'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPlanDisplayName } from '@/lib/planConfig';
import { useBalance } from '@/hooks/useBalance';
import { useQueryClient } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Clock,
  CreditCard,
  AlertTriangle,
  TrendingUp,
  Plus,
  Phone,
  Zap,
  Wallet,
  RefreshCw,
  Settings,
  MessageSquare,
  MessageCircle
} from 'lucide-react';

// UI translations for CreditBalance - YENİ FİYATLANDIRMA SİSTEMİ
// PAYG: Prepaid (bakiye yükleme), Paketler: Postpaid (ay sonu fatura)
const TRANSLATIONS = {
  TR: {
    usageStatus: 'Kullanım Durumu',
    balance: 'Bakiye',
    balanceMinutes: 'Bakiye (dakika)',
    minutesRemaining: 'dk kaldı',
    includedMinutes: 'Dahil Dakikalar',
    usedMinutes: 'Kullanılan',
    trialMinutes: 'Deneme Dakikaları',
    trialChat: 'Webchat / WhatsApp',
    trialDaysLeft: 'gün kaldı',
    trialExpired: 'Süresi doldu',
    chatUsage: 'Webchat Kullanımı',
    whatsappUsage: 'WhatsApp Kullanımı',
    tokenUsage: 'Token kullanımı',
    inputTokens: 'Input',
    outputTokens: 'Output',
    totalCost: 'Toplam maliyet',
    sessions: 'oturum',
    payPerMinute: 'Dakika başı ücret',
    used80Package: "Dahil dakikalarınızın %80'ini kullandınız",
    usedAllPackage: 'Dahil dakikalarınız tükendi, aşım ay sonu faturalanır',
    lowBalance: 'Bakiyeniz azalıyor',
    noBalance: 'Bakiyeniz yok',
    overageThisMonth: 'Bu Ay Aşım',
    voiceOverage: 'Ses aşımı',
    writtenOverage: 'Yazılı aşım',
    overageInteractions: 'etkileşim',
    overageRate: 'Aşım ücreti',
    overagePostpaid: 'Ay sonu faturalanır',
    periodEnd: 'Dönem sonu:',
    topUpBalance: 'Bakiye Yükle',
    autoReload: 'Otomatik Yükleme',
    autoReloadEnabled: 'Açık',
    autoReloadDisabled: 'Kapalı',
    autoReloadSettings: 'Otomatik yükleme ayarları',
    whenBalanceBelow: 'Bakiye şunun altına düşünce:',
    reloadAmount: 'Yüklenecek tutar:',
    retry: 'Tekrar Dene',
    loadError: 'Bakiye yüklenemedi',
    min: 'dk',
    perMin: '/dk',
    postpaidNote: 'Aşım kullanımı ay sonunda faturalanır',
    enterprisePaymentPending: 'Ödeme bekleniyor',
    enterprisePaymentPaid: 'Ödendi',
    enterprisePaymentOverdue: 'Gecikmiş',
    enterpriseEndDate: 'Bitiş tarihi',
    enterpriseConcurrent: 'Eşzamanlı çağrı',
    writtenSupport: 'Dahil Yazılı Etkileşimler',
    writtenSupportDesc: 'Webchat, WhatsApp ve e-posta',
    writtenObserved: 'Gözlenen yazılı kullanım',
    writtenLimitNotConfigured: 'Ayrı bir yazılı etkileşim limiti tanımlı değil. Bu kartta mevcut dönem içindeki gözlenen kullanım gösterilir.',
    writtenUnitPrice: 'Yazılı etkileşim birim ücreti',
    addOnRemainingLabel: 'Ek paket bakiyesi',
    voiceAddOnRemainingLabel: 'Ek ses dakikası',
    webchat: 'Webchat',
    whatsappChannel: 'WhatsApp',
    emailChannel: 'E-posta',
    interactions: 'etkileşim',
    used80Written: "Yazılı etkileşim limitinizin %80'ini kullandınız",
    usedAllWritten: 'Yazılı etkileşim limitiniz doldu'
  },
  EN: {
    usageStatus: 'Usage Status',
    balance: 'Balance',
    balanceMinutes: 'Balance (minutes)',
    minutesRemaining: 'min remaining',
    includedMinutes: 'Included Minutes',
    usedMinutes: 'Used',
    trialMinutes: 'Trial Minutes',
    trialChat: 'Webchat / WhatsApp',
    trialDaysLeft: 'days left',
    trialExpired: 'Expired',
    chatUsage: 'Webchat Usage',
    whatsappUsage: 'WhatsApp Usage',
    tokenUsage: 'Token usage',
    inputTokens: 'Input',
    outputTokens: 'Output',
    totalCost: 'Total cost',
    sessions: 'sessions',
    payPerMinute: 'Per minute rate',
    used80Package: "You've used 80% of your included minutes",
    usedAllPackage: 'Included minutes used up, overage will be billed monthly',
    lowBalance: 'Your balance is running low',
    noBalance: 'No balance',
    overageThisMonth: 'Overage This Month',
    voiceOverage: 'Voice overage',
    writtenOverage: 'Written overage',
    overageInteractions: 'interactions',
    overageRate: 'Overage rate',
    overagePostpaid: 'Billed at month end',
    periodEnd: 'Period ends:',
    topUpBalance: 'Top Up Balance',
    autoReload: 'Auto Reload',
    autoReloadEnabled: 'On',
    autoReloadDisabled: 'Off',
    autoReloadSettings: 'Auto reload settings',
    whenBalanceBelow: 'When balance falls below:',
    reloadAmount: 'Amount to reload:',
    retry: 'Retry',
    loadError: 'Failed to load balance',
    min: 'min',
    perMin: '/min',
    postpaidNote: 'Overage usage is billed at month end',
    enterprisePaymentPending: 'Payment pending',
    enterprisePaymentPaid: 'Paid',
    enterprisePaymentOverdue: 'Overdue',
    enterpriseEndDate: 'End date',
    enterpriseConcurrent: 'Concurrent calls',
    writtenSupport: 'Included Written Interactions',
    writtenSupportDesc: 'Webchat, WhatsApp, and email',
    writtenObserved: 'Observed written usage',
    writtenLimitNotConfigured: 'No separate written interaction limit is configured. This card shows observed usage for the current cycle.',
    writtenUnitPrice: 'Written interaction unit price',
    addOnRemainingLabel: 'Add-on balance',
    voiceAddOnRemainingLabel: 'Voice add-on balance',
    webchat: 'Webchat',
    whatsappChannel: 'WhatsApp',
    emailChannel: 'Email',
    interactions: 'interactions',
    used80Written: "You've used 80% of your written interaction limit",
    usedAllWritten: 'Written interaction limit reached'
  }
};

const LOCALE_TO_LANG = { tr: 'TR', en: 'EN' };

/**
 * CreditBalance Component - YENİ FİYATLANDIRMA SİSTEMİ
 * Displays:
 * - TRIAL: Trial minutes used, chat days remaining
 * - PAYG: Balance in TL/minutes, per-minute rate
 * - STARTER/PRO: Included minutes + balance for overage
 * - ENTERPRISE: Custom display
 */
export default function CreditBalance({ onBuyCredit, refreshTrigger }) {
  const { t, locale } = useLanguage();
  const lang = LOCALE_TO_LANG[locale] || 'TR';
  const txt = TRANSLATIONS[lang] || TRANSLATIONS.TR;
  const queryClient = useQueryClient();

  // React Query hook
  const { data: balance, isLoading: loading, error: queryError, refetch } = useBalance();
  const error = queryError?.response?.data?.error || (queryError ? 'load_error' : null);

  // Refetch when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    }
  }, [refreshTrigger, queryClient]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-neutral-200 dark:bg-neutral-700 rounded w-1/3"></div>
          <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
          <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
          <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="text-center text-neutral-500 dark:text-neutral-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
          <p>{error === 'load_error' ? txt.loadError : error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-2"
          >
            {txt.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (!balance) return null;

  const shouldUseNewSystem =
    balance.isNewSystem === true
    || Object.prototype.hasOwnProperty.call(balance, 'paymentModel')
    || Object.prototype.hasOwnProperty.call(balance, 'includedMinutes')
    || Object.prototype.hasOwnProperty.call(balance, 'writtenInteractions')
    || ['FREE', 'TRIAL', 'PAYG', 'STARTER', 'PRO', 'BASIC', 'ENTERPRISE'].includes(String(balance.plan || '').toUpperCase());
  const formatDisplayedMinutes = (value) => {
    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return 0;
    }

    return Math.ceil(numericValue);
  };

  // Currency based on region
  const currency = balance.currency || '₺';
  const dateLocale = lang === 'TR' ? 'tr-TR' : 'en-US';

  // New system display
  if (shouldUseNewSystem) {
    const plan = balance.plan || 'FREE';
    const isTrial = plan === 'TRIAL';
    const isPayg = plan === 'PAYG';
    const isEnterprise = plan === 'ENTERPRISE';
    const hasIncludedMinutes = ['STARTER', 'PRO', 'ENTERPRISE', 'BASIC'].includes(plan);

    // Calculate percentages
    const includedPercent = balance.includedMinutes?.limit > 0
      ? Math.min((balance.includedMinutes.used / balance.includedMinutes.limit) * 100, 100)
      : 0;

    const trialPercent = balance.trialMinutes?.limit > 0
      ? Math.min((balance.trialMinutes.used / balance.trialMinutes.limit) * 100, 100)
      : 0;

    const writtenLimitRaw = balance.writtenInteractions?.limit;
    const writtenRemainingRaw = balance.writtenInteractions?.remaining;
    const writtenLimit = Number.isFinite(writtenLimitRaw) ? Number(writtenLimitRaw) : 0;
    const writtenUsed = Number(balance.writtenInteractions?.used || 0);
    const writtenRemaining = Number.isFinite(writtenRemainingRaw)
      ? Number(writtenRemainingRaw)
      : null;
    const writtenDisplayTotal = writtenLimit > 0
      ? writtenLimit
      : (writtenRemaining !== null && writtenRemaining > 0 ? writtenUsed + writtenRemaining : null);
    const writtenPercent = writtenDisplayTotal > 0
      ? Math.min((writtenUsed / writtenDisplayTotal) * 100, 100)
      : 0;
    const voiceAddOnRemaining = Number(
      balance.voiceAddOnRemaining
      ?? balance.includedMinutes?.addOnRemaining
      ?? 0
    );
    const concurrentLimit = Number(balance.concurrent?.limit ?? balance.enterprise?.concurrent ?? 0);
    const voiceOverageMinutes = Number(balance.overage?.minutes || 0);
    const voiceOverageAmount = Number(balance.overage?.amount || 0);
    const voiceOverageRate = Number(balance.overage?.rate || 0);
    const writtenOverageCount = Number(balance.writtenInteractions?.overage || 0);
    const writtenOverageAmount = writtenOverageCount * Number(balance.writtenInteractions?.unitPrice || 0);
    const hasAnyOverage = voiceOverageMinutes > 0 || writtenOverageCount > 0;
    const shouldShowWrittenUsage = Boolean(balance.writtenInteractions) && plan !== 'FREE';

    const renderWrittenUsage = () => {
      if (!shouldShowWrittenUsage) {
        return null;
      }

      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{txt.writtenSupport}</span>
            </div>
            <div className="text-right text-neutral-600 dark:text-neutral-400">
              {writtenDisplayTotal !== null
                ? `${writtenUsed}/${writtenDisplayTotal} ${txt.interactions}`
                : `${writtenUsed} ${txt.interactions}`}
            </div>
          </div>
          {writtenDisplayTotal !== null && (
            <Progress
              value={writtenPercent}
              className={`h-2 ${writtenPercent >= 100 ? '[&>div]:bg-red-500' : writtenPercent >= 80 ? '[&>div]:bg-orange-500' : '[&>div]:bg-blue-600'}`}
            />
          )}
          {balance.writtenInteractions.addOnRemaining > 0 && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
              <span>{txt.addOnRemainingLabel}</span>
              <span>{balance.writtenInteractions.addOnRemaining} {txt.interactions}</span>
            </div>
          )}
          {writtenDisplayTotal !== null && writtenPercent >= 80 && writtenPercent < 100 && (
            <p className="text-xs text-orange-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {txt.used80Written}
            </p>
          )}
          {writtenDisplayTotal !== null && writtenPercent >= 100 && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {txt.usedAllWritten}
            </p>
          )}
        </div>
      );
    };

    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {txt.usageStatus}
            </h3>
          </div>
          <Badge variant="secondary" className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
            {getPlanDisplayName(plan, lang.toLowerCase())}
          </Badge>
        </div>

        {/* TRIAL Plan Display */}
        {isTrial && (
          <>
            {/* Trial Phone Minutes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{txt.trialMinutes}</span>
                </div>
                <span className="text-neutral-600 dark:text-neutral-400">
                  {balance.trialMinutes?.used || 0}/{balance.trialMinutes?.limit || 15} {txt.min}
                </span>
              </div>
              <Progress
                value={trialPercent}
                className={`h-2 ${trialPercent >= 80 ? '[&>div]:bg-orange-500' : '[&>div]:bg-green-500'}`}
              />
            </div>

            {/* Trial Chat Days */}
            {balance.trialChat && (
              <div className="flex items-center justify-between text-sm bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{txt.trialChat}</span>
                </div>
                <span className={`font-semibold ${balance.trialChat.daysLeft > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {balance.trialChat.daysLeft > 0
                    ? `${balance.trialChat.daysLeft} ${txt.trialDaysLeft}`
                    : txt.trialExpired}
                </span>
              </div>
            )}

            {renderWrittenUsage()}
          </>
        )}

        {/* PAYG Plan Display */}
        {isPayg && (
          <>
            {/* Balance Display */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{txt.balance}</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {currency}{(balance.balance || 0).toLocaleString(dateLocale)}
                  </span>
                  <p className="text-xs text-neutral-500">
                    ≈ {balance.balanceMinutes || 0} {txt.min}
                  </p>
                </div>
              </div>
            </div>

            {/* Per-minute rate */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">{txt.payPerMinute}</span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {currency}{balance.pricePerMinute || 23}{txt.perMin}
              </span>
            </div>

            {voiceAddOnRemaining > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">{txt.voiceAddOnRemainingLabel}</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {voiceAddOnRemaining} {txt.min}
                </span>
              </div>
            )}

            {/* Low balance warning */}
            {(balance.balance || 0) < 100 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm text-amber-700 dark:text-amber-400">
                  {(balance.balance || 0) === 0 ? txt.noBalance : txt.lowBalance}
                </span>
              </div>
            )}

            {renderWrittenUsage()}
          </>
        )}

        {/* STARTER/PRO/ENTERPRISE Plan Display - POSTPAID Model */}
        {hasIncludedMinutes && (
          <>
            {/* Included Minutes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{txt.includedMinutes}</span>
                </div>
                <span className="text-neutral-600 dark:text-neutral-400">
                  {formatDisplayedMinutes(balance.includedMinutes?.used)}/{formatDisplayedMinutes(balance.includedMinutes?.limit)} {txt.min}
                </span>
              </div>
              <Progress
                value={includedPercent}
                className={`h-2 ${includedPercent >= 100 ? '[&>div]:bg-red-500' : includedPercent >= 80 ? '[&>div]:bg-orange-500' : '[&>div]:bg-blue-600'}`}
              />
              {voiceAddOnRemaining > 0 && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                  <span>{txt.voiceAddOnRemainingLabel}</span>
                  <span>{voiceAddOnRemaining} {txt.min}</span>
                </div>
              )}
              {concurrentLimit > 0 && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                  <span>{txt.enterpriseConcurrent}</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{concurrentLimit}</span>
                </div>
              )}
              {includedPercent >= 80 && includedPercent < 100 && (
                <p className="text-xs text-orange-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {txt.used80Package}
                </p>
              )}
              {includedPercent >= 100 && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {txt.usedAllPackage}
                </p>
              )}
            </div>

            {renderWrittenUsage()}

            {/* Overage Info - POSTPAID (Ay sonu fatura) - Enterprise hariç */}
            {!isEnterprise && hasAnyOverage && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="font-medium text-neutral-700 dark:text-neutral-300">{txt.overageThisMonth}</span>
                  </div>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {voiceOverageMinutes > 0 && (
                    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300">
                      <span>{txt.voiceOverage}</span>
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {voiceOverageMinutes} {txt.min} · {currency}{voiceOverageAmount.toLocaleString(dateLocale)}
                      </span>
                    </div>
                  )}
                  {writtenOverageCount > 0 && (
                    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300">
                      <span>{txt.writtenOverage}</span>
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {writtenOverageCount} {txt.overageInteractions} · {currency}{writtenOverageAmount.toLocaleString(dateLocale)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    {voiceOverageMinutes > 0 && `${txt.overageRate}: ${currency}${voiceOverageRate}${txt.perMin}`}
                    {voiceOverageMinutes > 0 && writtenOverageCount > 0 ? ' · ' : ''}
                    {writtenOverageCount > 0 && `${txt.writtenUnitPrice}: ${currency}${Number(balance.writtenInteractions?.unitPrice || 0).toLocaleString(dateLocale)}`}
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">{txt.overagePostpaid}</span>
                </div>
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-400 font-semibold">
                  {txt.postpaidNote}: {currency}{(voiceOverageAmount + writtenOverageAmount).toLocaleString(dateLocale)}
                </p>
              </div>
            )}
          </>
        )}

        {/* Token Usage section removed as per request */}

        {/* Auto-Reload Status */}
        {balance.autoReload && (
          <div className="flex items-center justify-between text-sm bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-neutral-700 dark:text-neutral-300">{txt.autoReload}</span>
            </div>
            <Badge variant="outline" className="text-green-600 border-green-600">
              {balance.autoReload.enabled ? txt.autoReloadEnabled : txt.autoReloadDisabled}
            </Badge>
          </div>
        )}

        {/* Period Info */}
        {balance.periodEnd && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <span>{txt.periodEnd}</span>
            <span>{new Date(balance.periodEnd).toLocaleDateString(dateLocale)}</span>
          </div>
        )}

        {/* Top Up Button - SADECE PAYG için göster (prepaid model) */}
        {isPayg && (
          <Button
            onClick={onBuyCredit}
            className="w-full bg-primary-600 hover:bg-primary-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            {txt.topUpBalance}
          </Button>
        )}
      </div>
    );
  }

  // Legacy system display (fallback) - Keep original code
  const packagePercent = balance.package?.limit > 0
    ? Math.min((balance.package.used / balance.package.limit) * 100, 100)
    : 0;

  const creditPercent = balance.credit?.total > 0
    ? Math.min((balance.credit.used / balance.credit.total) * 100, 100)
    : 0;

  const totalRemaining = (balance.package?.remaining || 0) + (balance.credit?.remaining || 0);

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            {txt.usageStatus}
          </h3>
        </div>
        <Badge variant={balance.overage?.limitReached ? 'destructive' : 'secondary'}>
          {totalRemaining} {txt.minutesRemaining}
        </Badge>
      </div>

      {/* Package Minutes */}
      {balance.package && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{txt.includedMinutes}</span>
            </div>
            <span className="text-neutral-600 dark:text-neutral-400">
              {balance.package.used}/{balance.package.limit} {txt.min}
            </span>
          </div>
          <Progress
            value={packagePercent}
            className={`h-2 ${packagePercent >= 80 ? '[&>div]:bg-orange-500' : '[&>div]:bg-blue-600'}`}
          />
        </div>
      )}

      {/* Credit Minutes */}
      {balance.credit && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{txt.balance}</span>
            </div>
            <span className="text-neutral-600 dark:text-neutral-400">
              {balance.credit.remaining} {txt.minutesRemaining}
            </span>
          </div>
          <Progress
            value={creditPercent}
            className={`h-2 ${creditPercent >= 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'}`}
          />
        </div>
      )}

      {/* Buy Credits Button */}
      <Button
        onClick={onBuyCredit}
        className="w-full bg-primary-600 hover:bg-primary-700"
      >
        <Plus className="h-4 w-4 mr-2" />
        {txt.topUpBalance}
      </Button>
    </div>
  );
}
