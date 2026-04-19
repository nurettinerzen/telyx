'use client';

import Link from 'next/link';
import { AlertTriangle, CreditCard, MessageSquare, PhoneCall } from 'lucide-react';

const COPY = {
  tr: {
    cta: 'Aboneliği Gör',
    VOICE_INCLUDED_80: ({ percentage, used, limit }) => ({
      title: 'Ses kullanım limiti yaklaşıyor',
      body: `Dahil dakikalarınızın %${percentage} kadari kullanildi (${used}/${limit} dk).`
    }),
    VOICE_INCLUDED_EXHAUSTED: ({ used, limit }) => ({
      title: 'Dahil ses dakikaları tükendi',
      body: `Ses kullanimi dahil havuzu doldurdu (${used}/${limit} dk). Yeni kullanim asim olarak ilerleyebilir.`
    }),
    VOICE_OVERAGE_LIMIT_REACHED: ({ used, limit }) => ({
      title: 'Ses aşım limiti doldu',
      body: `Asim dakikasi limiti doldu (${used}/${limit} dk). Yeni aramalar engellenebilir.`
    }),
    WRITTEN_INCLUDED_80: ({ percentage, used, limit }) => ({
      title: 'Yazılı kullanım limiti yaklaşıyor',
      body: `Dahil yazili etkilesim havuzunun %${percentage} kadari kullanildi (${used}/${limit}).`
    }),
    WRITTEN_INCLUDED_EXHAUSTED: ({ used, limit }) => ({
      title: 'Yazılı havuz doldu',
      body: `Dahil yazili etkilesim limiti doldu (${used}/${limit}).`
    }),
    WRITTEN_LIMIT_REACHED: ({ used, limit }) => ({
      title: 'Yazılı etkileşim limiti doldu',
      body: `Yeni yazili yanitlar bloklanabilir (${used}/${limit}).`
    }),
    WRITTEN_OVERAGE_ACTIVE: ({ used, limit, overage }) => ({
      title: 'Yazılı kullanım aşımda ilerliyor',
      body: `Dahil havuz doldu (${used}/${limit}). ${overage || 0} etkilesim asimda.`
    }),
    PAYG_LOW_BALANCE: ({ remainingMinutes }) => ({
      title: 'Bakiye düşük',
      body: `Tahmini kalan ses bakiyesi ${Math.max(Math.floor(remainingMinutes || 0), 0)} dakika seviyesinde.`
    })
  },
  en: {
    cta: 'View Subscription',
    VOICE_INCLUDED_80: ({ percentage, used, limit }) => ({
      title: 'Voice usage is approaching the limit',
      body: `${percentage}% of your included voice minutes are used (${used}/${limit} min).`
    }),
    VOICE_INCLUDED_EXHAUSTED: ({ used, limit }) => ({
      title: 'Included voice minutes are exhausted',
      body: `Your included voice pool is full (${used}/${limit} min). New usage may continue as overage.`
    }),
    VOICE_OVERAGE_LIMIT_REACHED: ({ used, limit }) => ({
      title: 'Voice overage limit reached',
      body: `Your overage capacity is full (${used}/${limit} min). New calls may be blocked.`
    }),
    WRITTEN_INCLUDED_80: ({ percentage, used, limit }) => ({
      title: 'Written usage is approaching the limit',
      body: `${percentage}% of your included written interactions are used (${used}/${limit}).`
    }),
    WRITTEN_INCLUDED_EXHAUSTED: ({ used, limit }) => ({
      title: 'Written pool is exhausted',
      body: `Your included written pool is full (${used}/${limit}).`
    }),
    WRITTEN_LIMIT_REACHED: ({ used, limit }) => ({
      title: 'Written interaction limit reached',
      body: `New written replies may now be blocked (${used}/${limit}).`
    }),
    WRITTEN_OVERAGE_ACTIVE: ({ used, limit, overage }) => ({
      title: 'Written usage is now in overage',
      body: `Your included pool is full (${used}/${limit}). ${overage || 0} interactions are now overage.`
    }),
    PAYG_LOW_BALANCE: ({ remainingMinutes }) => ({
      title: 'Low balance',
      body: `Estimated remaining voice balance is about ${Math.max(Math.floor(remainingMinutes || 0), 0)} minutes.`
    })
  }
};

function resolveVisuals(alert) {
  if (alert.scope === 'wallet') {
    return {
      icon: CreditCard,
      container: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      iconWrap: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
      text: 'text-amber-900 dark:text-amber-100',
      subtext: 'text-amber-800/90 dark:text-amber-200/90',
      cta: 'text-amber-800 dark:text-amber-200'
    };
  }

  if (alert.scope === 'written') {
    return {
      icon: MessageSquare,
      container: alert.severity === 'critical'
        ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
        : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900',
      iconWrap: alert.severity === 'critical'
        ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
      text: alert.severity === 'critical' ? 'text-red-900 dark:text-red-100' : 'text-blue-900 dark:text-blue-100',
      subtext: alert.severity === 'critical' ? 'text-red-800/90 dark:text-red-200/90' : 'text-blue-800/90 dark:text-blue-200/90',
      cta: alert.severity === 'critical' ? 'text-red-800 dark:text-red-200' : 'text-blue-800 dark:text-blue-200'
    };
  }

  return {
    icon: PhoneCall,
    container: alert.severity === 'critical'
      ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
      : 'bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900',
    iconWrap: alert.severity === 'critical'
      ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
    text: alert.severity === 'critical' ? 'text-red-900 dark:text-red-100' : 'text-teal-900 dark:text-teal-100',
    subtext: alert.severity === 'critical' ? 'text-red-800/90 dark:text-red-200/90' : 'text-teal-800/90 dark:text-teal-200/90',
    cta: alert.severity === 'critical' ? 'text-red-800 dark:text-red-200' : 'text-teal-800 dark:text-teal-200'
  };
}

function getAlertCopy(alert, locale = 'tr') {
  const lang = locale === 'en' ? 'en' : 'tr';
  const resolver = COPY[lang][alert.code];
  if (typeof resolver === 'function') {
    return resolver(alert);
  }

  return {
    title: lang === 'en' ? 'Usage alert' : 'Kullanim uyari',
    body: lang === 'en' ? 'There is an important usage update on your account.' : 'Hesabinizda onemli bir kullanim guncellemesi var.'
  };
}

export default function UsageAlertsBanner({ alerts = [], locale = 'tr' }) {
  const lang = locale === 'en' ? 'en' : 'tr';
  const visibleAlerts = Array.isArray(alerts) ? alerts.slice(0, 2) : [];

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 px-6 pt-4">
      {visibleAlerts.map((alert) => {
        const copy = getAlertCopy(alert, lang);
        const visuals = resolveVisuals(alert);
        const Icon = visuals.icon || AlertTriangle;

        return (
          <div
            key={`${alert.code}-${alert.scope}`}
            className={`rounded-2xl border px-4 py-3 shadow-sm ${visuals.container}`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-full p-2 ${visuals.iconWrap}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${visuals.text}`}>{copy.title}</p>
                <p className={`mt-1 text-sm ${visuals.subtext}`}>{copy.body}</p>
              </div>
              <Link
                href="/dashboard/subscription"
                className={`shrink-0 text-sm font-medium underline-offset-4 hover:underline ${visuals.cta}`}
              >
                {COPY[lang].cta}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
