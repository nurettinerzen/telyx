/**
 * Appointment Handler
 * Creates appointments in business's Google Calendar and sends notifications
 */

import { PrismaClient } from '@prisma/client';
import googleCalendarService from '../../services/google-calendar.js';
import netgsmService from '../../services/netgsm.js';
import axios from 'axios';
import { ok, validationError, systemError } from '../toolResult.js';
import { maskPhone } from '../../utils/pii-redaction.js';
import { decryptGoogleTokenCredentials, encryptGoogleTokenCredentials } from '../../utils/google-oauth-tokens.js';

const prisma = new PrismaClient();

/**
 * Format appointment notification message for SMS/WhatsApp
 */
function formatAppointmentNotification(appointmentData, language = 'TR') {
  const { customerName, customerPhone, appointmentDate, serviceType } = appointmentData;

  const date = new Date(appointmentDate);
  const dateStr = date.toLocaleDateString('tr-TR');
  const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  if (language === 'TR') {
    return `🗓️ Yeni Randevu Bildirimi

📅 Tarih: ${dateStr}
⏰ Saat: ${timeStr}
👤 Müşteri: ${customerName}
📞 Telefon: ${customerPhone}
${serviceType ? `✨ Hizmet: ${serviceType}` : ''}

Randevu sisteminize kaydedildi.`;
  } else {
    return `🗓️ New Appointment Notification

📅 Date: ${date.toLocaleDateString('en-US')}
⏰ Time: ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
👤 Customer: ${customerName}
📞 Phone: ${customerPhone}
${serviceType ? `✨ Service: ${serviceType}` : ''}

Appointment saved to your system.`;
  }
}

/**
 * Execute appointment creation
 */
export async function execute(args, business, context = {}) {
  try {
    const { date, time, customer_name, customer_phone, service_type } = args;
    const language = business.language || 'TR';

    console.log('📅 Creating appointment:', { date, time, customer_name, customer_phone, service_type });

    // Validate required parameters
    if (!date || !time || !customer_name || !customer_phone) {
      const missing = [
        !date && 'date',
        !time && 'time',
        !customer_name && 'customer_name',
        !customer_phone && 'customer_phone'
      ].filter(Boolean);

      return validationError(
        language === 'TR'
          ? `Eksik bilgi: ${missing.join(', ')}`
          : `Missing information: ${missing.join(', ')}`,
        missing.join(', ')
      );
    }

    // Parse appointment date/time
    let appointmentDateTime;
    try {
      appointmentDateTime = new Date(`${date}T${time}`);

      if (isNaN(appointmentDateTime.getTime())) {
        appointmentDateTime = new Date(`${date} ${time}`);
      }

      if (isNaN(appointmentDateTime.getTime())) {
        throw new Error('Invalid date/time format');
      }
    } catch (error) {
      return validationError(
        language === 'TR'
          ? 'Geçersiz tarih/saat formatı. Örnek: 2024-01-15, 14:30'
          : 'Invalid date/time format. Example: 2024-01-15, 14:30',
        'date, time'
      );
    }

    // Check if business has Google Calendar connected
    const googleCalendarIntegration = business.integrations?.find(
      i => i.type === 'GOOGLE_CALENDAR' && i.isActive
    );

    let calendarEventId = null;

    if (googleCalendarIntegration) {
      console.log('📅 Creating Google Calendar event for business:', business.name);

      try {
        const {
          credentials,
          needsMigration
        } = decryptGoogleTokenCredentials(googleCalendarIntegration.credentials);
        const { access_token, refresh_token } = credentials;

        if (needsMigration && googleCalendarIntegration.id) {
          await prisma.integration.update({
            where: { id: googleCalendarIntegration.id },
            data: {
              credentials: encryptGoogleTokenCredentials(credentials)
            }
          });
        }

        const duration = business.bookingDuration || 30;
        const endDateTime = new Date(appointmentDateTime.getTime() + duration * 60000);

        const event = await googleCalendarService.createEvent(
          access_token,
          refresh_token,
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          {
            summary: `${service_type || 'Appointment'} - ${customer_name}`,
            description: `Customer: ${customer_name}\nPhone: ${customer_phone}\nService: ${service_type || 'Not specified'}\nSource: ${context.channel || 'AI Assistant'}`,
            start: {
              dateTime: appointmentDateTime.toISOString(),
              timeZone: business.timezone || 'Europe/Istanbul'
            },
            end: {
              dateTime: endDateTime.toISOString(),
              timeZone: business.timezone || 'Europe/Istanbul'
            },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'email', minutes: 24 * 60 },
                { method: 'popup', minutes: 30 }
              ]
            }
          }
        );

        calendarEventId = event.id;
        console.log('✅ Google Calendar event created:', calendarEventId);
      } catch (calendarError) {
        console.error('❌ Google Calendar error:', calendarError);
        // Continue anyway - we'll still save to database
      }
    }

    // Send WhatsApp notification to business owner
    if (business.ownerWhatsApp) {
      try {
        console.log('📱 Sending WhatsApp notification to:', business.ownerWhatsApp);

        await axios({
          method: 'POST',
          url: `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          data: {
            messaging_product: 'whatsapp',
            to: business.ownerWhatsApp,
            type: 'text',
            text: {
              body: `🎉 *New Appointment!*\n\nCustomer: ${customer_name}\nPhone: ${customer_phone}\nDate: ${date}\nTime: ${time}\nService: ${service_type || 'Not specified'}`
            }
          }
        });

        console.log('✅ WhatsApp notification sent successfully');
      } catch (whatsappError) {
        console.error('❌ WhatsApp notification failed:', whatsappError.response?.data || whatsappError.message);
      }
    }

    // Save appointment to database
    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerName: customer_name,
        customerPhone: customer_phone,
        appointmentDate: appointmentDateTime,
        duration: business.bookingDuration || 30,
        serviceType: service_type || null,
        status: 'CONFIRMED',
        notes: `Created via ${context.channel || 'AI assistant'}${calendarEventId ? ` - Google Calendar Event ID: ${calendarEventId}` : ''}`
      }
    });

    console.log('✅ Appointment saved to database:', appointment.id);

    // Send SMS notification to business owner
    try {
      const ownerPhone = business.phoneNumbers?.[0];

      if (ownerPhone) {
        const notificationMessage = formatAppointmentNotification(
          {
            customerName: customer_name,
            customerPhone: customer_phone,
            appointmentDate: appointmentDateTime,
            serviceType: service_type
          },
          language
        );

        await netgsmService.sendSMS(ownerPhone, notificationMessage);
        console.log('✅ SMS notification sent to business owner');
      }
    } catch (smsError) {
      console.error('⚠️ SMS notification failed (non-critical):', smsError);
    }

    // Return success message (SECURITY: mask phone to pass response firewall)
    const maskedPhone = maskPhone(customer_phone);
    const successMessage = language === 'TR'
      ? `Randevunuz ${date} tarihinde saat ${time} için başarıyla oluşturuldu. Randevu bilgileriniz ${maskedPhone} numarasına SMS ile gönderilecek.`
      : `Your appointment has been successfully created for ${date} at ${time}. Appointment details will be sent to ${maskedPhone} via SMS.`;

    return ok({
      appointmentId: appointment.id,
      calendarEventId: calendarEventId,
      confirmedDate: appointmentDateTime.toISOString()
    }, successMessage);

  } catch (error) {
    console.error('❌ Create appointment error:', error);
    return systemError(
      business.language === 'TR'
        ? 'Randevu oluşturulamadı. Lütfen tekrar deneyin.'
        : 'Could not create appointment. Please try again.',
      error
    );
  }
}

export default { execute };
