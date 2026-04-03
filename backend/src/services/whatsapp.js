/**
 * WhatsApp Business Integration Service
 * Meta Business API + Message Sending
 */

import axios from 'axios';
import crypto from 'crypto';
import { safeCompareStrings } from '../security/constantTime.js';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

class WhatsAppService {
  async listMessageTemplates(accessToken, wabaId, limit = 25) {
    try {
      const response = await axios.get(
        `${WHATSAPP_API_URL}/${wabaId}/message_templates`,
        {
          params: {
            fields: 'name,status,language,category,components',
            limit,
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return Array.isArray(response.data?.data) ? response.data.data : [];
    } catch (error) {
      console.error('WhatsApp list templates error:', error.response?.data);
      throw error;
    }
  }

  /**
   * Send text message
   */
  async sendMessage(accessToken, phoneNumberId, recipientPhone, message, options = {}) {
    const timeoutMs = Number(options.timeoutMs || process.env.WHATSAPP_SEND_TIMEOUT_MS || 15000);
    try {
      const response = await axios.post(
        `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: recipientPhone,
          type: 'text',
          text: { body: message }
        },
        {
          timeout: timeoutMs,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('WhatsApp send message error:', {
        timeoutMs,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      throw error;
    }
  }

  /**
   * Send template message
   */
  async sendTemplateMessage(
    accessToken,
    phoneNumberId,
    recipientPhone,
    templateName,
    templateParams = [],
    languageCode = 'en_US'
  ) {
    try {
      const response = await axios.post(
        `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: recipientPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components: templateParams
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('WhatsApp send template error:', error.response?.data);
      throw error;
    }
  }

  /**
   * Send follow-up message after call
   */
  async sendCallFollowUp(accessToken, phoneNumberId, recipientPhone, callSummary) {
    const message = `Thank you for calling! Here's a summary of our conversation:\n\n${callSummary}\n\nIf you have any questions, feel free to reach out!`;
    return this.sendMessage(accessToken, phoneNumberId, recipientPhone, message);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, appSecret) {
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');
    return safeCompareStrings(String(signature || ''), `sha256=${expectedSignature}`);
  }
}

export default new WhatsAppService();
