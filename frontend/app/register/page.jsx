'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { toast, Toaster } from 'sonner';
import { apiClient } from '@/lib/api';
import { TelyxLogoFull } from '@/components/TelyxLogo';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

const getBusinessTypes = (t) => [
  { value: 'RESTAURANT', label: `🍽️ ${t('auth.businessTypes.restaurant')}`, description: t('auth.businessTypes.restaurantDesc') },
  { value: 'SALON', label: `💇 ${t('auth.businessTypes.salon')}`, description: t('auth.businessTypes.salonDesc') },
  { value: 'ECOMMERCE', label: `🛍️ ${t('auth.businessTypes.ecommerce')}`, description: t('auth.businessTypes.ecommerceDesc') },
  { value: 'SERVICE', label: `🔧 ${t('auth.businessTypes.service')}`, description: t('auth.businessTypes.serviceDesc') },
  { value: 'OTHER', label: `📋 ${t('auth.businessTypes.other')}`, description: t('auth.businessTypes.otherDesc') }
];

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const BUSINESS_TYPES = getBusinessTypes(t);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    businessName: '',
    businessType: 'RESTAURANT'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Initialize Google Sign-In with OAuth2 popup flow
  useEffect(() => {
    if (typeof window !== 'undefined' && window.google && GOOGLE_CLIENT_ID) {
      // Initialize for One Tap (optional)
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
        use_fedcm_for_prompt: false,
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

      // Google users are already verified, redirect to dashboard
      router.push('/dashboard/assistant');
    } catch (err) {
      console.error('Google sign-in error:', err);
      toast.error(err.response?.data?.error || err.message || t('auth.googleSignInFailed'));
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

      // Google users are already verified, redirect to dashboard
      router.push('/dashboard/assistant');
    } catch (err) {
      console.error('Google sign-in error:', err);
      toast.error(err.response?.data?.error || err.message || t('auth.googleSignInFailed'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleSignup = () => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post('/api/auth/register', formData);
      const data = response.data;
      // Redirect to email verification pending page
      router.push('/auth/email-pending');
    } catch (err) {
      setError(err.response?.data?.error || t('auth.registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#edf3ff] via-white to-[#edfbff] dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex items-center justify-center p-4">
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
      <div className="w-full max-w-2xl">
        {/* Logo/Header */}
        <div className="text-center mb-8 flex items-center justify-between max-w-2xl mx-auto">
          <Link href="/" className="inline-block">
            <TelyxLogoFull width={136} height={38} />
          </Link>
          <LanguageSwitcher />
        </div>

        <Card className="glass border-white/20 dark:border-neutral-700 dark:bg-neutral-800/80 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('common.signup')}</CardTitle>
            <CardDescription>
              {t('auth.freeTrial')}. {t('auth.noCreditCard')}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-lg text-sm border border-red-200 dark:border-red-800" data-testid="error-message">
                  {error}
                </div>
              )}

              {/* Business Name */}
              <div className="space-y-2">
                <Label htmlFor="businessName">{t('auth.businessName')} *</Label>
                <Input
                  id="businessName"
                  type="text"
                  placeholder={t('auth.businessNamePlaceholder')}
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  required
                  data-testid="business-name-input"
                />
              </div>

              {/* Business Type */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">{t('auth.businessType')} *</Label>
                <div className="space-y-3">
                  {BUSINESS_TYPES.map(type => (
                    <div
                      key={type.value}
                      onClick={() => setFormData({ ...formData, businessType: type.value })}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] ${
                        formData.businessType === type.value
                          ? 'border-[#051752] bg-primary-50 dark:bg-primary-900/30 shadow-md'
                          : 'border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 hover:border-gray-300 dark:hover:border-neutral-500'
                      }`}
                      data-testid={`business-type-${type.value.toLowerCase()}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 dark:text-white mb-1">
                            {type.label}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-neutral-400">
                            {type.description}
                          </div>
                        </div>
                        {formData.businessType === type.value && (
                          <div className="w-6 h-6 rounded-full bg-[#051752] flex items-center justify-center flex-shrink-0 ml-4">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')} *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  data-testid="email-input"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')} *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={12}
                  data-testid="password-input"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-[#051752] via-[#000ACF] to-[#006FEB] hover:from-[#041240] hover:via-[#0008b0] hover:to-[#00C4E6] text-lg py-6"
                disabled={loading}
                data-testid="submit-button"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="animate-spin h-5 w-5 text-white" />
                    <span>{t('auth.creatingAccount')}</span>
                  </div>
                ) : (
                  t('common.createAccount')
                )}
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-gray-500">{t('auth.continueWith')}</span>
                </div>
              </div>

              {/* Google Sign Up */}
              <Button
                type="button"
                variant="outline"
                className="w-full py-6 text-lg"
                onClick={handleGoogleSignup}
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

              {/* Sign In Link */}
              <p className="text-center text-sm text-gray-600">
                {t('auth.alreadyHaveAccount')}{' '}
                <Link href="/login" className="text-[#000ACF] dark:text-[#00C4E6] hover:underline font-medium" data-testid="login-link">
                  {t('common.signIn')}
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>

        {/* Trust Indicators */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{t('auth.freeTrial')}</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{t('auth.noCreditCard')}</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{t('auth.cancelAnytime')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
