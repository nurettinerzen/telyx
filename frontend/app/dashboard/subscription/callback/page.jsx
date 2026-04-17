'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function SubscriptionCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const statusParam = searchParams.get('status');

    if (statusParam === 'success') {
      setStatus('success');
      toast.success(t('dashboard.subscriptionPage.upgradeSuccess') || 'Aboneliginiz basariyla aktiflestirildi!');
    } else if (statusParam === 'error') {
      setStatus('error');
      const message = searchParams.get('message');
      toast.error(message || t('dashboard.subscriptionPage.upgradeFailed') || 'Odeme islemi basarisiz oldu.');
    } else {
      // No explicit state in the URL; keep a short processing state before redirect.
      setStatus('processing');
    }

    // Redirect to subscription page after delay
    const timer = setTimeout(() => {
      router.push('/dashboard/subscription');
    }, 3000);

    return () => clearTimeout(timer);
  }, [searchParams, router, t]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center p-8 bg-white rounded-xl shadow-sm border border-neutral-200 max-w-md w-full">
        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              {t('dashboard.subscriptionPage.paymentSuccess') || 'Odeme Basarili!'}
            </h1>
            <p className="text-neutral-600 mb-4">
              {t('dashboard.subscriptionPage.subscriptionActivated') || 'Aboneliginiz aktiflestirildi.'}
            </p>
            <p className="text-sm text-neutral-500">
              {t('dashboard.subscriptionPage.redirecting') || 'Yonlendiriliyorsunuz...'}
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="h-12 w-12 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              {t('dashboard.subscriptionPage.paymentFailed') || 'Odeme Basarisiz'}
            </h1>
            <p className="text-neutral-600 mb-4">
              {t('dashboard.subscriptionPage.paymentFailedDesc') || 'Odeme islemi tamamlanamadi. Lutfen tekrar deneyin.'}
            </p>
            <p className="text-sm text-neutral-500">
              {t('dashboard.subscriptionPage.redirecting') || 'Yonlendiriliyorsunuz...'}
            </p>
          </>
        )}

        {(status === 'loading' || status === 'processing') && (
          <>
            <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="h-12 w-12 text-primary-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              {t('dashboard.subscriptionPage.processingPayment') || 'Odeme Isleniyor'}
            </h1>
            <p className="text-neutral-600">
              {t('dashboard.subscriptionPage.pleaseWait') || 'Lutfen bekleyin...'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
