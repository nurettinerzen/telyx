/**
 * Subscription Page
 * View current plan, usage, and upgrade options
 * Updated with Credit System support
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, CreditCard, Loader2, AlertCircle, MessageSquare, PhoneCall, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils';
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
} from '@/hooks/useSubscription';
import { useProfile } from '@/hooks/useSettings';
import { useQueryClient } from '@tanstack/react-query';

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
    includedFeatures: ['walletBilling', 'concurrent', 'assistants', 'phone', 'whatsapp', 'chatWidget', 'email', 'ecommerce', 'calendar', 'analytics', 'batchCalls'],
    isPayg: true,
    paymentModel: 'PREPAID',
  },
  {
    id: 'STARTER',
    nameKey: 'dashboard.subscriptionPage.planNameStarter',
    descriptionKey: 'dashboard.subscriptionPage.planDescStarter',
    includedFeatures: ['writtenInteractions', 'assistants', 'whatsapp', 'chatWidget', 'analytics', 'email', 'ecommerce', 'calendar'],
    paymentModel: 'POSTPAID',
  },
  {
    id: 'PRO',
    nameKey: 'dashboard.subscriptionPage.planNamePro',
    descriptionKey: 'dashboard.subscriptionPage.planDescPro',
    popular: true,
    includedFeatures: ['writtenInteractions', 'minutes', 'concurrent', 'assistants', 'phone', 'whatsapp', 'chatWidget', 'ecommerce', 'calendar', 'analytics', 'email', 'batchCalls', 'customCrm', 'prioritySupport'],
    paymentModel: 'POSTPAID',
  },
  {
    id: 'ENTERPRISE',
    nameKey: 'dashboard.subscriptionPage.planNameEnterprise',
    descriptionKey: 'dashboard.subscriptionPage.planDescEnterprise',
    includedFeatures: ['writtenInteractions', 'minutes', 'concurrent', 'assistants', 'phone', 'whatsapp', 'chatWidget', 'ecommerce', 'calendar', 'analytics', 'email', 'batchCalls', 'customCrm', 'prioritySupport', 'apiAccess', 'dedicatedSupport', 'customIntegrations', 'slaGuarantee'],
    paymentModel: 'POSTPAID',
  },
];

const CANCELLATION_REASON_OPTIONS = Object.freeze([
  { code: 'LOW_USAGE', tr: 'Çok kullanmıyorum', en: 'I do not use it enough' },
  { code: 'NO_NEED', tr: 'Artık ihtiyacım yok', en: 'I no longer need it' },
  { code: 'TOO_EXPENSIVE', tr: 'Pahalı geldi', en: 'It feels too expensive' },
  { code: 'LOW_QUALITY', tr: 'Kalitesini yeterli bulmadım', en: 'The quality is not good enough' },
  { code: 'MISSING_FEATURES', tr: 'Özellikler ihtiyacımı karşılamıyor', en: 'The features do not meet my needs' },
  { code: 'TOO_COMPLEX', tr: 'Karmaşık geldi', en: 'It feels too complex' },
  { code: 'OTHER', tr: 'Diğer', en: 'Other' },
]);

function getCancellationFlowCopy(locale) {
  const isTr = String(locale || '').toLowerCase().startsWith('tr');

  if (isTr) {
    return {
      sectionTitle: 'Aboneliği Sonlandır',
      sectionDescription: 'Aboneliğinizi dönem sonunda sonlandırabilirsiniz. İptalden sonra isterseniz kısa bir geri bildirim paylaşabilirsiniz.',
      sectionFootnote: 'İptal etseniz bile mevcut dönem bitene kadar kullanımınız devam eder.',
      confirmTitle: 'Gideceğinizi duymak üzücü',
      confirmDescription: 'Devam etmek isterseniz aboneliğiniz dönem sonunda iptal edilecektir.',
      confirmWarning: 'Bu işlem anında erişiminizi kapatmaz. Mevcut plan haklarınız dönem sonuna kadar aktif kalır.',
      confirmAction: 'İptali Onayla',
      surveyTitle: 'İptal işleminiz planlandı',
      surveyDescription: 'İsterseniz ayrılma nedeninizi paylaşabilirsiniz. Bu geri bildirim yalnızca ürün ve fiyatlandırmayı iyileştirmek için kullanılacaktır.',
      surveyOtherLabel: 'Diğer neden',
      surveyOtherPlaceholder: 'İsterseniz kısaca paylaşın',
      surveySubmit: 'Geri Bildirimi Gönder',
      surveySuccess: 'Geri bildiriminiz kaydedildi',
      surveySkip: 'Kapat',
      surveySelectPrompt: 'Lütfen bir neden seçin.',
    };
  }

  return {
    sectionTitle: 'End Subscription',
    sectionDescription: 'You can end your subscription at the end of the current billing period. You can optionally share a short reason afterwards.',
    sectionFootnote: 'Your current access stays active until the period ends.',
    confirmTitle: 'Sorry to see you go',
    confirmDescription: 'If you continue, your subscription will be canceled at the end of the current period.',
    confirmWarning: 'This does not remove access immediately. Your current plan stays active until the billing period ends.',
    confirmAction: 'Confirm Cancellation',
    surveyTitle: 'Your cancellation is scheduled',
    surveyDescription: 'If you want, you can share why you are leaving. This feedback is only used to improve the product and pricing.',
    surveyOtherLabel: 'Other reason',
    surveyOtherPlaceholder: 'Share a short note if you want',
    surveySubmit: 'Send Feedback',
    surveySuccess: 'Your feedback has been saved',
    surveySkip: 'Close',
    surveySelectPrompt: 'Please select a reason.',
  };
}

export default function SubscriptionPage() {
  const { t, locale } = useLanguage();
  const { can, loading: permissionsLoading } = usePermissions();
  const pageHelp = getPageHelp('subscription', locale);
  const queryClient = useQueryClient();

  // React Query hooks
  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useSubscription();
  const { data: billingHistory = [], isLoading: billingLoading } = useBillingHistory();
  const { data: profileData } = useProfile();

  const loading = subscriptionLoading || billingLoading;
  const [upgrading, setUpgrading] = useState(false);
  const [purchasingAddOn, setPurchasingAddOn] = useState('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelDialogStep, setCancelDialogStep] = useState('confirm');
  const [selectedCancellationReason, setSelectedCancellationReason] = useState('');
  const [cancellationReasonDetail, setCancellationReasonDetail] = useState('');
  // Credit modal state
  const [creditModalOpen, setCreditModalOpen] = useState(false);
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
  const cancellationCopy = getCancellationFlowCopy(locale);
  const cancellationReasons = CANCELLATION_REASON_OPTIONS.map((reason) => ({
    code: reason.code,
    label: String(locale || '').toLowerCase().startsWith('tr') ? reason.tr : reason.en,
  }));

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

  const formatBillingAmount = useCallback((amount, currency) => {
    const normalizedCurrency = String(currency || 'USD').toUpperCase();
    const currencyLocale = normalizedCurrency === 'TRY'
      ? 'tr-TR'
      : normalizedCurrency === 'BRL'
        ? 'pt-BR'
        : 'en-US';

    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2
    }).format(Number(amount || 0));
  }, []);

  const getAddOnLabel = useCallback((kind) => {
    return kind === 'VOICE'
      ? t('dashboard.subscriptionPage.voiceMinuteAddon')
      : t('dashboard.subscriptionPage.writtenInteractionAddon');
  }, [t]);

  const getBillingStatusLabel = useCallback((status) => {
    const normalized = String(status || 'paid').toLowerCase();
    const keyMap = {
      paid: 'dashboard.subscriptionPage.paid',
      pending: 'dashboard.subscriptionPage.pending',
      open: 'dashboard.subscriptionPage.statusOpen',
      draft: 'dashboard.subscriptionPage.statusDraft',
      void: 'dashboard.subscriptionPage.statusVoid',
      uncollectible: 'dashboard.subscriptionPage.statusUncollectible',
    };

    return keyMap[normalized]
      ? t(keyMap[normalized])
      : normalized.replace(/_/g, ' ');
  }, [t]);

  const refreshBillingState = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['subscription'] }),
      queryClient.invalidateQueries({ queryKey: ['balance'] }),
      queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] }),
    ]);

    await Promise.all([
      refetchSubscription(),
      queryClient.refetchQueries({ queryKey: ['balance'], exact: true }),
      queryClient.refetchQueries({ queryKey: ['subscription', 'billingHistory'], exact: true }),
      queryClient.refetchQueries({ queryKey: ['settings', 'profile'], exact: true }),
    ]);
  }, [queryClient, refetchSubscription]);

  // Get plan name from translation
  const getPlanName = (plan) => {
    return t(plan.nameKey);
  };

  const resetCancellationFlow = useCallback(() => {
    setCancelDialogOpen(false);
    setCancelDialogStep('confirm');
    setSelectedCancellationReason('');
    setCancellationReasonDetail('');
  }, []);

  // Check for success/error in URL params (after payment callback)
  useEffect(() => {
    const handleUrlState = async () => {
      const params = new URLSearchParams(window.location.search);
      const status = params.get('status');
      const success = params.get('success');
      const session_id = params.get('session_id');
      const walletTopup = params.get('wallet_topup');
      const addonStatus = params.get('addon');
      const addonKind = params.get('addon_kind');

      if (walletTopup === 'success') {
        try {
          if (session_id) {
            await apiClient.get(`/api/balance/verify-topup-session?session_id=${session_id}`);
          }
          toast.success(t('dashboard.subscriptionPage.balanceTopupCompleted'));
          await refreshBillingState();
        } catch (error) {
          console.error('Top-up verification error:', error);
          toast.error(
            error.response?.data?.error
            || t('dashboard.subscriptionPage.balanceTopupVerificationFailed')
          );
        } finally {
          window.history.replaceState({}, '', window.location.pathname);
        }
        return;
      }

      if (walletTopup === 'cancel') {
        toast.error(t('dashboard.subscriptionPage.balanceTopupCanceled'));
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      if (addonStatus === 'success') {
        try {
          if (session_id) {
            await apiClient.get(`/api/subscription/verify-addon-session?session_id=${session_id}`);
          }
          toast.success(
            t('dashboard.subscriptionPage.addonPurchaseCompleted')
              .replace('{addonName}', getAddOnLabel(addonKind))
          );
          await refreshBillingState();
        } catch (error) {
          console.error('Add-on verification error:', error);
          toast.error(
            error.response?.data?.error
            || t('dashboard.subscriptionPage.addonPurchaseVerificationFailed')
          );
        } finally {
          window.history.replaceState({}, '', window.location.pathname);
        }
        return;
      }

      if (addonStatus === 'cancel') {
        toast.error(
          t('dashboard.subscriptionPage.addonPurchaseCanceled')
            .replace('{addonName}', getAddOnLabel(addonKind))
        );
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      if (success === 'true' && session_id) {
        try {
          await apiClient.get(`/api/subscription/verify-session?session_id=${session_id}`);
          toast.success(t('dashboard.subscriptionPage.upgradeSuccess'));
          await refreshBillingState();
          window.history.replaceState({}, '', window.location.pathname);
        } catch (error) {
          console.error('Session verification error:', error);
          toast.error(t('dashboard.subscriptionPage.sessionVerificationError'));
        }
        return;
      }

      if (status === 'success' || success === 'true') {
        toast.success(t('dashboard.subscriptionPage.upgradeSuccess'));
        window.history.replaceState({}, '', window.location.pathname);
        await refreshBillingState();
      } else if (status === 'error' || params.get('error')) {
        const errorMsg = params.get('message') || t('dashboard.subscriptionPage.upgradeFailed');
        toast.error(decodeURIComponent(errorMsg));
        window.history.replaceState({}, '', window.location.pathname);
      }
    };

    handleUrlState();
  }, [getAddOnLabel, locale, refreshBillingState, t]);

  const handleUpgrade = async (planId) => {
    // Get plan name from translation keys
    const planInfo = BASE_PLANS.find(p => p.id === planId);
    const planName = planInfo ? t(planInfo.nameKey) : planId;
    const currentPlanId = LEGACY_PLAN_MAP[subscription?.plan] || subscription?.plan || 'FREE';
    const currentLevel = PLAN_HIERARCHY[currentPlanId] ?? 0;
    const nextLevel = PLAN_HIERARCHY[planId] ?? 0;
    const requiresConfirmation = nextLevel < currentLevel;

    if (requiresConfirmation && !confirm(`${t('dashboard.subscriptionPage.upgradeConfirmMsg')} ${planName}`)) {
      return;
    }

    try {
      setUpgrading(true);
      const response = planId === 'PAYG'
        ? await apiClient.post('/api/subscription/switch-to-payg', {})
        : await apiClient.subscription.upgrade(planId, locale);

      // Handle different response types
      if (response.data?.type === 'payg_switch') {
        // Switched to PAYG (pay as you go)
        toast.success(t('dashboard.subscriptionPage.paygSwitchSuccess'));
        await refreshBillingState();
      } else if (response.data?.type === 'upgrade') {
        // Immediate upgrade (with proration)
        toast.success(t('dashboard.subscriptionPage.upgradeWithProrationSuccess'));
        await refreshBillingState();
      } else if (response.data?.type === 'reactivate') {
        // Reactivated canceled subscription with new plan
        const effectiveDate = response.data.effectiveDate
          ? formatDate(response.data.effectiveDate, 'short', locale)
          : t('dashboard.subscriptionPage.nextPeriod');
        toast.success(t('dashboard.subscriptionPage.reactivateSuccess').replace('{date}', effectiveDate).replace('{planName}', planName));
        await refreshBillingState();
      } else if (response.data?.type === 'downgrade') {
        // Scheduled downgrade (end of period)
        const effectiveDate = response.data.effectiveDate
          ? formatDate(response.data.effectiveDate, 'short', locale)
          : null;
        toast.success(
          effectiveDate
            ? t('dashboard.subscriptionPage.downgradeScheduled').replace('{date}', effectiveDate).replace('{planName}', planName)
            : t('dashboard.subscriptionPage.downgradeScheduledNoDate').replace('{planName}', planName)
        );
        await refreshBillingState();
      } else if (response.data?.sessionUrl) {
        // Stripe checkout (new subscription)
        window.location.href = response.data.sessionUrl;
      } else {
        toast.success(t('dashboard.subscriptionPage.upgradeSuccess'));
        await refreshBillingState();
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      toast.error(error.response?.data?.error || t('dashboard.subscriptionPage.operationFailed'));
    } finally {
      setUpgrading(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelDialogOpen(true);
    setCancelDialogStep('confirm');
    setSelectedCancellationReason('');
    setCancellationReasonDetail('');
  };

  const handleCancelDialogOpenChange = (open) => {
    if (upgrading) return;
    if (!open) {
      resetCancellationFlow();
      return;
    }

    setCancelDialogOpen(true);
  };

  const handleConfirmCancellation = async () => {
    try {
      setUpgrading(true);
      const response = await apiClient.subscription.cancel();

      if (response.data?.success) {
        const cancelDate = response.data.cancelAt
          ? formatDate(response.data.cancelAt, 'long', locale)
          : null;
        setCancelDialogStep('survey');
        toast.success(
          cancelDate
            ? t('dashboard.subscriptionPage.cancelSuccess').replace('{date}', cancelDate)
            : t('dashboard.subscriptionPage.cancelSuccessNoDate')
        );
        await refreshBillingState();
      }
    } catch (error) {
      console.error('Cancel subscription error:', error);
      if (error.response?.data?.code === 'SUBSCRIPTION_NOT_LINKED') {
        toast.error(
          locale === 'tr'
            ? 'Abonelik kaydı Stripe ile henüz eşleşmedi. Birkaç saniye sonra tekrar deneyin; devam ederse bize haber verin.'
            : 'This subscription is not linked to Stripe yet. Please try again in a few seconds, and contact us if it continues.'
        );
      } else {
        toast.error(error.response?.data?.error || t('dashboard.subscriptionPage.cancelFailed'));
      }
    } finally {
      setUpgrading(false);
    }
  };

  const handleSubmitCancellationFeedback = async () => {
    if (!selectedCancellationReason) {
      toast.error(cancellationCopy.surveySelectPrompt);
      return;
    }

    if (selectedCancellationReason === 'OTHER' && !cancellationReasonDetail.trim()) {
      toast.error(cancellationCopy.surveyOtherLabel);
      return;
    }

    try {
      setUpgrading(true);
      const response = await apiClient.subscription.submitCancellationFeedback({
        reasonCode: selectedCancellationReason,
        reasonDetail: cancellationReasonDetail.trim() || undefined,
      });

      if (response.data?.success) {
        resetCancellationFlow();
        toast.success(cancellationCopy.surveySuccess);
      }
    } catch (error) {
      console.error('Cancellation feedback error:', error);
      toast.error(error.response?.data?.error || t('dashboard.subscriptionPage.operationFailed'));
    } finally {
      setUpgrading(false);
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      setUpgrading(true);
      const response = await apiClient.subscription.reactivate();

      if (response.data?.success) {
        toast.success(t('dashboard.subscriptionPage.reactivateCurrentSuccess'));
        await refreshBillingState();
      }
    } catch (error) {
      console.error('Reactivate subscription error:', error);
      toast.error(error.response?.data?.error || t('dashboard.subscriptionPage.operationFailed'));
    } finally {
      setUpgrading(false);
    }
  };

  const handleUndoScheduledChange = async () => {
    try {
      setUpgrading(true);
      const response = await apiClient.subscription.undoScheduledChange();

      if (response.data?.success) {
        toast.success(t('dashboard.subscriptionPage.undoScheduledChangeSuccess'));
        await refreshBillingState();
      }
    } catch (error) {
      console.error('Undo scheduled change error:', error);
      toast.error(error.response?.data?.error || t('dashboard.subscriptionPage.operationFailed'));
    } finally {
      setUpgrading(false);
    }
  };

  const handleBuyAddOn = async (kind, packageId) => {
    try {
      setPurchasingAddOn(`${kind}:${packageId}`);
      const response = await apiClient.subscription.createAddOnCheckout({ kind, packageId, locale });
      if (response.data?.sessionUrl) {
        window.location.href = response.data.sessionUrl;
        return;
      }
      toast.error(t('dashboard.subscriptionPage.addonCheckoutFailed'));
    } catch (error) {
      console.error('Add-on checkout error:', error);
      toast.error(error.response?.data?.error || t('dashboard.subscriptionPage.addonPurchaseFailed'));
    } finally {
      setPurchasingAddOn('');
    }
  };

  const writtenAddOnCatalog = subscription?.addOnCatalog?.written || [];
  const voiceAddOnCatalog = subscription?.addOnCatalog?.voice || [];
  const currentPlanPricing = subscription ? getPlanPricing(subscription.plan) : null;
  const showSubscriptionManagement = !['FREE', 'TRIAL', 'PAYG'].includes(subscription?.plan);
  const canSubmitCancellation = Boolean(selectedCancellationReason)
    && (selectedCancellationReason !== 'OTHER' || Boolean(cancellationReasonDetail.trim()));
  const pendingPlanName = subscription?.pendingPlanId
    ? getPlanDisplayName(subscription.pendingPlanId, locale)
    : null;
  const currentPlanSummary = subscription ? [
    {
      label: locale === 'tr' ? 'Yazılı etkileşim' : 'Written interactions',
      value: (() => {
        if (subscription.plan === 'PAYG') return locale === 'tr' ? 'Bakiyeden düşer' : 'Wallet-based';
        const limit = subscription.enterpriseSupportInteractions
          ?? subscription.writtenInteractionsIncluded
          ?? currentPlanPricing?.writtenInteractions;
        if (limit === null || limit === undefined) return locale === 'tr' ? 'Özel' : 'Custom';
        if (Number(limit) === 0) return locale === 'tr' ? 'Yok' : 'Not included';
        return `${Number(limit).toLocaleString(regionConfig.locale)} ${locale === 'tr' ? 'etkileşim' : 'interactions'}`;
      })(),
    },
    {
      label: locale === 'tr' ? 'Ses dakikası' : 'Voice minutes',
      value: (() => {
        if (subscription.plan === 'PAYG') return locale === 'tr' ? 'Bakiyeden düşer' : 'Wallet-based';
        const limit = subscription.enterpriseMinutes ?? currentPlanPricing?.minutes;
        if (limit === null || limit === undefined) return locale === 'tr' ? 'Özel' : 'Custom';
        if (Number(limit) === 0) return locale === 'tr' ? 'Yok' : 'Not included';
        return `${Number(limit).toLocaleString(regionConfig.locale)} ${locale === 'tr' ? 'dk' : 'min'}`;
      })(),
    },
    {
      label: locale === 'tr' ? 'Eşzamanlı çağrı' : 'Concurrent calls',
      value: (() => {
        const limit = subscription.enterpriseConcurrent ?? subscription.concurrentLimit ?? currentPlanPricing?.concurrent;
        if (limit === null || limit === undefined) return locale === 'tr' ? 'Özel' : 'Custom';
        if (Number(limit) === 0) return locale === 'tr' ? 'Yok' : 'Not included';
        return String(limit);
      })(),
    },
    {
      label: locale === 'tr' ? 'Asistan limiti' : 'Assistant limit',
      value: (() => {
        const limit = subscription.enterpriseAssistants ?? subscription.assistantsLimit ?? currentPlanPricing?.assistants;
        if (limit === null || limit === undefined) return locale === 'tr' ? 'Özel' : 'Custom';
        return String(limit);
      })(),
    },
  ] : [];

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
        <div className="space-y-6">
          {/* Compact Plan Info Bar */}
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#081224]/95 px-6 py-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Badge className="bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-400 text-sm px-3 py-1">
                  {getPlanDisplayName(subscription.plan, locale)}
                </Badge>
                <span className="hidden sm:block text-neutral-300 dark:text-neutral-600 select-none">·</span>
                <div className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                  <span className="font-medium text-neutral-500 dark:text-neutral-500">{t('dashboard.subscriptionPage.monthlyCost')}:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {(() => {
                      const planPricing = getPlanPricing(subscription.plan);
                      if (subscription.plan === 'ENTERPRISE' && subscription.enterprisePrice) {
                        return formatPrice(subscription.enterprisePrice);
                      }
                      if (planPricing && planPricing.price !== null) {
                        return formatPrice(planPricing.price);
                      }
                      if (subscription.plan === 'FREE') return formatPrice(0);
                      if (subscription.plan === 'ENTERPRISE') return t('dashboard.subscriptionPage.custom');
                      return formatPrice(subscription.price || 0);
                    })()}
                  </span>
                </div>
                <span className="hidden sm:block text-neutral-300 dark:text-neutral-600 select-none">·</span>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-medium text-neutral-500 dark:text-neutral-500">{t('dashboard.subscriptionPage.billingCycle')}:</span>
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {subscription.billingCycle || t('dashboard.subscriptionPage.monthly')}
                  </span>
                </div>
                {subscription.currentPeriodEnd && !subscription.cancelAtPeriodEnd && (
                  <>
                    <span className="hidden sm:block text-neutral-300 dark:text-neutral-600 select-none">·</span>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-medium text-neutral-500 dark:text-neutral-500">{t('dashboard.subscriptionPage.nextBilling')}:</span>
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {formatDate(subscription.currentPeriodEnd || subscription.nextBillingDate, 'short', locale)}
                      </span>
                    </div>
                  </>
                )}
                {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                  <>
                    <span className="hidden sm:block text-neutral-300 dark:text-neutral-600 select-none">·</span>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-medium text-neutral-500 dark:text-neutral-500">{t('dashboard.subscriptionPage.subscriptionEndDate')}:</span>
                      <span className="font-medium text-orange-600 dark:text-orange-400">
                        {formatDate(subscription.currentPeriodEnd, 'short', locale)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {showSubscriptionManagement && !subscription.cancelAtPeriodEnd && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelSubscription}
                  disabled={upgrading}
                  className="shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-transparent dark:text-red-300"
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
              )}
            </div>

            {/* Canceled status message */}
            {subscription.cancelAtPeriodEnd && !subscription.pendingPlanId && (
              <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-white/10">
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-4 py-3 text-sm text-orange-800 dark:text-orange-400 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <strong>{t('dashboard.subscriptionPage.subscriptionCanceled')}</strong>
                    {' '}
                    {subscription.currentPeriodEnd && (
                      <>{t('dashboard.subscriptionPage.planEndsOnDate').replace('{date}', formatDate(subscription.currentPeriodEnd, 'short', locale))}</>
                    )}
                    {!subscription.currentPeriodEnd && <>{t('dashboard.subscriptionPage.planEndsAtPeriodEnd')}</>}
                  </div>
                  {showCancelableSubscription && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReactivateSubscription}
                      disabled={upgrading}
                      className="shrink-0 border-orange-300 bg-white text-orange-700 hover:bg-orange-100 hover:text-orange-800 dark:border-orange-700 dark:bg-transparent dark:text-orange-300"
                    >
                      {upgrading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('dashboard.subscriptionPage.processing')}
                        </>
                      ) : (
                        t('dashboard.subscriptionPage.reactivate')
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {subscription.pendingPlanId && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <strong>{t('dashboard.subscriptionPage.pendingPlanChange')}</strong>
                  {' '}
                  {subscription.currentPeriodEnd
                    ? t('dashboard.subscriptionPage.pendingPlanChangeDesc')
                      .replace('{date}', formatDate(subscription.currentPeriodEnd, 'short', locale))
                      .replace('{planName}', pendingPlanName)
                    : t('dashboard.subscriptionPage.pendingPlanChangeNoDate')
                      .replace('{planName}', pendingPlanName)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndoScheduledChange}
                  disabled={upgrading}
                  className="shrink-0 border-blue-300 bg-white text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-700 dark:bg-transparent dark:text-blue-200"
                >
                  {upgrading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('dashboard.subscriptionPage.processing')}
                    </>
                  ) : (
                    t('dashboard.subscriptionPage.undoScheduledChange')
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Credit Balance - full width */}
          <CreditBalance
            onBuyCredit={() => setCreditModalOpen(true)}
          />
        </div>
      )}

      <Dialog open={cancelDialogOpen} onOpenChange={handleCancelDialogOpenChange}>
        <DialogContent className="sm:max-w-xl">
          {cancelDialogStep === 'confirm' ? (
            <>
              <DialogHeader>
                <DialogTitle>{cancellationCopy.confirmTitle}</DialogTitle>
                <DialogDescription>
                  {cancellationCopy.confirmDescription}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                {cancellationCopy.confirmWarning}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={resetCancellationFlow}
                  disabled={upgrading}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleConfirmCancellation}
                  disabled={upgrading}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {upgrading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('dashboard.subscriptionPage.processing')}
                    </>
                  ) : (
                    cancellationCopy.confirmAction
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{cancellationCopy.surveyTitle}</DialogTitle>
                <DialogDescription>
                  {cancellationCopy.surveyDescription}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {cancellationReasons.map((reason) => {
                  const selected = selectedCancellationReason === reason.code;
                  return (
                    <button
                      key={reason.code}
                      type="button"
                      onClick={() => {
                        setSelectedCancellationReason(reason.code);
                        if (reason.code !== 'OTHER') {
                          setCancellationReasonDetail('');
                        }
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-950/30'
                          : 'border-neutral-200 bg-white hover:border-red-200 hover:bg-red-50/50 dark:border-white/10 dark:bg-[#081224]/95 dark:hover:border-red-900 dark:hover:bg-red-950/20'
                      }`}
                    >
                      <span className={`text-sm font-medium ${selected ? 'text-red-700 dark:text-red-300' : 'text-neutral-900 dark:text-white'}`}>
                        {reason.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedCancellationReason === 'OTHER' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-white">
                    {cancellationCopy.surveyOtherLabel}
                  </label>
                  <Textarea
                    rows={4}
                    value={cancellationReasonDetail}
                    onChange={(event) => setCancellationReasonDetail(event.target.value)}
                    placeholder={cancellationCopy.surveyOtherPlaceholder}
                  />
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={resetCancellationFlow}
                  disabled={upgrading}
                >
                  {cancellationCopy.surveySkip}
                </Button>
                <Button
                  onClick={handleSubmitCancellationFeedback}
                  disabled={upgrading || !canSubmitCancellation}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {upgrading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('dashboard.subscriptionPage.processing')}
                    </>
                  ) : (
                    cancellationCopy.surveySubmit
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add-on Store — only purchase options, usage shown in CreditBalance above */}
      {!loading && subscription && (writtenAddOnCatalog.length > 0 || voiceAddOnCatalog.length > 0) && (
        <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">
            {locale === 'tr' ? 'Ek Paket Satın Al' : 'Buy Add-ons'}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
            {locale === 'tr'
              ? 'Dahil kullanımınız bittiğinde ek paketler devreye girer.'
              : 'Add-ons kick in when your included usage runs out.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Written interaction add-ons */}
            {writtenAddOnCatalog.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  {locale === 'tr' ? 'Yazılı etkileşim' : 'Written interactions'}
                </div>
                {writtenAddOnCatalog.map((pkg) => {
                  const buttonKey = `WRITTEN:${pkg.id}`;
                  return (
                    <div key={pkg.id} className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-white/10 px-4 py-3 dark:bg-[#0B1730]/60">
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          {pkg.quantity} {locale === 'tr' ? 'etkileşim' : 'interactions'}
                        </div>
                        <div className="text-sm text-neutral-500 dark:text-neutral-400">
                          {formatPrice(pkg.amount)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
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

            {/* Voice minute add-ons */}
            {voiceAddOnCatalog.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <PhoneCall className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  {locale === 'tr' ? 'Ses Dakikası' : 'Voice Minutes'}
                </div>
                {voiceAddOnCatalog.map((pkg) => {
                  const buttonKey = `VOICE:${pkg.id}`;
                  return (
                    <div key={pkg.id} className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-white/10 px-4 py-3 dark:bg-[#0B1730]/60">
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          {pkg.quantity} {locale === 'tr' ? 'dakika' : 'minutes'}
                        </div>
                        <div className="text-sm text-neutral-500 dark:text-neutral-400">
                          {formatPrice(pkg.amount)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
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
              'trialMinutes', 'trialChat', 'walletBilling', 'writtenInteractions', 'payPerMinute',
              'minutes', 'concurrent', 'assistants', 'phone', 'whatsapp', 'chatWidget',
              'ecommerce', 'calendar', 'analytics', 'email', 'batchCalls',
              'customCrm', 'prioritySupport', 'apiAccess', 'dedicatedSupport', 'customIntegrations',
              'slaGuarantee'
            ];

            // Feature labels using translation keys
            const getFeatureLabel = (key) => {
              const isEnterprise = plan.id === 'ENTERPRISE';
              const isPro = plan.id === 'PRO';

              const featureMap = {
                trialMinutes: t('dashboard.subscriptionPage.featureTrialMinutes'),
                trialChat: t('dashboard.subscriptionPage.featureTrialChat'),
                walletBilling: t('dashboard.subscriptionPage.featureWalletBilling'),
                writtenInteractions: isEnterprise
                  ? t('dashboard.subscriptionPage.featureWrittenInteractionsEnterprise')
                  : t('dashboard.subscriptionPage.featureWrittenInteractions').replace('{count}', String(planPricing?.writtenInteractions || 0)),
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
                phone: t('dashboard.subscriptionPage.featurePhone'),
                whatsapp: t('dashboard.subscriptionPage.featureWhatsapp'),
                chatWidget: t('dashboard.subscriptionPage.featureChatWidget'),
                email: t('dashboard.subscriptionPage.featureEmail'),
                ecommerce: t('dashboard.subscriptionPage.featureEcommerce'),
                calendar: t('dashboard.subscriptionPage.featureCalendar'),
                batchCalls: t('dashboard.subscriptionPage.featureBatchCalls'),
                customCrm: t('dashboard.subscriptionPage.featureCustomCrm'),
                analytics: t('dashboard.subscriptionPage.featureAnalytics'),
                prioritySupport: t('dashboard.subscriptionPage.featurePrioritySupport'),
                apiAccess: t('dashboard.subscriptionPage.featureApiAccess'),
                dedicatedSupport: t('dashboard.subscriptionPage.featureDedicatedSupport'),
                customIntegrations: t('dashboard.subscriptionPage.featureCustomIntegrations'),
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
                className={`bg-white dark:bg-[#081224]/95 rounded-xl border-2 p-6 shadow-sm relative flex flex-col h-full ${
                  isCurrentPlan ? 'border-green-500 ring-2 ring-green-200 dark:ring-green-900' : 'border-neutral-200 dark:border-white/10'
                }`}
              >
                {/* Show "Current Plan" badge if this is the current plan */}
                {isCurrentPlan && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-[#081224]/95 px-1">
                    <Badge className="bg-green-600 text-white px-3 py-1">
                      {t('dashboard.subscriptionPage.currentPlan')}
                    </Badge>
                  </div>
                )}
                {/* Show "Popular" badge only if user has no plan */}
                {showPopularBadge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-[#081224]/95 px-1">
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
                      className="flex items-start gap-2 text-[13px] leading-snug"
                    >
                      <Check className="mt-0.5 h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <span className="break-words text-neutral-700 dark:text-neutral-300 line-clamp-2">
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
                          ? 'bg-gradient-to-r from-[#051752] via-[#000ACF] to-[#006FEB] hover:from-[#041240] hover:via-[#0008b0] hover:to-[#00C4E6] text-white'
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

      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#081224]/95">
        <div className="p-6 border-b border-neutral-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{t('dashboard.subscriptionPage.billingHistory')}</h2>
          </div>
        </div>
        <div className="divide-y divide-neutral-200 dark:divide-white/10">
          {billingHistory.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {t('dashboard.subscriptionPage.noBillingHistory')}
            </div>
          ) : (
            billingHistory.map((entry) => {
              const invoiceUrl = entry.invoicePdfUrl || entry.hostedInvoiceUrl || null;
              const localizedPlan = entry.plan ? getPlanDisplayName(entry.plan, locale) : null;
              const statusTone = entry.status === 'paid'
                ? 'text-emerald-600 dark:text-emerald-400'
                : entry.status === 'open'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-neutral-500 dark:text-neutral-400';

              return (
                <div key={entry.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">
                      {entry.description || localizedPlan || t('dashboard.subscriptionPage.billingHistory')}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {formatDate(entry.date, 'long', locale)}
                      {localizedPlan ? ` • ${localizedPlan}` : ''}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-semibold text-neutral-900 dark:text-white">
                      {formatBillingAmount(entry.amount, entry.currency)}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-sm sm:justify-end">
                      <span className={statusTone}>
                        {getBillingStatusLabel(entry.status)}
                      </span>
                      {invoiceUrl && (
                        <a
                          href={invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary-600 hover:text-primary-700"
                        >
                          {t('dashboard.subscriptionPage.openInvoice')}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Buy Credit Modal - YENİ KREDİ SİSTEMİ */}
      <BuyCreditModal
        isOpen={creditModalOpen}
        initialRegion={region}
        onClose={() => setCreditModalOpen(false)}
        onSuccess={() => {
          refreshBillingState();
        }}
      />
    </div>
  );
}
