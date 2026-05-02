import {
  SITE_NAME,
  SITE_LEGAL_NAME,
  SITE_DESCRIPTION_TR,
  SITE_DESCRIPTION_EN,
  SUPPORT_EMAIL,
  SOCIAL_PROFILES,
  absoluteUrl,
  siteUrl,
} from './site';

const LOGO_URL = '/telyx-logo-full.png';

export function organizationSchema({ locale = 'tr' } = {}) {
  const description = locale === 'en' ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION_TR;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl()}#organization`,
    name: SITE_NAME,
    legalName: SITE_LEGAL_NAME,
    alternateName: 'Telyx AI',
    url: siteUrl(),
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl(LOGO_URL),
      width: 512,
      height: 512,
    },
    description,
    foundingDate: '2023',
    email: SUPPORT_EMAIL,
    sameAs: SOCIAL_PROFILES,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        email: SUPPORT_EMAIL,
        contactType: 'customer support',
        availableLanguage: ['Turkish', 'English'],
        areaServed: ['TR', 'US', 'EU'],
      },
      {
        '@type': 'ContactPoint',
        email: SUPPORT_EMAIL,
        contactType: 'sales',
        availableLanguage: ['Turkish', 'English'],
      },
    ],
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Los Angeles',
      addressRegion: 'CA',
      addressCountry: 'US',
    },
  };
}

export function websiteSchema({ locale = 'tr' } = {}) {
  const description = locale === 'en' ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION_TR;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl()}#website`,
    url: siteUrl(),
    name: SITE_NAME,
    description,
    inLanguage: ['tr-TR', 'en-US'],
    publisher: { '@id': `${siteUrl()}#organization` },
  };
}

export function softwareApplicationSchema({ locale = 'tr' } = {}) {
  const description = locale === 'en' ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION_TR;
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${siteUrl()}#software`,
    name: 'Telyx',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Customer Service Software',
    operatingSystem: 'Web, iOS, Android',
    description,
    url: siteUrl(),
    image: absoluteUrl(LOGO_URL),
    publisher: { '@id': `${siteUrl()}#organization` },
    offers: [
      {
        '@type': 'Offer',
        name: 'Trial',
        price: '0',
        priceCurrency: 'TRY',
        description: '15 dakika telefon görüşmesi + 14 gün chat/WhatsApp erişimi',
      },
      {
        '@type': 'Offer',
        name: 'Starter',
        price: '2499',
        priceCurrency: 'TRY',
        description: '500 yazılı etkileşim, 5 asistan, yazılı kanallar',
      },
      {
        '@type': 'Offer',
        name: 'Pro',
        price: '7499',
        priceCurrency: 'TRY',
        description: '2000 yazılı etkileşim + 500 dakika telefon, 10 asistan, tüm kanallar',
      },
    ],
    featureList: [
      'Telefon (sesli AI agent)',
      'WhatsApp Business API',
      'Web sohbet widget',
      'E-posta otomasyonu',
      'Çoklu asistan yönetimi',
      'CRM ve e-ticaret entegrasyonları',
      'Türkçe ve İngilizce dil desteği',
      '7/24 otomatik müşteri hizmetleri',
      'Bilgi tabanı yönetimi',
      'KVKK uyumlu veri saklama',
    ],
    aggregateRating: undefined,
  };
}

export function breadcrumbSchema(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqSchema(faqs = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function serviceSchema({
  name,
  description,
  serviceType,
  path,
  areaServed = ['TR', 'US', 'EU'],
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    serviceType,
    provider: { '@id': `${siteUrl()}#organization` },
    url: absoluteUrl(path),
    areaServed,
    audience: {
      '@type': 'BusinessAudience',
      audienceType: 'Small and Medium-sized Businesses',
    },
  };
}

export function articleSchema({
  headline,
  description,
  path,
  datePublished,
  dateModified,
  authorName = 'Telyx Ekibi',
  image,
  inLanguage = 'tr-TR',
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    image: image ? absoluteUrl(image) : undefined,
    datePublished,
    dateModified: dateModified || datePublished,
    inLanguage,
    author: { '@type': 'Organization', name: authorName },
    publisher: { '@id': `${siteUrl()}#organization` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(path) },
  };
}

export function howToSchema({
  name,
  description,
  totalTime,
  steps = [],
  path,
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    totalTime,
    inLanguage: 'tr-TR',
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      url: step.url ? absoluteUrl(step.url) : path ? `${absoluteUrl(path)}#step-${index + 1}` : undefined,
    })),
  };
}

export function contactPageSchema({ path = '/contact' } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    url: absoluteUrl(path),
    name: 'Telyx — İletişim',
    description: 'Telyx ile iletişime geçin: demo talep edin, satış ekibimizle konuşun veya destek alın.',
    mainEntity: { '@id': `${siteUrl()}#organization` },
  };
}
