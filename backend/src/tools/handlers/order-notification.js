/**
 * Order Notification Handler
 * Sends order notification to business owner via SMS/WhatsApp
 */

import prisma from '../../prismaClient.js';
import netgsmService from '../../services/netgsm.js';
import whatsappService from '../../services/whatsapp.js';
import { ok, validationError, systemError } from '../toolResult.js';

/**
 * Format order notification message
 */
function formatOrderNotification(orderData, language = 'TR') {
  const { customerName, customerPhone, orderItems } = orderData;

  if (language === 'TR') {
    return `🛒 Yeni Sipariş Bildirimi

👤 Müşteri: ${customerName}
📞 Telefon: ${customerPhone}

📦 Sipariş Detayı:
${orderItems}

Sipariş alındı ve işleme alınıyor.`;
  } else {
    return `🛒 New Order Notification

👤 Customer: ${customerName}
📞 Phone: ${customerPhone}

📦 Order Details:
${orderItems}

Order received and processing.`;
  }
}

/**
 * Execute order notification
 */
export async function execute(args, business, context = {}) {
  try {
    const { customer_name, customer_phone, order_items } = args;
    const language = business.language || 'TR';

    // SECURITY: Don't log customer PII
    console.log('📦 Sending order notification:', {
      has_name: !!customer_name,
      has_phone: !!customer_phone,
      item_count: order_items?.length || 0
    });

    // Validate required parameters
    if (!customer_name || !customer_phone || !order_items) {
      const missing = [
        !customer_name && 'customer_name',
        !customer_phone && 'customer_phone',
        !order_items && 'order_items'
      ].filter(Boolean);

      return validationError(
        language === 'TR'
          ? `Eksik bilgi: ${missing.join(', ')}`
          : `Missing information: ${missing.join(', ')}`,
        missing.join(', ')
      );
    }

    // Get business owner's contact info
    const ownerPhone = business.phoneNumbers?.[0];

    if (!ownerPhone) {
      return validationError(
        language === 'TR'
          ? 'İşletme sahibinin telefon numarası yapılandırılmamış.'
          : 'Business owner phone number not configured.',
        'owner_phone'
      );
    }

    // Format notification message
    const notificationMessage = formatOrderNotification(
      {
        customerName: customer_name,
        customerPhone: customer_phone,
        orderItems: order_items
      },
      language
    );

    // Check if business prefers WhatsApp or SMS
    const whatsappIntegration = business.integrations?.find(
      i => i.type === 'WHATSAPP' && i.isActive
    );

    let notificationSent = false;

    if (whatsappIntegration) {
      // Send via WhatsApp
      try {
        const { accessToken, phoneNumberId } = whatsappIntegration.credentials;
        await whatsappService.sendMessage(
          accessToken,
          phoneNumberId,
          ownerPhone,
          notificationMessage
        );
        notificationSent = true;
        console.log('✅ WhatsApp notification sent');
      } catch (whatsappError) {
        console.error('⚠️ WhatsApp failed, falling back to SMS:', whatsappError);
      }
    }

    // If WhatsApp not available or failed, send SMS
    if (!notificationSent) {
      try {
        await netgsmService.sendSMS(ownerPhone, notificationMessage);
        console.log('✅ SMS notification sent');
        notificationSent = true;
      } catch (smsError) {
        console.error('❌ SMS notification also failed:', smsError);
      }
    }

    // Return result
    const successMessage = language === 'TR'
      ? `Siparişiniz alındı. İşletme sahibine bildirim gönderildi. En kısa sürede sizinle iletişime geçilecek.`
      : `Your order has been received. Notification sent to business owner. They will contact you shortly.`;

    return ok({ notificationSent }, successMessage);

  } catch (error) {
    console.error('❌ Send order notification error:', error);
    return systemError(
      business.language === 'TR'
        ? 'Sipariş bildirimi gönderilemedi. Lütfen tekrar deneyin.'
        : 'Could not send order notification. Please try again.',
      error
    );
  }
}

export default { execute };
