'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { FileCode, Mail, ArrowLeft } from 'lucide-react';

export default function ApiDocsPage() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Navigation />

      {/* Content Section */}
      <section className="pt-28 md:pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-[#051752] via-[#000ACF] to-[#00C4E6] rounded-3xl flex items-center justify-center mx-auto mb-6 md:mb-8"
            >
              <FileCode className="w-10 h-10 md:w-12 md:h-12 text-white" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-5xl font-normal tracking-tight mb-6 text-gray-900 dark:text-white"
            >
              {t('apiDocs.title')}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-xl text-gray-600 dark:text-neutral-400 mb-8"
            >
              {t('apiDocs.comingSoon')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="bg-white dark:bg-neutral-800 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-neutral-700 mb-8"
            >
              <div className="flex items-center justify-center gap-3 mb-4">
                <Mail className="w-5 h-5 text-primary dark:text-[#00C4E6]" />
                <span className="text-gray-600 dark:text-neutral-400">{t('apiDocs.contactText')}</span>
              </div>
              <a
                href="mailto:info@telyx.ai"
                className="text-primary hover:text-primary/80 dark:text-[#00C4E6] dark:hover:text-[#7fe9ff] font-semibold text-lg"
              >
                info@telyx.ai
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <Link href="/">
                <Button size="lg" variant="outline" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  {t('apiDocs.backToHome')}
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
