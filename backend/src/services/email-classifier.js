// ============================================================================
// EMAIL CLASSIFIER SERVICE (Smart Filtering)
// ============================================================================
// Classifies emails as personal/business vs automated/marketing
// Uses heuristics first, then AI for uncertain cases
// ============================================================================

import prisma from '../prismaClient.js';
import OpenAI from 'openai';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Known automated sender patterns
const AUTOMATED_SENDER_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^no_reply@/i,
  /^newsletter@/i,
  /^newsletters@/i,
  /^marketing@/i,
  /^notification@/i,
  /^notifications@/i,
  /^alert@/i,
  /^alerts@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounce@/i,
  /^donotreply@/i,
  /^do-not-reply@/i,
  /^updates@/i,
  /^news@/i,
  /^promo@/i,
  /^promotions@/i,
  /^billing@/i,
  /^invoice@/i,
  /^receipt@/i,
  /^order@/i,
  /^orders@/i,
  /^shipping@/i,
  /^tracking@/i,
  /^confirm@/i,
  /^confirmation@/i,
  /^verify@/i,
  /^verification@/i,
  /^welcome@/i,
  /^hello@/i,
  /^team@/i,
  /^support@/i,
  /^info@/i,
  /^service@/i,
  /^services@/i,
  /^digest@/i,
  /^weekly@/i,
  /^monthly@/i,
  /^daily@/i,
  /^auto@/i,
  /^automated@/i,
  /^system@/i,
  /^account@/i,
  /^accounts@/i,
  /^security@/i,
  /^feedback@/i,
  /^survey@/i,
  /^reply@/i,
  /^mail@/i,
  /^mailer@/i,
  /^daemon@/i,
  /^robot@/i,
  /^bot@/i,
];

// Known bulk sender domains
const BULK_SENDER_DOMAINS = [
  'sendgrid.net',
  'sendgrid.com',
  'mailchimp.com',
  'mailchimpapp.com',
  'amazonses.com',
  'amazon.com',
  'mailgun.org',
  'mailgun.com',
  'constantcontact.com',
  'hubspot.com',
  'hubspotemail.net',
  'salesforce.com',
  'marketo.com',
  'pardot.com',
  'klaviyo.com',
  'mailerlite.com',
  'sendinblue.com',
  'brevo.com',
  'campaign-archive.com',
  'createsend.com',
  'cmail19.com',
  'cmail20.com',
  'ctctcdn.com',
  'exacttarget.com',
  'postmarkapp.com',
  'intercom-mail.com',
  'intercom.io',
  'drip.com',
  'activecampaign.com',
  'convertkit.com',
  'getresponse.com',
  'aweber.com',
  'moosend.com',
  'omnisend.com',
  'freshdesk.com',
  'zendesk.com',
  'helpscout.net',
  'crisp.email',
  'tawk.to',
  'shopify.com',
  'squarespace.com',
  'wix.com',
  'wordpress.com',
  'substack.com',
  'beehiiv.com',
  'ghost.io',
  'buttondown.email',
  'linkedin.com',
  'facebookmail.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'pinterest.com',
  'youtube.com',
  'google.com',
  'apple.com',
  'microsoft.com',
  'paypal.com',
  'stripe.com',
  'square.com',
  'intuit.com',
  'quickbooks.intuit.com',
  'uber.com',
  'lyft.com',
  'doordash.com',
  'grubhub.com',
  'postmates.com',
  'airbnb.com',
  'booking.com',
  'expedia.com',
  'hotels.com',
  'capitalone.com',
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citi.com',
  'americanexpress.com',
  'discover.com',
  'directv.com',
  'directv-mail.com',
  'att.com',
  'verizon.com',
  'tmobile.com',
  'sprint.com',
  'comcast.com',
  'xfinity.com',
  'spectrum.com',
  'cox.com',
  'notifyvisitors.com',
  'sellerboard.com',
  'temu.com',
  'shein.com',
  'aliexpress.com',
  'wish.com',
  'ebay.com',
  'etsy.com',
  'target.com',
  'walmart.com',
  'bestbuy.com',
  'costco.com',
  'samsclub.com',
  'homedepot.com',
  'lowes.com',
  'wayfair.com',
  'overstock.com',
  'qrlynk.com',
  'breville.com',
  'vacationstogo.com',
  'socalgas.com',
  'elevenaccounting.com',
  'thesolutionsmaven.com',
  'link-trans.com',
];

/**
 * Classify an email sender
 * @param {number} businessId - Business ID
 * @param {string} senderEmail - Sender's email address
 * @param {object} emailData - Email metadata (subject, snippet, headers)
 * @returns {Promise<{classification: string, source: string}>}
 */
export async function classifyEmailSender(businessId, senderEmail, emailData = {}) {
  if (!senderEmail) {
    return { classification: 'PERSONAL', source: 'DEFAULT' };
  }

  const normalizedEmail = senderEmail.toLowerCase().trim();

  // Check cache first
  const cached = await getCachedClassification(businessId, normalizedEmail);
  if (cached) {
    return {
      classification: cached.classification,
      source: cached.classifiedBy,
      cached: true,
    };
  }

  // Apply heuristic checks
  const heuristicResult = applyHeuristics(normalizedEmail, emailData);
  if (heuristicResult.confident) {
    // Cache the result
    await cacheClassification(businessId, normalizedEmail, heuristicResult.classification, 'HEURISTIC');
    return {
      classification: heuristicResult.classification,
      source: 'HEURISTIC',
      reason: heuristicResult.reason,
    };
  }

  // Use AI for uncertain cases
  try {
    const aiResult = await classifyWithAI(senderEmail, emailData);
    await cacheClassification(businessId, normalizedEmail, aiResult.classification, 'AI');
    return {
      classification: aiResult.classification,
      source: 'AI',
      reason: aiResult.reason,
    };
  } catch (error) {
    console.error('[Email Classifier] AI classification failed:', error);
    // Default to personal if AI fails
    return {
      classification: 'PERSONAL',
      source: 'DEFAULT',
      reason: 'AI classification failed, defaulting to personal',
    };
  }
}

/**
 * Apply heuristic rules for classification
 */
function applyHeuristics(email, emailData = {}) {
  const localPart = email.split('@')[0];
  const domain = email.split('@')[1] || '';
  const headers = emailData.headers || {};
  const subject = emailData.subject || '';

  // Check sender patterns
  for (const pattern of AUTOMATED_SENDER_PATTERNS) {
    if (pattern.test(localPart) || pattern.test(email)) {
      return {
        classification: 'AUTOMATED',
        confident: true,
        reason: `Sender matches automated pattern: ${pattern}`,
      };
    }
  }

  // Check bulk sender domains
  for (const bulkDomain of BULK_SENDER_DOMAINS) {
    if (domain.includes(bulkDomain)) {
      return {
        classification: 'AUTOMATED',
        confident: true,
        reason: `Domain matches bulk sender: ${bulkDomain}`,
      };
    }
  }

  // Check headers for automated indicators
  if (headers['List-Unsubscribe'] || headers['list-unsubscribe']) {
    return {
      classification: 'AUTOMATED',
      confident: true,
      reason: 'Contains List-Unsubscribe header',
    };
  }

  if (headers['X-Mailer'] || headers['x-mailer']) {
    const mailer = headers['X-Mailer'] || headers['x-mailer'];
    if (/mailchimp|sendgrid|amazon\s*ses|mailgun|constant\s*contact/i.test(mailer)) {
      return {
        classification: 'AUTOMATED',
        confident: true,
        reason: `X-Mailer indicates bulk sender: ${mailer}`,
      };
    }
  }

  if (headers['X-Campaign'] || headers['x-campaign'] || headers['X-Campaign-Id']) {
    return {
      classification: 'AUTOMATED',
      confident: true,
      reason: 'Contains campaign header',
    };
  }

  // Check for common automated subject patterns
  const automatedSubjectPatterns = [
    /^(re:\s*)?\[?newsletter\]?/i,
    /^order\s*(confirmation|#|number)/i,
    /^shipping\s*(confirmation|update|notification)/i,
    /^your\s*(order|receipt|invoice|statement)/i,
    /^(verify|confirm)\s*(your|email|account)/i,
    /^password\s*reset/i,
    /^welcome\s*to/i,
    /^thank\s*you\s*for\s*(your\s*)?(order|purchase|signing)/i,
    /unsubscribe/i,
    /^weekly\s*(digest|update|summary)/i,
    /^monthly\s*(newsletter|update|report)/i,
    /^daily\s*(digest|update|summary)/i,
    /^\d+\+?\s*free\s*(channel|offer|trial)/i,
    /^(special|limited|exclusive)\s*(offer|deal|discount)/i,
    /^(sale|promo|promotion|discount)\s*(alert|code|offer)?/i,
    /^flash\s*sale/i,
    /^save\s*\d+%/i,
    /^\d+%\s*off/i,
    /^(last\s*chance|final\s*call|act\s*now|hurry)/i,
    /^don'?t\s*miss/i,
    /^(free\s*shipping|free\s*delivery)/i,
    /^(credit|account)\s*(statement|alert|update)/i,
    /^(payment|transaction)\s*(received|confirmed|alert)/i,
    /^(bill|invoice)\s*(ready|available|reminder)/i,
    /^(security|fraud)\s*alert/i,
    /^(new|important)\s*update/i,
    /^(app|software)\s*update/i,
    /^(rate|review|feedback|survey)\s*(your|our|this)?/i,
    /^how\s*was\s*your/i,
    /^we\s*miss\s*you/i,
    /^(come\s*back|return\s*to)/i,
    /^(reward|points|cashback)/i,
    /^(new\s*arrival|just\s*arrived|now\s*available)/i,
    /^(trending|popular|best\s*seller)/i,
    /^(subscription|membership)\s*(confirm|renew|expir)/i,
    /^(refund|return)\s*(confirm|process|status)/i,
    /^track\s*(your|package|order)/i,
    /^(out\s*for\s*delivery|delivered|shipped)/i,
    /^(tax|filing|irs|w-?2|1099)/i,
    /^(vergi|fatura|sipariş|kargo|teslimat)/i,
    /^(hoş\s*geldiniz|teşekkür|kampanya|indirim|fırsat)/i,
    /^important:\s*alerts/i,
    /star.*would\s*you\s*give/i,
    /value\s*your\s*feedback/i,
    /credit.*reached/i,
    /transunion/i,
    /restart\s*your\s*(free\s*)?(subscription|trial)/i,
  ];

  for (const pattern of automatedSubjectPatterns) {
    if (pattern.test(subject)) {
      return {
        classification: 'AUTOMATED',
        confident: true,
        reason: `Subject matches automated pattern: ${pattern}`,
      };
    }
  }

  // Check body content for marketing indicators
  const bodySnippet = (emailData.snippet || emailData.bodyPreview || emailData.bodyText || '').toLowerCase();
  const automatedBodyPatterns = [
    /unsubscribe/i,
    /click\s*here\s*to\s*(view|unsubscribe|opt)/i,
    /view\s*(this|email)\s*in\s*(browser|web)/i,
    /this\s*email\s*was\s*sent\s*(to|by)/i,
    /you('re|\s*are)\s*receiving\s*this\s*(email|message)/i,
    /manage\s*(your\s*)?(email\s*)?preferences/i,
    /email\s*preferences/i,
    /privacy\s*policy/i,
    /terms\s*(of\s*service|and\s*conditions)/i,
    /©\s*\d{4}/i,
    /all\s*rights\s*reserved/i,
    /this\s*is\s*an?\s*(automated|auto-generated)/i,
    /do\s*not\s*reply\s*(to\s*this\s*email)?/i,
    /no-reply/i,
    /if\s*you\s*no\s*longer\s*wish/i,
    /update\s*your\s*(communication\s*)?preferences/i,
    /this\s*information\s*is\s*only\s*visible\s*during\s*previews/i,
    /preheader:/i,
    /intake\s*id:/i,
  ];

  for (const pattern of automatedBodyPatterns) {
    if (pattern.test(bodySnippet)) {
      return {
        classification: 'AUTOMATED',
        confident: true,
        reason: `Body contains automated indicator: ${pattern}`,
      };
    }
  }

  // Not confident - needs AI classification
  return {
    classification: 'PERSONAL',
    confident: false,
    reason: 'No automated indicators found, needs AI verification',
  };
}

/**
 * Classify using AI for uncertain cases
 */
async function classifyWithAI(senderEmail, emailData) {
  const prompt = `Classify this email as either "personal" (requiring a human response) or "automated" (marketing, notifications, no response needed).

From: ${senderEmail}
Subject: ${emailData.subject || 'N/A'}
Snippet: ${emailData.snippet || emailData.bodyPreview || 'N/A'}

Consider:
- Is this from a real person expecting a reply?
- Or is it automated (newsletter, notification, marketing, receipt, etc.)?

Respond with ONLY one word: "personal" or "automated"`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You classify emails as personal or automated. Respond with only one word.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.1,
    max_tokens: 10,
  });

  const result = response.choices[0]?.message?.content?.trim().toLowerCase();

  return {
    classification: result === 'automated' ? 'AUTOMATED' : 'PERSONAL',
    reason: 'AI classification',
  };
}

/**
 * Get cached classification for a sender
 */
async function getCachedClassification(businessId, email) {
  const cached = await prisma.emailSenderCache.findUnique({
    where: {
      businessId_emailAddress: {
        businessId,
        emailAddress: email,
      },
    },
  });

  // Check if cache is expired
  if (cached && cached.expiresAt < new Date()) {
    // Delete expired cache
    await prisma.emailSenderCache.delete({
      where: { id: cached.id },
    });
    return null;
  }

  return cached;
}

/**
 * Cache a classification result
 */
async function cacheClassification(businessId, email, classification, source) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

  await prisma.emailSenderCache.upsert({
    where: {
      businessId_emailAddress: {
        businessId,
        emailAddress: email,
      },
    },
    update: {
      classification,
      classifiedBy: source,
      expiresAt,
    },
    create: {
      businessId,
      emailAddress: email,
      classification,
      classifiedBy: source,
      expiresAt,
    },
  });
}

/**
 * Override classification manually (user correction)
 */
export async function overrideClassification(businessId, email, newClassification) {
  const normalizedEmail = email.toLowerCase().trim();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  return prisma.emailSenderCache.upsert({
    where: {
      businessId_emailAddress: {
        businessId,
        emailAddress: normalizedEmail,
      },
    },
    update: {
      classification: newClassification,
      classifiedBy: 'USER_OVERRIDE',
      overriddenAt: new Date(),
      expiresAt,
    },
    create: {
      businessId,
      emailAddress: normalizedEmail,
      classification: newClassification,
      classifiedBy: 'USER_OVERRIDE',
      overriddenAt: new Date(),
      expiresAt,
    },
  });
}

/**
 * Get classification statistics for a business
 */
export async function getClassificationStats(businessId) {
  const stats = await prisma.emailSenderCache.groupBy({
    by: ['classification', 'classifiedBy'],
    where: {
      businessId,
      expiresAt: { gt: new Date() },
    },
    _count: true,
  });

  return stats;
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache() {
  const result = await prisma.emailSenderCache.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  console.log(`[Email Classifier] Cleaned up ${result.count} expired cache entries`);
  return result.count;
}

export default {
  classifyEmailSender,
  overrideClassification,
  getClassificationStats,
  cleanupExpiredCache,
};
