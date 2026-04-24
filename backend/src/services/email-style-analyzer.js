// ============================================================================
// EMAIL STYLE ANALYZER SERVICE
// ============================================================================
// Analyzes user's sent emails to learn their writing style
// ============================================================================

import prisma from '../prismaClient.js';
import OpenAI from 'openai';
import { google } from 'googleapis';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Create authenticated Gmail API client for a business
 */
async function getAuthenticatedGmailClient(integration) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials(integration.credentials);

  // Handle token refresh if needed
  if (integration.credentials.expiry_date && Date.now() >= integration.credentials.expiry_date) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await prisma.emailIntegration.update({
        where: { id: integration.id },
        data: { credentials }
      });
      oauth2Client.setCredentials(credentials);
    } catch (error) {
      console.error('[Style Analyzer] Token refresh failed:', error);
      throw error;
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Analyze user's writing style from sent emails
 * @param {number} businessId - Business ID
 * @returns {Promise<object>} Style profile
 */
export async function analyzeWritingStyle(businessId) {
  console.log(`[Style Analyzer] Starting analysis for business ${businessId}`);

  // Get email integration
  const integration = await prisma.emailIntegration.findUnique({
    where: { businessId },
  });

  if (!integration) {
    throw new Error('Email integration not found');
  }

  // Update status to processing
  await prisma.emailIntegration.update({
    where: { id: integration.id },
    data: { styleAnalysisStatus: 'PROCESSING' },
  });

  try {
    // Fetch sent emails based on provider (last 30 days, up to 150 emails)
    let sentEmails = [];

    if (integration.provider === 'GMAIL') {
      sentEmails = await fetchGmailSentEmails(integration, 150);
    } else if (integration.provider === 'OUTLOOK') {
      sentEmails = await fetchOutlookSentEmails(integration, 150);
    } else if (integration.provider === 'IMAP') {
      console.warn('[Style Analyzer] IMAP style analysis not yet implemented');
    }

    if (sentEmails.length === 0) {
      console.log(`[Style Analyzer] No sent emails found for business ${businessId}`);
      await prisma.emailIntegration.update({
        where: { id: integration.id },
        data: {
          styleAnalysisStatus: 'COMPLETED',
          styleAnalyzedAt: new Date(),
          styleProfile: {
            error: 'No sent emails found',
            analyzed: false,
          },
        },
      });
      return null;
    }

    console.log(`[Style Analyzer] Fetched ${sentEmails.length} sent emails for analysis`);

    // Analyze emails with AI
    const styleProfile = await analyzeEmailsWithAI(sentEmails);

    // Save profile
    await prisma.emailIntegration.update({
      where: { id: integration.id },
      data: {
        styleProfile,
        styleAnalysisStatus: 'COMPLETED',
        styleAnalyzedAt: new Date(),
      },
    });

    console.log(`[Style Analyzer] Analysis completed for business ${businessId}`);
    return styleProfile;
  } catch (error) {
    console.error(`[Style Analyzer] Error analyzing style for business ${businessId}:`, error);

    await prisma.emailIntegration.update({
      where: { id: integration.id },
      data: {
        styleAnalysisStatus: 'FAILED',
        styleProfile: {
          error: error.message,
          analyzed: false,
        },
      },
    });

    throw error;
  }
}

/**
 * Fetch sent emails from Gmail (last 30 days)
 */
async function fetchGmailSentEmails(integration, limit = 150) {
  try {
    const gmail = await getAuthenticatedGmailClient(integration);
    if (!gmail) return [];

    // Get sent emails from last 30 days
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

    // Get message list from Sent folder
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['SENT'],
      maxResults: limit,
      q: `after:${thirtyDaysAgo}`, // Only last 30 days
    });

    if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
      return [];
    }

    // Fetch message details (body text)
    const emails = [];
    const messageIds = listResponse.data.messages.slice(0, limit);

    for (const msg of messageIds) {
      try {
        const msgResponse = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const headers = msgResponse.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === 'Subject')?.value || '';
        const to = headers.find((h) => h.name === 'To')?.value || '';

        // Extract body text
        let bodyText = '';
        const payload = msgResponse.data.payload;

        if (payload.body?.data) {
          bodyText = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        } else if (payload.parts) {
          const textPart = payload.parts.find(
            (p) => p.mimeType === 'text/plain' && p.body?.data
          );
          if (textPart) {
            bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        }

        if (bodyText) {
          emails.push({
            subject,
            to,
            body: bodyText.substring(0, 2000), // Limit body length
          });
        }
      } catch (msgError) {
        console.warn(`[Style Analyzer] Failed to fetch message ${msg.id}:`, msgError.message);
      }
    }

    return emails;
  } catch (error) {
    console.error('[Style Analyzer] Gmail fetch error:', error);
    return [];
  }
}

/**
 * Fetch sent emails from Outlook
 * Note: Outlook integration is not yet fully implemented
 */
async function fetchOutlookSentEmails(integration, limit = 100) {
  // TODO: Implement Outlook Graph API integration
  // For now, return empty array as Outlook is not yet supported
  console.warn('[Style Analyzer] Outlook style analysis not yet implemented');
  return [];
}

/**
 * Analyze emails with OpenAI to extract writing style
 */
async function analyzeEmailsWithAI(emails) {
  // Prepare email samples for analysis - include full body to capture signatures
  const emailSamples = emails
    .slice(0, 50) // Limit to 50 for token management
    .map((e, i) => `--- Email ${i + 1} ---\nTo: ${e.to}\nSubject: ${e.subject}\nBody:\n${e.body}`)
    .join('\n\n');

  const prompt = `Analyze the following ${emails.length} sent emails and create a DETAILED writing style profile for the author. Pay special attention to how they sign their emails.

${emailSamples}

Based on these emails, provide a JSON object with the following structure:
{
  "formality": "formal" | "semi-formal" | "informal",
  "greetingPatterns": {
    "turkish": ["array of greetings used in Turkish emails, e.g. 'Merhaba', 'İyi günler', 'Selam'"],
    "english": ["array of greetings used in English emails, e.g. 'Hi', 'Hello', 'Dear'"]
  },
  "closingPatterns": {
    "turkish": ["array of closings used in Turkish, e.g. 'Saygılarımla', 'İyi çalışmalar', 'Teşekkürler'"],
    "english": ["array of closings used in English, e.g. 'Best regards', 'Thanks', 'Best'"]
  },
  "signature": {
    "hasSignature": true/false,
    "name": "Full name if consistently used, or null",
    "title": "Job title if used, or null",
    "company": "Company name if used, or null",
    "phone": "Phone number if included, or null",
    "fullSignature": "The complete signature block as typically used, or null"
  },
  "averageLength": "short" | "medium" | "long",
  "primaryLanguage": "tr" | "en",
  "secondaryLanguage": "tr" | "en" | null,
  "tone": "professional" | "friendly" | "direct" | "warm",
  "writingCharacteristics": {
    "usesEmoji": true/false,
    "usesPunctuation": "minimal" | "standard" | "heavy",
    "paragraphStyle": "short" | "medium" | "long",
    "bulletPoints": true/false
  },
  "responsePatterns": {
    "startsWithGreeting": true/false,
    "addressesRecipientByName": true/false,
    "includesPleasantries": true/false,
    "directToPoint": true/false
  },
  "additionalNotes": "Other notable characteristics",
  "analyzed": true,
  "sampleCount": ${emails.length}
}

IMPORTANT: Extract the ACTUAL signature from the emails. Look for:
- Name at the end of emails
- Any title/company info
- Contact info in signature
- Consistent patterns in how they sign off

Respond ONLY with the JSON object, no other text.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at analyzing writing styles. Analyze the emails and return a detailed JSON profile. Pay special attention to signature patterns and language-specific greetings/closings. Respond only with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500, // Increased for detailed profile
    });

    const content = response.choices[0]?.message?.content?.trim();

    // Parse JSON response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('[Style Analyzer] Successfully parsed style profile:', JSON.stringify(parsed, null, 2));
        return parsed;
      }
    } catch (parseError) {
      console.error('[Style Analyzer] Failed to parse AI response:', parseError);
    }

    // Default profile if parsing fails
    return {
      formality: 'semi-formal',
      greetingPatterns: {
        turkish: ['Merhaba', 'İyi günler'],
        english: ['Hi', 'Hello'],
      },
      closingPatterns: {
        turkish: ['Saygılarımla', 'İyi çalışmalar'],
        english: ['Best regards', 'Thanks'],
      },
      signature: {
        hasSignature: false,
        name: null,
        title: null,
        company: null,
        phone: null,
        fullSignature: null,
      },
      averageLength: 'medium',
      primaryLanguage: 'tr',
      secondaryLanguage: 'en',
      tone: 'professional',
      writingCharacteristics: {
        usesEmoji: false,
        usesPunctuation: 'standard',
        paragraphStyle: 'medium',
        bulletPoints: false,
      },
      responsePatterns: {
        startsWithGreeting: true,
        addressesRecipientByName: true,
        includesPleasantries: true,
        directToPoint: false,
      },
      additionalNotes: 'Unable to fully analyze - using defaults',
      analyzed: false,
      sampleCount: emails.length,
    };
  } catch (error) {
    console.error('[Style Analyzer] OpenAI API error:', error);
    throw error;
  }
}

/**
 * Get style profile for a business
 */
export async function getStyleProfile(businessId) {
  const integration = await prisma.emailIntegration.findUnique({
    where: { businessId },
    select: {
      styleProfile: true,
      styleAnalysisStatus: true,
      styleAnalyzedAt: true,
    },
  });

  return integration;
}

/**
 * Trigger re-analysis of writing style
 */
export async function reanalyzeWritingStyle(businessId) {
  // Reset status and trigger analysis
  await prisma.emailIntegration.update({
    where: { businessId },
    data: {
      styleAnalysisStatus: 'PENDING',
      styleProfile: null,
      styleAnalyzedAt: null,
    },
  });

  // Run analysis in background
  setImmediate(() => {
    analyzeWritingStyle(businessId).catch((err) => {
      console.error(`[Style Analyzer] Background analysis failed:`, err);
    });
  });

  return { message: 'Style re-analysis started' };
}

export default {
  analyzeWritingStyle,
  getStyleProfile,
  reanalyzeWritingStyle,
};
