// ============================================================================
// EMAIL SERVICE
// ============================================================================
// FILE: backend/src/services/emailService.js
//
// Handles all email notifications using Resend
// ============================================================================

import { Resend } from 'resend';
import { sanitizeEmailAddress, sanitizeHeaderValue, escapeHtml } from '../utils/mailSanitizer.js';
import runtimeConfig, { buildBackendUrl, buildFrontendUrl } from '../config/runtime.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || 'Telyx.AI <notifications@telyx.ai>';
const SELF_SEND_FROM_EMAIL = process.env.SELF_SEND_FROM_EMAIL || 'Telyx.AI Notifications <notifications@telyx.ai>';
const INTERNAL_SIGNUP_NOTIFICATION_EMAIL = process.env.SIGNUP_NOTIFICATION_EMAIL
  || process.env.PUBLIC_CONTACT_OWNER_EMAIL
  || 'info@telyx.ai';
const FRONTEND_URL = runtimeConfig.frontendUrl;
const SITE_URL = runtimeConfig.siteUrl;

let resend = null;

if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
} else {
  console.warn('⚠️ RESEND_API_KEY not set. Email notifications will be logged only.');
}

/**
 * Send email helper
 */
const extractEmailAddress = (value = '') => {
  const sanitized = sanitizeHeaderValue(value);
  const match = sanitized.match(/<([^>]+)>/);
  return sanitizeEmailAddress(match?.[1] || sanitized);
};

const resolveFromEmail = (safeTo) => {
  const safeFrom = sanitizeHeaderValue(FROM_EMAIL);
  const fromAddress = extractEmailAddress(FROM_EMAIL);
  const selfSendFromAddress = extractEmailAddress(SELF_SEND_FROM_EMAIL);

  if (fromAddress && fromAddress === safeTo && selfSendFromAddress && selfSendFromAddress !== safeTo) {
    return sanitizeHeaderValue(SELF_SEND_FROM_EMAIL);
  }

  return safeFrom;
};

const sendEmail = async (to, subject, html) => {
  const safeTo = sanitizeEmailAddress(to);
  const safeSubject = sanitizeHeaderValue(subject);

  if (!safeTo) {
    console.error('[EMAIL] Invalid recipient:', JSON.stringify(to), 'type:', typeof to, 'safeTo:', JSON.stringify(safeTo));
    throw new Error('Invalid recipient email');
  }

  const safeFrom = resolveFromEmail(safeTo);

  if (!resend) {
    console.log(`📧 [EMAIL PREVIEW] From: ${safeFrom}, To: ${safeTo}, Subject: ${safeSubject}`);
    console.log(html);
    return { sent: false, reason: 'no_api_key' };
  }

  try {
    const result = await resend.emails.send({
      from: safeFrom,
      to: [safeTo],
      subject: safeSubject,
      html
    });
    console.log(`✅ Email sent to ${safeTo}: ${safeSubject} (ID: ${result.data?.id})`);
    return { sent: true, id: result.data?.id };
  } catch (error) {
    console.error('❌ Email send error:', error);
    throw error;
  }
};

/**
 * 1. Email Verification Email
 */
export const sendVerificationEmail = async (email, verificationUrl, businessName) => {
  const safeBusinessName = businessName ? escapeHtml(businessName) : '';
  const safeVerificationUrl = sanitizeHeaderValue(verificationUrl);
  const subject = 'Telyx.AI - Email Adresinizi Doğrulayın';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Email Adresinizi Doğrulayın</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 16px 0; color: #333333;">Merhaba${safeBusinessName ? ` <strong>${safeBusinessName}</strong>` : ''},</p>
          <p style="margin: 0 0 16px 0; color: #333333;">Telyx.AI'a kayıt olduğunuz için teşekkürler! Hesabınızı aktif hale getirmek için email adresinizi doğrulamanız gerekmektedir.</p>

          <p style="text-align: center;">
            <a href="${safeVerificationUrl}" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px;">Email Adresimi Doğrula</a>
          </p>

          <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 24px 0;">
            <p style="margin: 0; color: #333333;"><strong>⏰ Önemli:</strong> Bu link 10 dakika geçerlidir. Süre dolarsa yeni bir doğrulama linki talep edebilirsiniz.</p>
          </div>

          <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px 0;">
            Eğer butona tıklayamıyorsanız, aşağıdaki linki tarayıcınıza kopyalayabilirsiniz:<br>
            <a href="${safeVerificationUrl}" style="color: #667eea; word-break: break-all;">${safeVerificationUrl}</a>
          </p>

          <p style="font-size: 14px; color: #6b7280; margin: 0;">
            Bu hesabı siz oluşturmadıysanız, bu emaili görmezden gelebilirsiniz.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p style="margin: 0;">Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 2. Password Reset Email
 */
export const sendPasswordResetEmail = async (email, resetUrl) => {
  const safeResetUrl = sanitizeHeaderValue(resetUrl);
  const subject = 'Telyx.AI - Şifre Sıfırlama';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Şifre Sıfırlama</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba,</p>
          <p>Şifrenizi sıfırlamak için bir talep aldık. Yeni şifre belirlemek için aşağıdaki butona tıklayın:</p>

          <p style="text-align: center;">
            <a href="${safeResetUrl}" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px;">Şifremi Sıfırla</a>
          </p>

          <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 24px 0;">
            <p style="margin: 0;"><strong>⏰ Önemli:</strong> Bu link 10 dakika geçerlidir.</p>
          </div>

          <p style="font-size: 14px; color: #6b7280;">
            Eğer bu talebi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz. Şifreniz değişmeyecektir.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 3. Welcome Email (after verification)
 */
export const sendWelcomeEmail = async (email, userName) => {
  const safeUserName = userName ? escapeHtml(userName) : '';
  const subject = "Telyx.AI'a Hoş Geldiniz!";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>Telyx.AI'a Hoş Geldiniz!</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${safeUserName ? ` <strong>${safeUserName}</strong>` : ''},</p>
          <p>Telyx.AI ailesine hoş geldiniz! Hesabınız aktif ve kullanıma hazır.</p>

          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 24px 0;">
            <h3 style="margin-top: 0;">Başlamanız için birkaç adım:</h3>
            <div style="padding: 8px 0; color: #333333;">İlk asistanınızı oluşturun</div>
            <div style="padding: 8px 0; color: #333333;">Kanallarınızı bağlayın (WhatsApp, Telefon, Chat)</div>
            <div style="padding: 8px 0; color: #333333;">Bilgi bankasına dökümanlarınızı ekleyin</div>
          </div>

          <p style="background: #ecfdf5; padding: 16px; border-radius: 8px; border-left: 4px solid #10b981;">
            <strong>Deneme sürenizde:</strong><br>
            15 dakika telefon görüşmesi ve 7 gün chat/WhatsApp kullanım hakkınız var.
          </p>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Dashboard'a Git</a>
          </p>

          <p style="font-size: 14px; color: #6b7280;">
            Sorularınız mı var? <a href="mailto:info@telyx.ai" style="color: #667eea; word-break: break-all;">info@telyx.ai</a> adresinden bize ulaşabilirsiniz.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 4. Low Balance Alert (PAYG)
 */
export const sendLowBalanceAlert = async (email, currentBalance) => {
  const safeBalance = Number.isFinite(Number(currentBalance)) ? Number(currentBalance) : 0;
  const subject = 'Telyx.AI - Bakiyeniz Azalıyor';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>⚠️ Bakiyeniz Azalıyor</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba,</p>
          <p>Telyx.AI bakiyeniz düşük seviyeye geldi. Kesintisiz hizmet için bakiye yüklemenizi öneririz.</p>

          <div style="background-color: #fef3c7; padding: 24px; border-radius: 8px; text-align: center; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; color: #6b7280;">Mevcut Bakiye:</p>
            <p style="font-size: 32px; font-weight: bold; color: #d97706;">${safeBalance} TL</p>
          </div>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/billing" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Bakiye Yükle</a>
          </p>

          <div style="background-color: #eff6ff; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 24px 0;">
            <p style="margin: 0;"><strong>💡 İpucu:</strong> Otomatik yükleme özelliğini açarak bakiyenizin bitmesini önleyebilirsiniz.</p>
          </div>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 5. Overage Invoice
 */
export const sendOverageInvoice = async (email, overageMinutes, amount, billingPeriod) => {
  const subject = 'Telyx.AI - Aylık Aşım Faturanız';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>Aylık Aşım Faturanız</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba,</p>
          <p>${billingPeriod || 'Bu ay'} dönemi için aşım faturanız oluşturuldu.</p>

          <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 24px 0;">
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span>Aşım Dakikası:</span>
              <span>${overageMinutes} dk</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span>Birim Fiyat:</span>
              <span>23 TL/dk</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span>Toplam Tutar:</span>
              <span>${amount} TL</span>
            </div>
          </div>

          <p style="font-size: 14px; color: #6b7280;">
            Bu tutar kayıtlı kartınızdan otomatik olarak tahsil edilecektir.
          </p>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/billing" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Fatura Detayları</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 6. Email Change Verification
 */
export const sendEmailChangeVerification = async (newEmail, verificationUrl) => {
  const safeNewEmail = escapeHtml(newEmail || '');
  const safeVerificationUrl = sanitizeHeaderValue(verificationUrl);
  const subject = 'Telyx.AI - Yeni Email Adresinizi Doğrulayın';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>Yeni Email Doğrulama</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba,</p>
          <p>Email adresinizi <strong>${safeNewEmail}</strong> olarak değiştirmek istediğinizi gördük. Bu değişikliği tamamlamak için lütfen yeni email adresinizi doğrulayın.</p>

          <p style="text-align: center;">
            <a href="${safeVerificationUrl}" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Yeni Email Adresimi Doğrula</a>
          </p>

          <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 24px 0;">
            <p style="margin: 0;"><strong>⏰ Önemli:</strong> Bu link 10 dakika geçerlidir.</p>
          </div>

          <p style="font-size: 14px; color: #6b7280;">
            Bu işlemi siz başlatmadıysanız, lütfen bu emaili dikkate almayın ve hesap güvenliğinizi kontrol edin.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(newEmail, subject, html);
};

/**
 * 7. Assistant Created Email
 */
export const sendAssistantCreatedEmail = async (email, businessName) => {
  const subject = 'Telyx.AI - AI Asistanınız Hazır!';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>🎤 AI Asistanınız Hazır!</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>Harika haber! AI asistanınız oluşturuldu ve test etmeye hazır.</p>

          <div style="background-color: #eff6ff; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 24px 0;">
            <p style="margin: 0;"><strong>🎯 Şimdi deneyin:</strong><br>
            Dashboard'daki "Asistanı Test Et" butonuna tıklayarak AI'nızla konuşabilirsiniz.</p>
          </div>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/assistant" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Asistanı Test Et</a>
          </p>

          <p><strong>Gerçek aramalar için hazır mısınız?</strong><br>
          STARTER planına geçerek telefon numaranızı alın ve 7/24 arama almaya başlayın!</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 8. Phone Number Activated Email
 */
export const sendPhoneActivatedEmail = async (email, businessName, phoneNumber) => {
  const subject = 'Telyx.AI - Telefon Numaranız Aktif!';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>📞 Telefon Numaranız Aktif!</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>Tebrikler! AI asistanınız artık canlı ve aramaları yanıtlıyor.</p>

          <div style="background-color: #ecfdf5; padding: 24px; border-radius: 8px; text-align: center; margin: 24px 0; border: 2px solid: #10b981;">
            <p style="margin: 0 0 8px 0; color: #6b7280;">Telefon Numaranız:</p>
            <p style="font-size: 32px; font-weight: bold; color: #059669;">${phoneNumber}</p>
            <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 14px;">Bu numarayı müşterilerinizle paylaşın!</p>
          </div>

          <p><strong>Bundan sonra ne olacak?</strong></p>
          <ul>
            <li>Bu numaraya yapılan aramalar AI asistanınız tarafından yanıtlanacak</li>
            <li>Tüm konuşmalar dashboard'unuzda kaydedilecek</li>
            <li>Arama performansı analizlerini görebileceksiniz</li>
            <li>Asistan eğitimini istediğiniz zaman güncelleyebilirsiniz</li>
          </ul>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Dashboard'a Git</a>
          </p>

          <p style="background: #eff6ff; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <strong>💡 Pro İpucu:</strong> Bu numarayı kendiniz arayarak asistanınızı test edin!
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

function resolveUsageLimitEmailCopy(limitType, currentPlan = null) {
  const normalized = String(limitType || '').trim().toLowerCase();
  const nextPlan = currentPlan === 'STARTER' ? 'PRO' : 'ENTERPRISE';

  const copyByType = {
    minutes: {
      subjectWarning: 'Dakika limitiniz azalıyor',
      subjectReached: 'Dakika limitine ulasildi',
      label: 'dakika',
      bodyWarning: 'Aylik ses dakikasi limitinizin',
      bodyReached: `${currentPlan || 'Mevcut'} planinizdaki aylik dakika limitine ulasildi.`,
      actionText: 'Paketleri Goruntule'
    },
    package_minutes: {
      subjectWarning: 'Dahil dakikalariniz azaliyor',
      subjectReached: 'Dahil dakika limiti doldu',
      label: 'dakika',
      bodyWarning: 'Dahil ses dakikasi limitinizin',
      bodyReached: 'Dahil ses dakikalariniz tukenmek uzere veya tukendi.',
      actionText: 'Paketleri Goruntule'
    },
    credit_minutes: {
      subjectWarning: 'Ek ses paketiniz azaliyor',
      subjectReached: 'Ek ses paketi tukeniyor',
      label: 'dakika',
      bodyWarning: 'Ek ses dakikasi bakiyenizin',
      bodyReached: 'Ek ses dakikasi bakiyeniz kritik seviyeye geldi.',
      actionText: 'Add-on Satin Al'
    },
    written_interactions: {
      subjectWarning: 'Yazili etkilesim limitiniz azaliyor',
      subjectReached: 'Yazili etkilesim limiti doldu',
      label: 'yazili etkilesim',
      bodyWarning: 'Dahil yazili etkilesim limitinizin',
      bodyReached: 'Yazili etkilesim limitiniz doldu veya asim kullanimi basladi.',
      actionText: 'Paketi Incele'
    },
    calls: {
      subjectWarning: 'Arama limitiniz azaliyor',
      subjectReached: 'Arama limitine ulasildi',
      label: 'arama',
      bodyWarning: 'Aylik arama limitinizin',
      bodyReached: `${currentPlan || 'Mevcut'} planinizdaki aylik arama limitine ulasildi.`,
      actionText: `${nextPlan}'ya Yuksel`
    }
  };

  return copyByType[normalized] || copyByType.calls;
}

/**
 * 9. Limit Warning Email (at 80% usage)
 */
export const sendLimitWarningEmail = async (email, businessName, limitType, usage) => {
  const copy = resolveUsageLimitEmailCopy(limitType);
  const subject = `Telyx.AI - ${copy.subjectWarning}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>⚠️ Kullanım Uyarısı</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>${copy.bodyWarning} <strong>${usage.percentage}%</strong>'ini kullandiniz.</p>

          <div style="background-color: #fef3c7; padding: 24px; border-radius: 8px; margin: 24px 0;">
            <h3 style="margin-top: 0;">Mevcut Kullanım:</h3>
            <div style="background-color: #e5e7eb; height: 24px; border-radius: 12px; overflow: hidden; margin: 16px 0;">
              <div style="background-color: #667eea; height: 100%; transition: width 0.3s ease; width: ${usage.percentage}%;"></div>
            </div>
            <p style="text-align: center; margin: 0;"><strong>${usage.used} / ${usage.limit}</strong> ${copy.label}</p>
          </div>

          <p>Hizmet kesintisini önlemek için planınızı yükseltmeyi veya bakiye yüklemeyi düşünebilirsiniz.</p>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/subscription" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">${copy.actionText}</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 10. Limit Reached Email
 */
export const sendLimitReachedEmail = async (email, businessName, limitType, usage, currentPlan) => {
  const nextPlan = currentPlan === 'STARTER' ? 'PRO' : 'ENTERPRISE';
  const copy = resolveUsageLimitEmailCopy(limitType, currentPlan);
  const subject = `Telyx.AI - ${copy.subjectReached}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>🚫 Limite Ulaşıldı</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>${copy.bodyReached}</p>

          <div style="background-color: #f9fafb; padding: 18px 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Mevcut kullanim:</strong> ${usage.used} / ${usage.limit} ${copy.label}</p>
          </div>

          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 24px 0;">
            <p style="margin: 0;"><strong>⚠️ Bu ne anlama geliyor:</strong><br>
            ${String(limitType || '').toLowerCase() === 'written_interactions'
              ? 'Yazili kullanim havuzunuz tukenirse yeni yanitlar plan politikaniza gore bloklanir veya asim olarak ilerler.'
              : 'Mevcut limit politikasi nedeniyle yeni kullanim kisitlanabilir veya ek ucretlendirme devreye girebilir.'}</p>
          </div>

          <p><strong>${nextPlan} planına yükselterek devam edin:</strong></p>
          <ul>
            <li>${nextPlan === 'PRO' ? '500 dakika/ay' : 'Sınırsız dakika'}</li>
            <li>Gelişmiş analitikler</li>
            <li>Öncelikli destek</li>
          </ul>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/subscription" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">${copy.actionText}</a>
          </p>

          <p style="font-size: 14px; color: #6b7280;">
            Kullanımınız ayın 1'inde sıfırlanacak.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 11. Payment Success Email
 */
export const sendPaymentSuccessEmail = async (email, businessName, amount, plan) => {
  const subject = 'Telyx.AI - Ödeme Başarılı!';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>✅ Ödeme Başarılı</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>Teşekkürler! Ödemeniz başarıyla işlendi.</p>

          <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 24px 0;">
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span><strong>Plan:</strong></span>
              <span>${plan}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span><strong>Tutar:</strong></span>
              <span>${amount} TL</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span><strong>Durum:</strong></span>
              <span style="color: #10b981;"><strong>ÖDENDİ</strong></span>
            </div>
          </div>

          <p>Aboneliğiniz aktif ve asistanınız arama almaya hazır!</p>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Dashboard'a Git</a>
          </p>

          <p style="font-size: 14px; color: #6b7280;">
            Faturanıza ödeme ayarlarından ulaşabilirsiniz.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 12. Payment Failed Email
 */
export const sendPaymentFailedEmail = async (email, businessName) => {
  const subject = 'Telyx.AI - Ödeme Başarısız';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>❌ Ödeme Başarısız</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>Son ödemenizi işleyemedik. Bu çözülmezse hizmetiniz kesintiye uğrayabilir.</p>

          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 24px 0;">
            <p style="margin: 0;"><strong>⚠️ İşlem Gerekli:</strong><br>
            Telyx kullanmaya devam etmek için lütfen ödeme yönteminizi güncelleyin.</p>
          </div>

          <p><strong>Ödeme başarısızlığının yaygın nedenleri:</strong></p>
          <ul>
            <li>Yetersiz bakiye</li>
            <li>Kartın süresi dolmuş</li>
            <li>Yanlış fatura bilgileri</li>
          </ul>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/settings?tab=billing" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Ödeme Yöntemini Güncelle</a>
          </p>

          <p style="font-size: 14px; color: #6b7280;">
            Yardıma ihtiyacınız varsa bu emaile cevap verebilirsiniz.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 13. Monthly Reset Email
 */
export const sendMonthlyResetEmail = async (email, businessName, plan) => {
  const subject = 'Telyx.AI - Yeni Ay, Yeni Limitler!';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>🔄 Yeni Ay Başladı!</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>Harika haber! ${plan} planınız için aylık kullanım limitleri sıfırlandı.</p>

          <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 24px 0; border: 1px solid #e5e7eb;">
            <p style="margin: 0;"><strong>✨ Yeni limitler:</strong></p>
            <ul style="margin: 15px 0;">
              ${plan === 'STARTER' ? '<li>150 dakika</li>' : ''}
              ${plan === 'PRO' ? '<li>500 dakika</li>' : ''}
              ${plan === 'ENTERPRISE' ? '<li>Sınırsız!</li>' : ''}
            </ul>
          </div>

          <p>AI asistanınız harika bir ay daha için arama almaya hazır!</p>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/analytics" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Analizleri Görüntüle</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 14. Weekly Summary Email (PRO+ only)
 */
export const sendWeeklySummaryEmail = async (email, businessName, stats) => {
  const subject = `Telyx.AI - Haftalık Özet: ${stats.totalCalls} Arama`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>📊 Haftalık Özet</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">AI Asistan Performansınız</p>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>AI asistanınızın bu haftaki performansı:</p>

          <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 24px 0;">
            <h3 style="margin-top: 0; border-bottom: 2px solid #10b981; padding-bottom: 12px;">Temel Metrikler</h3>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span><strong>Toplam Arama:</strong></span>
              <span style="font-weight: bold; color: #10b981;">${stats.totalCalls}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span><strong>Ortalama Süre:</strong></span>
              <span>${stats.avgDuration}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span><strong>Müşteri Memnuniyeti:</strong></span>
              <span>${stats.satisfaction}% Olumlu</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span><strong>En Yoğun Gün:</strong></span>
              <span>${stats.busiestDay}</span>
            </div>
          </div>

          ${stats.topIntent ? `
          <div style="background-color: #ecfdf5; padding: 16px; border-radius: 8px; border-left: 4px solid #10b981; margin: 24px 0;">
            <p style="margin: 0;"><strong>💡 En Sık Arama Nedeni:</strong><br>
            ${stats.topIntent}</p>
          </div>
          ` : ''}

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/analytics" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Tam Raporu Görüntüle</a>
          </p>

          <p>Harika iş çıkarıyorsunuz!</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 15. Low Balance Warning Email (Alias for sendLowBalanceAlert)
 */
export const sendLowBalanceWarningEmail = async (email, dataOrBusinessName = {}, balanceArg = null, remainingMinutesArg = null) => {
  const data = (dataOrBusinessName && typeof dataOrBusinessName === 'object')
    ? dataOrBusinessName
    : {
        businessName: dataOrBusinessName,
        balance: balanceArg,
        remainingMinutes: remainingMinutesArg
      };

  return sendLowBalanceAlert(email, data?.balance ?? data?.currentBalance ?? data?.remainingMinutes ?? 0);
};

/**
 * 16. Trial Expired Notification
 */
export const sendTrialExpiredNotification = async ({ email, to, businessName }) => {
  const targetEmail = email || to;
  const subject = 'Telyx.AI - Deneme Süreniz Doldu';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>Deneme Süreniz Doldu</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>7 günlük deneme süreniz sona erdi. Telyx.AI'ı kullanmaya devam etmek için bir plan seçmeniz gerekiyor.</p>

          <p><strong>Size özel fırsatlar:</strong></p>
          <ul>
            <li><strong>PAYG (Kullandıkça Öde):</strong> Taahhütsüz, sadece kullandığınız kadar ödeyin</li>
            <li><strong>STARTER:</strong> 2.499 TL/ay, 150 dakika dahil</li>
            <li><strong>PRO:</strong> 7.499 TL/ay, 500 dakika dahil</li>
          </ul>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/subscription" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Plan Seç</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(targetEmail, subject, html);
};

/**
 * 17. Overage Bill Notification
 */
export const sendOverageBillNotification = async ({ email, to, businessName, overageMinutes, totalAmount, overageAmount }) => {
  return sendOverageInvoice(email || to, overageMinutes, totalAmount ?? overageAmount);
};

/**
 * 18. Overage Limit Reached Email
 */
export const sendOverageLimitReachedEmail = async (email, businessName, overageMinutes, maxOverageLimit) => {
  const subject = 'Telyx.AI - Aşım Limitine Ulaşıldı';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>Aşım Limitine Ulaşıldı</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>Bu ay için belirlenen maksimum aşım limitinize (${maxOverageLimit} dakika) ulaştınız.</p>

          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 24px 0;">
            <p style="margin: 0;"><strong>⚠️ Önemli:</strong><br>
            Hizmet kesintisini önlemek için bakiye yükleyin veya planınızı yükseltin.</p>
          </div>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/billing" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Bakiye Yükle</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 19. Auto Reload Failed Email
 */
export const sendAutoReloadFailedEmail = async (email, businessName, amount) => {
  const subject = 'Telyx.AI - Otomatik Yükleme Başarısız';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1>Otomatik Yükleme Başarısız</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p>Merhaba${businessName ? ` ${businessName}` : ''},</p>
          <p>Otomatik bakiye yükleme işleminiz (${amount} TL) başarısız oldu.</p>

          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 24px 0;">
            <p style="margin: 0;"><strong>⚠️ Olası Nedenler:</strong></p>
            <ul style="margin: 8px 0 0 0; padding-left: 20px;">
              <li>Yetersiz bakiye</li>
              <li>Kartın süresi dolmuş</li>
              <li>Kart limiti aşılmış</li>
            </ul>
          </div>

          <p>Hizmet kesintisini önlemek için lütfen ödeme yönteminizi kontrol edin veya manuel yükleme yapın.</p>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/billing" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Ödeme Yöntemini Güncelle</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p>Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea; word-break: break-all;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 20. Low Balance Warning (with data object)
 */
export const sendLowBalanceWarning = async ({ email, to, businessName, balance, currentBalance, threshold }) => {
  return sendLowBalanceAlert(email || to, balance ?? currentBalance ?? threshold ?? 0);
};

/**
 * 21. Team Invitation Email
 */
export const sendTeamInvitationEmail = async ({ email, inviterName, businessName, role, invitationUrl }) => {
  const subject = `${businessName} - Takıma Davet Edildiniz!`;

  const roleNames = {
    OWNER: 'Sahip',
    MANAGER: 'Yönetici',
    STAFF: 'Personel'
  };

  const roleName = roleNames[role] || role;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">🎉 Takıma Davet Edildiniz!</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 16px 0; color: #333333;">Merhaba,</p>
          <p style="margin: 0 0 16px 0; color: #333333;"><strong>${inviterName}</strong> sizi <strong>${businessName}</strong> organizasyonuna davet etti.</p>

          <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 24px 0; border: 1px solid #e5e7eb;">
            <p style="margin: 0 0 8px 0; color: #6b7280;">Davet Edilen Rol:</p>
            <div style="display: inline-block; padding: 6px 12px; background-color: #eff6ff; color: #1e40af; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 8px 0;">${roleName}</div>
            <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 14px;">
              ${role === 'OWNER' ? 'Tam yönetici erişimi - tüm ayarları yönetebilir, takım ekleyebilir/çıkarabilir.' : ''}
              ${role === 'MANAGER' ? 'Yönetici erişimi - asistanları yönetebilir, raporları görüntüleyebilir.' : ''}
              ${role === 'STAFF' ? 'Personel erişimi - temel dashboard erişimi ve sınırlı yönetim.' : ''}
            </p>
          </div>

          <p style="margin: 0 0 16px 0; color: #333333;">Daveti kabul etmek için aşağıdaki butona tıklayın. Telyx.AI hesabınız yoksa, kabul sırasında yeni bir hesap oluşturabilirsiniz.</p>

          <p style="text-align: center; margin: 24px 0;">
            <a href="${invitationUrl}" style="display: inline-block; padding: 16px 48px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Daveti Kabul Et</a>
          </p>

          <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 24px 0;">
            <p style="margin: 0; color: #333333;"><strong>⏰ Önemli:</strong> Bu davet linki 7 gün geçerlidir. Süre dolarsa yeni bir davet talep edebilirsiniz.</p>
          </div>

          <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px 0;">
            Eğer butona tıklayamıyorsanız, aşağıdaki linki tarayıcınıza kopyalayabilirsiniz:<br>
            <a href="${invitationUrl}" style="color: #667eea; word-break: break-all;">${invitationUrl}</a>
          </p>

          <p style="font-size: 14px; color: #6b7280; margin: 0;">
            Bu daveti siz talep etmediyseniz, bu emaili görmezden gelebilirsiniz.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p style="margin: 0;">Telyx.AI Ekibi<br>
          <a href="${SITE_URL}" style="color: #667eea;">${SITE_URL}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * 22. Waitlist Application Notification (to admin)
 */
export const sendWaitlistNotificationEmail = async ({ name, email, company, businessType, message }) => {
  const safeName = escapeHtml(name || '');
  const safeEmail = sanitizeEmailAddress(email) || 'invalid@email';
  const safeCompany = company ? escapeHtml(company) : '';
  const safeBusinessType = businessType ? escapeHtml(businessType) : '';
  const safeMessage = message ? escapeHtml(message) : '';
  const subject = `Yeni Waitlist Başvurusu: ${sanitizeHeaderValue(name || 'Unknown')}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #667eea; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Yeni Waitlist Başvurusu</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb;">
            <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Ad Soyad</span><br>
              <strong>${safeName}</strong>
            </div>
            <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">E-posta</span><br>
              <strong><a href="mailto:${safeEmail}" style="color: #667eea;">${safeEmail}</a></strong>
            </div>
            ${safeCompany ? `<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Şirket</span><br>
              <strong>${safeCompany}</strong>
            </div>` : ''}
            ${safeBusinessType ? `<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">İşletme Türü</span><br>
              <strong>${safeBusinessType}</strong>
            </div>` : ''}
            ${safeMessage ? `<div style="padding: 12px 0;">
              <span style="color: #6b7280; font-size: 14px;">Mesaj</span><br>
              <span>${safeMessage}</span>
            </div>` : ''}
          </div>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; padding: 12px 32px; background-color: #667eea; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Dashboard'a Git</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p style="margin: 0;">Telyx.AI Waitlist Bildirimi</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail('info@telyx.ai', subject, html);
};

export const sendLeadNotificationEmail = async (lead) => {
  const safeName = escapeHtml(lead?.name || '');
  const safeEmail = sanitizeEmailAddress(lead?.email) || '';
  const safePhone = lead?.phone ? escapeHtml(lead.phone) : '';
  const safeCompany = lead?.company ? escapeHtml(lead.company) : '';
  const safeBusinessType = lead?.businessType ? escapeHtml(lead.businessType) : '';
  const safeSource = lead?.source ? escapeHtml(lead.source) : 'UNKNOWN';
  const safeCampaign = lead?.campaignName ? escapeHtml(lead.campaignName) : '';
  const safeFormName = lead?.formName ? escapeHtml(lead.formName) : '';
  const subject = `Yeni Lead: ${sanitizeHeaderValue(lead?.name || lead?.email || 'Unknown')}`;
  const adminLeadUrl = buildFrontendUrl('/dashboard/admin/leads');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#051752,#006FEB);padding:28px 32px;color:#ffffff;">
                  <h1 style="margin:0;font-size:24px;">Yeni Lead Geldi</h1>
                  <p style="margin:8px 0 0 0;font-size:14px;opacity:.88;">${safeSource}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:20px 22px;">
                    <p style="margin:0 0 10px 0;"><strong>Ad:</strong> ${safeName}</p>
                    ${safeEmail ? `<p style="margin:0 0 10px 0;"><strong>Email:</strong> <a href="mailto:${safeEmail}" style="color:#006FEB;">${safeEmail}</a></p>` : ''}
                    ${safePhone ? `<p style="margin:0 0 10px 0;"><strong>Telefon:</strong> ${safePhone}</p>` : ''}
                    ${safeCompany ? `<p style="margin:0 0 10px 0;"><strong>Şirket:</strong> ${safeCompany}</p>` : ''}
                    ${safeBusinessType ? `<p style="margin:0 0 10px 0;"><strong>İşletme Türü:</strong> ${safeBusinessType}</p>` : ''}
                    ${safeCampaign ? `<p style="margin:0 0 10px 0;"><strong>Kampanya:</strong> ${safeCampaign}</p>` : ''}
                    ${safeFormName ? `<p style="margin:0;"><strong>Form:</strong> ${safeFormName}</p>` : ''}
                  </div>
                  <p style="margin:24px 0 0 0;text-align:center;">
                    <a href="${sanitizeHeaderValue(adminLeadUrl)}" style="display:inline-block;background:#111827;color:#ffffff !important;text-decoration:none;padding:14px 24px;border-radius:10px;font-size:14px;font-weight:600;">
                      Lead Panelini Aç
                    </a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return sendEmail(INTERNAL_SIGNUP_NOTIFICATION_EMAIL, subject, html);
};

export const sendLeadAutoResponseEmail = async (lead) => {
  const safeName = escapeHtml(lead?.name || '');
  const safeTo = sanitizeEmailAddress(lead?.email);
  if (!safeTo) {
    throw new Error('Lead email is required for autoresponse');
  }

  const yesUrl = buildBackendUrl(`/api/leads/respond/${encodeURIComponent(lead.responseToken)}?action=yes`);
  const noUrl = buildBackendUrl(`/api/leads/respond/${encodeURIComponent(lead.responseToken)}?action=no`);
  const subject = 'Telyx hakkında kısa bilgi';
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#051752,#006FEB);padding:28px 32px;color:#ffffff;">
                    <h1 style="margin:0;font-size:24px;">Telyx</h1>
                    <p style="margin:8px 0 0 0;font-size:14px;opacity:.9;">AI destekli müşteri iletişimi</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 16px 0;font-size:16px;">Merhaba${safeName ? ` ${safeName}` : ''},</p>
                    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                      İlginiz için teşekkürler. Telyx; telefon, WhatsApp, chat ve email üzerinden gelen müşteri taleplerini tek panelde toplayan ve AI ile 7/24 yanıtlamaya yardımcı olan bir platformdur.
                    </p>
                    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                      Özellikle tekrar eden müşteri soruları, geç dönüşler ve dağınık iletişim süreçlerini azaltmak için kullanılır.
                    </p>
                    <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
                      Sizin için kısa bir demo araması planlayabiliriz. Aşağıdan size uygun seçeneği işaretleyebilirsiniz.
                    </p>
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto 12px auto;">
                      <tr>
                        <td style="padding-right:8px;">
                          <a href="${sanitizeHeaderValue(yesUrl)}" style="display:inline-block;background:#006FEB;color:#ffffff !important;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px;font-weight:bold;">
                            Evet, demo araması istiyorum
                          </a>
                        </td>
                        <td style="padding-left:8px;">
                          <a href="${sanitizeHeaderValue(noUrl)}" style="display:inline-block;background:#e2e8f0;color:#0f172a !important;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px;font-weight:bold;">
                            Şu an ilgilenmiyorum
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 32px;background:#f8fafc;font-size:12px;color:#64748b;">
                    Telyx AI
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail(safeTo, subject, html);
};

/**
 * 23. Contact Form Notification (to admin)
 */
export const sendContactNotificationEmail = async ({ name, email, company, phone, businessType, message }) => {
  const safeName = escapeHtml(name || '');
  const safeEmail = sanitizeEmailAddress(email) || 'invalid@email';
  const safeCompany = company ? escapeHtml(company) : '';
  const safePhone = phone ? escapeHtml(phone) : '';
  const safeBusinessType = businessType ? escapeHtml(businessType) : '';
  const safeMessage = message ? escapeHtml(message) : '';
  const subject = `Yeni Iletisim Formu: ${sanitizeHeaderValue(name || 'Unknown')}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #111827; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Yeni Iletisim Formu</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb;">
            <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Ad Soyad</span><br>
              <strong>${safeName}</strong>
            </div>
            <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">E-posta</span><br>
              <strong><a href="mailto:${safeEmail}" style="color: #667eea;">${safeEmail}</a></strong>
            </div>
            ${safeCompany ? `<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Sirket</span><br>
              <strong>${safeCompany}</strong>
            </div>` : ''}
            ${safePhone ? `<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Telefon</span><br>
              <strong>${safePhone}</strong>
            </div>` : ''}
            ${safeBusinessType ? `<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Isletme Turu</span><br>
              <strong>${safeBusinessType}</strong>
            </div>` : ''}
            ${safeMessage ? `<div style="padding: 12px 0;">
              <span style="color: #6b7280; font-size: 14px;">Mesaj</span><br>
              <span>${safeMessage}</span>
            </div>` : ''}
          </div>

          <p style="text-align: center;">
            <a href="mailto:${safeEmail}" style="display: inline-block; padding: 12px 32px; background-color: #111827; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Talebe Don</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p style="margin: 0;">Telyx.AI Contact Form Notification</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail('info@telyx.ai', subject, html);
};

/**
 * 24. New Signup Notification (to admin)
 */
export const sendNewSignupNotificationEmail = async ({
  userName,
  email,
  businessName,
  businessType,
  country,
  plan = 'TRIAL',
  source = 'register'
}) => {
  const safeUserName = userName ? escapeHtml(userName) : '';
  const safeEmail = sanitizeEmailAddress(email) || 'invalid@email';
  const safeBusinessName = businessName ? escapeHtml(businessName) : '';
  const safeBusinessType = businessType ? escapeHtml(businessType) : '';
  const safeCountry = country ? escapeHtml(country) : 'TR';
  const safePlan = plan ? escapeHtml(plan) : 'TRIAL';
  const safeSource = source ? escapeHtml(source) : 'register';
  const signedAt = new Date().toLocaleString('tr-TR');
  const subject = `Yeni Kullanici Kaydi: ${sanitizeHeaderValue(email || businessName || 'Unknown')}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #111827; color: #ffffff; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Yeni Kullanici Kaydi</h1>
        </div>
        <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
          <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb;">
            ${safeUserName ? `<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Ad Soyad</span><br>
              <strong>${safeUserName}</strong>
            </div>` : ''}
            <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">E-posta</span><br>
              <strong><a href="mailto:${safeEmail}" style="color: #667eea;">${safeEmail}</a></strong>
            </div>
            ${safeBusinessName ? `<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Isletme</span><br>
              <strong>${safeBusinessName}</strong>
            </div>` : ''}
            <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Plan</span><br>
              <strong>${safePlan}</strong>
            </div>
            <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Ulke</span><br>
              <strong>${safeCountry}</strong>
            </div>
            ${safeBusinessType ? `<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Isletme Turu</span><br>
              <strong>${safeBusinessType}</strong>
            </div>` : ''}
            <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 14px;">Kaynak</span><br>
              <strong>${safeSource}</strong>
            </div>
            <div style="padding: 12px 0;">
              <span style="color: #6b7280; font-size: 14px;">Kayit Zamani</span><br>
              <strong>${escapeHtml(signedAt)}</strong>
            </div>
          </div>

          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/dashboard/admin/users" style="display: inline-block; padding: 12px 32px; background-color: #111827; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Admin Paneli Ac</a>
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
          <p style="margin: 0;">Telyx.AI Signup Notification</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(INTERNAL_SIGNUP_NOTIFICATION_EMAIL, subject, html);
};

export const sendAdminMfaCodeEmail = async (email, code, expiresAt) => {
  const safeCode = escapeHtml(code || '');
  const expiryLabel = expiresAt instanceof Date ? expiresAt.toLocaleString('en-US', { hour12: false }) : '';
  const subject = 'Telyx Admin MFA Verification Code';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #111827; color: #ffffff; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 22px; color: #ffffff;">Admin MFA Code</h1>
        </div>
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 12px 12px;">
          <p>A new admin verification code was requested for your account.</p>
          <div style="font-size: 32px; letter-spacing: 6px; font-weight: 700; text-align: center; margin: 20px 0; color: #111827;">
            ${safeCode}
          </div>
          <p>This code expires in 10 minutes${expiryLabel ? ` (until ${escapeHtml(expiryLabel)})` : ''}.</p>
          <p>If you did not request this code, contact security immediately.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

export default {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendLowBalanceAlert,
  sendOverageInvoice,
  sendEmailChangeVerification,
  sendAssistantCreatedEmail,
  sendPhoneActivatedEmail,
  sendLimitWarningEmail,
  sendLimitReachedEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendMonthlyResetEmail,
  sendWeeklySummaryEmail,
  sendLowBalanceWarningEmail,
  sendTrialExpiredNotification,
  sendOverageBillNotification,
  sendOverageLimitReachedEmail,
  sendAutoReloadFailedEmail,
  sendLowBalanceWarning,
  sendTeamInvitationEmail,
  sendWaitlistNotificationEmail,
  sendLeadNotificationEmail,
  sendLeadAutoResponseEmail,
  sendContactNotificationEmail,
  sendNewSignupNotificationEmail,
  sendAdminMfaCodeEmail
};
