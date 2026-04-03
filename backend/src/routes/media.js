/**
 * Media Access Routes
 *
 * Provides secure signed URL access to media files
 * SECURITY: mediaId-based (not path-based) to prevent path traversal
 */

import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import prisma from '../prismaClient.js';
import { verifySignedMediaToken } from '../utils/signedUrl.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiter for media access
const mediaAccessLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: 'Çok fazla medya erişim isteği. Lütfen 1 dakika bekleyin.',
  standardHeaders: true,
  legacyHeaders: false
});

function extractMediaAccessToken(req) {
  const headerToken = req.headers['x-media-access-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * GET /api/media/signed
 * Serve media file with signed token passed in header (never in URL)
 */
router.get('/signed', mediaAccessLimiter, async (req, res) => {
  try {
    const token = extractMediaAccessToken(req);
    if (!token) {
      return res.status(400).json({ error: 'Media access token is required in header' });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifySignedMediaToken(token);
    } catch (error) {
      return res.status(403).json({ error: 'Token geçersiz veya süresi dolmuş' });
    }

    const { mediaId, userId, businessId } = decoded;

    // Fetch media record from database
    const media = await prisma.mediaFile.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        businessId: true,
        filePath: true,
        mimeType: true,
        fileName: true
      }
    });

    if (!media) {
      return res.status(404).json({ error: 'Medya bulunamadı' });
    }

    // Business isolation check
    if (media.businessId !== businessId) {
      console.warn(`⚠️ Business isolation violation: User ${userId} tried to access media from business ${media.businessId}`);
      return res.status(403).json({ error: 'Bu medyaya erişim yetkiniz yok' });
    }

    // Verify user belongs to business
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        businessId: businessId
      }
    });

    if (!user) {
      console.warn(`⚠️ User-business mismatch: User ${userId} not in business ${businessId}`);
      return res.status(403).json({ error: 'Erişim yetkiniz yok' });
    }

    // Path traversal protection: Resolve absolute path and check base dir
    const MEDIA_BASE_DIR = path.resolve(process.env.MEDIA_DIR || './uploads/media');
    const requestedPath = path.resolve(MEDIA_BASE_DIR, media.filePath);

    // Ensure resolved path is within base directory
    if (!requestedPath.startsWith(MEDIA_BASE_DIR)) {
      console.error(`🚨 Path traversal attempt: ${media.filePath} resolved to ${requestedPath}`);
      return res.status(403).json({ error: 'Geçersiz dosya yolu' });
    }

    // Check file exists
    try {
      await fs.access(requestedPath);
    } catch {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }

    // Set security headers
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', media.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${media.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    // Serve file
    res.sendFile(requestedPath);
  } catch (error) {
    console.error('Media access error:', error);
    res.status(500).json({ error: 'Medya erişim hatası' });
  }
});

export default router;
