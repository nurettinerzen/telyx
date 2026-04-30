const path = require('path');

const normalizeAppEnv = (value) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (['production', 'prod', 'live'].includes(normalized)) return 'production';
  if (['beta', 'staging', 'stage', 'preview', 'preprod'].includes(normalized)) return 'beta';
  if (normalized === 'test') return 'test';

  return 'development';
};

const isNextNoModulePolyfillPlugin = (plugin) => {
  const normalizedFilePath = typeof plugin?.filePath === 'string'
    ? path.normalize(plugin.filePath)
    : '';

  return plugin?.constructor?.name === 'CopyFilePlugin'
    && normalizedFilePath.endsWith(path.join('polyfills', 'polyfill-nomodule.js'));
};

const toOrigin = (value) => {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const appEnv = normalizeAppEnv(process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV);
const isBetaApp = appEnv === 'beta';
const frameAncestors = process.env.CSP_FRAME_ANCESTORS || "'none'";
const connectSrcValues = new Set([
  "'self'",
  'https:',
  'wss:',
]);
const apiOrigin = toOrigin(process.env.NEXT_PUBLIC_API_URL);

if (apiOrigin) {
  connectSrcValues.add(apiOrigin);
}

connectSrcValues.add('https://www.facebook.com');
connectSrcValues.add('https://*.facebook.com');
connectSrcValues.add('https://connect.facebook.net');
connectSrcValues.add('https://*.facebook.net');
connectSrcValues.add('https://www.clarity.ms');
connectSrcValues.add('https://*.clarity.ms');

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  `frame-ancestors ${frameAncestors}`,
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://accounts.google.com https://apis.google.com https://www.gstatic.com https://www.googletagmanager.com https://www.google-analytics.com https://tagassistant.google.com https://static.iyzipay.com https://sandbox-static.iyzipay.com https://connect.facebook.net https://*.facebook.net https://*.facebook.com https://*.fbcdn.net https://www.clarity.ms https://*.clarity.ms",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https:",
  `connect-src ${Array.from(connectSrcValues).join(' ')}`,
  "frame-src 'self' https://accounts.google.com https://*.google.com https://www.googletagmanager.com https://tagassistant.google.com https://*.iyzipay.com https://www.facebook.com https://web.facebook.com https://*.facebook.com",
  "form-action 'self' https:",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Content-Security-Policy', value: `${contentSecurityPolicy};` },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
];
const indexingHeaders = isBetaApp
  ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }]
  : [];

const noStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'Pragma', value: 'no-cache' },
];
const nextStaticHeaders = appEnv === 'development'
  ? noStoreHeaders
  : [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
const microphoneEnabledHeader = {
  key: 'Permissions-Policy',
  value: 'geolocation=(), microphone=(self), camera=()',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...securityHeaders, ...indexingHeaders],
      },
      {
        source: '/auth/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/dashboard/:path*',
        headers: [
          ...noStoreHeaders,
          microphoneEnabledHeader,
        ],
      },
      {
        source: '/demo-preview/:path*',
        headers: [
          ...noStoreHeaders,
          microphoneEnabledHeader,
        ],
      },
      {
        source: '/dashboard/integrations',
        headers: [
          ...noStoreHeaders,
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      {
        source: '/auth/meta/whatsapp-callback',
        headers: [
          ...noStoreHeaders,
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      {
        source: '/login',
        headers: [
          ...noStoreHeaders,
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      {
        source: '/register',
        headers: [
          ...noStoreHeaders,
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      {
        source: '/signup',
        headers: [
          ...noStoreHeaders,
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      {
        source: '/forgot-password',
        headers: noStoreHeaders,
      },
      {
        source: '/reset-password',
        headers: noStoreHeaders,
      },
      {
        source: '/_next/static/:path*',
        headers: nextStaticHeaders,
      },
    ];
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/voices/preview/:voiceId',
        destination: `${backendUrl}/api/voices/preview/:voiceId`,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias['@shared'] = path.resolve(__dirname, 'shared');

    if (!isServer) {
      // Next 14 emits a nomodule legacy polyfill chunk even with modern browserslist targets.
      config.plugins = config.plugins.filter((plugin) => !isNextNoModulePolyfillPlugin(plugin));
    }

    return config;
  },
};

module.exports = nextConfig;
