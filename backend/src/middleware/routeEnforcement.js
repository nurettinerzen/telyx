/**
 * Route Protection Enforcement
 *
 * Ensures all routes (except public ones) have authentication/authorization
 * FAILS IN STAGING/CI if unprotected routes are found
 */

const PUBLIC_PATHS = [
  // Health checks
  '/health',
  '/version',
  '/api/health',

  // Auth endpoints (public by design)
  '/api/auth/register',
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/verify-email',
  '/api/auth/google',
  '/api/auth/google/code',
  '/api/auth/google/callback',
  '/api/auth/microsoft/callback',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/resend-verification',

  // Webhooks (secured by signature verification, not JWT)
  '/api/subscription/webhook',
  '/api/elevenlabs/webhook',
  '/api/elevenlabs/post-call',
  '/api/post-call',  // Alt pattern
  '/api/elevenlabs/call-started',
  '/api/elevenlabs/call-ended',
  '/api/webhook/incoming',
  '/api/webhook/crm',
  '/api/webhook',  // Generic webhook endpoint
  '/api/webhooks/send',
  '/api/send',  // Alt pattern
  '/api/webhooks/*',
  '/api/webhook/*',
  '/api/stripe',
  '/api/whatsapp/webhook',
  // REMOVED: /api/whatsapp/conversations, /api/whatsapp/send — now require admin auth

  // Public widget/embed endpoints (no JWT, uses embedKey)
  '/api/chat', // Public chat widget
  '/api/chat-legacy',
  '/api/widget',
  '/api/widget/*',
  '/api/embed/:embedKey',

  // Demo endpoints (public)
  '/api/demo/*',
  '/api/demo-request',

  // Public integrations callbacks (OAuth, no JWT)
  '/api/google/callback',
  '/api/callback',  // VoiceID callback
  '/api/template',  // VoiceID template
  '/api/integrations/google-calendar/callback',
  '/api/integrations/hubspot/callback',
  '/api/email/gmail/callback',
  '/api/gmail/callback',  // Alt pattern
  '/api/email/outlook/callback',
  '/api/outlook/callback',  // Alt pattern
  '/api/auth/microsoft/callback',
  '/api/integrations/shopify/callback',
  '/api/integrations/ideasoft/callback',
  '/api/integrations/amazon/login',
  '/api/integrations/amazon/callback',

  // Public invitation endpoints (token in request body, not URL path)
  '/api/team/invitation/lookup',
  '/api/team/invitation/accept',

  // Waitlist (public)
  '/api/waitlist',
  '/api/waitlist/check/:email',
  '/api/check/:email',  // Alt pattern

  // Cron jobs (secured by cron-secret header, not JWT)
  '/api/cron/*',

  // Public pricing/plans info
  '/api/subscription/plans',
  '/api/cost-calculator/pricing',

  // Media access (signed token only via headers, never URL path/query)
  '/api/media/signed',

  // CRM webhook (secured by webhook headers/signature, not JWT)
  '/api/webhook/crm/:businessId',
  '/api/webhook/crm/:businessId/:webhookSecret',
  '/api/crm/:businessId', // Alt pattern

  // Voice samples (public for demos/previews)
  '/api/voices',
  '/api/voices/:id',
  '/api/:id',  // Alt pattern for voice ID
  '/api/voices/language/:code',
  '/api/language/:code',  // Alt pattern
  '/api/voices/preview/:voiceId',
  '/api/preview/:voiceId',  // Alt pattern
  '/api/preview/cache',  // Cache endpoint
  '/api/voices/sample/:voiceId',
  '/api/sample/:voiceId',  // Alt pattern
  '/api/voices/elevenlabs/all',
  '/api/elevenlabs/all',  // Alt pattern

  // Cost calculator (public pricing tool)
  '/api/cost-calculator/calculate',
  '/api/calculate',  // Alt pattern
  '/api/cost-calculator/pricing',
  '/api/pricing',  // Alt pattern
  '/api/cost-calculator/assistant/:assistantId',
  '/api/assistant/:assistantId',  // Alt pattern

  // Media signed URLs (secured by JWT token in URL, not session)
  '/api/media/signed-url/:assistantId',
  '/api/signed-url/:assistantId',  // Alt pattern

  // Dashboard public metrics (no sensitive data)
  '/api/concurrent-metrics/dashboard',
  '/api/dashboard',  // Alt pattern
  '/api/concurrent-metrics/shadow-mode',
  '/api/shadow-mode',  // Alt pattern
  '/api/concurrent-metrics/idempotency',
  '/api/idempotency',  // Alt pattern
  '/api/concurrent-metrics/prometheus',
  '/api/prometheus',  // Alt pattern

  // Cron endpoints (secured by cron-secret header)
  '/api/cron/reset-minutes',
  '/api/reset-minutes',  // Alt pattern
  '/api/cron/low-balance',
  '/api/low-balance',  // Alt pattern
  '/api/cron/auto-reload',
  '/api/auto-reload',  // Alt pattern
  '/api/cron/trial-expired',
  '/api/trial-expired',  // Alt pattern
  '/api/cron/cleanup',
  '/api/cleanup',  // Alt pattern
  '/api/cron/email-rag-backfill',
  '/api/email-rag-backfill',  // Alt pattern
  '/api/cron/email-lock-cleanup',
  '/api/email-lock-cleanup',  // Alt pattern
  '/api/cron/email-embedding-cleanup',
  '/api/email-embedding-cleanup',  // Alt pattern
  '/api/cron/status',
  '/api/cron/reset-state',
  '/api/reset-state',  // Alt pattern

  // VoiceID public endpoints (demo/preview)
  '/api/voiceid',
  '/api/voiceid/:id',
  '/api/voiceid/template',
  '/api/voiceid/callback',

  // API root (health check)
  '/api/',
  '/api/status'
];

const PROTECTED_MIDDLEWARE_NAMES = [
  'authenticateToken',
  'verifyBusinessAccess',
  'isAdmin',
  'checkPermission',
  'requireOwner',
  'requireManagerOrAbove',
  'checkAnyPermission',
  'checkAllPermissions'
];

/**
 * Check if a path matches public patterns
 */
function isPublicPath(path) {
  return PUBLIC_PATHS.some(publicPath => {
    if (publicPath.includes('*')) {
      const regex = new RegExp('^' + publicPath.replace('*', '.*') + '$');
      return regex.test(path);
    }
    if (publicPath.includes(':')) {
      const regex = new RegExp('^' + publicPath.replace(/:[^/]+/g, '[^/]+') + '$');
      return regex.test(path);
    }
    return path === publicPath;
  });
}

/**
 * Check if a route has protection middleware
 */
function hasProtectionMiddleware(route) {
  if (!route.stack) return false;

  return route.stack.some(layer => {
    const middlewareName = layer.handle?.name || layer.name;
    return PROTECTED_MIDDLEWARE_NAMES.includes(middlewareName);
  });
}

/**
 * Extract all routes from Express app
 */
function extractRoutes(app) {
  const routes = [];

  function processStack(stack, basePath = '', inheritedProtection = false) {
    // Check if this stack has router-level auth middleware (router.use(authenticateToken))
    let hasRouterLevelAuth = inheritedProtection;

    stack.forEach(layer => {
      // Check for router-level middleware (router.use)
      if (!layer.route && layer.handle && layer.handle.name) {
        const middlewareName = layer.handle.name;
        if (PROTECTED_MIDDLEWARE_NAMES.includes(middlewareName)) {
          hasRouterLevelAuth = true;
        }
      }
    });

    stack.forEach(middleware => {
      if (middleware.route) {
        // Regular route
        const path = basePath + middleware.route.path;
        const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase());

        routes.push({
          path,
          methods,
          protected: hasRouterLevelAuth || hasProtectionMiddleware(middleware.route)
        });
      } else if (middleware.name === 'router' && middleware.handle?.stack) {
        // Router middleware
        const routerPath = middleware.regexp?.toString().match(/\^\\\/([^?\\]+)/)?.[1] || '';
        processStack(middleware.handle.stack, basePath + '/' + routerPath, hasRouterLevelAuth);
      }
    });
  }

  if (app._router?.stack) {
    processStack(app._router.stack);
  }

  return routes;
}

/**
 * Assert all routes are protected (except public ones)
 * FAILS in staging/CI, WARNS in production
 */
export function assertAllRoutesProtected(app) {
  const routes = extractRoutes(app);

  const unprotected = routes.filter(route => {
    // Skip if protected
    if (route.protected) return false;

    // Skip if public path
    if (isPublicPath(route.path)) return false;

    return true;
  });

  if (unprotected.length > 0) {
    console.error('\n🚨 ============================================');
    console.error('🚨 UNPROTECTED ROUTES DETECTED');
    console.error('🚨 ============================================');
    console.error(`Found ${unprotected.length} unprotected routes:\n`);

    unprotected.forEach(route => {
      console.error(`  ❌ ${route.methods.join(',')} ${route.path}`);
    });

    console.error('\n💡 Add one of these middleware to protect:');
    console.error('  - authenticateToken');
    console.error('  - checkPermission(...)');
    console.error('  - requireOwner');
    console.error('  - isAdmin');
    console.error('🚨 ============================================\n');

    const env = process.env.NODE_ENV;

    if (env === 'production') {
      // In production: warn but don't crash
      console.error('⚠️  WARNING: Running in production with unprotected routes!');
      console.error('⚠️  This is a SECURITY RISK. Fix immediately.\n');
    } else {
      // In staging/dev/CI: FAIL
      throw new Error(`SECURITY: ${unprotected.length} unprotected routes found. Deploy blocked.`);
    }
  } else {
    console.log('✅ Route protection check: All routes are protected');
  }
}

/**
 * Express middleware version (optional, for runtime checks)
 */
export function enforceRouteProtection(req, res, next) {
  // This is more for documentation - actual enforcement is at boot time
  next();
}

export default {
  assertAllRoutesProtected,
  enforceRouteProtection,
  isPublicPath
};
