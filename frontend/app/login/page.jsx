'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { useTheme } from 'next-themes';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SecurePasswordInput } from '@/components/ui/secure-password-input';
import { Label } from '@/components/ui/label';
import { toast, Toaster } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api';
import AuthFlowShell from '@/components/AuthFlowShell';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize Google Sign-In with OAuth2 popup flow
  useEffect(() => {
    if (typeof window !== 'undefined' && window.google && GOOGLE_CLIENT_ID) {
      // Initialize for One Tap (optional, may not work in all browsers)
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
        use_fedcm_for_prompt: false, // Disable FedCM to avoid AbortError
      });

      // Initialize OAuth2 client for popup flow (more reliable)
      window.googleOAuth2Client = window.google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        ux_mode: 'popup',
        callback: handleGoogleAuthCode,
      });
    }
  }, []);

  // Handle Google One Tap callback (ID token flow)
  const handleGoogleCallback = async (response) => {
    if (!response.credential) {
      toast.error(t('auth.googleSignInFailed'));
      return;
    }

    setGoogleLoading(true);
    try {
      const res = await apiClient.post('/api/auth/google', {
        credential: response.credential,
      });

      const data = res.data;

      if (data.isNewUser) {
        toast.success(t('auth.accountCreated'));
      } else {
        toast.success(t('auth.loginSuccess'));
      }

      // Google users are already verified, redirect to assistant page
      router.push('/dashboard/assistant');
    } catch (error) {
      console.error('Google sign-in error:', error);
      toast.error(error.response?.data?.error || error.message || t('auth.googleSignInFailed'));
    } finally {
      setGoogleLoading(false);
    }
  };

  // Handle Google OAuth2 authorization code flow
  const handleGoogleAuthCode = async (response) => {
    if (response.error) {
      console.error('Google OAuth error:', response.error);
      toast.error(t('auth.googleSignInCancelled'));
      setGoogleLoading(false);
      return;
    }

    setGoogleLoading(true);
    try {
      const res = await apiClient.post('/api/auth/google/code', {
        code: response.code,
      });

      const data = res.data;

      if (data.isNewUser) {
        toast.success(t('auth.accountCreated'));
      } else {
        toast.success(t('auth.loginSuccess'));
      }

      // Google users are already verified, redirect to assistant page
      router.push('/dashboard/assistant');
    } catch (error) {
      console.error('Google sign-in error:', error);
      toast.error(error.response?.data?.error || error.message || t('auth.googleSignInFailed'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiClient.post('/api/auth/login', formData);

      toast.success(t('auth.loginSuccess'));

      // Skip email verification check - go directly to assistant page
      router.push('/dashboard/assistant');
    } catch (error) {
      console.error('Login error:', error);
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || t('auth.invalidEmailOrPassword');
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleGoogleLogin = () => {
    if (!GOOGLE_CLIENT_ID) {
      toast.error(t('auth.googleSignInNotConfigured'));
      return;
    }

    if (typeof window !== 'undefined' && window.googleOAuth2Client) {
      // Use OAuth2 popup flow - more reliable than FedCM/One Tap
      window.googleOAuth2Client.requestCode();
    } else if (typeof window !== 'undefined' && window.google) {
      // Fallback to One Tap prompt
      window.google.accounts.id.prompt();
    } else {
      toast.error(t('auth.googleSignInNotAvailable'));
    }
  };

  const passwordToggleLabels = locale === 'tr'
    ? { show: 'Şifreyi göster', hide: 'Şifreyi gizle' }
    : { show: 'Show password', hide: 'Hide password' };

  return (
    <div>
      {/* Google Sign-In Script */}
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.google && GOOGLE_CLIENT_ID) {
            // Initialize One Tap
            window.google.accounts.id.initialize({
              client_id: GOOGLE_CLIENT_ID,
              callback: handleGoogleCallback,
              use_fedcm_for_prompt: false,
            });

            // Initialize OAuth2 client for popup flow
            window.googleOAuth2Client = window.google.accounts.oauth2.initCodeClient({
              client_id: GOOGLE_CLIENT_ID,
              scope: 'email profile openid',
              ux_mode: 'popup',
              callback: handleGoogleAuthCode,
            });
          }
        }}
      />
      <Toaster position="top-right" richColors />

      <AuthFlowShell
        title={t('auth.loginTitle')}
        subtitle={t('auth.loginSubtitle')}
        mountedDarkMode={mounted && resolvedTheme === 'dark'}
        footer={(
          <p className="text-center text-sm text-neutral-600 dark:text-slate-400">
            {t('auth.dontHaveAccount')}{' '}
            <Link href="/waitlist" className="font-medium text-primary-600 hover:underline dark:text-[#7DD3FC]">
              {t('navigation.applyEarlyAccess')}
            </Link>
          </p>
        )}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="email" className="text-sm font-medium text-neutral-700 dark:text-slate-200">{t('auth.email')}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder={t('auth.emailPlaceholder')}
              className="mt-2 h-11 rounded-xl border-neutral-200 bg-white/80 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-slate-200">{t('auth.password')}</Label>
            <SecurePasswordInput
              id="password"
              name="password"
              required
              showToggle
              value={formData.password}
              onValueChange={(password) => setFormData((prev) => ({ ...prev, password }))}
              placeholder={t('auth.passwordPlaceholder')}
              className="mt-2 h-11 rounded-xl border-neutral-200 bg-white/80 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
              aria-label={t('auth.password')}
              toggleShowLabel={passwordToggleLabels.show}
              toggleHideLabel={passwordToggleLabels.hide}
            />
          </div>

          <div className="flex items-center justify-end">
            <Link href="/forgot-password" className="text-xs text-primary-600 hover:underline dark:text-[#7DD3FC]">
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <Button type="submit" className="h-11 w-full rounded-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('common.signIn')
            )}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200 dark:border-white/[0.08]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-xs text-neutral-500 dark:bg-[#071224] dark:text-slate-400">
              {t('auth.continueWith')}
            </span>
          </div>
        </div>

        <div id="google-signin-button" className="hidden"></div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-full dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              {t('common.loading')}
            </>
          ) : (
            <>
              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {t('common.google')}
            </>
          )}
        </Button>
      </AuthFlowShell>
    </div>
  );
}
