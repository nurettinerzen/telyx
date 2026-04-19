'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast, Toaster } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api';
import AuthFlowShell from '@/components/AuthFlowShell';

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
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
    <div>
      <Toaster position="top-right" richColors />

      <AuthFlowShell
        title={submitted ? t('auth.checkYourEmail') : t('auth.forgotPasswordTitle')}
        subtitle={submitted ? t('auth.resetLinkSent').replace('{email}', email) : t('auth.forgotPasswordSubtitle')}
        backHref="/login"
        backLabel={t('auth.backToLogin')}
        mountedDarkMode={mounted && resolvedTheme === 'dark'}
      >
        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-neutral-700 dark:text-slate-200">{t('auth.emailLabel')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholderExample')}
                className="mt-2 h-11 rounded-xl border-neutral-200 bg-white/80 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
              />
            </div>

            <Button type="submit" className="h-11 w-full rounded-full" disabled={loading}>
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
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
              <Mail className="h-8 w-8 text-success-600 dark:text-success-400" />
            </div>
            <p className="mb-6 text-sm leading-7 text-neutral-600 dark:text-slate-300">
              {t('auth.resetLinkSent').replace('{email}', email)}
            </p>
            <Button variant="outline" onClick={() => setSubmitted(false)} className="rounded-full dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white">
              {t('auth.tryDifferentEmail')}
            </Button>
          </div>
        )}
      </AuthFlowShell>
    </div>
  );
}
