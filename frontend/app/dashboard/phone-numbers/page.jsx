'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, MessageSquare, Phone, PhoneCall, Plus, Trash2, Users } from 'lucide-react';
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
import { getPlanDisplayName } from '@/lib/planConfig';
import { getPhoneNumbersCopy } from '@/lib/phoneNumbersCopy';

/* ── Helpers ── */
function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createUsageMeter({ total = 0, used = 0, overage = 0, overageUnitPrice = 0 } = {}) {
  const t = toNumber(total, 0);
  const u = toNumber(used, 0);
  return {
    total: t,
    used: u,
    remaining: Math.max(t - u, 0),
    overage: toNumber(overage, 0),
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
    channels: { webchat: writtenEnabled, whatsapp: writtenEnabled, email: writtenEnabled, phone: phoneEnabled },
    entitlements: {
      concurrentCalls: toNumber(subscription?.entitlements?.concurrentCalls ?? subscription?.limits?.concurrent ?? subscription?.concurrentLimit, 0),
      assistants: toNumber(subscription?.entitlements?.assistants ?? subscription?.limits?.assistants ?? subscription?.assistantsLimit, 0)
    },
    includedUsage: {
      writtenInteractions: createUsageMeter({
        total: subscription?.writtenInteractionsIncluded ?? subscription?.usage?.writtenInteractions?.included,
        used: subscription?.writtenInteractionsUsed ?? subscription?.usage?.writtenInteractions?.used,
        overage: subscription?.writtenInteractionsOverage ?? subscription?.usage?.writtenInteractions?.overage,
        overageUnitPrice: subscription?.writtenInteractionOveragePrice ?? subscription?.writtenInteractionUnitPrice
      }),
      voiceMinutes: createUsageMeter({
        total: subscription?.voiceMinutesIncluded ?? subscription?.usage?.voiceMinutes?.included ?? subscription?.usage?.minutes?.limit ?? subscription?.limits?.minutes ?? subscription?.minutesLimit,
        used: subscription?.voiceMinutesUsed ?? subscription?.usage?.voiceMinutes?.used ?? subscription?.usage?.minutes?.used ?? subscription?.minutesUsed,
        overage: subscription?.voiceMinutesOverage ?? subscription?.usage?.voiceMinutes?.overage ?? subscription?.overageMinutes,
        overageUnitPrice: subscription?.phoneMinuteOveragePrice ?? subscription?.overageRate ?? subscription?.phoneMinuteUnitPrice
      })
    },
    addOns: {
      writtenInteractions: { remaining: toNumber(subscription?.writtenAddOnRemaining, 0) },
      voiceMinutes: { remaining: toNumber(subscription?.voiceAddOnRemaining, 0) }
    },
    wallet: {
      enabled: Boolean(subscription?.paygWalletEnabled || plan === 'PAYG' || toNumber(subscription?.balance, 0) > 0),
      balance: toNumber(subscription?.balance, 0),
      writtenUnitPrice: toNumber(subscription?.writtenInteractionUnitPrice, 0),
      phoneMinuteUnitPrice: toNumber(subscription?.phoneMinuteUnitPrice, 0)
    },
    renewalDate: subscription?.renewalDate || subscription?.currentPeriodEnd || subscription?.voiceMinutesResetAt || subscription?.writtenInteractionsResetAt || null
  };
}

function getLockReasonText(reason, locale) {
  const copy = {
    tr: { PHONE_NOT_INCLUDED: 'Bu pakette telefon erişimi yok.', PLAN_DISABLED: 'Paket telefon kullanımını desteklemiyor.', SUBSCRIPTION_INACTIVE: 'Abonelik aktif değil.', unknown: 'Erişim kısıtlanmış.' },
    en: { PHONE_NOT_INCLUDED: 'Phone access is not included.', PLAN_DISABLED: 'Plan does not support phone.', SUBSCRIPTION_INACTIVE: 'Subscription is inactive.', unknown: 'Access restricted.' }
  };
  const lang = locale === 'en' ? 'en' : 'tr';
  return copy[lang][reason] || copy[lang].unknown;
}

/* ── Progress Bar ── */
function ProgressBar({ value, colorClass = 'bg-primary' }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* ── Metric Pill ── */
function Metric({ label, value, sub, className = '' }) {
  return (
    <div className={`rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800/60 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-neutral-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{sub}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════ */

export default function PhoneNumbersPage() {
  const { t, locale } = useLanguage();
  const pageCopy = getPhoneNumbersCopy(locale);
  const pageHelp = getPageHelp('phoneNumbers', locale);
  const isTR = locale !== 'en';

  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState(null);
  const hasFetchedRef = useRef(false);

  const localeCode = locale === 'en' ? 'en-US' : 'tr-TR';
  const snapshot = subscription?.billingSnapshot || buildLegacyBillingSnapshot(subscription);
  const voiceUsage = snapshot?.includedUsage?.voiceMinutes || null;
  const writtenUsage = snapshot?.includedUsage?.writtenInteractions || null;
  const addOns = snapshot?.addOns || {};

  const fmt = (v, d = 0) => Number(v || 0).toLocaleString(localeCode, { maximumFractionDigits: d });

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const [subRes, phoneRes] = await Promise.allSettled([
          apiClient.subscription.getCurrent(),
          apiClient.phoneNumbers.getAll()
        ]);
        const sub = subRes.status === 'fulfilled' ? subRes.value.data : null;
        const numbers = phoneRes.status === 'fulfilled' ? (phoneRes.value.data.phoneNumbers || []) : [];
        const snap = sub?.billingSnapshot || buildLegacyBillingSnapshot(sub);
        const outEnt = sub?.entitlements?.phone?.outbound || sub?.entitlements?.outbound || null;

        setSubscription(sub);
        setPhoneNumbers(numbers);

        if (snap?.channels?.phone === false) { setIsLocked(true); setLockReason('PHONE_NOT_INCLUDED'); }
        else if (outEnt && outEnt.enabled === false) { setIsLocked(true); setLockReason(outEnt.reason || 'OUTBOUND_DISABLED'); }
        else { setIsLocked(false); setLockReason(null); }

        if (subRes.status === 'rejected') toast.error(isTR ? 'Abonelik bilgileri yüklenemedi' : 'Failed to load subscription data');
        if (phoneRes.status === 'rejected') toast.error(isTR ? 'Telefon numaraları yüklenemedi' : 'Failed to load phone numbers');
      } catch (_err) {
        toast.error(isTR ? 'Veri yüklenemedi' : 'Failed to load data');
      } finally { setLoading(false); }
    })();
  }, [locale, isTR]);

  const loadPhoneNumbers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.phoneNumbers.getAll();
      setPhoneNumbers(response.data.phoneNumbers || []);
    } catch (_e) {
      toast.error(isTR ? 'Telefon numaraları yüklenemedi' : 'Failed to load phone numbers');
    } finally { setLoading(false); }
  };

  const handleRelease = async (pn) => {
    if (!confirm(`${t('dashboard.phoneNumbersPage.releaseConfirm')} ${formatPhone(pn.phoneNumber)}?`)) return;
    try {
      await toastHelpers.async(apiClient.phoneNumbers.delete(pn.id), t('dashboard.phoneNumbersPage.releasingNumber'), t('dashboard.phoneNumbersPage.phoneNumberReleased'));
      loadPhoneNumbers();
    } catch (_e) { /* handled */ }
  };

  const rawLimit = subscription?.usage?.phoneNumbers?.limit ?? subscription?.limits?.phoneNumbers;
  const phoneNumberLimit = rawLimit === undefined ? null : rawLimit;
  const isUnlimited = phoneNumberLimit === -1 || phoneNumberLimit === null;
  const canAdd = () => !isLocked && subscription && (isUnlimited || phoneNumbers.length < phoneNumberLimit);

  const voiceProgress = voiceUsage?.total > 0 ? (toNumber(voiceUsage.used) / toNumber(voiceUsage.total, 1)) * 100 : 0;
  const concurrentCalls = toNumber(snapshot?.entitlements?.concurrentCalls || subscription?.entitlements?.concurrentCalls, 0);

  const actionButton = (
    <Button onClick={() => setShowProvisionModal(true)} disabled={!canAdd()}>
      <Plus className="mr-2 h-4 w-4" />
      {t('dashboard.phoneNumbersPage.getPhoneNumber')}
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageIntro
        title={pageHelp?.title || t('dashboard.phoneNumbersPage.title')}
        subtitle={pageHelp?.subtitle || t('dashboard.phoneNumbersPage.description')}
        locale={locale}
        help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
        actions={actionButton}
      />

      {/* ═══ 1. Phone Numbers — always first ═══ */}
      <section className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" /><div className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" /><div className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" /></div>
          </div>
        ) : phoneNumbers.length > 0 ? (
          phoneNumbers.map((number) => (
            <div key={number.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                      {formatPhone(number.phoneNumber)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge className="rounded-full bg-emerald-100 text-emerald-700 text-xs dark:bg-emerald-900/40 dark:text-emerald-300">
                        {number.status || (isTR ? 'Aktif' : 'Active')}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleRelease(number)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5 text-red-500" />
                    {isTR ? 'Sil' : 'Delete'}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Metric
                  label={isTR ? 'Asistan' : 'Assistant'}
                  value={number.assistantName || (isTR ? 'Atanmamış' : 'Not assigned')}
                />
                <Metric
                  label={isTR ? 'Eklenme' : 'Added'}
                  value={formatDate(number.createdAt, 'short', locale)}
                />
                <Metric
                  label={isTR ? 'Eşzamanlı Çağrı' : 'Concurrent Calls'}
                  value={fmt(concurrentCalls)}
                />
              </div>
            </div>
          ))
        ) : isLocked ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
            <EmptyState
              icon={Lock}
              title={pageCopy.phoneLockedTitle}
              description={getLockReasonText(lockReason, locale)}
              actionLabel={isTR ? 'Paketleri İncele' : 'View Plans'}
              onAction={() => { window.location.href = '/dashboard/subscription'; }}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
            <EmptyState
              icon={Phone}
              title={t('dashboard.phoneNumbersPage.noPhoneNumbersYet')}
              description={t('dashboard.phoneNumbersPage.getNumberToStart')}
              actionLabel={t('dashboard.phoneNumbersPage.getPhoneNumber')}
              onAction={() => setShowProvisionModal(true)}
            />
          </div>
        )}
      </section>

      {/* ═══ 2. Usage Overview ═══ */}
      {!loading && snapshot && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full text-xs font-semibold">
                {getPlanDisplayName(snapshot?.plan || subscription?.plan, locale)}
              </Badge>
              <span className="text-sm text-neutral-400 dark:text-neutral-500">
                {isTR ? 'Genel Bakış' : 'Overview'}
              </span>
            </div>
            <Link
              href="/dashboard/subscription"
              className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
            >
              {isTR ? 'Paket & Faturalandırma' : 'Plan & Billing'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Voice Minutes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                <PhoneCall className="h-3.5 w-3.5 text-teal-500" />
                {isTR ? 'Ses Dakikaları' : 'Voice Minutes'}
              </div>
              {voiceUsage && voiceUsage.total > 0 ? (
                <>
                  <p className="text-lg font-bold text-neutral-900 dark:text-white">
                    {fmt(voiceUsage.used, 1)} <span className="text-sm font-normal text-neutral-400">/ {fmt(voiceUsage.total, 1)}</span>
                  </p>
                  <ProgressBar value={voiceProgress} colorClass={voiceProgress >= 80 ? 'bg-orange-500' : 'bg-teal-500'} />
                </>
              ) : (
                <p className="text-sm text-neutral-400 dark:text-neutral-500">{isTR ? 'Bu pakette yok' : 'Not in plan'}</p>
              )}
            </div>

            {/* Written Interactions */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                {isTR ? 'Yazılı Destek' : 'Written Support'}
              </div>
              {writtenUsage && toNumber(writtenUsage.total) > 0 ? (
                <>
                  <p className="text-lg font-bold text-neutral-900 dark:text-white">
                    {fmt(writtenUsage.used)} <span className="text-sm font-normal text-neutral-400">/ {fmt(writtenUsage.total)}</span>
                  </p>
                  <ProgressBar
                    value={toNumber(writtenUsage.total) > 0 ? (toNumber(writtenUsage.used) / toNumber(writtenUsage.total)) * 100 : 0}
                    colorClass={toNumber(writtenUsage.used) / toNumber(writtenUsage.total, 1) >= 0.8 ? 'bg-orange-500' : 'bg-blue-500'}
                  />
                </>
              ) : (
                <p className="text-sm text-neutral-400 dark:text-neutral-500">{isTR ? 'Limit yok' : 'No limit'}</p>
              )}
            </div>

            {/* Concurrent Calls */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                <Phone className="h-3.5 w-3.5 text-purple-500" />
                {isTR ? 'Eşzamanlı Çağrı' : 'Concurrent'}
              </div>
              <p className="text-lg font-bold text-neutral-900 dark:text-white">
                {concurrentCalls > 0 ? concurrentCalls : '—'}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">{isTR ? 'maks. eşzamanlı' : 'max concurrent'}</p>
            </div>

            {/* Assistants */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                <Users className="h-3.5 w-3.5 text-amber-500" />
                {isTR ? 'Asistan' : 'Assistants'}
              </div>
              <p className="text-lg font-bold text-neutral-900 dark:text-white">
                {fmt(toNumber(snapshot?.entitlements?.assistants || subscription?.limits?.assistants, 0))}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">{isTR ? 'maks. asistan' : 'max assistants'}</p>
            </div>
          </div>

          {/* Add-on balances row */}
          {(toNumber(addOns?.voiceMinutes?.remaining) > 0 || toNumber(addOns?.writtenInteractions?.remaining) > 0) && (
            <div className="mt-4 flex flex-wrap gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              {toNumber(addOns?.voiceMinutes?.remaining) > 0 && (
                <Badge variant="outline" className="text-xs text-teal-600 border-teal-200 dark:text-teal-400 dark:border-teal-800">
                  +{fmt(addOns.voiceMinutes.remaining, 1)} {isTR ? 'dk ek paket' : 'min add-on'}
                </Badge>
              )}
              {toNumber(addOns?.writtenInteractions?.remaining) > 0 && (
                <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-800">
                  +{fmt(addOns.writtenInteractions.remaining)} {isTR ? 'etkileşim ek paket' : 'interaction add-on'}
                </Badge>
              )}
            </div>
          )}
        </section>
      )}

      {/* ═══ Lock Banner ═══ */}
      {isLocked && !loading && (
        <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-300" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">{pageCopy.phoneLockedTitle}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{getLockReasonText(lockReason, locale)}</p>
          </div>
          <Link href="/dashboard/subscription">
            <Button variant="outline" size="sm" className="rounded-xl shrink-0">
              {isTR ? 'Paketleri İncele' : 'View Plans'}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}

      <PhoneNumberModal
        isOpen={showProvisionModal}
        onClose={() => setShowProvisionModal(false)}
        onSuccess={() => { setShowProvisionModal(false); loadPhoneNumbers(); }}
      />
    </div>
  );
}
