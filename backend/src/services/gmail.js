/**
 * Gmail Integration Service
 * OAuth 2.0 + Email Operations
 */

import { google } from 'googleapis';
import prisma from '../prismaClient.js';
import { convert } from 'html-to-text';
import { encryptGoogleTokenCredentials, decryptGoogleTokenCredentials } from '../utils/google-oauth-tokens.js';
import { revokeGoogleOAuthToken } from '../utils/google-oauth-revoke.js';

/**
 * Strip quoted reply content from email body
 * Removes the "On ... wrote:" pattern and everything after it
 */
function stripQuotedContent(text) {
  if (!text) return '';

  // Common patterns for quoted replies in different languages
  const patterns = [
    // English: "On Mon, Jan 15, 2024 at 10:30 AM John Doe <john@example.com> wrote:"
    /\n\s*On\s+.*\s+wrote:\s*\n[\s\S]*/i,
    // Turkish: "15 Oca 2024 Pzt, 10:30 tarihinde John Doe <john@example.com> şunu yazdı:"
    /\n\s*\d+\s+\w+\s+\d+.*şunu yazdı:\s*\n[\s\S]*/i,
    // Gmail style separator
    /\n\s*---------- Forwarded message ---------[\s\S]*/i,
    // Common reply markers
    /\n\s*-{3,}\s*Original Message\s*-{3,}[\s\S]*/i,
    /\n\s*_{3,}\s*[\s\S]*/,
    // Quote markers (lines starting with >)
    /(\n\s*>.*)+$/,
    // "From:" header pattern (Outlook style)
    /\n\s*From:.*\n\s*Sent:.*\n\s*To:.*\n\s*Subject:[\s\S]*/i,
    // "Kimden:" Turkish Outlook pattern
    /\n\s*Kimden:.*\n\s*Gönderildi:.*\n\s*Kime:.*\n\s*Konu:[\s\S]*/i
  ];

  let cleanedText = text;

  for (const pattern of patterns) {
    cleanedText = cleanedText.replace(pattern, '');
  }

  // Also strip signature blocks
  cleanedText = cleanedText.replace(/\n\s*--\s*\n[\s\S]*$/, '');

  return cleanedText.trim();
}

// Gmail API Scopes
// Only request minimum necessary scopes:
// - gmail.readonly: Read emails and threads
// - gmail.send: Send emails (messages.send)
// - userinfo.email: Get user's email address
// Note: gmail.modify removed (was used for markAsRead + drafts.create, both unnecessary)
// Note: gmail.compose not needed (drafts managed in our DB, not Gmail Drafts folder)
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email'
];

function isInsufficientScopeError(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  const reasons = [
    ...(Array.isArray(error?.errors) ? error.errors : []),
    ...(Array.isArray(error?.response?.data?.error?.errors) ? error.response.data.error.errors : []),
  ];
  const message = String(error?.message || '').toLowerCase();
  const wwwAuthenticate = String(error?.response?.headers?.['www-authenticate'] || '').toLowerCase();

  return status === 403 && (
    reasons.some((item) => item?.reason === 'insufficientPermissions')
    || message.includes('insufficient permission')
    || message.includes('insufficientpermissions')
    || wwwAuthenticate.includes('insufficient_scope')
  );
}

function createReconnectRequiredError() {
  const error = new Error('Gmail connection is missing required permissions. Please reconnect your Gmail account.');
  error.code = 'EMAIL_RECONNECT_REQUIRED';
  return error;
}

class GmailService {
  /**
   * Create OAuth2 client
   */
  createOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_EMAIL_REDIRECT_URI ||
      `${process.env.BACKEND_URL}/api/email/gmail/callback`;

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  /**
   * Get OAuth authorization URL with PKCE support
   * @param {string} state - Cryptographically secure state token (CSRF protection)
   * @param {string} codeChallenge - PKCE code challenge (optional)
   * @returns {string} Authorization URL
   */
  getAuthUrl(state, codeChallenge = null) {
    const oauth2Client = this.createOAuth2Client();

    const authUrlParams = {
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      prompt: 'consent',
      state
    };

    // Add PKCE parameters if provided
    if (codeChallenge) {
      authUrlParams.code_challenge = codeChallenge;
      authUrlParams.code_challenge_method = 'S256';
    }

    return oauth2Client.generateAuthUrl(authUrlParams);
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code
   * @param {number} businessId - Business ID
   * @param {string} codeVerifier - PKCE code verifier (optional)
   */
  async handleCallback(code, businessId, codeVerifier = null) {
    try {
      const oauth2Client = this.createOAuth2Client();

      // Include PKCE verifier if provided
      const tokenParams = { code };
      if (codeVerifier) {
        tokenParams.codeVerifier = codeVerifier;
      }

      const { tokens } = await oauth2Client.getToken(tokenParams);

      // Log granted scopes for debugging
      console.log('📧 [Gmail] Granted scopes:', tokens.scope);
      console.log('📧 [Gmail] Token type:', tokens.token_type);
      console.log('📧 [Gmail] Has refresh token:', !!tokens.refresh_token);

      // Get user email
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email;

      let mergedTokens = { ...tokens };
      if (!mergedTokens.refresh_token) {
        try {
          const existingIntegration = await prisma.emailIntegration.findUnique({
            where: { businessId }
          });
          if (existingIntegration?.credentials) {
            const { credentials: existingCredentials } = decryptGoogleTokenCredentials(existingIntegration.credentials);
            if (existingCredentials.refresh_token) {
              mergedTokens = {
                ...mergedTokens,
                refresh_token: existingCredentials.refresh_token
              };
            }
          }
        } catch (mergeError) {
          console.warn(`Gmail refresh token merge skipped for business ${businessId}:`, mergeError.message);
        }
      }

      const encryptedTokens = encryptGoogleTokenCredentials(mergedTokens);

      await prisma.emailIntegration.upsert({
        where: { businessId },
        update: {
          provider: 'GMAIL',
          email,
          credentials: encryptedTokens,
          connected: true
          // lastSyncedAt kaldırıldı - ilk sync'te 7 gün getirecek
        },
        create: {
          businessId,
          provider: 'GMAIL',
          email,
          credentials: encryptedTokens,
          connected: true
          // lastSyncedAt kaldırıldı - ilk sync'te 7 gün getirecek
        }
      });

      console.log(`Gmail connected for business ${businessId}: ${email}`);
      return { success: true, email };
    } catch (error) {
      console.error('Gmail callback error:', error);
      throw new Error('Failed to complete Gmail OAuth');
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken(businessId) {
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId }
    });

    if (!integration || integration.provider !== 'GMAIL') {
      throw new Error('Gmail not connected');
    }

    const {
      credentials,
      needsMigration
    } = decryptGoogleTokenCredentials(integration.credentials);
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials(credentials);

    if (needsMigration) {
      await prisma.emailIntegration.update({
        where: { businessId },
        data: {
          credentials: encryptGoogleTokenCredentials(credentials)
        }
      });
    }

    // Check if token is expired or needs refresh
    if (credentials.expiry_date && credentials.expiry_date < Date.now()) {
      try {
        const { credentials: refreshedTokens } = await oauth2Client.refreshAccessToken();
        const mergedTokens = {
          ...credentials,
          ...refreshedTokens,
          refresh_token: refreshedTokens.refresh_token || credentials.refresh_token
        };

        // Update stored credentials
        await prisma.emailIntegration.update({
          where: { businessId },
          data: {
            credentials: encryptGoogleTokenCredentials(mergedTokens)
          }
        });

        oauth2Client.setCredentials(mergedTokens);
        console.log(`Gmail token refreshed for business ${businessId}`);
      } catch (error) {
        console.error('Token refresh failed:', error);

        // Check if it's an invalid_grant error (token revoked/expired)
        if (error.response?.data?.error === 'invalid_grant') {
          // Mark the integration as disconnected so user knows to reconnect
          await prisma.emailIntegration.update({
            where: { businessId },
            data: {
              connected: false,
              lastSyncedAt: null,
              credentials: {}
            }
          });
          console.log(`Gmail disconnected for business ${businessId} due to invalid_grant`);
          throw new Error('Gmail bağlantısı sona erdi. Lütfen yeniden bağlanın. / Gmail connection expired. Please reconnect.');
        }

        throw new Error('Gmail token expired. Please reconnect.');
      }
    }

    return oauth2Client;
  }

  /**
   * Get list of messages
   */
  async getMessages(businessId, options = {}) {
    try {
      const auth = await this.getAccessToken(businessId);
      const gmail = google.gmail({ version: 'v1', auth });

      const {
        maxResults = 20,
        labelIds = ['INBOX'],
        query = '',
        pageToken = null
      } = options;

      const listParams = {
        userId: 'me',
        maxResults,
        q: query
      };
      // Only add labelIds if query doesn't already contain in:inbox (avoid redundancy)
      if (labelIds?.length && !query.includes('in:inbox')) {
        listParams.labelIds = labelIds;
      }
      if (pageToken) listParams.pageToken = pageToken;

      const response = await gmail.users.messages.list(listParams);

      const messages = response.data.messages || [];
      const fullMessages = [];

      // Get full message details
      for (const msg of messages) {
        const fullMsg = await this.getMessage(businessId, msg.id, auth);
        fullMessages.push(fullMsg);
      }

      return {
        messages: fullMessages,
        nextPageToken: response.data.nextPageToken
      };
    } catch (error) {
      console.error('Get messages error:', error);
      if (isInsufficientScopeError(error)) {
        throw createReconnectRequiredError();
      }
      throw error;
    }
  }

  /**
   * Get single message with full details
   */
  async getMessage(businessId, messageId, authClient = null) {
    try {
      const auth = authClient || await this.getAccessToken(businessId);
      const gmail = google.gmail({ version: 'v1', auth });

      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      return this.parseMessage(response.data);
    } catch (error) {
      console.error('Get message error:', error);
      if (isInsufficientScopeError(error)) {
        throw createReconnectRequiredError();
      }
      throw error;
    }
  }

  /**
   * Get thread with all messages
   */
  async getThread(businessId, threadId) {
    try {
      const auth = await this.getAccessToken(businessId);
      const gmail = google.gmail({ version: 'v1', auth });

      const response = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full'
      });

      const thread = response.data;
      const messages = (thread.messages || []).map(msg => this.parseMessage(msg));

      return {
        threadId: thread.id,
        messages,
        snippet: thread.snippet
      };
    } catch (error) {
      console.error('Get thread error:', error);
      if (isInsufficientScopeError(error)) {
        throw createReconnectRequiredError();
      }
      throw error;
    }
  }

  /**
   * Send an email
   */
  async sendMessage(businessId, to, subject, body, options = {}) {
    try {
      const auth = await this.getAccessToken(businessId);
      const gmail = google.gmail({ version: 'v1', auth });

      const integration = await prisma.emailIntegration.findUnique({
        where: { businessId }
      });

      const { threadId, inReplyTo, references } = options;

      // Build email headers
      const headers = [
        `To: ${to}`,
        `From: ${integration.email}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8'
      ];

      if (inReplyTo) {
        headers.push(`In-Reply-To: ${inReplyTo}`);
      }
      if (references) {
        headers.push(`References: ${references}`);
      }

      const emailContent = headers.join('\r\n') + '\r\n\r\n' + body;
      const encodedMessage = Buffer.from(emailContent)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: threadId || undefined
        }
      });

      return {
        messageId: response.data.id,
        threadId: response.data.threadId
      };
    } catch (error) {
      console.error('Send message error:', error);
      if (isInsufficientScopeError(error)) {
        throw createReconnectRequiredError();
      }
      throw error;
    }
  }



/**
 * Sync new messages since last sync
 */
async syncNewMessages(businessId) {
  try {
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId }
    });

    if (!integration) {
      throw new Error('Gmail not connected');
    }

    let query = 'in:inbox';

    // Her zaman son 7 günün maillerini çek.
    // lastSyncedAt kullanmıyoruz çünkü sayfa yenilenince SSE kesilir,
    // DB'ye kaydedilmemiş mailler kaybolurdu. Duplicate'ler saveMessageToDb'de atlanır (isNew: false).
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const afterDate = `${sevenDaysAgo.getFullYear()}/${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}/${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;
    query += ` after:${afterDate}`;

    console.log(`📧 [Gmail Sync] Fetching last 7 days (after: ${afterDate})`);

    // Paginate through ALL pages — Gmail API returns max ~100 IDs per page
    let allMessages = [];
    let pageToken = null;
    let pageCount = 0;

    do {
      const { messages, nextPageToken } = await this.getMessages(businessId, {
        maxResults: 100,  // Gmail optimal page size
        query,
        labelIds: ['INBOX'],
        pageToken
      });
      allMessages = allMessages.concat(messages);
      pageToken = nextPageToken;
      pageCount++;
      console.log(`📧 [Gmail Sync] Page ${pageCount}: fetched ${messages.length} messages (total: ${allMessages.length}, hasMore: ${!!pageToken})`);
    } while (pageToken);

    // NOT: lastSyncedAt'i burada güncellemiyoruz.
    // SSE stream'de tüm mesajlar DB'ye kaydedildikten sonra güncellenir.
    // Bu sayede sayfa yenilenince yarıda kalan sync tekrarlanabilir.

    console.log(`📧 [Gmail Sync] Fetched ${allMessages.length} messages in ${pageCount} page(s) — ready for DB save`);
    return allMessages;
  } catch (error) {
    console.error('Sync messages error:', error);
    if (isInsufficientScopeError(error)) {
      throw createReconnectRequiredError();
    }
    throw error;
  }
}

/**
 * Disconnect Gmail
 */
async disconnect(businessId) {
  try {
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId }
    });

    if (integration?.provider === 'GMAIL') {
      try {
        const { credentials } = decryptGoogleTokenCredentials(integration.credentials);
        const revokeToken = credentials.refresh_token || credentials.access_token;
        await revokeGoogleOAuthToken(revokeToken);
      } catch (revokeError) {
        console.warn(`Gmail token revoke skipped for business ${businessId}:`, revokeError.message);
      }
    }

    await prisma.emailIntegration.update({
      where: { businessId },
      data: { 
        connected: false,
        lastSyncedAt: null,
        credentials: {}
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}

  /**
   * Parse Gmail message to standard format
   */
  parseMessage(message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : null;
    };

    // Get body content + attachment metadata (content NOT downloaded — security measure)
    let bodyHtml = '';
    let bodyText = '';
    const attachmentMeta = [];

    const processPayload = (payload) => {
      if (payload.mimeType === 'text/html') {
        bodyHtml = Buffer.from(payload.body.data || '', 'base64').toString('utf-8');
      } else if (payload.mimeType === 'text/plain') {
        bodyText = Buffer.from(payload.body.data || '', 'base64').toString('utf-8');
      }

      if (payload.parts) {
        for (const part of payload.parts) {
          // Collect attachment METADATA only (no content download)
          if (part.filename && part.body?.attachmentId) {
            attachmentMeta.push({
              filename: part.filename,
              mimeType: part.mimeType,
              size: part.body.size || 0
            });
          }
          // Process text parts recursively
          if (!part.filename && !part.body?.attachmentId) {
            processPayload(part);
          }
        }
      }
    };

    if (message.payload) {
      processPayload(message.payload);
    }

    // Convert HTML to plain text if needed
    if (!bodyText && bodyHtml) {
      bodyText = convert(bodyHtml, {
        wordwrap: false,
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' }
        ]
      });
    }

    // Strip quoted content from replies to show only the new message
    const cleanBodyText = stripQuotedContent(bodyText);

    // Parse from address
    const fromRaw = getHeader('From') || '';
    const fromMatch = fromRaw.match(/^(?:(.+?)\s*)?<?([^\s<>]+@[^\s<>]+)>?$/);
    const fromName = fromMatch ? (fromMatch[1] || '').replace(/"/g, '').trim() : '';
    const fromEmail = fromMatch ? fromMatch[2] : fromRaw;

    return {
      messageId: message.id,
      internetMessageId: getHeader('Message-ID') || getHeader('Message-Id') || null,
      threadId: message.threadId,
      subject: getHeader('Subject') || '(No Subject)',
      from: {
        email: fromEmail,
        name: fromName
      },
      to: getHeader('To') || '',
      date: getHeader('Date') || '',
      inReplyTo: getHeader('In-Reply-To'),
      references: getHeader('References'),
      bodyText: cleanBodyText,
      bodyHtml,
      attachments: attachmentMeta, // Metadata only — file content NOT downloaded (security)
      snippet: message.snippet,
      labelIds: message.labelIds || [],
      isUnread: (message.labelIds || []).includes('UNREAD')
    };
  }
}

export default new GmailService();
