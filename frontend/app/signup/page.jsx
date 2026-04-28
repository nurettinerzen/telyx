'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SecurePasswordInput } from '@/components/ui/secure-password-input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, User, Loader2, Building2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import {
  trackFormStart,
  trackFormError,
  trackFormSubmit,
  trackSignupPageView,
  trackSignupSuccess,
  trackTrialStart,
} from '@/lib/marketingAnalytics';
import { toast, Toaster } from 'sonner';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/contexts/LanguageContext';
import { TelyxLogoFull } from '@/components/TelyxLogo';

export default function SignupPage() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const { t, locale } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [formStarted, setFormStarted] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    businessName: '',
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const passwordToggleLabels = locale === 'tr'
    ? { show: 'Şifreyi göster', hide: 'Şifreyi gizle' }
    : { show: 'Show password', hide: 'Hide password' };

  // Check if user is already logged in
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        await apiClient.auth.me();
        router.push('/dashboard/assistant');
        return;
      } catch (_error) {
        // Not authenticated yet, stay on signup page.
      }
      setCheckingAuth(false);
    };

    checkExistingAuth();
  }, [router]);

  useEffect(() => {
    if (!checkingAuth) {
      trackSignupPageView({ locale });
    }
  }, [checkingAuth, locale]);

  const markFormStarted = () => {
    if (formStarted) return;
    setFormStarted(true);
    trackFormStart({
      formName: 'signup',
      locale,
    });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.email || !formData.password || !formData.fullName || !formData.businessName) {
        trackFormError({
          formName: 'signup',
          errorType: 'missing_required_fields',
          locale,
        });
        toast.error(t('auth.pleaseFillAllFields'));
        setLoading(false);
        return;
      }

      if (!acceptedTerms) {
        trackFormError({
          formName: 'signup',
          errorType: 'terms_not_accepted',
          locale,
        });
        toast.error(t('auth.acceptTermsRequired'));
        setLoading(false);
        return;
      }

      trackFormSubmit({
        formName: 'signup',
        locale,
        business_name: formData.businessName,
      });

      await apiClient.auth.signup(formData);
      trackSignupSuccess({
        formName: 'signup',
        locale,
        business_name: formData.businessName,
        email: formData.email,
      });
      trackTrialStart({
        source: 'signup_form',
        locale,
        form_name: 'signup',
        email: formData.email,
      });
      toast.success(t('auth.accountCreated'));
      // Redirect to email verification pending page
      router.push('/auth/email-pending');
    } catch (error) {
      console.error('Signup error:', error);
      trackFormError({
        formName: 'signup',
        errorType: 'submission_failed',
        locale,
        status_code: error.response?.status,
      });
      toast.error(error.response?.data?.error || t('auth.signupFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-teal-50 to-teal-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-teal-50 to-teal-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex items-center justify-center p-4">
      <Toaster position="top-right" />

      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-8">
          <Link href="/">
            <TelyxLogoFull width={160} height={48} darkMode={mounted && resolvedTheme === 'dark'} />
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl dark:border dark:border-neutral-700 p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {t('auth.signupTitle')}
            </h1>
            <p className="text-gray-600 dark:text-neutral-400">{t('auth.signupSubtitle')}</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-6">
            <div>
              <Label htmlFor="fullName">{t('auth.fullName')}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder={t('auth.fullName')}
                  className="pl-10"
                  value={formData.fullName}
                  onFocus={markFormStarted}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="businessName">{t('auth.businessName')}</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="businessName"
                  type="text"
                  placeholder={t('auth.businessName')}
                  className="pl-10"
                  value={formData.businessName}
                  onFocus={markFormStarted}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">{t('auth.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  className="pl-10"
                  value={formData.email}
                  onFocus={markFormStarted}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <SecurePasswordInput
                  id="password"
                  placeholder="••••••••"
                  className="pl-10"
                  value={formData.password}
                  onValueChange={(password) => setFormData((prev) => ({ ...prev, password }))}
                  required
                  minLength={12}
                  showToggle
                  onFocus={markFormStarted}
                  aria-label={t('auth.password')}
                  toggleShowLabel={passwordToggleLabels.show}
                  toggleHideLabel={passwordToggleLabels.hide}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-neutral-500 mt-1">
                {t('auth.passwordRequirements')}
              </p>
            </div>

            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="acceptTerms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 dark:border-neutral-600 dark:bg-neutral-700"
              />
              <label htmlFor="acceptTerms" className="text-sm text-gray-600 dark:text-neutral-400">
                {t('auth.acceptTermsAndPrivacy')}{' '}
                <Link href="/terms" className="text-teal-600 dark:text-teal-400 hover:underline font-medium">
                  {t('auth.termsOfService')}
                </Link>
                {' '}{t('auth.and')}{' '}
                <Link href="/privacy" className="text-teal-600 dark:text-teal-400 hover:underline font-medium">
                  {t('auth.privacyPolicy')}
                </Link>
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('auth.creatingAccount')}
                </>
              ) : (
                t('common.createAccount')
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600 dark:text-neutral-400">
            {t('auth.alreadyHaveAccount')}{' '}
            <Link href="/login" className="text-teal-600 dark:text-teal-400 hover:underline font-medium">
              {t('common.signIn')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
