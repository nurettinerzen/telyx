'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  X,
  Loader2,
  Clock,
  Zap,
  CreditCard,
  ArrowRight,
  Phone,
  MessageSquare,
  Check
} from 'lucide-react';

// UI translations
const TRANSLATIONS = {
  TR: {
    title: 'Deneme Süreniz Doldu',
    subtitle: 'Telyx.AI deneme süreniz sona erdi',
    trialUsed: 'Kullandığınız deneme hakları:',
    phoneMinutes: 'Telefon görüşmesi',
    chatDays: 'Chat/WhatsApp',
    whatNext: 'Şimdi ne yapabilirsiniz?',
    option1Title: 'Kullandıkça Öde (PAYG)',
    option1Desc: 'Taahhütsüz, bakiye yükleyerek devam edin',
    option1Price: '/dk',
    option1Cta: 'PAYG\'ye Geç',
    option2Title: 'Başlangıç Planı',
    option2Desc: '150 dakika dahil, aylık abonelik',
    option2Price: '/ay',
    option2Cta: 'Planı Seç',
    viewAllPlans: 'Tüm planları görüntüle',
    later: 'Daha Sonra',
    upgrading: 'Yükseltiliyor...',
    successPayg: 'PAYG planına geçildi! Bakiye yükleyerek kullanmaya başlayabilirsiniz.',
    successStarter: 'Başlangıç planına yükseltildiniz!',
    error: 'İşlem başarısız oldu'
  },
  EN: {
    title: 'Your Trial Has Ended',
    subtitle: 'Your Telyx.AI trial period has expired',
    trialUsed: 'Your trial usage:',
    phoneMinutes: 'Phone calls',
    chatDays: 'Chat/WhatsApp',
    whatNext: 'What would you like to do next?',
    option1Title: 'Pay As You Go (PAYG)',
    option1Desc: 'No commitment, top up and continue',
    option1Price: '/min',
    option1Cta: 'Switch to PAYG',
    option2Title: 'Starter Plan',
    option2Desc: '150 minutes included, monthly subscription',
    option2Price: '/mo',
    option2Cta: 'Select Plan',
    viewAllPlans: 'View all plans',
    later: 'Later',
    upgrading: 'Upgrading...',
    successPayg: 'Switched to PAYG! Top up your balance to start using.',
    successStarter: 'Upgraded to Starter plan!',
    error: 'Operation failed'
  }
};

const LOCALE_TO_LANG = { tr: 'TR', en: 'EN' };

// Regional pricing
const REGIONAL_PRICING = {
  TR: {
    currency: '₺',
    paygRate: 23,
    starterPrice: 2499
  },
  US: {
    currency: '$',
    paygRate: 0.55,
    starterPrice: 59
  },
  BR: {
    currency: 'R$',
    paygRate: 1.5,
    starterPrice: 149
  }
};

/**
 * TrialExpiredModal Component
 * Shows when user's trial has expired with upgrade options
 */
export default function TrialExpiredModal({
  isOpen,
  onClose,
  trialUsage = { phoneMinutes: 0, chatDays: 7 },
  region = 'TR'
}) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const lang = LOCALE_TO_LANG[locale] || 'TR';
  const txt = TRANSLATIONS[lang] || TRANSLATIONS.TR;
  const pricing = REGIONAL_PRICING[region] || REGIONAL_PRICING.TR;

  const [loading, setLoading] = useState(null); // 'payg' | 'starter' | null

  const handleSwitchToPayg = async () => {
    setLoading('payg');
    try {
      await apiClient.post('/api/subscription/switch-to-payg');
      toast.success(txt.successPayg);
      onClose();
      // Redirect to balance top-up
      router.push('/dashboard/subscription?topup=true');
    } catch (error) {
      toast.error(error.response?.data?.error || txt.error);
    } finally {
      setLoading(null);
    }
  };

  const handleUpgradeToStarter = async () => {
    setLoading('starter');
    try {
      const response = await apiClient.post('/api/subscription/upgrade', { planId: 'STARTER', locale });

      if (response.data?.sessionUrl) {
        // Stripe checkout
        window.location.href = response.data.sessionUrl;
      } else {
        toast.success(txt.successStarter);
        onClose();
        router.push('/dashboard/subscription');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || txt.error);
    } finally {
      setLoading(null);
    }
  };

  const handleViewAllPlans = () => {
    onClose();
    router.push('/dashboard/subscription');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto my-4 mx-auto">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 rounded-full p-2">
              <Clock className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold">{txt.title}</h2>
          </div>
          <p className="text-white/90">{txt.subtitle}</p>
        </div>

        {/* Trial Usage Summary */}
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">{txt.trialUsed}</p>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
              <Phone className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {trialUsage.phoneMinutes}/15 {lang === 'TR' ? 'dk' : 'min'} {txt.phoneMinutes}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {trialUsage.chatDays} {lang === 'TR' ? 'gün' : 'days'} {txt.chatDays}
              </span>
            </div>
          </div>
        </div>

        {/* Upgrade Options */}
        <div className="p-6 space-y-4">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-4">
            {txt.whatNext}
          </p>

          {/* PAYG Option */}
          <div
            className="border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 cursor-pointer hover:border-amber-400 transition-colors"
            onClick={handleSwitchToPayg}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-5 w-5 text-amber-600" />
                  <h3 className="font-semibold text-neutral-900 dark:text-white">
                    {txt.option1Title}
                  </h3>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {txt.option1Desc}
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-amber-600">
                  {pricing.currency}{pricing.paygRate}
                </span>
                <span className="text-sm text-neutral-500">{txt.option1Price}</span>
              </div>
            </div>
            <Button
              className="w-full mt-3 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={loading !== null}
              onClick={(e) => {
                e.stopPropagation();
                handleSwitchToPayg();
              }}
            >
              {loading === 'payg' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {txt.upgrading}
                </>
              ) : (
                <>
                  {txt.option1Cta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {/* Starter Plan Option */}
          <div
            className="border-2 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4 cursor-pointer hover:border-primary-400 transition-colors"
            onClick={handleUpgradeToStarter}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-5 w-5 text-primary-600" />
                  <h3 className="font-semibold text-neutral-900 dark:text-white">
                    {txt.option2Title}
                  </h3>
                  <span className="bg-primary-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {lang === 'TR' ? 'Popüler' : 'Popular'}
                  </span>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {txt.option2Desc}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs text-primary-600">
                  <Check className="h-3 w-3" />
                  <span>150 {lang === 'TR' ? 'dakika dahil' : 'minutes included'}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-primary-600">
                  {pricing.currency}{pricing.starterPrice.toLocaleString()}
                </span>
                <span className="text-sm text-neutral-500">{txt.option2Price}</span>
              </div>
            </div>
            <Button
              className="w-full mt-3 bg-primary-600 hover:bg-primary-700 text-white"
              disabled={loading !== null}
              onClick={(e) => {
                e.stopPropagation();
                handleUpgradeToStarter();
              }}
            >
              {loading === 'starter' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {txt.upgrading}
                </>
              ) : (
                <>
                  {txt.option2Cta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            onClick={handleViewAllPlans}
            className="text-sm text-primary-600 hover:text-primary-700 hover:underline text-left"
          >
            {txt.viewAllPlans}
          </button>
          <Button variant="ghost" onClick={onClose} disabled={loading !== null} className="self-end sm:self-auto">
            {txt.later}
          </Button>
        </div>
      </div>
    </div>
  );
}
