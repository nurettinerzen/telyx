/**
 * Customer Identity Resolver
 *
 * Canonical lookup strategy:
 * 1. Strong identifier (orderNumber, ticketNumber) → Find in specific table → Get customerId
 * 2. Verify customerId with collected verification data (name, phone)
 * 3. Fallback: Search in CustomerData table with verification fields
 *
 * Returns:
 * - success: boolean
 * - customerId: string (if found)
 * - reason: string (if failed)
 * - suggestion: string (user-friendly hint)
 */

import prisma from '../prismaClient.js';
import { normalize } from './slot-processor.js';

/**
 * Calculate similarity between two strings (0-1)
 * Simple Levenshtein-based similarity
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 1.0;
  }

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Verify customer in database
 *
 * @param {Object} verificationData - Collected verification fields { name, phone, email }
 * @param {Object} collectedSlots - Other collected slots { orderNumber, ticketNumber }
 * @param {number} businessId - Business ID
 * @returns {Promise<Object>} Verification result
 */
export async function verifyInDatabase(verificationData, collectedSlots = {}, businessId) {
  console.log('[VerifyDB] Starting verification:', {
    verificationData: Object.keys(verificationData),
    collectedSlots: Object.keys(collectedSlots),
    businessId
  });

  // STRATEGY 1: Strong identifier lookup (order_number or ticket_number)
  if (collectedSlots.orderNumber) {
    console.log('[VerifyDB] Strategy 1: Order number lookup');
    return await verifyWithOrderNumber(
      collectedSlots.orderNumber,
      verificationData,
      businessId
    );
  }

  if (collectedSlots.ticketNumber) {
    console.log('[VerifyDB] Strategy 1: Ticket number lookup');
    return await verifyWithTicketNumber(
      collectedSlots.ticketNumber,
      verificationData,
      businessId
    );
  }

  // STRATEGY 2: Direct verification with CustomerData
  console.log('[VerifyDB] Strategy 2: Direct CustomerData lookup');
  return await verifyWithCustomerData(verificationData, businessId);
}

/**
 * Verify using order number
 */
async function verifyWithOrderNumber(orderNumber, verificationData, businessId) {
  const normalizedOrderNumber = normalize('order_number', orderNumber);

  console.log('[VerifyDB] Looking for order:', normalizedOrderNumber);

  // Check CrmOrder first (webhook data)
  const crmOrder = await prisma.crmOrder.findFirst({
    where: {
      businessId,
      orderNumber: normalizedOrderNumber
    }
  });

  if (crmOrder) {
    console.log('[VerifyDB] Found in CrmOrder');
    // Verify name and/or phone matches
    return verifyCustomerMatch(
      {
        customerName: crmOrder.customerName,
        customerPhone: crmOrder.customerPhone
      },
      verificationData,
      crmOrder.id // Use order ID as customerId for now
    );
  }

  // Check WebhookOrder (legacy webhook data)
  const webhookOrder = await prisma.webhookOrder.findFirst({
    where: {
      businessId,
      externalId: normalizedOrderNumber
    }
  });

  if (webhookOrder) {
    console.log('[VerifyDB] Found in WebhookOrder');
    return verifyCustomerMatch(
      {
        customerName: webhookOrder.customerName,
        customerPhone: webhookOrder.customerPhone
      },
      verificationData,
      webhookOrder.id
    );
  }

  // Not found
  console.log('[VerifyDB] Order not found');
  return {
    success: false,
    reason: 'order_not_found',
    suggestion: 'Sipariş numaranızı kontrol edip tekrar deneyin.'
  };
}

/**
 * Verify using ticket number
 */
async function verifyWithTicketNumber(ticketNumber, verificationData, businessId) {
  const normalizedTicketNumber = normalize('ticket_number', ticketNumber);

  console.log('[VerifyDB] Looking for ticket:', normalizedTicketNumber);

  const crmTicket = await prisma.crmTicket.findFirst({
    where: {
      businessId,
      ticketNumber: normalizedTicketNumber
    }
  });

  if (crmTicket) {
    console.log('[VerifyDB] Found in CrmTicket');
    return verifyCustomerMatch(
      {
        customerName: crmTicket.customerName,
        customerPhone: crmTicket.customerPhone
      },
      verificationData,
      crmTicket.id
    );
  }

  console.log('[VerifyDB] Ticket not found');
  return {
    success: false,
    reason: 'ticket_not_found',
    suggestion: 'Arıza/servis numaranızı kontrol edip tekrar deneyin.'
  };
}

/**
 * Verify using CustomerData table (Excel uploads)
 */
async function verifyWithCustomerData(verificationData, businessId) {
  console.log('[VerifyDB] Looking in CustomerData');

  // Normalize verification data
  const normalizedName = verificationData.name ? normalize('name', verificationData.name) : null;
  const normalizedPhone = verificationData.phone ? normalize('phone', verificationData.phone) : null;

  // Build query
  const whereConditions = {
    businessId
  };

  // Phone is most reliable - use it if available
  if (normalizedPhone) {
    whereConditions.phone = normalizedPhone;
  }

  if (Object.keys(whereConditions).length === 1) {
    // Only businessId - need more criteria
    console.log('[VerifyDB] Not enough verification data');
    return {
      success: false,
      reason: 'insufficient_data',
      suggestion: 'Lütfen isminizi ve telefon numaranızı doğru girin.'
    };
  }

  // Find customers matching phone
  const customers = await prisma.customerData.findMany({
    where: whereConditions,
    take: 10 // Limit results
  });

  if (customers.length === 0) {
    console.log('[VerifyDB] No customers found with phone:', normalizedPhone);
    return {
      success: false,
      reason: 'not_found',
      suggestion: 'Telefon numaranız kayıtlı değil. Lütfen kontrol edin.'
    };
  }

  console.log('[VerifyDB] Found', customers.length, 'customers with phone');

  // If name provided, filter by name similarity
  if (normalizedName) {
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const customer of customers) {
      const customerNormalizedName = customer.companyName
        ? normalize('name', customer.companyName)
        : (customer.contactName ? normalize('name', customer.contactName) : '');

      if (!customerNormalizedName) continue;

      const similarity = calculateSimilarity(normalizedName, customerNormalizedName);
      console.log('[VerifyDB] Name similarity:', similarity, 'for', customer.companyName || customer.contactName);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = customer;
      }
    }

    // Require at least 70% similarity
    if (bestMatch && bestSimilarity >= 0.7) {
      console.log('[VerifyDB] Found match with', (bestSimilarity * 100).toFixed(0), '% similarity');
      return {
        success: true,
        customerId: bestMatch.id
      };
    } else {
      console.log('[VerifyDB] No good name match (best:', (bestSimilarity * 100).toFixed(0), '%)');
      return {
        success: false,
        reason: 'name_mismatch',
        suggestion: 'İsminiz kayıtlı telefon numarasıyla eşleşmiyor. Lütfen kontrol edin.'
      };
    }
  }

  // No name provided - return first match by phone
  console.log('[VerifyDB] Matched by phone only');
  return {
    success: true,
    customerId: customers[0].id
  };
}

/**
 * Verify customer data matches
 */
function verifyCustomerMatch(dbCustomer, verificationData, customerId) {
  console.log('[VerifyDB] Verifying match:', {
    dbName: dbCustomer.customerName,
    dbPhone: dbCustomer.customerPhone,
    providedName: verificationData.name,
    providedPhone: verificationData.phone
  });

  // Normalize
  const dbNormalizedName = dbCustomer.customerName ? normalize('name', dbCustomer.customerName) : null;
  const dbNormalizedPhone = dbCustomer.customerPhone ? normalize('phone', dbCustomer.customerPhone) : null;
  const providedNormalizedName = verificationData.name ? normalize('name', verificationData.name) : null;
  const providedNormalizedPhone = verificationData.phone ? normalize('phone', verificationData.phone) : null;

  // Check phone match (if both available)
  if (dbNormalizedPhone && providedNormalizedPhone) {
    if (dbNormalizedPhone !== providedNormalizedPhone) {
      console.log('[VerifyDB] Phone mismatch');
      return {
        success: false,
        reason: 'phone_mismatch',
        suggestion: 'Telefon numaranız kayıtlı bilgilerle eşleşmiyor.'
      };
    }
  }

  // Check name match (if both available)
  if (dbNormalizedName && providedNormalizedName) {
    const similarity = calculateSimilarity(dbNormalizedName, providedNormalizedName);
    console.log('[VerifyDB] Name similarity:', similarity);

    if (similarity < 0.7) {
      console.log('[VerifyDB] Name mismatch');
      return {
        success: false,
        reason: 'name_mismatch',
        suggestion: 'İsminiz kayıtlı bilgilerle eşleşmiyor.'
      };
    }
  }

  // Match!
  console.log('[VerifyDB] Match successful');
  return {
    success: true,
    customerId: customerId
  };
}
