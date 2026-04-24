import crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import prisma from '../prismaClient.js';
import { convert } from 'html-to-text';
import { decryptImapCredentials, encryptImapCredentials } from '../utils/imap-credentials.js';

const MAX_SYNC_MESSAGES = 150;
const MAX_LOOKUP_MESSAGES = 250;
const DEFAULT_LOOKBACK_DAYS = 7;

function stripQuotedContent(text) {
  if (!text) return '';

  const patterns = [
    /\n\s*On\s+.*\s+wrote:\s*\n[\s\S]*/i,
    /\n\s*\d+\s+\w+\s+\d+.*şunu yazdı:\s*\n[\s\S]*/i,
    /\n\s*---------- Forwarded message ---------[\s\S]*/i,
    /\n\s*-{3,}\s*Original Message\s*-{3,}[\s\S]*/i,
    /\n\s*_{3,}\s*[\s\S]*/,
    /(\n\s*>.*)+$/,
    /\n\s*From:.*\n\s*Sent:.*\n\s*To:.*\n\s*Subject:[\s\S]*/i,
    /\n\s*Kimden:.*\n\s*Gönderildi:.*\n\s*Kime:.*\n\s*Konu:[\s\S]*/i
  ];

  let cleanedText = text;

  for (const pattern of patterns) {
    cleanedText = cleanedText.replace(pattern, '');
  }

  cleanedText = cleanedText.replace(/\n\s*--\s*\n[\s\S]*$/, '');

  return cleanedText.trim();
}

function normalizePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeMessageId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith('<') && raw.endsWith('>')) {
    return raw;
  }
  return `<${raw.replace(/^<|>$/g, '')}>`;
}

function normalizeReferenceChain(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(normalizeMessageId).filter(Boolean);
  }

  return String(value)
    .split(/\s+/)
    .map(part => normalizeMessageId(part))
    .filter(Boolean);
}

function buildSyntheticThreadId({ internetMessageId, inReplyTo, references, subject, fromEmail }) {
  const chain = normalizeReferenceChain(references);
  const root = chain[0]
    || normalizeMessageId(inReplyTo)
    || normalizeMessageId(internetMessageId)
    || `${String(subject || '').trim().toLowerCase()}::${String(fromEmail || '').trim().toLowerCase()}`;

  const digest = crypto
    .createHash('sha1')
    .update(root)
    .digest('hex')
    .slice(0, 32);

  return `imap-${digest}`;
}

function buildSnippet(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function parseAddressList(addressObject) {
  const values = Array.isArray(addressObject?.value) ? addressObject.value : [];
  return values
    .map(item => item?.address)
    .filter(Boolean)
    .join(', ');
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function normalizeRawSource(source) {
  if (!source) return Buffer.alloc(0);
  if (Buffer.isBuffer(source)) return source;
  if (typeof source === 'string') return Buffer.from(source);
  if (typeof source?.pipe === 'function' || typeof source?.[Symbol.asyncIterator] === 'function') {
    return streamToBuffer(source);
  }
  return Buffer.from(String(source));
}

class ImapService {
  normalizeConfig(input = {}) {
    const email = String(input.email || '').trim().toLowerCase();
    const username = String(input.username || email).trim();
    const password = String(input.password || '').trim();
    const imapHost = String(input.imapHost || '').trim();
    const smtpHost = String(input.smtpHost || '').trim();
    const imapSecure = toBoolean(input.imapSecure, true);
    const smtpSecure = toBoolean(input.smtpSecure, false);

    return {
      email,
      username,
      password,
      imapHost,
      imapPort: normalizePort(input.imapPort, imapSecure ? 993 : 143),
      imapSecure,
      smtpHost,
      smtpPort: normalizePort(input.smtpPort, smtpSecure ? 465 : 587),
      smtpSecure
    };
  }

  assertRequiredConfig(config) {
    const requiredFields = [
      ['email', 'Email address is required'],
      ['username', 'Mailbox username is required'],
      ['password', 'Mailbox password or app password is required'],
      ['imapHost', 'IMAP host is required'],
      ['smtpHost', 'SMTP host is required']
    ];

    for (const [field, message] of requiredFields) {
      if (!config[field]) {
        throw new Error(message);
      }
    }
  }

  buildImapClientConfig(credentials) {
    return {
      host: credentials.imapHost,
      port: credentials.imapPort,
      secure: credentials.imapSecure,
      auth: {
        user: credentials.username,
        pass: credentials.password
      },
      logger: false,
      disableAutoIdle: true
    };
  }

  buildSmtpTransportConfig(credentials) {
    return {
      host: credentials.smtpHost,
      port: credentials.smtpPort,
      secure: credentials.smtpSecure,
      auth: {
        user: credentials.username,
        pass: credentials.password
      }
    };
  }

  async createImapClient(credentials) {
    const client = new ImapFlow(this.buildImapClientConfig(credentials));
    await client.connect();
    return client;
  }

  createSmtpTransport(credentials) {
    return nodemailer.createTransport(this.buildSmtpTransportConfig(credentials));
  }

  async getStoredCredentials(businessId) {
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId }
    });

    if (!integration || integration.provider !== 'IMAP') {
      throw new Error('IMAP email is not connected');
    }

    const { credentials, needsMigration } = decryptImapCredentials(integration.credentials);

    if (needsMigration) {
      await prisma.emailIntegration.update({
        where: { businessId },
        data: {
          credentials: encryptImapCredentials(credentials)
        }
      });
    }

    return {
      integration,
      credentials: this.normalizeConfig({
        ...credentials,
        email: integration.email,
        username: credentials.username || integration.email
      })
    };
  }

  async verifyConnection(input) {
    const credentials = this.normalizeConfig(input);
    this.assertRequiredConfig(credentials);

    const imapClient = await this.createImapClient(credentials);
    try {
      await imapClient.mailboxOpen('INBOX', { readOnly: true });
    } finally {
      await imapClient.logout().catch(() => undefined);
    }

    const transport = this.createSmtpTransport(credentials);
    try {
      await transport.verify();
    } finally {
      transport.close();
    }

    return {
      success: true,
      email: credentials.email
    };
  }

  async connect(businessId, input) {
    const credentials = this.normalizeConfig(input);
    this.assertRequiredConfig(credentials);

    await this.verifyConnection(credentials);

    const encryptedCredentials = encryptImapCredentials(credentials);

    await prisma.emailIntegration.upsert({
      where: { businessId },
      update: {
        provider: 'IMAP',
        email: credentials.email,
        credentials: encryptedCredentials,
        connected: true,
        lastSyncedAt: null
      },
      create: {
        businessId,
        provider: 'IMAP',
        email: credentials.email,
        credentials: encryptedCredentials,
        connected: true
      }
    });

    return {
      success: true,
      email: credentials.email
    };
  }

  async fetchLatestMailboxMessages(client, { mailboxName = 'INBOX', maxMessages = MAX_SYNC_MESSAGES, readOnly = true } = {}) {
    const mailbox = await client.mailboxOpen(mailboxName, { readOnly });
    const messageCount = Number(mailbox?.exists || 0);
    if (!messageCount) {
      return [];
    }

    const startSequence = Math.max(1, messageCount - maxMessages + 1);
    const range = `${startSequence}:*`;
    const messages = [];

    for await (const message of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      source: true
    })) {
      messages.push(message);
    }

    return messages;
  }

  async fetchLatestInboxMessages(credentials, { maxMessages = MAX_SYNC_MESSAGES } = {}) {
    const client = await this.createImapClient(credentials);

    try {
      return await this.fetchLatestMailboxMessages(client, {
        mailboxName: 'INBOX',
        maxMessages,
        readOnly: true
      });
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  async parseFetchedMessage(message) {
    const rawSource = await normalizeRawSource(message.source);
    const parsed = await simpleParser(rawSource);

    const internetMessageId = normalizeMessageId(parsed.messageId);
    const inReplyTo = normalizeMessageId(parsed.inReplyTo);
    const references = normalizeReferenceChain(parsed.references || parsed.headers?.get?.('references'));
    const bodyHtml = typeof parsed.html === 'string' ? parsed.html : '';
    const bodyText = parsed.text
      ? parsed.text
      : convert(bodyHtml || '', {
          wordwrap: false,
          selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' }
          ]
        });

    const cleanBodyText = stripQuotedContent(bodyText);
    const fromAddress = parsed.from?.value?.[0] || {};
    const date = parsed.date || message.internalDate || new Date();
    const syntheticMessageId = internetMessageId || `imap-uid-${message.uid}`;

    return {
      uid: message.uid,
      messageId: syntheticMessageId,
      internetMessageId,
      threadId: buildSyntheticThreadId({
        internetMessageId,
        inReplyTo,
        references,
        subject: parsed.subject,
        fromEmail: fromAddress.address
      }),
      subject: parsed.subject || '(No Subject)',
      from: {
        email: fromAddress.address || '',
        name: fromAddress.name || ''
      },
      to: parseAddressList(parsed.to),
      date,
      inReplyTo,
      references: references.join(' ') || null,
      bodyText: cleanBodyText,
      bodyHtml,
      attachments: Array.isArray(parsed.attachments)
        ? parsed.attachments.map((attachment) => ({
            filename: attachment.filename || 'attachment',
            mimeType: attachment.contentType || 'application/octet-stream',
            size: attachment.size || 0
          }))
        : [],
      snippet: buildSnippet(cleanBodyText || parsed.subject || ''),
      isUnread: !(Array.isArray(message.flags) && message.flags.includes('\\Seen'))
    };
  }

  async getMessages(businessId, options = {}) {
    const { credentials } = await this.getStoredCredentials(businessId);
    const maxResults = normalizePort(options.maxResults, 20);
    const fetched = await this.fetchLatestInboxMessages(credentials, {
      maxMessages: Math.max(maxResults, 20)
    });

    const parsedMessages = [];
    for (const message of fetched) {
      parsedMessages.push(await this.parseFetchedMessage(message));
    }

    parsedMessages.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      messages: parsedMessages.slice(0, maxResults)
    };
  }

  async getMessage(businessId, messageId) {
    const { credentials } = await this.getStoredCredentials(businessId);
    const fetched = await this.fetchLatestInboxMessages(credentials, {
      maxMessages: MAX_LOOKUP_MESSAGES
    });

    for (const message of fetched.reverse()) {
      const parsed = await this.parseFetchedMessage(message);
      if (parsed.messageId === messageId || parsed.internetMessageId === normalizeMessageId(messageId)) {
        return parsed;
      }
    }

    throw new Error('Message not found in IMAP inbox');
  }

  async getThread(businessId, threadId) {
    const { credentials } = await this.getStoredCredentials(businessId);
    const fetched = await this.fetchLatestInboxMessages(credentials, {
      maxMessages: MAX_LOOKUP_MESSAGES
    });

    const messages = [];
    for (const message of fetched) {
      const parsed = await this.parseFetchedMessage(message);
      if (parsed.threadId === threadId) {
        messages.push(parsed);
      }
    }

    messages.sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      threadId,
      messages,
      snippet: messages[messages.length - 1]?.snippet || ''
    };
  }

  async sendMessage(businessId, to, subject, body, options = {}) {
    const { integration, credentials } = await this.getStoredCredentials(businessId);
    const transport = this.createSmtpTransport(credentials);

    try {
      const headers = {};
      if (options.inReplyTo) headers['In-Reply-To'] = options.inReplyTo;
      if (options.references) headers.References = options.references;

      const result = await transport.sendMail({
        from: integration.email,
        to,
        subject,
        html: body,
        headers
      });

      return {
        messageId: normalizeMessageId(result.messageId) || `smtp-${Date.now()}`,
        threadId: options.threadId || buildSyntheticThreadId({
          internetMessageId: result.messageId,
          inReplyTo: options.inReplyTo,
          references: options.references,
          subject,
          fromEmail: integration.email
        })
      };
    } finally {
      transport.close();
    }
  }

  async markAsRead(businessId, messageId) {
    const { credentials } = await this.getStoredCredentials(businessId);
    const client = await this.createImapClient(credentials);

    try {
      const fetched = await this.fetchLatestMailboxMessages(client, {
        mailboxName: 'INBOX',
        maxMessages: MAX_LOOKUP_MESSAGES
      });

      const normalizedTarget = normalizeMessageId(messageId);
      const matched = [];

      for (const message of fetched) {
        const parsed = await this.parseFetchedMessage(message);
        if (parsed.messageId === messageId || parsed.internetMessageId === normalizedTarget) {
          matched.push(message.uid);
        }
      }

      if (matched.length > 0) {
        await client.messageFlagsAdd(matched, ['\\Seen'], { uid: true });
      }

      return { success: true };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  async syncNewMessages(businessId) {
    const { integration, credentials } = await this.getStoredCredentials(businessId);
    const fetched = await this.fetchLatestInboxMessages(credentials, {
      maxMessages: MAX_SYNC_MESSAGES
    });

    const threshold = integration.lastSyncedAt
      ? new Date(integration.lastSyncedAt)
      : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const parsedMessages = [];
    for (const message of fetched) {
      const parsed = await this.parseFetchedMessage(message);
      if (new Date(parsed.date) >= threshold) {
        parsedMessages.push(parsed);
      }
    }

    parsedMessages.sort((a, b) => new Date(a.date) - new Date(b.date));
    return parsedMessages;
  }

  async disconnect(businessId) {
    await prisma.emailIntegration.update({
      where: { businessId },
      data: {
        connected: false,
        lastSyncedAt: null,
        credentials: {}
      }
    });

    return { success: true };
  }
}

export default new ImapService();
