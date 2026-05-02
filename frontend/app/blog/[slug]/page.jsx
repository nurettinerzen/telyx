import { notFound } from 'next/navigation';
import BlogPostClient from '@/components/blog/BlogPostClient';
import JsonLd from '@/components/seo/JsonLd';
import { getBlogPost, BLOG_SLUGS, getRelatedSlugs, BLOG_POSTS } from '@/lib/blog/posts';
import {
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { articleSchema, breadcrumbSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return BLOG_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const post = getBlogPost(params.slug);
  if (!post) return { title: 'Bulunamadı' };

  const path = `/blog/${params.slug}`;
  return {
    title: post.title.tr,
    description: post.excerpt.tr,
    keywords: post.keywords,
    alternates: languageAlternates(path),
    openGraph: buildOpenGraph({
      title: post.title.tr,
      description: post.excerpt.tr,
      path,
      type: 'article',
    }),
    twitter: buildTwitter({
      title: post.title.tr,
      description: post.excerpt.tr,
    }),
  };
}

export default function BlogPostPage({ params }) {
  const post = getBlogPost(params.slug);
  if (!post) notFound();

  const relatedSlugs = getRelatedSlugs(params.slug, 2);
  const relatedPosts = relatedSlugs.map((slug) => ({
    slug,
    post: BLOG_POSTS[slug],
  }));

  const includeStructuredData = !runtimeConfig.isBetaApp;
  const path = `/blog/${params.slug}`;

  const article = articleSchema({
    headline: post.title.tr,
    description: post.excerpt.tr,
    path,
    datePublished: `${post.date}T00:00:00Z`,
    dateModified: `${post.date}T00:00:00Z`,
    inLanguage: 'tr-TR',
  });

  const breadcrumbs = breadcrumbSchema([
    { name: 'Ana Sayfa', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: post.title.tr, path },
  ]);

  return (
    <>
      {includeStructuredData ? (
        <JsonLd id={`blog-${params.slug}`} data={[article, breadcrumbs]} />
      ) : null}
      <BlogPostClient post={post} relatedPosts={relatedPosts} />
    </>
  );
}
