/**
 * Subscription Page
 * View current plan, usage, and upgrade options
 * Updated with Credit System support
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, CreditCard, Loader2, AlertCircle, MessageSquare, PhoneCall, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils';
import { renderTrustedCheckoutHtml } from '@/lib/safeHtml';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import CreditBalance from '@/components/CreditBalance';
import BuyCreditModal from '@/components/BuyCreditModal';
import {
  REGIONAL_PRICING,
  PLAN_HIERARCHY,
  LEGACY_PLAN_MAP,
  getPlanDisplayName,
} from '@/lib/planConfig';
import {
  useSubscription,
  useBillingHistory,
  useUpgradeSubscription,
} from '@/hooks/useSubscription';
import { useProfile } from '@/hooks/useSettings';

// Note: Region is determined by business.country, NOT by UI language
// Language (locale) only affects UI text, not pricing

// Base plan configurations
// Order: PAYG -> Starter -> Pro -> Enterprise
// NOTE: TRIAL plan not shown here, starts automatically for new signups
// PAYG = PREPAID (balance), Packages = POSTPAID (end-of-month billing)
// Calendar and Sheets are enabled for all plans
const BASE_PLANS = [
  {
    id: 'PAYG',
    nameKey: 'dashboard.subscriptionPage.planNamePayg',
    descriptionKey: 'dashboard.subscriptionPage.planDescPayg',
    includedFeatures: ['payPerMinute', 'concurrent', 'assistants', 'phoneNumbers', 'phone', 'whatsapp', 'chatWidget', 'analytics', 'email', 'batchCalls'],
    isPayg: true,
    paymentModel: 'PREPAID',
  },
  {
    id: 'STARTER',
    nameKey: 'dashboard.subscriptionPage.planNameStarter',
    descriptionKey: 'dashboard.subscriptionPage.planDescStarter',
    includedFeatures: ['assistants', 'whatsapp', 'chatWidget', 'analytics', 'email'],
    paymentModel: 'POSTPAID',
  },
  {
    id: 'PRO',
    nameKey: 'dashboard.subscriptionPage.planNamePro',
    descriptionKey: 'dashboard.subscriptionPage.planDescPro',
    popular: true,
    includedFeatures: ['minutes', 'concurrent', 'assistants', 'phoneNumbers', 'phone', 'whatsapp', 'chatWidget', 'ecommerce', 'calendar', 'googleSheets', 'analytics', 'email', 'batchCalls', 'prioritySupport', 'apiAccess'],
    paymentModel: 'POSTPAID',
  },
  {
    id: 'ENTERPRISE',
    nameKey: 'dashboard.subscriptionPage.planNameEnterprise',
    descriptionKey: 'dashboard.subscriptionPage.planDescEnterprise',
    includedFeatures: ['minutes', 'concurrent', 'assistants', 'phoneNumbers', 'phone', 'whatsapp', 'chatWidget', 'ecommerce', 'calendar', 'googleSheets', 'analytics', 'email', 'batchCalls', 'prioritySupport', 'apiAccess', 'slaGuarantee'],
    paymentModel: 'POSTPAID',
  },
];

export default function SubscriptionPage() {
  const { t, locale } = useLanguage();
  const { can, loading: permissionsLoading } = usePermissions();
  const pageHelp = getPageHelp('subscription', locale);

  // React Query hooks
  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useSubscription();
  const { data: billingHistory = [], isLoading: billingLoading } = useBillingHistory();
  const { data: profileData } = useProfile();
  const upgradeSubscription = useUpgradeSubscription();

  const loading = subscriptionLoading || billingLoading;
  const [upgrading, setUpgrading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [checkoutFormHtml, setCheckoutFormHtml] = useState('');
  const [purchasingAddOn, setPurchasingAddOn] = useState('');
  const checkoutContainerRef = useRef(null);
  // Credit modal state
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditRefreshTrigger, setCreditRefreshTrigger] = useState(0);
  const [userCountry, setUserCountry] = useState(() => {
    // Initial detection from browser locale
    if (typeof navigator !== 'undefined') {
      const lang = navigator.language || navigator.userLanguage;
      if (lang === 'tr' || lang === 'tr-TR' || lang.startsWith('tr-')) {
        return 'TR';
      }
      if (lang === 'pt' || lang === 'pt-BR' || lang.startsWith('pt-')) {
        return 'BR';
      }
    }
    return 'US';
  });

  // Update user country from profile data
  useEffect(() => {
    if (profileData?.business?.country || profileData?.country) {
      const country = profileData.business?.country || profileData.country;
      setUserCountry(country);
    }
  }, [profileData]);

  useEffect(() => {
    if (subscription?.business?.country || subscription?.country) {
      const country = subscription.business?.country || subscription.country;
      setUserCountry(country);
    }
  }, [subscription]);

  // Determine region from business country (NOT from UI language)
  const getRegion = () => {
    // Region is based on business.country, not locale
    if (userCountry === 'TR' || userCountry === 'Turkey') return 'TR';
    if (userCountry === 'BR' || userCountry === 'Brazil') return 'BR';
    if (userCountry === 'US' || userCountry === 'United States') return 'US';
    return 'US'; // Default fallback
  };

  const region = getRegion(); // For pricing (based on country)
  const regionConfig = REGIONAL_PRICING[region] || REGIONAL_PRICING.US;

  // Format currency based on region
  const formatPrice = (amount) => {
    if (amount === null || amount === undefined) return null;
    const formatted = amount.toLocaleString(regionConfig.locale);
    return regionConfig.currencyPosition === 'after'
      ? `${formatted}${regionConfig.currency}`
      : `${regionConfig.currency}${formatted}`;
  };

  // Get plan pricing for current region
  const getPlanPricing = (planId) => {
    return regionConfig.plans[planId] || null;
  };

  // Get plan name from translation
  const getPlanName = (plan) => {
    return t(plan.nameKey);
  };

  // Handle iyzico checkout form rendering
  useEffect(() => {
    if (showPaymentModal && checkoutFormHtml && checkoutContainerRef.current) {
      renderTrustedCheckoutHtml(checkoutContainerRef.current, checkoutFormHtml);
    }
  }, [showPaymentModal, checkoutFormHtml]);

  // Check for success/error in URL params (after payment callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const success = params.get('success');
    const session_id = params.get('session_id');
    const walletTopup = params.get('wallet_topup');
    const addonStatus = params.get('addon');
    const addonKind = params.get('addon_kind');

    if (walletTopup === 'success') {
      toast.success(locale === 'tr' ? 'Bakiye yükleme tamamlandı' : 'Balance top-up completed');
      refetchSubscription();
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (walletTopup === 'cancel') {
      toast.error(locale === 'tr' ? 'Bakiye yükleme iptal edildi' : 'Balance top-up canceled');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (addonStatus === 'success') {
      toast.success(
        locale === 'tr'
          ? `${addonKind === 'VOICE' ? 'Ses dakikası' : 'Yazılı destek'} ek paketi satın alındı`
          : `${addonKind === 'VOICE' ? 'Voice minute' : 'Written support'} add-on purchase completed`
      );
      refetchSubscription();
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (addonStatus === 'cancel') {
      toast.error(
        locale === 'tr'
          ? `${addonKind === 'VOICE' ? 'Ses dakikası' : 'Yazılı destek'} ek paket satın alma iptal edildi`
          : `${addonKind === 'VOICE' ? 'Voice minute' : 'Written support'} add-on purchase canceled`
      );
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Verify Stripe session if present
    if (success === 'true' && session_id) {
      apiClient.get(`/api/subscription/verify-session?session_id=${session_id}`)
        .then(() => {
          toast.success(t('dashboard.subscriptionPage.upgradeSuccess'));
          // Reload subscription data
          refetchSubscription();
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((error) => {
          console.error('Session verification error:', error);
          toast.error(t('dashboard.subscriptionPage.sessionVerificationError'));
        });
      return;
    }

    if (status === 'success' || success === 'true') {
      toast.success(t('dashboard.subscriptionPage.upgradeSuccess'));
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      // Reload subscription data
      refetchSubscription();
    } else if (status === 'error' || params.get('error')) {
      const errorMsg = params.get('message') || t('dashboard.subscriptionPage.upgradeFailed');
      toast.error(decodeURIComponent(errorMsg));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [locale, refetchSubscription, t]);

  const handleUpgrade = async (planId) => {
    // Get plan name from translation keys
    const planInfo = BASE_PLANS.find(p => p.id === planId);
    const planName = planInfo ? t(planInfo.nameKey) : planId;

    if (!confirm(`${t('dashboard.subscriptionPage.upgradeConfirmMsg')} ${planName}`)) return;

    try {
      setUpgrading(true);
      const response = await apiClient.subscription.upgrade(planId);

      // Handle different response types
      if (response.data?.type === 'payg_switch') {
        // Switched to PAYG (pay as you go)
        toast.success(t('dashboard.subscriptionPage.paygSwitchSuccess'));
        refetchSubscription();
      } else if (response.data?.type === 'upgrade') {
        // Immediate upgrade (with proration)
        toast.success(t('dashboard.subscriptionPage.upgradeWithProrationSuccess'));
        refetchSubscription();
      } else if (response.data?.type === 'reactivate') {
        // Reactivated canceled subscription with new plan
        const effectiveDate = response.data.effectiveDate
          ? formatDate(response.data.effectiveDate, 'long')
          : t('dashboard.subscriptionPage.nextPeriod');
        toast.success(t('dashboard.subscriptionPage.reactivateSuccess').replace('{date}', effectiveDate).replace('{planName}', planName));
        refetchSubscription();
      } else if (response.data?.type === 'downgrade') {
        // Scheduled downgrade (end of period)
        const effectiveDate = response.data.effectiveDate
          ? formatDate(response.data.effectiveDate, 'long')
          : t('dashboard.subscriptionPage.endOfPeriod');
        toast.success(t('dashboard.subscriptionPage.downgradeScheduled').replace('{date}', effectiveDate).replace('{planName}', planName));
        refetchSubscription();
      } else if (response.data?.checkoutFormContent) {
        // iyzico checkout form
        setCheckoutFormHtml(response.data.checkoutFormContent);
        setShowPaymentModal(true);
      } else if (response.data?.sessionUrl) {
        // Stripe checkout (new subscription)
        window.location.href = response.data.sessionUrl;
      } else {
        toast.success(t('dashboard.subscriptionPage.upgradeSuccess'));
        refetchSubscription();
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      toast.error(error.response?.data?.error || t('dashboard.subscriptionPage.operationFailed'));
    } finally {
      setUpgrading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm(t('dashboard.subscriptionPage.cancelConfirm'))) {
      return;
    }

    try {
      setUpgrading(true);
      const response = await apiClient.post('/api/subscription/cancel');

      if (response.data?.success) {
        const cancelDate = response.data.cancelAt
          ? formatDate(response.data.cancelAt, 'long')
          : t('dashboard.subscriptionPage.endOfPeriod');
        toast.success(t('dashboard.subscriptionPage.cancelSuccess').replace('{date}', cancelDate));
        refetchSubscription();
      }
    } catch (error) {
      console.error('Cancel subscription error:', error);
      toast.error(error.response?.data?.error || t('dashboard.subscriptionPage.cancelFailed'));
    } finally {
      setUpgrading(false);
    }
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setCheckoutFormHtml('');
  };

  const handleBuyAddOn = async (kind, packageId) => {
    try {
      setPurchasingAddOn(`${kind}:${packageId}`);
      const response = await apiClient.subscription.createAddOnCheckout({ kind, packageId });
      if (response.data?.sessionUrl) {
        window.location.href = response.data.sessionUrl;
        return;
      }
      toast.error(locale === 'tr' ? 'Ek paket ödeme oturumu oluşturulamadı' : 'Failed to create add-on checkout session');
    } catch (error) {
      console.error('Add-on checkout error:', error);
      toast.error(error.response?.data?.error || (locale === 'tr' ? 'Ek paket satın alma başarısız oldu' : 'Add-on purchase failed'));
    } finally {
      setPurchasingAddOn('');
    }
  };

  const usagePercent = subscription
    ? (subscription.creditsUsed / subscription.creditsLimit) * 100
    : 0;
  const billingSnapshot = subscription?.billingSnapshot || null;
  const writtenUsage = billingSnapshot?.includedUsage?.writtenInteractions || null;
  const voiceUsage = billingSnapshot?.includedUsage?.voiceMinutes || null;
  const writtenAddOnCatalog = subscription?.addOnCatalog?.written || [];
  const voiceAddOnCatalog = subscription?.addOnCatalog?.voice || [];

  // Show loading while permissions are being loaded
  if (permissionsLoading || loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Check permission for billing
  if (!can('billing:view')) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <AlertCircle className="h-16 w-16 text-neutral-300 mb-4" />
        <h2 className="text-xl font-semibold text-neutral-700 mb-2">{t('dashboard.subscriptionPage.accessDenied')}</h2>
        <p className="text-neutral-500">{t('dashboard.subscriptionPage.noBillingPermission')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageIntro
        title={pageHelp?.title || t('dashboard.subscriptionPage.title')}
        subtitle={pageHelp?.subtitle}
        locale={locale}
        help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
      />

      {/* Current plan & usage */}
      {!loading && subscription && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current plan */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{t('dashboard.subscriptionPage.currentPlan')}</h2>
              <Badge className="bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-400">
                {getPlanDisplayName(subscription.plan, locale)}
              </Badge>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">{t('dashboard.subscriptionPage.monthlyCost')}</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {(() => {
                    // Get price from REGIONAL_PRICING based on subscription.plan
                    const planPricing = getPlanPricing(subscription.plan);
                    if (planPricing && planPricing.price !== null) {
                      return formatPrice(planPricing.price);
                    }
                    // FREE plan or custom pricing
                    if (subscription.plan === 'FREE') return formatPrice(0);
                    if (subscription.plan === 'ENTERPRISE') return t('dashboard.subscriptionPage.custom');
                    return formatPrice(subscription.price || 0);
                  })()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">{t('dashboard.subscriptionPage.billingCycle')}</span>
                <span className="font-medium text-neutral-900 dark:text-white">
                  {subscription.billingCycle || t('dashboard.subscriptionPage.monthly')}
                </span>
              </div>
              {subscription.currentPeriodEnd && !subscription.cancelAtPeriodEnd && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">{t('dashboard.subscriptionPage.nextBilling')}</span>
                <span className="font-medium text-neutral-900 dark:text-white">
                  {formatDate(subscription.currentPeriodEnd || subscription.nextBillingDate, 'short')}
                </span>
              </div>
              )}
              {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">{t('dashboard.subscriptionPage.subscriptionEndDate')}</span>
                <span className="font-medium text-orange-600 dark:text-orange-400">
                  {formatDate(subscription.currentPeriodEnd, 'short')}
                </span>
              </div>
              )}
            </div>

            {/* Cancel Subscription Button - Only show for paid plans */}
            {subscription.plan !== 'FREE' && !subscription.cancelAtPeriodEnd && (
              <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelSubscription}
                  disabled={upgrading}
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  {upgrading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('dashboard.subscriptionPage.processing')}
                    </>
                  ) : (
                    <>
                      <X className="mr-2 h-4 w-4" />
                      {t('dashboard.subscriptionPage.cancelSubscription')}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Canceled status message */}
            {subscription.cancelAtPeriodEnd && (
              <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-sm text-orange-800 dark:text-orange-400">
                  <strong>{t('dashboard.subscriptionPage.subscriptionCanceled')}</strong>
                  <br />
                  {subscription.currentPeriodEnd && (
                    <>{t('dashboard.subscriptionPage.planEndsOnDate').replace('{date}', formatDate(subscription.currentPeriodEnd, 'short'))}</>
                  )}
                  {!subscription.currentPeriodEnd && <>{t('dashboard.subscriptionPage.planEndsAtPeriodEnd')}</>}
                </div>
              </div>
            )}
          </div>

          {/* Credit Balance - YENİ KREDİ SİSTEMİ */}
          <div className="lg:col-span-2">
            <CreditBalance
              onBuyCredit={() => setCreditModalOpen(true)}
              refreshTrigger={creditRefreshTrigger}
            />
          </div>
        </div>
      )}

      {!loading && subscription && (writtenAddOnCatalog.length > 0 || voiceAddOnCatalog.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary-600" />
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                    {locale === 'tr' ? 'Yazılı Destek Kullanımı' : 'Written Support Usage'}
                  </h3>
                </div>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {locale === 'tr'
                    ? 'Webchat, WhatsApp ve e-posta aynı havuzdan düşer.'
                    : 'Webchat, WhatsApp, and email all consume the same pool.'}
                </p>
              </div>
              <Badge variant="outline">
                {locale === 'tr'
                  ? `${writtenUsage?.used || 0} / ${writtenUsage?.total ?? 0}`
                  : `${writtenUsage?.used || 0} / ${writtenUsage?.total ?? 0}`}
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 px-4 py-3">
                <div className="text-neutral-500 dark:text-neutral-400">{locale === 'tr' ? 'Plana dahil kalan' : 'Included remaining'}</div>
                <div className="mt-1 text-xl font-semibold text-neutral-900 dark:text-white">{writtenUsage?.remaining ?? '-'}</div>
              </div>
              <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 px-4 py-3">
                <div className="text-neutral-500 dark:text-neutral-400">{locale === 'tr' ? 'Ek paket kalan' : 'Add-on remaining'}</div>
                <div className="mt-1 text-xl font-semibold text-neutral-900 dark:text-white">
                  {billingSnapshot?.addOns?.writtenInteractions?.remaining ?? 0}
                </div>
              </div>
            </div>

            {writtenAddOnCatalog.length > 0 && (
              <div className="mt-5 space-y-3">
                {writtenAddOnCatalog.map((pkg) => {
                  const buttonKey = `WRITTEN:${pkg.id}`;
                  return (
                    <div key={pkg.id} className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-3">
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          {pkg.quantity} {locale === 'tr' ? 'yazılı etkileşim' : 'written interactions'}
                        </div>
                        <div className="text-sm text-neutral-500 dark:text-neutral-400">
                          {formatPrice(pkg.amount)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleBuyAddOn('WRITTEN', pkg.id)}
                        disabled={purchasingAddOn === buttonKey}
                      >
                        {purchasingAddOn === buttonKey ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          locale === 'tr' ? 'Satın Al' : 'Buy'
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <PhoneCall className="h-4 w-4 text-primary-600" />
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                    {locale === 'tr' ? 'Ses Dakikası Kullanımı' : 'Voice Minute Usage'}
                  </h3>
                </div>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {locale === 'tr'
                    ? 'Dahil dakikalar bittiğinde ek paket bakiyesi kullanılır.'
                    : 'Add-on balance is used after included minutes are exhausted.'}
                </p>
              </div>
              <Badge variant="outline">
                {locale === 'tr'
                  ? `${voiceUsage?.used || 0} / ${voiceUsage?.total ?? 0} dk`
                  : `${voiceUsage?.used || 0} / ${voiceUsage?.total ?? 0} min`}
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 px-4 py-3">
                <div className="text-neutral-500 dark:text-neutral-400">{locale === 'tr' ? 'Plana dahil kalan' : 'Included remaining'}</div>
                <div className="mt-1 text-xl font-semibold text-neutral-900 dark:text-white">{voiceUsage?.remaining ?? 0}</div>
              </div>
              <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 px-4 py-3">
                <div className="text-neutral-500 dark:text-neutral-400">{locale === 'tr' ? 'Ek paket kalan' : 'Add-on remaining'}</div>
                <div className="mt-1 text-xl font-semibold text-neutral-900 dark:text-white">
                  {billingSnapshot?.addOns?.voiceMinutes?.remaining ?? 0}
                </div>
              </div>
            </div>

            {voiceAddOnCatalog.length > 0 && (
              <div className="mt-5 space-y-3">
                {voiceAddOnCatalog.map((pkg) => {
                  const buttonKey = `VOICE:${pkg.id}`;
                  return (
                    <div key={pkg.id} className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-3">
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          {pkg.quantity} {locale === 'tr' ? 'ses dakikası' : 'voice minutes'}
                        </div>
                        <div className="text-sm text-neutral-500 dark:text-neutral-400">
                          {formatPrice(pkg.amount)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleBuyAddOn('VOICE', pkg.id)}
                        disabled={purchasingAddOn === buttonKey}
                      >
                        {purchasingAddOn === buttonKey ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          locale === 'tr' ? 'Satın Al' : 'Buy'
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pricing plans */}
      <div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-6">
          {t('dashboard.subscriptionPage.plans')}
        </h2>
        {/* 4 plan kartı: mobilde 1, tablette 2, büyük ekranda 4 yan yana */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
          {BASE_PLANS.map((plan) => {
            const planPricing = getPlanPricing(plan.id);
            // Legacy plan mapping from centralized config
            const userPlanMapped = LEGACY_PLAN_MAP[subscription?.plan] || subscription?.plan;
            const isCurrentPlan = userPlanMapped === plan.id;
            // Only show "Popular" badge if user has no plan or is on FREE plan
            const showPopularBadge = plan.popular && !isCurrentPlan && (!subscription?.plan || subscription?.plan === 'FREE');

            // Plan order for upgrade/downgrade logic from centralized config
            const currentPlanIndex = PLAN_HIERARCHY[subscription?.plan] || 0;
            const thisPlanIndex = PLAN_HIERARCHY[plan.id];
            const isUpgrade = thisPlanIndex > currentPlanIndex;
            const isDowngrade = thisPlanIndex < currentPlanIndex;

            // Button text based on plan comparison
            const getButtonText = () => {
              if (isCurrentPlan) return t('dashboard.subscriptionPage.currentPlan');
              if (plan.id === 'ENTERPRISE') return t('dashboard.subscriptionPage.contactUs');
              if (isUpgrade) return t('dashboard.subscriptionPage.upgrade');
              if (isDowngrade) return t('dashboard.subscriptionPage.downgrade');
              return t('dashboard.subscriptionPage.select');
            };

            // Feature order - YENİ FİYATLANDIRMA SİSTEMİ
            const FEATURE_ORDER = [
              'trialMinutes', 'trialChat', 'payPerMinute', 'minutes', 'concurrent',
              'assistants', 'phoneNumbers', 'phone', 'whatsapp', 'chatWidget',
              'ecommerce', 'calendar', 'analytics', 'email', 'googleSheets', 'batchCalls',
              'prioritySupport', 'apiAccess', 'slaGuarantee'
            ];

            // Feature labels using translation keys
            const getFeatureLabel = (key) => {
              const isEnterprise = plan.id === 'ENTERPRISE';
              const isPro = plan.id === 'PRO';

              const featureMap = {
                trialMinutes: t('dashboard.subscriptionPage.featureTrialMinutes'),
                trialChat: t('dashboard.subscriptionPage.featureTrialChat'),
                payPerMinute: t('dashboard.subscriptionPage.featurePayPerMinute').replace('{price}', formatPrice(planPricing?.pricePerMinute || 0)),
                minutes: isEnterprise
                  ? t('dashboard.subscriptionPage.featureMinutesEnterprise')
                  : t('dashboard.subscriptionPage.featureMinutes').replace('{count}', String(planPricing?.minutes || 0)),
                concurrent: isEnterprise
                  ? t('dashboard.subscriptionPage.featureConcurrentEnterprise')
                  : (planPricing?.concurrent || 1) > 1
                    ? t('dashboard.subscriptionPage.featureConcurrentPlural').replace('{count}', String(planPricing?.concurrent || 1))
                    : t('dashboard.subscriptionPage.featureConcurrent').replace('{count}', String(planPricing?.concurrent || 1)),
                assistants: isEnterprise
                  ? t('dashboard.subscriptionPage.featureAssistantsEnterprise')
                  : isPro
                    ? t('dashboard.subscriptionPage.featureAssistants10')
                    : t('dashboard.subscriptionPage.featureAssistants5'),
                phoneNumbers: t('dashboard.subscriptionPage.featurePhoneNumbers'),
                phone: t('dashboard.subscriptionPage.featurePhone'),
                whatsapp: t('dashboard.subscriptionPage.featureWhatsapp'),
                chatWidget: t('dashboard.subscriptionPage.featureChatWidget'),
                email: t('dashboard.subscriptionPage.featureEmail'),
                ecommerce: t('dashboard.subscriptionPage.featureEcommerce'),
                calendar: t('dashboard.subscriptionPage.featureCalendar'),
                googleSheets: t('dashboard.subscriptionPage.featureGoogleSheets'),
                batchCalls: t('dashboard.subscriptionPage.featureBatchCalls'),
                analytics: t('dashboard.subscriptionPage.featureAnalytics'),
                prioritySupport: t('dashboard.subscriptionPage.featurePrioritySupport'),
                apiAccess: t('dashboard.subscriptionPage.featureApiAccess'),
                slaGuarantee: t('dashboard.subscriptionPage.featureSlaGuarantee'),
              };

              return featureMap[key] || key;
            };

            // Get only included features (no gaps, maintains order)
            const getPlanFeatures = () => {
              return FEATURE_ORDER
                .filter(key => plan.includedFeatures.includes(key))
                .map(key => ({
                  key,
                  text: getFeatureLabel(key)
                }));
            };

            return (
              <div
                key={plan.id}
                className={`bg-white dark:bg-neutral-900 rounded-xl border-2 p-6 shadow-sm relative flex flex-col h-full ${
                  isCurrentPlan ? 'border-green-500 ring-2 ring-green-200 dark:ring-green-900' : 'border-neutral-200 dark:border-neutral-700'
                }`}
              >
                {/* Show "Current Plan" badge if this is the current plan */}
                {isCurrentPlan && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-neutral-900 px-1">
                    <Badge className="bg-green-600 text-white px-3 py-1">
                      {t('dashboard.subscriptionPage.currentPlan')}
                    </Badge>
                  </div>
                )}
                {/* Show "Popular" badge only if user has no plan */}
                {showPopularBadge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-neutral-900 px-1">
                    <Badge className="bg-primary-600 text-white px-3 py-1">
                      {t('dashboard.subscriptionPage.popular')}
                    </Badge>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                    {getPlanName(plan)}
                  </h3>
                  <div className="flex items-baseline justify-center gap-1 h-[40px]">
                    {plan.id === 'PAYG' ? (
                      /* PAYG: Dakika başına fiyat */
                      <>
                        <span className="text-3xl font-bold text-neutral-900 dark:text-white">
                          {formatPrice(planPricing?.pricePerMinute || 0)}
                        </span>
                        <span className="text-neutral-500 dark:text-neutral-400">/{t('dashboard.subscriptionPage.perMinuteUnit')}</span>
                      </>
                    ) : planPricing?.price !== null ? (
                      /* Normal planlar: Aylık fiyat */
                      <>
                        <span className="text-3xl font-bold text-neutral-900 dark:text-white">
                          {formatPrice(planPricing.price)}
                        </span>
                        <span className="text-neutral-500 dark:text-neutral-400">{t('dashboard.subscriptionPage.perMonth')}</span>
                      </>
                    ) : (
                      /* Enterprise: Özel */
                      <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                        {t('dashboard.subscriptionPage.custom')}
                      </span>
                    )}
                  </div>
                  <div className="h-[20px] mt-2">
                    {plan.id === 'PAYG' ? (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {t('dashboard.subscriptionPage.noCommitmentDesc')}
                      </p>
                    ) : planPricing?.overageRate ? (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {t('dashboard.subscriptionPage.overageDesc')
                          .replace('{price}', formatPrice(planPricing.overageRate))}
                      </p>
                    ) : plan.id === 'ENTERPRISE' ? (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {t('dashboard.subscriptionPage.customPricing')}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Features list - only shows included features, no gaps */}
                <ul className="space-y-2 mb-6 flex-1 min-h-0">
                  {getPlanFeatures().map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <span className="text-neutral-700 dark:text-neutral-300 truncate">
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                {plan.id === 'ENTERPRISE' ? (
                  isCurrentPlan ? (
                    <Button
                      className="w-full bg-neutral-100 text-neutral-500 cursor-not-allowed border-neutral-200"
                      variant="outline"
                      disabled
                    >
                      {getButtonText()}
                    </Button>
                  ) : (
                    <Button
                      className="w-full border-primary-600 text-primary-600 hover:bg-primary-50"
                      variant="outline"
                      onClick={() => window.location.href = '/contact'}
                    >
                      {getButtonText()}
                    </Button>
                  )
                ) : (
                  <Button
                    className={`w-full ${
                      isCurrentPlan
                        ? 'bg-neutral-100 text-neutral-500 cursor-not-allowed border-neutral-200'
                        : isUpgrade
                          ? 'bg-gradient-to-r from-teal-600 to-blue-500 hover:from-teal-700 hover:to-blue-600 text-white'
                          : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                    }`}
                    variant={isCurrentPlan ? 'outline' : (isUpgrade ? 'default' : 'outline')}
                    disabled={isCurrentPlan || !can('billing:manage') || upgrading}
                    onClick={() => handleUpgrade(plan.id)}
                  >
                    {upgrading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('dashboard.subscriptionPage.processing')}
                      </>
                    ) : (
                      getButtonText()
                    )}
                  </Button>
                )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing history - Hidden until real invoices are available */}
      {/*
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
        <div className="p-6 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">{t('dashboard.subscriptionPage.billingHistory')}</h2>
          </div>
        </div>
        <div className="p-8 text-center text-sm text-neutral-500">
          {t('dashboard.subscriptionPage.noBillingHistory')}
        </div>
      </div>
      */}

      {/* iyzico Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center p-4 border-b border-neutral-200">
              <h3 className="text-lg font-semibold text-neutral-900">
                {t('dashboard.subscriptionPage.payment')}
              </h3>
              <button
                onClick={closePaymentModal}
                className="text-neutral-500 hover:text-neutral-700 transition-colors p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <div ref={checkoutContainerRef} id="iyzico-checkout-container" />
            </div>
          </div>
        </div>
      )}

      {/* Buy Credit Modal - YENİ KREDİ SİSTEMİ */}
      <BuyCreditModal
        isOpen={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        onSuccess={() => {
          // Refresh credit balance
          setCreditRefreshTrigger(prev => prev + 1);
          // Also reload subscription data
          refetchSubscription();
        }}
      />
    </div>
  );
}
