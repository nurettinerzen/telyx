'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/contexts/LanguageContext';
import { TelyxLogoFull } from '@/components/TelyxLogo';

export default function Navigation() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const navigation = [
    { name: t('navigation.features'), href: '/features' },
    {
      name: t('navigation.solutions'),
      href: '/solutions',
      items: [
        { nameKey: 'navigation.solutionsEcommerce', href: '/solutions/ecommerce' },
        { nameKey: 'navigation.solutionsRestaurant', href: '/solutions/restaurant' },
        { nameKey: 'navigation.solutionsSalon', href: '/solutions/salon' },
        { nameKey: 'navigation.solutionsSupport', href: '/solutions/support' },
      ]
    },
    { name: t('navigation.pricing'), href: '/pricing' },
    {
      name: t('navigation.resources') || 'Kaynaklar',
      href: '/blog',
      items: [
        { nameKey: 'navigation.blog', href: '/blog' },
        { nameKey: 'navigation.integrations', href: '/integrations' },
        { nameKey: 'navigation.changelog', href: '/changelog' },
        { nameKey: 'navigation.security', href: '/security' },
        { nameKey: 'navigation.help', href: '/help' },
      ]
    },
    { name: t('navigation.contact'), href: '/contact' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10 dark:bg-neutral-900/80 dark:border-neutral-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <TelyxLogoFull width={136} height={38} darkMode={mounted && resolvedTheme === 'dark'} />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => (
              <div
                key={item.name}
                className="relative"
                onMouseEnter={() => item.items && setActiveDropdown(item.name)}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link
                  href={item.href}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-700 dark:hover:text-primary-300 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 flex items-center"
                >
                  {item.name}
                  {item.items && (
                    <ChevronDown className="ml-1 w-4 h-4" />
                  )}
                </Link>

                {/* Dropdown */}
                {item.items && activeDropdown === item.name && (
                  <div className="absolute top-full left-0 pt-2 w-64">
                    <div className="glass rounded-xl shadow-xl border border-white/20 dark:bg-neutral-800 dark:border-neutral-700 overflow-hidden animate-fade-in">
                      {item.items.map((subItem) => (
                        <Link
                          key={subItem.nameKey}
                          href={subItem.href}
                          className="block px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary/10 dark:hover:bg-primary-950/50 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                        >
                          {t(subItem.nameKey)}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Auth Buttons + Language Switcher */}
          <div className="hidden md:flex items-center space-x-3">
            <LanguageSwitcher />
            <Link href="/login">
              <Button variant="ghost" size="sm">
                {t('common.signIn')}
              </Button>
            </Link>
            <Link href="/waitlist">
              <Button size="sm" variant="pill" className="px-5">
                {t('navigation.applyEarlyAccess')}
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg className="w-6 h-6 text-gray-700 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-2 animate-fade-in">
            {navigation.map((item) => (
              <div key={item.name}>
                <Link
                  href={item.href}
                  className="block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
                {item.items && (
                  <div className="ml-4 space-y-1">
                    {item.items.map((subItem) => (
                      <Link
                        key={subItem.nameKey}
                        href={subItem.href}
                        className="block px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-lg"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {t(subItem.nameKey)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-col space-y-2 px-4 pt-4">
              <LanguageSwitcher />
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  {t('common.signIn')}
                </Button>
              </Link>
              <Link href="/waitlist">
                <Button variant="pill" className="w-full">
                  {t('navigation.applyEarlyAccess')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
