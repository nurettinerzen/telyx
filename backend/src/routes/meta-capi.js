import express from 'express';
import rateLimit from 'express-rate-limit';
import { isCapiConfigured, resolveMetaEventName, sendMetaCapiEvent } from '../services/metaCapi.js';

const router = express.Router();

const capiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many CAPI events. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

function clientIpFromRequest(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || undefined;
}

router.post('/events', capiLimiter, async (req, res) => {
  if (!isCapiConfigured()) {
    return res.status(503).json({
      error: 'Meta Conversions API is not configured.',
      code: 'CAPI_NOT_CONFIGURED',
    });
  }

  const body = req.body || {};
  if (!resolveMetaEventName(body.eventName)) {
    return res.status(400).json({
      error: 'Unsupported event name for Meta Conversions API.',
      code: 'UNSUPPORTED_EVENT',
    });
  }

  const result = await sendMetaCapiEvent({
    eventName: body.eventName,
    eventId: body.eventId,
    eventTime: body.eventTime,
    eventSourceUrl: body.eventSourceUrl || body.pageUrl,
    customData: body.customData || body.params,
    fbp: body.fbp,
    fbc: body.fbc,
    email: body.email || req.user?.email,
    phone: body.phone || req.user?.phone,
    externalId: body.externalId || req.user?.id,
    clientIp: clientIpFromRequest(req),
    clientUserAgent: req.headers['user-agent'],
  });

  if (!result.success) {
    if (result.code === 'CAPI_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Meta Conversions API is not configured.', code: result.code });
    }
    if (result.code === 'UNSUPPORTED_EVENT') {
      return res.status(400).json({ error: 'Unsupported event name for Meta Conversions API.', code: result.code });
    }
    return res.status(502).json({
      error: 'Meta Conversions API forward failed.',
      code: result.code,
      upstreamStatus: result.upstreamStatus,
      upstreamError: result.upstreamError,
    });
  }

  return res.status(202).json({
    success: true,
    eventId: result.eventId,
    metaEventName: result.metaEventName,
    eventsReceived: result.eventsReceived,
    fbtraceId: result.fbtraceId,
  });
});

export default router;
