'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast, Toaster } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api';
import AuthFlowShell from '@/components/AuthFlowShell';

function VerifyEmailContent() {
  const router = useRouter();
  const { t } = useLanguage();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('verifying'); // verifying, success, error, expired
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashToken = hash.get('token') || '';
    setToken(hashToken);
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage(t('auth.verificationLinkInvalid'));
      return;
    }

    verifyEmail();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const verifyEmail = async () => {
    try {
      setStatus('verifying');

      const response = await apiClient.post('/api/auth/verify-email', { token });
      const data = response.data;

      setStatus('success');
      setEmail(data.email);
      toast.success(t('auth.emailVerified'));

      // Redirect to dashboard after 3 seconds
      setTimeout(() => {
        router.push('/dashboard');
      }, 3000);
    } catch (error) {
      console.error('Verification error:', error);

      const data = error.response?.data;
      if (data?.code === 'TOKEN_EXPIRED') {
        setStatus('expired');
        setErrorMessage(t('auth.verificationLinkExpired'));
      } else {
        setStatus('error');
        setErrorMessage(data?.error || t('auth.verificationFailed'));
      }
    }
  };

  const handleRequestNewLink = () => {
    router.push('/auth/email-pending');
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  const handleGoToLogin = () => {
    router.push('/login');
  };

  return (
    <div>
      <Toaster position="top-right" richColors />

      <AuthFlowShell>
          {/* Verifying State */}
          {status === 'verifying' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                {t('auth.emailVerifying')}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                {t('auth.pleaseWaitVerifying')}
              </p>
            </div>
          )}

          {/* Success State */}
          {status === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                {t('auth.emailVerified')}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                {email && <span className="font-medium">{email}</span>}{' '}
                {t('auth.redirectingToDashboard')}
              </p>
              <Button onClick={handleGoToDashboard} className="w-full">
                {t('auth.goToDashboard')}
              </Button>
            </div>
          )}

          {/* Expired State */}
          {status === 'expired' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                {t('auth.linkExpiredTitle')}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                {errorMessage}
              </p>
              <div className="space-y-3">
                <Button onClick={handleRequestNewLink} className="w-full">
                  {t('auth.requestNewLinkBtn')}
                </Button>
                <Button variant="outline" onClick={handleGoToLogin} className="w-full">
                  {t('auth.returnToLogin')}
                </Button>
              </div>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                {t('auth.verificationFailed2')}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                {errorMessage}
              </p>
              <div className="space-y-3">
                <Button onClick={handleRequestNewLink} className="w-full">
                  {t('auth.requestNewLinkBtn')}
                </Button>
                <Button variant="outline" onClick={handleGoToLogin} className="w-full">
                  {t('auth.returnToLogin')}
                </Button>
              </div>
            </div>
          )}

          {/* Help Link */}
          <p className="text-center text-sm text-neutral-500 dark:text-neutral-400 mt-6">
            {t('auth.havingIssues')}{' '}
            <Link href="mailto:support@telyx.ai" className="text-primary-600 dark:text-primary-400 hover:underline">
              {t('auth.getSupport')}
            </Link>
          </p>
      </AuthFlowShell>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <AuthFlowShell>
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      </AuthFlowShell>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
