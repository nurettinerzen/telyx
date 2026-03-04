/**
 * Rate Limiter Middleware
 * Simple in-memory rate limiting for API endpoints
 * For production, consider using Redis for distributed rate limiting
 */

import { logRateLimitHit } from './securityEventLogger.js';

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // Default: 1 minute
    this.maxRequests = options.maxRequests || 100; // Default: 100 requests per window
    this.requests = new Map();

    // Clean up old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Middleware function for rate limiting
   */
  middleware() {
    return (req, res, next) => {
      // Get identifier (IP address or custom identifier)
      const identifier = this.getIdentifier(req);

      // Get current request count
      const now = Date.now();
      const requestData = this.requests.get(identifier) || { count: 0, resetTime: now + this.windowMs };

      // Check if window has expired
      if (now > requestData.resetTime) {
        requestData.count = 0;
        requestData.resetTime = now + this.windowMs;
      }

      // Increment request count
      requestData.count++;
      this.requests.set(identifier, requestData);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - requestData.count));
      res.setHeader('X-RateLimit-Reset', new Date(requestData.resetTime).toISOString());

      // Check if limit exceeded
      if (requestData.count > this.maxRequests) {
        // P0: Log rate limit hit to SecurityEvent for Red Alert monitoring
        // Fire-and-forget: Don't block response, log async in background
        logRateLimitHit(req, this.maxRequests, this.windowMs).catch(err => {
          console.error('Failed to log rate limit event:', err);
          // Don't block request even if logging fails
        });

        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Please try again after ${new Date(requestData.resetTime).toISOString()}`,
          retryAfter: Math.ceil((requestData.resetTime - now) / 1000)
        });
      }

      next();
    };
  }

  /**
   * Get identifier for rate limiting
   * Uses IP address by default, but can be customized
   */
  getIdentifier(req) {
    // Try to get real IP from common headers
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const ip = forwarded ? forwarded.split(',')[0] : realIp || req.ip || req.connection.remoteAddress;

    return ip;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [identifier, data] of this.requests.entries()) {
      if (now > data.resetTime + this.windowMs) {
        this.requests.delete(identifier);
      }
    }
  }

  /**
   * Reset rate limit for a specific identifier
   */
  reset(identifier) {
    this.requests.delete(identifier);
  }

  /**
   * Get current status for an identifier
   */
  getStatus(identifier) {
    const data = this.requests.get(identifier);
    if (!data) {
      return { count: 0, limit: this.maxRequests, remaining: this.maxRequests };
    }

    return {
      count: data.count,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - data.count),
      resetTime: new Date(data.resetTime).toISOString()
    };
  }
}

/**
 * Create rate limiter instances for different use cases
 */

// Rate limiter for webhook endpoints (500 requests per minute)
// CRM webhooks may send bulk data (e.g. 100+ stock/order items at once)
// TODO: Make dynamic per subscription plan (Free: 200, Pro: 500, Enterprise: unlimited)
export const webhookRateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 500 // 500 requests per minute for bulk imports
});

// Standard rate limiter for API endpoints (100 requests per minute)
export const apiRateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 100
});

// Lenient rate limiter for auth endpoints (10 requests per minute)
export const authRateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10
});

export default RateLimiter;
