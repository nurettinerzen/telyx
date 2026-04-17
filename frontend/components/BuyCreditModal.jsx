'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  X,
  Loader2,
  CreditCard,
  Info,
  Check,
  Wallet,
  RefreshCw,
  Settings
} from 'lucide-react';

// UI translations - YENİ FİYATLANDIRMA SİSTEMİ
const TRANSLATIONS = {
  TR: {
    title: 'Bakiye Yükle',
    howMuchToLoad: 'Ne kadar yüklemek istiyorsunuz?',
    enterAmount: 'Tutar girin',
    min: 'dk',
    pricing: 'Fiyatlandırma',
    pricePerMinute: 'Dakika başı fiyat:',
    total: 'Toplam:',
    minutesYouGet: 'Alacağınız dakika:',
    balanceInfo: 'Bakiye süresi dolmaz. Telefon, WhatsApp ve chat kanallarında kullanılır.',
    autoReloadTitle: 'Otomatik Yükleme',
    autoReloadDesc: 'Bakiye belirli bir seviyenin altına düşünce otomatik yükle',
    whenBelow: 'Bakiye şunun altına düşünce:',
    reloadAmount: 'Yüklenecek tutar:',
    cancel: 'İptal',
    processing: 'İşleniyor...',
    topUp: 'Bakiye Yükle',
    invalidAmount: 'Geçersiz tutar',
    minTopup: 'Minimum yükleme tutarı:',
    balanceAdded: 'Bakiyeniz yüklendi!',
    topUpFailed: 'Yükleme başarısız',
    requiresCard: 'Bakiye yüklemek için önce bir kart kaydetmeniz gerekiyor.',
    perMin: '/dk',
    autoReloadSaved: 'Otomatik yükleme ayarları kaydedildi',
    paymentRedirect: 'Ödeme sayfasına yönlendiriliyorsunuz...'
  },
  EN: {
    title: 'Top Up Balance',
    howMuchToLoad: 'How much would you like to load?',
    enterAmount: 'Enter amount',
    min: 'min',
    pricing: 'Pricing',
    pricePerMinute: 'Price per minute:',
    total: 'Total:',
    minutesYouGet: 'Minutes you get:',
    balanceInfo: 'Balance never expires. Used for phone, WhatsApp and chat channels.',
    autoReloadTitle: 'Auto Reload',
    autoReloadDesc: 'Automatically reload when balance falls below threshold',
    whenBelow: 'When balance falls below:',
    reloadAmount: 'Amount to reload:',
    cancel: 'Cancel',
    processing: 'Processing...',
    topUp: 'Top Up',
    invalidAmount: 'Invalid amount',
    minTopup: 'Minimum top-up amount:',
    balanceAdded: 'Balance added!',
    topUpFailed: 'Top-up failed',
    requiresCard: 'You need to save a card first to top up balance.',
    perMin: '/min',
    autoReloadSaved: 'Auto reload settings saved',
    paymentRedirect: 'Redirecting to payment page...'
  }
};

const LOCALE_TO_LANG = { tr: 'TR', en: 'EN' };

// Regional pricing for top-up
const REGIONAL_TOPUP = {
  TR: {
    currency: '₺',
    pricePerMinute: 23, // PAYG rate
    minTopup: 100, // Minimum 100 TL
    quickOptions: [100, 250, 500, 1000],
    autoReloadThresholds: [50, 100, 200],
    autoReloadAmounts: [100, 250, 500]
  },
  US: {
    currency: '$',
    pricePerMinute: 0.55,
    minTopup: 5,
    quickOptions: [5, 10, 25, 50],
    autoReloadThresholds: [5, 10, 20],
    autoReloadAmounts: [10, 25, 50]
  },
  BR: {
    currency: 'R$',
    pricePerMinute: 1.5,
    minTopup: 20,
    quickOptions: [20, 50, 100, 200],
    autoReloadThresholds: [10, 20, 50],
    autoReloadAmounts: [20, 50, 100]
  }
};

/**
 * BuyCreditModal Component - YENİ FİYATLANDIRMA SİSTEMİ
 * Modal for topping up balance (TL/USD/BRL)
 */
export default function BuyCreditModal({ isOpen, onClose, onSuccess, initialRegion = null }) {
  const { locale } = useLanguage();
  const lang = LOCALE_TO_LANG[locale] || 'TR';
  const txt = TRANSLATIONS[lang] || TRANSLATIONS.TR;

  const [region, setRegion] = useState('TR');
  const regionConfig = REGIONAL_TOPUP[region] || REGIONAL_TOPUP.TR;
  const currency = regionConfig.currency;
  const dateLocale = lang === 'TR' ? 'tr-TR' : lang === 'EN' ? 'en-US' : 'pt-BR';

  const [amount, setAmount] = useState(regionConfig.quickOptions[1]); // Default to second option
  const [loading, setLoading] = useState(false);
  const [showAutoReload, setShowAutoReload] = useState(false);
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(false);
  const [autoReloadThreshold, setAutoReloadThreshold] = useState(regionConfig.autoReloadThresholds[0]);
  const [autoReloadAmount, setAutoReloadAmount] = useState(regionConfig.autoReloadAmounts[0]);

  // Calculate minutes from amount
  const minutesFromAmount = Math.floor(amount / regionConfig.pricePerMinute);

  useEffect(() => {
    if (initialRegion && REGIONAL_TOPUP[initialRegion]) {
      setRegion((current) => (current === initialRegion ? current : initialRegion));
      return;
    }

    const nextRegion = locale?.toLowerCase().startsWith('pt')
      ? 'BR'
      : locale?.toLowerCase().startsWith('en')
        ? 'US'
        : 'TR';

    setRegion((current) => (current === nextRegion ? current : nextRegion));
  }, [initialRegion, locale]);

  useEffect(() => {
    setAmount(regionConfig.quickOptions[1]);
    setAutoReloadThreshold(regionConfig.autoReloadThresholds[0]);
    setAutoReloadAmount(regionConfig.autoReloadAmounts[0]);
  }, [regionConfig.autoReloadAmounts, regionConfig.autoReloadThresholds, regionConfig.quickOptions]);

  const handleAmountChange = (e) => {
    const value = parseFloat(e.target.value) || 0;
    setAmount(value);
  };

  const handleQuickSelect = (amt) => {
    setAmount(amt);
  };

  const handleTopUp = async () => {
    if (amount < regionConfig.minTopup) {
      toast.error(`${txt.minTopup} ${currency}${regionConfig.minTopup}`);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/api/balance/topup', {
        amount,
        currency: currency === '₺' ? 'TRY' : currency === '$' ? 'USD' : 'BRL',
        locale
      });

      if (response.data?.sessionUrl) {
        toast.info(txt.paymentRedirect);
        window.location.href = response.data.sessionUrl;
      } else if (response.data?.success) {
        toast.success(txt.balanceAdded);
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || txt.topUpFailed;

      if (error.response?.data?.requiresCard) {
        toast.error(txt.requiresCard);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAutoReload = async () => {
    try {
      await apiClient.put('/api/balance/auto-reload', {
        enabled: autoReloadEnabled,
        threshold: autoReloadThreshold,
        amount: autoReloadAmount
      });
      toast.success(txt.autoReloadSaved);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save settings');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {txt.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 transition-colors p-1 rounded-lg hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {txt.howMuchToLoad}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-neutral-500">{currency}</span>
              <Input
                type="number"
                value={amount}
                onChange={handleAmountChange}
                min={regionConfig.minTopup}
                step="1"
                className="text-lg font-medium"
                placeholder={txt.enterAmount}
              />
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {txt.minTopup} {currency}{regionConfig.minTopup}
            </p>
          </div>

          {/* Quick Select */}
          <div className="flex flex-wrap gap-2">
            {regionConfig.quickOptions.map((option) => (
              <button
                key={option}
                onClick={() => handleQuickSelect(option)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  amount === option
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {currency}{option.toLocaleString(dateLocale)}
              </button>
            ))}
          </div>

          {/* Calculation */}
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">{txt.pricePerMinute}</span>
              <span className="font-medium text-neutral-900 dark:text-white">
                {currency}{regionConfig.pricePerMinute}{txt.perMin}
              </span>
            </div>
            <hr className="border-primary-200 dark:border-primary-700" />
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">{txt.minutesYouGet}</span>
              <span className="font-semibold text-primary-700 dark:text-primary-400">
                ~{minutesFromAmount} {txt.min}
              </span>
            </div>
            <hr className="border-primary-200 dark:border-primary-700" />
            <div className="flex justify-between items-center">
              <span className="font-semibold text-neutral-900 dark:text-white">{txt.total}</span>
              <span className="text-xl font-bold text-primary-700 dark:text-primary-400">
                {currency}{amount.toLocaleString(dateLocale)}
              </span>
            </div>
          </div>

          {/* Info Note */}
          <div className="flex items-start gap-2 text-xs text-neutral-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <Check className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p>{txt.balanceInfo}</p>
          </div>

          {/* Auto-Reload Section */}
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-green-600" />
                <span className="font-medium text-neutral-900 dark:text-white">{txt.autoReloadTitle}</span>
              </div>
              <button
                onClick={() => setShowAutoReload(!showAutoReload)}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>

            {showAutoReload && (
              <div className="space-y-4 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-reload" className="text-sm text-neutral-600 dark:text-neutral-400">
                    {txt.autoReloadDesc}
                  </Label>
                  <Switch
                    id="auto-reload"
                    checked={autoReloadEnabled}
                    onCheckedChange={setAutoReloadEnabled}
                  />
                </div>

                {autoReloadEnabled && (
                  <>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">{txt.whenBelow}</label>
                      <div className="flex gap-2">
                        {regionConfig.autoReloadThresholds.map((threshold) => (
                          <button
                            key={threshold}
                            onClick={() => setAutoReloadThreshold(threshold)}
                            className={`flex-1 px-2 py-1 rounded text-sm ${
                              autoReloadThreshold === threshold
                                ? 'bg-green-600 text-white'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            {currency}{threshold}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">{txt.reloadAmount}</label>
                      <div className="flex gap-2">
                        {regionConfig.autoReloadAmounts.map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setAutoReloadAmount(amt)}
                            className={`flex-1 px-2 py-1 rounded text-sm ${
                              autoReloadAmount === amt
                                ? 'bg-green-600 text-white'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            {currency}{amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveAutoReload}
                      className="w-full"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      {lang === 'TR' ? 'Kaydet' : 'Save'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              {txt.cancel}
            </Button>
            <Button
              onClick={handleTopUp}
              disabled={loading || amount < regionConfig.minTopup}
              className="flex-1 bg-primary-600 hover:bg-primary-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {txt.processing}
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {txt.topUp}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
