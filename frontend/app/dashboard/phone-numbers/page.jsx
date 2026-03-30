'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Layers3, Lock, Phone, PhoneCall, Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import PhoneNumberModal from '@/components/PhoneNumberModal';
import PageIntro from '@/components/PageIntro';
import { apiClient } from '@/lib/api';
import { toast, toastHelpers } from '@/lib/toast';
import { formatPhone, formatDate } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPageHelp } from '@/content/pageHelp';
import { getBillingPageCopy, formatTl } from '@/lib/billingCopy';
import { getPlanDisplayName } from '@/lib/planConfig';
import { getPhoneNumbersCopy } from '@/lib/phoneNumbersCopy';

function ProgressBar({ value, colorClass = 'bg-primary' }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function UsageCard({ icon: Icon, title, subtitle, stats = [], progress = null, progressColorClass, footer = null }) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-neutral-100 p-3 dark:bg-neutral-800">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800/70">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {stat.label}
            </div>
            <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {progress !== null ? (
        <div className="mt-5 space-y-2">
          <ProgressBar value={progress} colorClass={progressColorClass} />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {Math.round(progress)}%
          </p>
        </div>
      ) : null}

      {footer ? (
        <div className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function NumberMeta({ label, value }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800/70">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-neutral-900 dark:text-white">
        {value}
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, detail, tone = 'default' }) {
  const toneClasses = {
    default: 'bg-neutral-50 dark:bg-neutral-800/70',
    info: 'bg-blue-50 dark:bg-blue-950/30',
    success: 'bg-emerald-50 dark:bg-emerald-950/30',
    warning: 'bg-amber-50 dark:bg-amber-950/30'
  };

  return (
    <div className={`rounded-2xl px-4 py-3 ${toneClasses[tone] || toneClasses.default}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function getLockReasonText(reason, locale, fallback) {
  const copy = {
    tr: {
      PHONE_NOT_INCLUDED: 'Bu pakette telefon erişimi tanımlı değil.',
      PLAN_DISABLED: 'Mevcut paket telefon kullanımını desteklemiyor.',
      V1_OUTBOUND_ONLY: 'Geçiş kısıtı nedeniyle telefon erişimi şu anda sınırlı.',
      BUSINESS_DISABLED: 'İşletme düzeyinde telefon erişimi kapalı.',
      OUTBOUND_DISABLED: 'Telefon entitlement durumu izin vermiyor.',
      SUBSCRIPTION_INACTIVE: 'Abonelik aktif olmadığı için telefon erişimi kapalı.',
      unknown: fallback || 'Kilit nedeni açıklanmadı.'
    },
    en: {
      PHONE_NOT_INCLUDED: 'Phone access is not included on this plan.',
      PLAN_DISABLED: 'The current plan does not support phone usage.',
      V1_OUTBOUND_ONLY: 'Phone access is currently limited by a rollout restriction.',
      BUSINESS_DISABLED: 'Phone access is disabled at the business level.',
      OUTBOUND_DISABLED: 'Current phone entitlements do not allow outbound usage.',
      SUBSCRIPTION_INACTIVE: 'Phone access is disabled because the subscription is inactive.',
      unknown: fallback || 'No lock reason was provided.'
    }
  };

  const lang = locale === 'en' ? 'en' : 'tr';
  return copy[lang][reason] || copy[lang].unknown;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createUsageMeter({ total = 0, used = 0, overage = 0, overageUnitPrice = 0 } = {}) {
  const normalizedTotal = toNumber(total, 0);
  const normalizedUsed = toNumber(used, 0);
  const normalizedOverage = toNumber(overage, 0);

  return {
    total: normalizedTotal,
    used: normalizedUsed,
    remaining: Math.max(normalizedTotal - normalizedUsed, 0),
    overage: normalizedOverage,
    overageUnitPrice: toNumber(overageUnitPrice, 0)
  };
}

function buildLegacyBillingSnapshot(subscription) {
  if (!subscription) return null;

  const plan = subscription.plan || 'FREE';
  const phoneEnabled = Boolean(
    subscription?.entitlements?.phone?.outbound?.enabled
    ?? subscription?.entitlements?.outbound?.enabled
    ?? ['TRIAL', 'PAYG', 'PRO', 'ENTERPRISE'].includes(plan)
  );
  const writtenEnabled = subscription?.writtenChannelsEnabled !== false && plan !== 'FREE';

  return {
    plan,
    status: subscription.status || 'TRIAL',
    channels: {
      webchat: writtenEnabled,
      whatsapp: writtenEnabled,
      email: writtenEnabled,
      phone: phoneEnabled
    },
    entitlements: {
      concurrentCalls: toNumber(
        subscription?.entitlements?.concurrentCalls
        ?? subscription?.limits?.concurrent
        ?? subscription?.concurrentLimit,
        0
      ),
      assistants: toNumber(
        subscription?.entitlements?.assistants
        ?? subscription?.limits?.assistants
        ?? subscription?.assistantsLimit,
        0
      )
    },
    includedUsage: {
      writtenInteractions: createUsageMeter({
        total: subscription?.writtenInteractionsIncluded ?? subscription?.usage?.writtenInteractions?.included,
        used: subscription?.writtenInteractionsUsed ?? subscription?.usage?.writtenInteractions?.used,
        overage: subscription?.writtenInteractionsOverage ?? subscription?.usage?.writtenInteractions?.overage,
        overageUnitPrice: subscription?.writtenInteractionOveragePrice ?? subscription?.writtenInteractionUnitPrice
      }),
      voiceMinutes: createUsageMeter({
        total: subscription?.voiceMinutesIncluded
          ?? subscription?.usage?.voiceMinutes?.included
          ?? subscription?.usage?.minutes?.limit
          ?? subscription?.limits?.minutes
          ?? subscription?.minutesLimit,
        used: subscription?.voiceMinutesUsed
          ?? subscription?.usage?.voiceMinutes?.used
          ?? subscription?.usage?.minutes?.used
          ?? subscription?.minutesUsed,
        overage: subscription?.voiceMinutesOverage
          ?? subscription?.usage?.voiceMinutes?.overage
          ?? subscription?.overageMinutes,
        overageUnitPrice: subscription?.phoneMinuteOveragePrice
          ?? subscription?.overageRate
          ?? subscription?.phoneMinuteUnitPrice
      })
    },
    addOns: {
      writtenInteractions: {
        remaining: toNumber(subscription?.writtenAddOnRemaining, 0)
      },
      voiceMinutes: {
        remaining: toNumber(subscription?.voiceAddOnRemaining, 0)
      }
    },
    wallet: {
      enabled: Boolean(subscription?.paygWalletEnabled || plan === 'PAYG' || toNumber(subscription?.balance, 0) > 0),
      balance: toNumber(subscription?.balance, 0),
      writtenUnitPrice: toNumber(subscription?.writtenInteractionUnitPrice, 0),
      phoneMinuteUnitPrice: toNumber(subscription?.phoneMinuteUnitPrice, 0)
    },
    renewalDate: subscription?.renewalDate
      || subscription?.currentPeriodEnd
      || subscription?.voiceMinutesResetAt
      || subscription?.writtenInteractionsResetAt
      || null
  };
}

export default function PhoneNumbersPage() {
  const { t, locale } = useLanguage();
  const billingCopy = getBillingPageCopy(locale);
  const pageCopy = getPhoneNumbersCopy(locale);
  const pageHelp = getPageHelp('phoneNumbers', locale);

  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState(null);

  const hasFetchedRef = useRef(false);

  const localeCode = locale === 'en' ? 'en-US' : 'tr-TR';
  const snapshot = subscription?.billingSnapshot || buildLegacyBillingSnapshot(subscription);
  const writtenUsage = snapshot?.includedUsage?.writtenInteractions || null;
  const voiceUsage = snapshot?.includedUsage?.voiceMinutes || null;
  const addOns = snapshot?.addOns || {};
  const wallet = snapshot?.wallet || {};
  const supportUsageSummary = subscription?.supportUsage || null;

  const formatCount = (value, maximumFractionDigits = 0) => (
    Number(value || 0).toLocaleString(localeCode, { maximumFractionDigits })
  );

  const formatDateValue = (value) => {
    if (!value) return '—';
    return new Intl.DateTimeFormat(localeCode, {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(new Date(value));
  };

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [subResponse, phoneResponse] = await Promise.allSettled([
          apiClient.subscription.getCurrent(),
          apiClient.phoneNumbers.getAll()
        ]);

        const sub = subResponse.status === 'fulfilled' ? subResponse.value.data : null;
        const numbers = phoneResponse.status === 'fulfilled'
          ? (phoneResponse.value.data.phoneNumbers || [])
          : [];
        const effectiveSnapshot = sub?.billingSnapshot || buildLegacyBillingSnapshot(sub);
        const outboundEntitlement = sub?.entitlements?.phone?.outbound || sub?.entitlements?.outbound || null;
        const phoneEnabled = effectiveSnapshot?.channels?.phone;

        setSubscription(sub);
        setPhoneNumbers(numbers);

        if (phoneEnabled === false) {
          setIsLocked(true);
          setLockReason('PHONE_NOT_INCLUDED');
        } else if (outboundEntitlement && outboundEntitlement.enabled === false) {
          setIsLocked(true);
          setLockReason(outboundEntitlement.reason || 'OUTBOUND_DISABLED');
        } else {
          setIsLocked(false);
          setLockReason(null);
        }

        if (subResponse.status === 'rejected') {
          console.error('Failed to load subscription data for phone numbers page:', subResponse.reason);
          toast.error(locale === 'en' ? 'Failed to load subscription data' : 'Abonelik bilgileri yüklenemedi');
        }

        if (phoneResponse.status === 'rejected') {
          console.error('Failed to load phone numbers:', phoneResponse.reason);
          toast.error(t('dashboard.phoneNumbersPage.failedToLoad') || 'Telefon numaraları yüklenemedi');
        }
      } catch (error) {
        console.error('Failed to load phone number data:', error);
        toast.error(t('dashboard.phoneNumbersPage.failedToLoad') || 'Telefon numaraları yüklenemedi');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [locale, t]);

  const loadPhoneNumbers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.phoneNumbers.getAll();
      setPhoneNumbers(response.data.phoneNumbers || []);
    } catch (_error) {
      toast.error(t('dashboard.phoneNumbersPage.failedToLoad') || 'Telefon numaraları yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (phoneNumber) => {
    if (!confirm(`${t('dashboard.phoneNumbersPage.releaseConfirm')} ${formatPhone(phoneNumber.phoneNumber)}?`)) {
      return;
    }

    try {
      await toastHelpers.async(
        apiClient.phoneNumbers.delete(phoneNumber.id),
        t('dashboard.phoneNumbersPage.releasingNumber'),
        t('dashboard.phoneNumbersPage.phoneNumberReleased')
      );
      loadPhoneNumbers();
    } catch (_error) {
      // toastHelpers handles the error.
    }
  };

  const rawPhoneNumberLimit = subscription?.usage?.phoneNumbers?.limit ?? subscription?.limits?.phoneNumbers;
  const phoneNumberLimit = rawPhoneNumberLimit === undefined ? null : rawPhoneNumberLimit;
  const isPhoneNumberLimitUnlimited = phoneNumberLimit === -1 || phoneNumberLimit === null;

  const canAddNumber = () => {
    if (!subscription || isLocked) return false;
    if (isPhoneNumberLimitUnlimited) return true;
    return phoneNumbers.length < phoneNumberLimit;
  };

  const voiceProgress = voiceUsage?.total > 0
    ? (Number(voiceUsage.used || 0) / Number(voiceUsage.total || 1)) * 100
    : 0;

  const observedSupportChannels = supportUsageSummary?.channels || {};
  const supportConfiguredTotal = supportUsageSummary?.configured
    ? Number(supportUsageSummary?.total || 0)
    : Number(writtenUsage?.total || 0);
  const supportConfiguredUsed = supportUsageSummary?.configured
    ? Number(supportUsageSummary?.used || 0)
    : Number(writtenUsage?.used || 0);
  const supportConfiguredRemaining = supportUsageSummary?.configured
    ? Number(supportUsageSummary?.remaining || 0)
    : Number(writtenUsage?.remaining || 0);
  const supportConfiguredOverage = supportUsageSummary?.configured
    ? Number(supportUsageSummary?.overage || 0)
    : Number(writtenUsage?.overage || 0);
  const hasConfiguredWrittenLimit = Boolean(supportUsageSummary?.configured || Number(writtenUsage?.total || 0) > 0);
  const supportStatusTone = hasConfiguredWrittenLimit
    ? 'success'
    : (snapshot?.plan === 'ENTERPRISE' ? 'warning' : 'info');
  const assistantLimit = subscription?.usage?.assistants?.limit
    ?? snapshot?.entitlements?.assistants
    ?? subscription?.limits?.assistants
    ?? subscription?.assistantsLimit
    ?? 0;
  const assistantsUsed = subscription?.usage?.assistants?.used
    ?? subscription?.assistantsCreated
    ?? 0;
  const supportObservedCount = supportUsageSummary?.used ?? writtenUsage?.used ?? 0;
  const supportStatusValue = hasConfiguredWrittenLimit
    ? pageCopy.configuredShort
    : (snapshot?.plan === 'ENTERPRISE' ? pageCopy.notConfiguredShort : pageCopy.observedShort);
  const supportStatusDetail = hasConfiguredWrittenLimit
    ? `${formatCount(supportConfiguredUsed)} / ${formatCount(supportConfiguredTotal)}`
    : `${formatCount(supportObservedCount)} ${pageCopy.cycleObserved.toLowerCase()}`;
  const voiceSummaryValue = snapshot?.channels?.phone
    ? (voiceUsage?.total > 0 ? formatCount(voiceUsage?.remaining || 0, 1) : '—')
    : pageCopy.voiceAccessDisabled;
  const voiceSummaryDetail = snapshot?.channels?.phone
    ? (voiceUsage?.total > 0
      ? `${formatCount(voiceUsage?.used || 0, 1)} / ${formatCount(voiceUsage?.total || 0, 1)}`
      : pageCopy.notIncluded)
    : pageCopy.notIncluded;
  const phoneLimitValue = isPhoneNumberLimitUnlimited ? '∞' : formatCount(phoneNumberLimit ?? 0);
  const phoneLimitDetail = `${phoneNumbers.length}/${isPhoneNumberLimitUnlimited ? '∞' : (phoneNumberLimit ?? 0)} ${t('dashboard.phoneNumbersPage.numbersUsed')}`;
  const writtenFooter = hasConfiguredWrittenLimit
    ? (snapshot?.plan === 'PAYG'
      ? pageCopy.paygWrittenHint
      : pageCopy.supportConfiguredFooter)
    : (snapshot?.plan === 'ENTERPRISE'
      ? pageCopy.supportLimitMissingDescription
      : pageCopy.supportTrackingOnly);
  const supportCardSubtitle = hasConfiguredWrittenLimit
    ? pageCopy.supportSubtitle
    : pageCopy.supportObservedSubtitle;
  const supportCardStats = hasConfiguredWrittenLimit
    ? [
      { label: pageCopy.total, value: formatCount(supportConfiguredTotal) },
      { label: pageCopy.used, value: formatCount(supportConfiguredUsed) },
      { label: pageCopy.remaining, value: formatCount(supportConfiguredRemaining) },
      { label: pageCopy.overage, value: formatCount(supportConfiguredOverage) }
    ]
    : [
      { label: pageCopy.cycleObserved, value: formatCount(supportObservedCount) },
      { label: billingCopy.pricing.channelLabels.webchat, value: formatCount(observedSupportChannels.webchat || 0) },
      { label: billingCopy.pricing.channelLabels.whatsapp, value: formatCount(observedSupportChannels.whatsapp || 0) },
      { label: billingCopy.pricing.channelLabels.email, value: formatCount(observedSupportChannels.email || 0) }
    ];

  let voiceFooter = null;
  if (snapshot?.plan === 'PAYG') {
    voiceFooter = pageCopy.paygVoiceHint;
  } else if (snapshot && !snapshot.channels?.phone) {
    voiceFooter = pageCopy.notIncluded;
  }

  const accessFooter = wallet?.enabled
    ? `${pageCopy.walletBalance}: ${formatTl(wallet.balance || 0, locale)}`
    : (snapshot?.channels?.phone ? pageCopy.voiceAccessEnabled : pageCopy.voiceAccessDisabled);

  const actionButton = (
    <Button onClick={() => setShowProvisionModal(true)} disabled={!canAddNumber()}>
      <Plus className="mr-2 h-4 w-4" />
      {t('dashboard.phoneNumbersPage.getPhoneNumber')}
    </Button>
  );

  return (
    <div className="space-y-8">
      <PageIntro
        title={pageHelp?.title || t('dashboard.phoneNumbersPage.title')}
        subtitle={pageHelp?.subtitle || t('dashboard.phoneNumbersPage.description')}
        locale={locale}
        help={pageHelp ? {
          tooltipTitle: pageHelp.tooltipTitle,
          tooltipBody: pageHelp.tooltipBody,
          quickSteps: pageHelp.quickSteps
        } : undefined}
        actions={actionButton}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{pageCopy.usageSectionTitle}</p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">
                {getPlanDisplayName(snapshot?.plan || subscription?.plan, locale)}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-300">
                {hasConfiguredWrittenLimit ? pageCopy.usageSectionSubtitle : pageCopy.observedUsageSubtitle}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full">
                {phoneNumbers.length}/{isPhoneNumberLimitUnlimited ? '∞' : (phoneNumberLimit ?? 1)} {t('dashboard.phoneNumbersPage.numbersUsed')}
              </Badge>
              {snapshot?.channels?.phone ? (
                <Badge className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  {pageCopy.voiceAccessEnabled}
                </Badge>
              ) : (
                <Badge className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  {pageCopy.voiceAccessDisabled}
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryMetric
              label={pageCopy.supportStatus}
              value={supportStatusValue}
              detail={supportStatusDetail}
              tone={supportStatusTone}
            />
            <SummaryMetric
              label={pageCopy.voiceTitle}
              value={voiceSummaryValue}
              detail={voiceSummaryDetail}
              tone={snapshot?.channels?.phone ? 'default' : 'warning'}
            />
            <SummaryMetric
              label={pageCopy.concurrentCalls}
              value={formatCount(snapshot?.entitlements?.concurrentCalls || subscription?.entitlements?.concurrentCalls || 0)}
              detail={pageCopy.accessSubtitle}
            />
            <SummaryMetric
              label={pageCopy.assistantLimit}
              value={formatCount(assistantLimit)}
              detail={`${formatCount(assistantsUsed)} ${pageCopy.used.toLowerCase()}`}
            />
            <SummaryMetric
              label={pageCopy.phoneNumberLimit}
              value={phoneLimitValue}
              detail={phoneLimitDetail}
            />
          </div>

          {isLocked ? (
            <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/30 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-3">
                <div className="rounded-2xl bg-amber-100 p-3 dark:bg-amber-900/40">
                  <Lock className="h-5 w-5 text-amber-700 dark:text-amber-200" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{pageCopy.phoneLockedTitle}</h3>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{pageCopy.phoneLockedDescription}</p>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                    {pageCopy.phoneLockedReasonLabel}: {getLockReasonText(lockReason, locale, pageCopy.unknown)}
                  </p>
                </div>
              </div>

              <Link href="/dashboard/subscription" className="shrink-0">
                <Button variant="outline" className="rounded-2xl">
                  {pageCopy.billingCta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : snapshot?.plan === 'ENTERPRISE' && !hasConfiguredWrittenLimit ? (
            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/30">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{pageCopy.supportLimitMissingTitle}</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                {pageCopy.supportLimitMissingDescription}
              </p>
            </div>
          ) : null}
        </div>

        <UsageCard
          icon={Layers3}
          title={pageCopy.accessTitle}
          subtitle={pageCopy.accessSubtitle}
          stats={[
            {
              label: pageCopy.currentPlan,
              value: getPlanDisplayName(snapshot?.plan || subscription?.plan, locale)
            },
            {
              label: pageCopy.resetDate,
              value: formatDateValue(snapshot?.renewalDate || subscription?.renewalDate)
            },
            {
              label: pageCopy.concurrentCalls,
              value: formatCount(snapshot?.entitlements?.concurrentCalls || subscription?.entitlements?.concurrentCalls || 0)
            },
            {
              label: wallet?.enabled ? pageCopy.walletBalance : pageCopy.voiceUnitPrice,
              value: wallet?.enabled
                ? formatTl(wallet.balance || 0, locale)
                : formatTl(voiceUsage?.overageUnitPrice || wallet?.phoneMinuteUnitPrice || 29, locale)
            }
          ]}
          footer={accessFooter}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <UsageCard
          icon={PhoneCall}
          title={pageCopy.voiceTitle}
          subtitle={pageCopy.voiceSubtitle}
          stats={[
            { label: pageCopy.total, value: formatCount(voiceUsage?.total || 0, 1) },
            { label: pageCopy.used, value: formatCount(voiceUsage?.used || 0, 1) },
            { label: pageCopy.remaining, value: formatCount(voiceUsage?.remaining || 0, 1) },
            { label: pageCopy.overage, value: formatCount(voiceUsage?.overage || 0, 1) }
          ]}
          progress={voiceUsage?.total > 0 ? voiceProgress : null}
          progressColorClass="bg-teal-500"
          footer={voiceFooter}
        />

        <UsageCard
          icon={Wallet}
          title={pageCopy.supportTitle}
          subtitle={supportCardSubtitle}
          stats={supportCardStats}
          progress={hasConfiguredWrittenLimit && supportConfiguredTotal > 0
            ? (supportConfiguredUsed / Math.max(supportConfiguredTotal, 1)) * 100
            : null}
          progressColorClass="bg-blue-500"
          footer={writtenFooter}
        />

        <UsageCard
          icon={CalendarClock}
          title={pageCopy.addOnTitle}
          subtitle={pageCopy.addOnSubtitle}
          stats={[
            {
              label: pageCopy.writtenAddOn,
              value: formatCount(addOns?.writtenInteractions?.remaining || 0)
            },
            {
              label: pageCopy.voiceAddOn,
              value: formatCount(addOns?.voiceMinutes?.remaining || 0, 1)
            },
            {
              label: pageCopy.writtenUnitPrice,
              value: formatTl(wallet?.writtenUnitPrice || writtenUsage?.overageUnitPrice || 2.5, locale)
            },
            {
              label: pageCopy.voiceUnitPrice,
              value: formatTl(wallet?.phoneMinuteUnitPrice || voiceUsage?.overageUnitPrice || 29, locale)
            }
          ]}
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{(addOns?.writtenInteractions?.remaining || 0) > 0 || (addOns?.voiceMinutes?.remaining || 0) > 0 ? pageCopy.addOnRemaining : pageCopy.noAddOns}</span>
              <Link href="/dashboard/subscription">
                <Button variant="outline" size="sm" className="rounded-2xl">
                  {pageCopy.billingCta}
                </Button>
              </Link>
            </div>
          }
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">{pageCopy.numberSectionTitle}</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{pageCopy.numberSectionSubtitle}</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6">
            {[1, 2].map((index) => (
              <div
                key={index}
                className="rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="h-20 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : phoneNumbers.length > 0 ? (
          <div className={`grid gap-6 ${phoneNumbers.length === 1 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
            {phoneNumbers.map((number) => (
              <div
                key={number.id}
                className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="rounded-2xl bg-primary/10 p-3">
                        <Phone className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                          {formatPhone(number.phoneNumber)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                            {number.status || t('dashboard.phoneNumbersPage.active')}
                          </Badge>
                          <Badge variant="secondary" className="rounded-full">
                            {number.provider || pageCopy.unknown}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link href="/dashboard/subscription">
                      <Button variant="outline" size="sm" className="rounded-2xl">
                        {pageCopy.billingCta}
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRelease(number)}
                      className="rounded-2xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('common.delete') || 'Delete'}
                    </Button>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <NumberMeta
                    label={t('dashboard.phoneNumbersPage.assistant')}
                    value={number.assistantName || t('dashboard.phoneNumbersPage.notAssigned')}
                  />
                  <NumberMeta
                    label={pageCopy.provider}
                    value={number.provider || pageCopy.unknown}
                  />
                  <NumberMeta
                    label={pageCopy.createdAt}
                    value={formatDate(number.createdAt, 'short')}
                  />
                  <NumberMeta
                    label={pageCopy.nextBilling}
                    value={number.nextBillingDate ? formatDate(number.nextBillingDate, 'short') : '—'}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : isLocked ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
            <EmptyState
              icon={Lock}
              title={pageCopy.phoneLockedTitle}
              description={pageCopy.phoneLockedDescription}
              actionLabel={pageCopy.billingCta}
              onAction={() => {
                window.location.href = '/dashboard/subscription';
              }}
            />
          </div>
        ) : (
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
            <EmptyState
              icon={Phone}
              title={t('dashboard.phoneNumbersPage.noPhoneNumbersYet')}
              description={t('dashboard.phoneNumbersPage.getNumberToStart')}
              actionLabel={t('dashboard.phoneNumbersPage.getPhoneNumber')}
              onAction={() => setShowProvisionModal(true)}
            />
          </div>
        )}
      </div>

      <PhoneNumberModal
        isOpen={showProvisionModal}
        onClose={() => setShowProvisionModal(false)}
        onSuccess={() => {
          setShowProvisionModal(false);
          loadPhoneNumbers();
        }}
      />
    </div>
  );
}
