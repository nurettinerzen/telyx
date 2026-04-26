'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { TelyxLogoFull } from '@/components/TelyxLogo';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function DemoPreviewPage({ params }) {
  const token = useMemo(() => decodeURIComponent(params?.token || ''), [params?.token]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestState, setRequestState] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function submitRequest() {
      if (!token || !API_BASE_URL) {
        setError('Demo talebi başlatılamadı.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/leads/preview/${encodeURIComponent(token)}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.error || 'Demo talebi işlenemedi.');
        }

        if (!cancelled) {
          setRequestState(data);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Demo talebi işlenemedi.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    submitRequest();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const title = requestState?.title || 'Demo talebinizi aldık';
  const message = requestState?.message || 'Talebiniz bize ulaştı. En kısa sürede sizinle iletişime geçeceğiz.';
  const leadName = requestState?.leadName;

  return (
    <main className="min-h-screen bg-[#eef3f9] px-4 py-10 text-[#051752]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="rounded-[28px] border border-[#d7e2f0] bg-white px-6 py-8 shadow-[0_18px_60px_rgba(5,23,82,0.08)] sm:px-10">
          <div className="h-1.5 w-full rounded-full bg-[linear-gradient(90deg,#00c3e6_0%,#245ce5_100%)]" />

          <div className="pt-8">
            <TelyxLogoFull width={192} height={44} darkMode={false} />
          </div>

          <div className="mt-8">
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#051752] sm:text-4xl">
              {leadName ? `Merhaba ${leadName},` : 'Merhaba,'}
            </h1>
          </div>

          <div className="mt-8 rounded-[24px] border border-[#d7e2f0] bg-[#f7f9fc] p-5 sm:p-6">
            {loading ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#051752]" />
                <p className="text-sm text-[#52637d]">Demo talebiniz işleniyor...</p>
              </div>
            ) : error ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-red-500" />
                <div>
                  <p className="text-base font-semibold text-[#051752]">Talep başlatılamadı</p>
                  <p className="mt-2 text-sm text-[#52637d]">{error}</p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-5 text-center">
                <CheckCircle2 className="h-12 w-12 text-[#10b981]" />
                <div className="space-y-3">
                  <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#051752]">{title}</h2>
                  <p className="mx-auto max-w-xl text-base leading-7 text-[#52637d]">{message}</p>
                </div>
                <div className="inline-flex rounded-full bg-[#ecfdf5] px-4 py-2 text-sm font-semibold text-[#047857]">
                  Talebiniz ekibe iletildi
                </div>
              </div>
            )}
          </div>

          <p className="mt-5 text-xs leading-6 text-[#71829c]">
            Talebiniz kayıt altına alındı ve demo süreciniz başlatıldı.
          </p>
        </div>
      </div>
    </main>
  );
}
