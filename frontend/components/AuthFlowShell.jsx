'use client';

import React from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { ArrowRight, ShieldCheck, Sparkles, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { TelyxLogoFull } from '@/components/TelyxLogo';
import { useLanguage } from '@/contexts/LanguageContext';

function getAuthSidebarCopy(locale) {
  if (locale === 'tr') {
    return {
      eyebrow: 'Telyx Workspace',
      title: 'Telefon, chat ve operasyonu tek panelde yonetin.',
      description:
        'Bu alanlari daha modern, akiskan ve marka paletine yakin bir yapiya tasiyoruz. Giris ve hesap akislarinda da ayni duzeni koruyoruz.',
      points: [
        'Marka tonuna yakin koyu zemin ve yumusak isik gecisleri',
        'Daha net form hiyerarsisi ve daha temiz odak durumlari',
        'Auth akislarinda sade, kurumsal ve guven veren yuzeyler',
      ],
    };
  }

  return {
    eyebrow: 'Telyx Workspace',
    title: 'Manage calls, chat, and operations from one unified surface.',
    description:
      'These account flows use the same calmer, more modern visual language so login and recovery screens feel connected to the product.',
    points: [
      'Brand-led dark gradients with softer highlights',
      'Clearer form hierarchy and focus states',
      'More polished account recovery and verification steps',
    ],
  };
}

export default function AuthFlowShell({
  title,
  subtitle,
  children,
  footer,
  backHref,
  backLabel,
  mountedDarkMode = false,
  cardClassName,
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const { locale } = useLanguage();
  const copy = getAuthSidebarCopy(locale);

  return (
    <div
      className={cn(
        'relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8',
        dark
          ? 'bg-[#040913]'
          : 'bg-[linear-gradient(180deg,#eef5ff_0%,#f8fbff_52%,#ffffff_100%)]',
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: dark
            ? 'radial-gradient(circle at 12% 16%, rgba(0,196,230,0.16), transparent 26%), radial-gradient(circle at 82% 12%, rgba(0,111,235,0.18), transparent 28%), radial-gradient(circle at 50% 85%, rgba(0,10,207,0.18), transparent 24%)'
            : 'radial-gradient(circle at 18% 18%, rgba(0,196,230,0.08), transparent 28%), radial-gradient(circle at 78% 14%, rgba(0,111,235,0.08), transparent 26%), radial-gradient(circle at 50% 88%, rgba(5,23,82,0.06), transparent 24%)',
        }}
      />
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 opacity-[0.2]',
          dark ? 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_34%)]' : 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.80),transparent_40%)]',
        )}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_minmax(0,520px)]">
          <aside className="hidden lg:block">
            <div
              className={cn(
                'relative overflow-hidden rounded-[32px] border p-8 xl:p-10',
                dark
                  ? 'border-white/[0.08] bg-[linear-gradient(180deg,rgba(6,15,34,0.92),rgba(5,12,28,0.86))] shadow-[0_32px_90px_rgba(2,6,23,0.42)]'
                  : 'border-slate-200/80 bg-white/82 shadow-[0_24px_70px_rgba(15,23,42,0.08)]',
              )}
            >
              <div className="absolute inset-0 bg-[linear-gradient(130deg,transparent,rgba(255,255,255,0.06),transparent)]" />
              <div
                aria-hidden
                className="absolute -left-10 top-10 h-44 w-44 rounded-full blur-3xl"
                style={{ background: dark ? 'rgba(0,196,230,0.18)' : 'rgba(0,196,230,0.10)' }}
              />
              <div
                aria-hidden
                className="absolute bottom-4 right-2 h-52 w-52 rounded-full blur-3xl"
                style={{ background: dark ? 'rgba(0,111,235,0.18)' : 'rgba(0,111,235,0.10)' }}
              />

              <div className="relative space-y-8">
                <div className="space-y-4">
                  <span
                    className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]"
                    style={{
                      color: '#00C4E6',
                      backgroundColor: dark ? 'rgba(0,196,230,0.12)' : 'rgba(0,196,230,0.08)',
                      borderColor: dark ? 'rgba(0,196,230,0.28)' : 'rgba(0,196,230,0.16)',
                    }}
                  >
                    {copy.eyebrow}
                  </span>

                  <div className="space-y-3">
                    <h2 className={cn('max-w-lg text-4xl font-semibold leading-tight', dark ? 'text-white' : 'text-slate-900')}>
                      {copy.title}
                    </h2>
                    <p className={cn('max-w-xl text-base leading-7', dark ? 'text-slate-300' : 'text-slate-600')}>
                      {copy.description}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {copy.points.map((point, index) => {
                    const icons = [Sparkles, Waves, ShieldCheck];
                    const Icon = icons[index] || ArrowRight;

                    return (
                      <div
                        key={point}
                        className={cn(
                          'flex items-start gap-3 rounded-2xl border p-4',
                          dark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-slate-200/80 bg-white/70',
                        )}
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
                          style={{
                            color: index === 0 ? '#00C4E6' : index === 1 ? '#006FEB' : '#000ACF',
                            backgroundColor: dark
                              ? index === 0
                                ? 'rgba(0,196,230,0.12)'
                                : index === 1
                                  ? 'rgba(0,111,235,0.12)'
                                  : 'rgba(0,10,207,0.14)'
                              : index === 0
                                ? 'rgba(0,196,230,0.08)'
                                : index === 1
                                  ? 'rgba(0,111,235,0.08)'
                                  : 'rgba(0,10,207,0.08)',
                            borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.18)',
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className={cn('text-sm leading-6', dark ? 'text-slate-200' : 'text-slate-700')}>{point}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          <div className="w-full">
            <div className="mb-6 flex items-center justify-between gap-4">
              <Link href="/" className="inline-flex items-center">
                <TelyxLogoFull width={144} height={40} darkMode={mountedDarkMode} />
              </Link>
              <LanguageSwitcher />
            </div>

            <div
              className={cn(
                'relative overflow-hidden rounded-[30px] border p-6 sm:p-8',
                dark
                  ? 'border-white/[0.08] bg-[linear-gradient(180deg,rgba(7,16,36,0.92),rgba(5,12,28,0.86))] shadow-[0_30px_90px_rgba(2,6,23,0.4)]'
                  : 'border-slate-200/80 bg-white/92 shadow-[0_24px_70px_rgba(15,23,42,0.08)]',
                cardClassName,
              )}
            >
              <div className="absolute inset-0 bg-[linear-gradient(140deg,transparent,rgba(255,255,255,0.06),transparent)]" />
              <div
                aria-hidden
                className="absolute right-0 top-0 h-40 w-40 rounded-full blur-3xl"
                style={{ background: dark ? 'rgba(0,10,207,0.16)' : 'rgba(0,10,207,0.06)' }}
              />
              <div
                aria-hidden
                className="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-3xl"
                style={{ background: dark ? 'rgba(0,196,230,0.14)' : 'rgba(0,196,230,0.05)' }}
              />

              <div className="relative z-10">
                {backHref && backLabel ? (
                  <Link
                    href={backHref}
                    className={cn(
                      'mb-6 inline-flex items-center gap-2 text-sm transition-colors',
                      dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900',
                    )}
                  >
                    <ArrowRight className="h-4 w-4 rotate-180" />
                    {backLabel}
                  </Link>
                ) : null}

                {title || subtitle ? (
                  <div className="mb-8 space-y-2">
                    {title ? (
                      <h1 className={cn('text-3xl font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
                        {title}
                      </h1>
                    ) : null}
                    {subtitle ? (
                      <p className={cn('text-sm leading-6', dark ? 'text-slate-300' : 'text-slate-600')}>{subtitle}</p>
                    ) : null}
                  </div>
                ) : null}

                {children}

                {footer ? <div className="relative z-10 mt-8">{footer}</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
