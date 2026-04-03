/**
 * Microsoft 365 / Outlook Integration Service
 * OAuth 2.0 + Email Operations via Microsoft Graph API
 */

import axios from 'axios';
import prisma from '../prismaClient.js';
import { convert } from 'html-to-text';

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

// Microsoft Graph API endpoints
const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';

// Microsoft API Scopes
const MICROSOFT_SCOPES = [
  'offline_access',
  'Mail.Read',
  'Mail.Send',
  'Mail.ReadWrite',
  'User.Read'
];

class OutlookService {
  /**
   * Get OAuth configuration
   */
  getOAuthConfig() {
    return {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI ||
        `${process.env.BACKEND_URL}/api/auth/microsoft/callback`,
      tenantId: process.env.MICROSOFT_TENANT_ID || 'common'
    };
  }

  /**
   * Get OAuth authorization URL with PKCE support
   * @param {string} state - Cryptographically secure state token (CSRF protection)
   * @param {string} codeChallenge - PKCE code challenge (optional)
   * @returns {string} Authorization URL
   */
  getAuthUrl(state, codeChallenge = null) {
    const config = this.getOAuthConfig();

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: MICROSOFT_SCOPES.join(' '),
      response_mode: 'query',
      state
      // NOTE: Removed 'prompt: consent' to respect tenant-wide admin consent
      // If admin consent is granted, users won't see consent screen again
    });

    // Add PKCE parameters if provided
    if (codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    return `${MICROSOFT_AUTH_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code
   * @param {number} businessId - Business ID
   * @param {string} codeVerifier - PKCE code verifier (optional)
   */
  async handleCallback(code, businessId, codeVerifier = null) {
    try {
      const config = this.getOAuthConfig();

      // Build token request parameters
      const tokenParams = {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code'
      };

      // Add PKCE verifier if provided
      if (codeVerifier) {
        tokenParams.code_verifier = codeVerifier;
      }

      // Exchange code for tokens
      const tokenResponse = await axios.post(
        `${MICROSOFT_AUTH_URL}/token`,
        new URLSearchParams(tokenParams),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      const tokens = tokenResponse.data;

      // Calculate expiry timestamp
      const expiryDate = Date.now() + (tokens.expires_in * 1000);

      // Get user email
      const userResponse = await axios.get(`${GRAPH_API_URL}/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });

      const email = userResponse.data.mail || userResponse.data.userPrincipalName;

      // Save to database
      const credentials = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: expiryDate
      };

      await prisma.emailIntegration.upsert({
  where: { businessId },
  update: {
    provider: 'OUTLOOK',
    email,
    credentials,
    connected: true
    // lastSyncedAt kaldırıldı
  },
  create: {
    businessId,
    provider: 'OUTLOOK',
    email,
    credentials,
    connected: true
    // lastSyncedAt kaldırıldı
  }
});

      console.log(`Outlook connected for business ${businessId}: ${email}`);
      return { success: true, email };
    } catch (error) {
      console.error('Outlook callback error:', error.response?.data || error);
      throw new Error('Failed to complete Outlook OAuth');
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken(businessId) {
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId }
    });

    if (!integration || integration.provider !== 'OUTLOOK') {
      throw new Error('Outlook not connected');
    }

    const credentials = integration.credentials;

    // Check if token is expired (5 min buffer)
    if (credentials.expiry_date && credentials.expiry_date < (Date.now() + 300000)) {
      try {
        const config = this.getOAuthConfig();

        const tokenResponse = await axios.post(
          `${MICROSOFT_AUTH_URL}/token`,
          new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: credentials.refresh_token,
            grant_type: 'refresh_token'
          }),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }
        );

        const newTokens = tokenResponse.data;
        const expiryDate = Date.now() + (newTokens.expires_in * 1000);

        const newCredentials = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || credentials.refresh_token,
          expiry_date: expiryDate
        };

        await prisma.emailIntegration.update({
          where: { businessId },
          data: { credentials: newCredentials }
        });

        console.log(`Outlook token refreshed for business ${businessId}`);
        return newCredentials.access_token;
      } catch (error) {
        console.error('Outlook token refresh failed:', {
          status: error.response?.status,
          message: error.response?.data?.error_description || error.response?.data?.error || error.message
        });
        throw new Error('Outlook token expired. Please reconnect.');
      }
    }

    return credentials.access_token;
  }

  /**
   * Get list of messages
   */
  async getMessages(businessId, options = {}) {
    try {
      const accessToken = await this.getAccessToken(businessId);

      const {
        maxResults = 20,
        folder = 'inbox',
        filter = '',
        skip = 0
      } = options;

      let url = `${GRAPH_API_URL}/me/mailFolders/${folder}/messages`;
      const params = new URLSearchParams({
        '$top': maxResults,
        '$skip': skip,
        '$orderby': 'receivedDateTime desc',
        '$select': 'id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,hasAttachments,isRead'
      });

      if (filter) {
        params.append('$filter', filter);
      }

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const messages = (response.data.value || []).map(msg => this.parseMessage(msg));

      return {
        messages,
        nextLink: response.data['@odata.nextLink']
      };
    } catch (error) {
      console.error('Get messages error:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Get single message with full details
   */
  async getMessage(businessId, messageId) {
    try {
      const accessToken = await this.getAccessToken(businessId);

      const response = await axios.get(
        `${GRAPH_API_URL}/me/messages/${messageId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            '$expand': 'attachments'
          }
        }
      );

      return this.parseMessage(response.data);
    } catch (error) {
      console.error('Get message error:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Get conversation (thread)
   */
  async getThread(businessId, conversationId) {
    try {
      const accessToken = await this.getAccessToken(businessId);

      const response = await axios.get(
        `${GRAPH_API_URL}/me/messages`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            '$filter': `conversationId eq '${conversationId}'`,
            '$orderby': 'receivedDateTime asc',
            '$select': 'id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,hasAttachments,isRead'
          }
        }
      );

      const messages = (response.data.value || []).map(msg => this.parseMessage(msg));

      return {
        threadId: conversationId,
        messages,
        snippet: messages[messages.length - 1]?.snippet || ''
      };
    } catch (error) {
      console.error('Get thread error:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Send an email
   */
  async sendMessage(businessId, to, subject, body, options = {}) {
    try {
      const accessToken = await this.getAccessToken(businessId);

      const { conversationId, replyToId } = options;

      // If replying, use the reply endpoint
      if (replyToId) {
        const response = await axios.post(
          `${GRAPH_API_URL}/me/messages/${replyToId}/reply`,
          {
            comment: body
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        return {
          messageId: response.data?.id || replyToId,
          threadId: conversationId
        };
      }

      // New message
      const message = {
        subject,
        body: {
          contentType: 'HTML',
          content: body
        },
        toRecipients: [
          {
            emailAddress: {
              address: to
            }
          }
        ]
      };

      const response = await axios.post(
        `${GRAPH_API_URL}/me/sendMail`,
        { message },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        messageId: 'sent',
        threadId: conversationId
      };
    } catch (error) {
      console.error('Send message error:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Create a draft email (not sent)
   * @param {number} businessId
   * @param {Object} options - { conversationId, to, subject, body, replyToId }
   * @returns {Promise<Object>} { draftId, messageId, conversationId }
   */
  async createDraft(businessId, options) {
    try {
      const accessToken = await this.getAccessToken(businessId);
      const { conversationId, to, subject, body, replyToId } = options;

      // If replying to a message, create a reply draft
      if (replyToId) {
        const response = await axios.post(
          `${GRAPH_API_URL}/me/messages/${replyToId}/createReply`,
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const draftId = response.data.id;

        // Update the draft with our content
        await axios.patch(
          `${GRAPH_API_URL}/me/messages/${draftId}`,
          {
            body: {
              contentType: 'HTML',
              content: body
            }
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log(`✅ Outlook reply draft created: ${draftId}`);

        return {
          draftId,
          messageId: draftId,
          conversationId,
          provider: 'OUTLOOK'
        };
      }

      // New message draft (not a reply)
      const response = await axios.post(
        `${GRAPH_API_URL}/me/messages`,
        {
          subject,
          body: {
            contentType: 'HTML',
            content: body
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Outlook draft created: ${response.data.id}`);

      return {
        draftId: response.data.id,
        messageId: response.data.id,
        conversationId: response.data.conversationId,
        provider: 'OUTLOOK'
      };
    } catch (error) {
      console.error('Create draft error:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(businessId, messageId) {
    try {
      const accessToken = await this.getAccessToken(businessId);

      await axios.patch(
        `${GRAPH_API_URL}/me/messages/${messageId}`,
        { isRead: true },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return { success: true };
    } catch (error) {
      console.error('Mark as read error:', error.response?.data || error);
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
      throw new Error('Outlook not connected');
    }

    const lastSync = integration.lastSyncedAt;
    let filter = '';

    // DEBUG LOGS
    console.log('=== OUTLOOK SYNC DEBUG ===');
    console.log('lastSync from DB:', lastSync);
    console.log('Date.now():', Date.now());

    if (lastSync) {
      const isoDate = lastSync.toISOString();
      filter = `receivedDateTime ge ${isoDate}`;
      console.log('Using lastSync filter:', filter);
    } else {
      // İlk sync: son 7 günün maillerini getir
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      filter = `receivedDateTime ge ${sevenDaysAgo.toISOString()}`;
      console.log('Using 7 days ago filter:', filter);
    }

    console.log('Final filter:', filter);
    console.log('==========================');

    const { messages } = await this.getMessages(businessId, {
      maxResults: 50,
      filter
    });

    console.log('Messages fetched:', messages?.length || 0);

    // Update last sync time
    await prisma.emailIntegration.update({
      where: { businessId },
      data: { lastSyncedAt: new Date() }
    });

    return messages;
  } catch (error) {
    console.error('Sync messages error:', error);
    throw error;
  }
}
  /**
   * Disconnect Outlook
   */
  async disconnect(businessId) {
    try {
      await prisma.emailIntegration.update({
        where: { businessId },
        data: { connected: false }
      });

      return { success: true };
    } catch (error) {
      console.error('Disconnect error:', error);
      throw error;
    }
  }

  /**
   * Parse Outlook message to standard format
   * Note: Attachments are intentionally not processed for security reasons
   */
  parseMessage(message) {
    const bodyHtml = message.body?.contentType === 'html' ? message.body.content : '';
    const bodyText = message.body?.contentType === 'text'
      ? message.body.content
      : convert(bodyHtml || '', {
          wordwrap: false,
          selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' }
          ]
        });

    // Strip quoted content from replies to show only the new message
    const cleanBodyText = stripQuotedContent(bodyText);

    return {
      messageId: message.id,
      internetMessageId: message.internetMessageId || null,
      threadId: message.conversationId,
      subject: message.subject || '(No Subject)',
      from: {
        email: message.from?.emailAddress?.address || '',
        name: message.from?.emailAddress?.name || ''
      },
      to: message.toRecipients?.map(r => r.emailAddress?.address).join(', ') || '',
      date: message.receivedDateTime || '',
      inReplyTo: null,
      references: null,
      bodyText: cleanBodyText,
      bodyHtml,
      attachments: [], // Attachments disabled for security
      snippet: message.bodyPreview || '',
      isUnread: !message.isRead
    };
  }
}

export default new OutlookService();
