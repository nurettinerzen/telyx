const path = require('path');

const frameAncestors = process.env.CSP_FRAME_ANCESTORS || "'none'";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  `frame-ancestors ${frameAncestors}`,
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com https://www.gstatic.com https://static.iyzipay.com https://sandbox-static.iyzipay.com https://connect.facebook.net https://*.facebook.net https://*.facebook.com https://*.fbcdn.net",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://accounts.google.com https://*.google.com https://*.iyzipay.com https://www.facebook.com https://web.facebook.com https://*.facebook.com",
  "form-action 'self' https:",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Content-Security-Policy', value: `${contentSecurityPolicy};` },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
];

const noStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'Pragma', value: 'no-cache' },
];

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
        headers: securityHeaders,
      },
      {
        source: '/auth/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/dashboard/:path*',
        headers: noStoreHeaders,
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
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
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
  webpack: (config) => {
    config.resolve.alias['@shared'] = path.resolve(__dirname, '../shared');
    return config;
  },
};

module.exports = nextConfig;
