'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { TelyxLogoFull } from '@/components/TelyxLogo';
import { useTheme } from 'next-themes';

export const Footer = () => {
  const { t, locale } = useLanguage();
  const { resolvedTheme } = useTheme();
  const isTR = locale === 'tr';

  const columns = [
    {
      title: isTR ? 'Ürün' : 'Product',
      links: [
        { label: t('navigation.features'), href: '/features' },
        { label: t('navigation.pricing'), href: '/pricing' },
        { label: t('landing.footer.integrations'), href: '/integrations' },
        { label: isTR ? 'Changelog' : 'Changelog', href: '/changelog' },
      ],
    },
    {
      title: isTR ? 'Kanallar' : 'Channels',
      links: [
        { label: 'WhatsApp AI', href: '/whatsapp' },
        { label: isTR ? 'Telefon AI' : 'Phone AI', href: '/telefon' },
        { label: isTR ? 'Web Sohbet' : 'Web Chat', href: '/web-sohbet' },
        { label: isTR ? 'E-posta AI' : 'Email AI', href: '/e-posta' },
      ],
    },
    {
      title: isTR ? 'Sektörler' : 'Industries',
      links: [
        { label: isTR ? 'E-ticaret' : 'E-commerce', href: '/solutions/ecommerce' },
        { label: isTR ? 'Restoran' : 'Restaurant', href: '/solutions/restaurant' },
        { label: isTR ? 'Güzellik Salonu' : 'Beauty Salon', href: '/solutions/salon' },
        { label: isTR ? 'Müşteri Desteği' : 'Customer Support', href: '/solutions/support' },
      ],
    },
    {
      title: isTR ? 'Kaynaklar' : 'Resources',
      links: [
        { label: isTR ? 'Kaynak Merkezi' : 'Resource Center', href: '/kaynak' },
        { label: 'Blog', href: '/blog' },
        { label: isTR ? 'SSS' : 'FAQ', href: '/sss' },
        { label: t('landing.footer.help'), href: '/help' },
        { label: isTR ? 'Güvenlik' : 'Security', href: '/security' },
      ],
    },
    {
      title: isTR ? 'Şirket' : 'Company',
      links: [
        { label: t('landing.footer.about'), href: '/about' },
        { label: t('landing.footer.contact'), href: '/contact' },
        { label: t('landing.footer.privacy'), href: '/privacy' },
        { label: t('landing.footer.terms'), href: '/terms' },
      ],
    },
  ];

  return (
    <footer className="border-t border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
      <div className="container mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-block mb-4">
              <TelyxLogoFull width={128} height={36} darkMode={resolvedTheme === 'dark'} />
            </Link>
            <p className="text-sm text-gray-500 dark:text-neutral-500 leading-relaxed">
              {isTR
                ? 'AI destekli müşteri hizmetleri platformu.'
                : 'AI-powered customer service platform.'}
            </p>
          </div>

          {/* Link Columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-500 dark:text-neutral-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-gray-100 dark:border-neutral-800 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs text-gray-400 dark:text-neutral-600">
            {t('landing.footer.copyright')}
          </p>
          <div className="flex gap-5 text-xs text-gray-400 dark:text-neutral-600">
            <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              {t('landing.footer.privacy')}
            </Link>
            <Link href="/terms" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              {t('landing.footer.terms')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
