import type { MetadataRoute } from 'next';

const STATIC_ROUTES = [
  '/',
  '/pricing',
  '/features',
  '/integrations',
  '/about',
  '/contact',
  '/login',
  '/signup',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const envBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://telyx.ai';
  const baseUrl = envBaseUrl.endsWith('/') ? envBaseUrl.slice(0, -1) : envBaseUrl;
  const now = new Date();

  return STATIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
  }));
}
