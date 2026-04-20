'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { Phone, Loader2, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast, Toaster } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { apiClient } from '@/lib/api';
import { TelyxLogoFull } from '@/components/TelyxLogo';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiClient.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
      toast.success(t('auth.forgotPasswordSuccess'));
    } catch (error) {
      console.error('Forgot password error:', error);
      toast.error(t('auth.forgotPasswordError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex items-center justify-center p-4">
      <Toaster position="top-right" richColors />

      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-700 p-8">
          {/* Logo and Language Switcher */}
          <div className="flex items-center justify-between mb-8">
            <TelyxLogoFull width={200} height={60} darkMode={mounted && resolvedTheme === 'dark'} />
            <LanguageSwitcher />
          </div>

          {/* Back Link */}
          <Link
            href="/login"
            className="inline-flex items-center text-sm text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('auth.backToLogin')}
          </Link>

          {!submitted ? (
            <>
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
                  {t('auth.forgotPasswordTitle')}
                </h1>
                <p className="text-neutral-600 dark:text-neutral-400">
                  {t('auth.forgotPasswordSubtitle')}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="email">{t('auth.emailLabel')}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholderExample')}
                    className="mt-1"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('auth.sending')}
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      {t('auth.sendResetLink')}
                    </>
                  )}
                </Button>
              </form>
            </>
          ) : (
            /* Success State */
            <div className="text-center">
              <div className="w-16 h-16 bg-success-100 dark:bg-success-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-success-600 dark:text-success-400" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                {t('auth.checkYourEmail')}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                {t('auth.resetLinkSent').replace('{email}', email)}
              </p>
              <Button variant="outline" onClick={() => setSubmitted(false)}>
                {t('auth.tryDifferentEmail')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
