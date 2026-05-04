'use client';

import { useMemo, useState } from 'react';

const planLabels = {
  TRIAL_FREE: 'Ücretsiz Deneme',
  PAYG: 'Kullandıkça Öde',
  STARTER: 'Başlangıç',
  PRO: 'Pro',
  ENTERPRISE: 'Kurumsal',
};

const planTones = {
  TRIAL_FREE: {
    border: 'border-cyan-400/30',
    activeBorder: 'border-cyan-300',
    bg: 'from-cyan-950/58 via-slate-950 to-cyan-950/34',
    badge: 'bg-cyan-400/13 text-cyan-300',
  },
  PAYG: {
    border: 'border-violet-400/30',
    activeBorder: 'border-violet-300',
    bg: 'from-violet-950/48 via-slate-950 to-fuchsia-950/30',
    badge: 'bg-violet-400/13 text-violet-300',
  },
  STARTER: {
    border: 'border-blue-400/30',
    activeBorder: 'border-blue-300',
    bg: 'from-blue-950/46 via-slate-950 to-sky-950/30',
    badge: 'bg-blue-400/13 text-blue-300',
  },
  PRO: {
    border: 'border-emerald-400/30',
    activeBorder: 'border-emerald-300',
    bg: 'from-emerald-950/45 via-slate-950 to-teal-950/30',
    badge: 'bg-emerald-400/13 text-emerald-300',
  },
  ENTERPRISE: {
    border: 'border-amber-400/30',
    activeBorder: 'border-amber-300',
    bg: 'from-amber-950/42 via-slate-950 to-orange-950/28',
    badge: 'bg-amber-400/13 text-amber-300',
  },
  ALL: {
    border: 'border-indigo-400/30',
    activeBorder: 'border-indigo-300',
    bg: 'from-indigo-950/50 via-slate-950 to-blue-950/28',
    badge: 'bg-indigo-400/13 text-indigo-300',
  },
};

const subscriptionRows = [
  {
    id: 1,
    business: 'Katibim',
    email: 'abdulhamid-turk@outlook.com',
    plan: 'TRIAL_FREE',
    status: 'Aktif',
    lifecycle: 'Aktif Abonelik',
    minutes: '0 / 0',
    periodEnd: '10.05.2026',
    payment: 'Stripe',
  },
  {
    id: 2,
    business: 'Uday Müşteri Merkezi',
    email: 'dayema2312@videobix.com',
    plan: 'TRIAL_FREE',
    status: 'Aktif',
    lifecycle: 'Aktif Abonelik',
    minutes: '0 / 0',
    periodEnd: '10.05.2026',
    payment: 'Stripe',
  },
  {
    id: 3,
    business: 'Uday',
    email: 'udayalimm@gmail.com',
    plan: 'TRIAL_FREE',
    status: 'Aktif',
    lifecycle: 'Deneme',
    minutes: '0 / 0',
    periodEnd: '10.05.2026',
    payment: 'Stripe',
  },
  {
    id: 4,
    business: 'NORTH GROUP SU ARITMA',
    email: 'northsheild@gmail.com',
    plan: 'PAYG',
    status: 'Aktif',
    lifecycle: 'Aktif Abonelik',
    minutes: '0 / 0',
    periodEnd: '10.05.2026',
    payment: 'Stripe',
  },
  {
    id: 5,
    business: 'Sercan',
    email: 'jacov44391@gixpos.com',
    plan: 'PAYG',
    status: 'Aktif',
    lifecycle: 'Aktif Abonelik',
    minutes: '0 / 0',
    periodEnd: '10.05.2026',
    payment: 'Stripe',
  },
  {
    id: 6,
    business: 'HED',
    email: 'esatdaplan4@gmail.com',
    plan: 'PRO',
    status: 'Aktif',
    lifecycle: 'Aktif Abonelik',
    minutes: '420 / 1000',
    periodEnd: '09.05.2026',
    payment: 'Stripe',
  },
  {
    id: 7,
    business: 'Leadspark',
    email: 'finance@leadspark.ai',
    plan: 'PRO',
    status: 'Aktif',
    lifecycle: 'Aktif Abonelik',
    minutes: '690 / 1000',
    periodEnd: '18.05.2026',
    payment: 'Stripe',
  },
  {
    id: 8,
    business: 'Netgsm Finansal İşlemler',
    email: 'ops@netgsm.com.tr',
    plan: 'ENTERPRISE',
    status: 'Aktif',
    lifecycle: 'İptal Planlı',
    minutes: '2.840 / 5.000',
    periodEnd: '31.05.2026',
    payment: 'Fatura',
  },
  {
    id: 9,
    business: 'SwissTransfer Destek',
    email: 'admin@swisstransfer.test',
    plan: 'ENTERPRISE',
    status: 'Aktif',
    lifecycle: 'Aktif Abonelik',
    minutes: '1.120 / 5.000',
    periodEnd: '28.05.2026',
    payment: 'Fatura',
  },
  {
    id: 10,
    business: 'Demo Başlangıç',
    email: 'demo@starter.test',
    plan: 'STARTER',
    status: 'Aktif',
    lifecycle: 'Yenilenmeyen Paket',
    minutes: '90 / 250',
    periodEnd: '01.05.2026',
    payment: 'Stripe',
  },
];

const subscriptionCounts = {
  TRIAL_FREE: 20,
  PAYG: 2,
  STARTER: 0,
  PRO: 8,
  ENTERPRISE: 2,
  ALL: 32,
};

const userRows = [
  {
    id: 1,
    name: 'Abdulhamid Türk',
    email: 'abdulhamid-turk@outlook.com',
    business: 'Katibim',
    emailVerified: true,
    verifiedAt: '03.05.2026',
    plan: 'TRIAL_FREE',
    lifecycle: 'Aktif Abonelik',
    usage: '0 asistan, 0 arama',
    status: 'Aktif',
  },
  {
    id: 2,
    name: 'Dayema',
    email: 'dayema2312@videobix.com',
    business: 'Uday Müşteri Merkezi',
    emailVerified: true,
    verifiedAt: '03.05.2026',
    plan: 'TRIAL_FREE',
    lifecycle: 'Aktif Abonelik',
    usage: '1 asistan, 3 arama',
    status: 'Aktif',
  },
  {
    id: 3,
    name: 'Uday Alimm',
    email: 'udayalimm@gmail.com',
    business: 'Uday',
    emailVerified: false,
    verifiedAt: null,
    plan: 'TRIAL_FREE',
    lifecycle: 'Denemesi Biten',
    usage: '0 asistan, 0 arama',
    status: 'Aktif',
  },
  {
    id: 4,
    name: 'Sercan',
    email: 'jacov44391@gixpos.com',
    business: 'Sercan',
    emailVerified: false,
    verifiedAt: null,
    plan: 'PAYG',
    lifecycle: 'Aktif Abonelik',
    usage: '2 asistan, 8 arama',
    status: 'Aktif',
  },
  {
    id: 5,
    name: 'Esat Kaplan',
    email: 'esatdaplan4@gmail.com',
    business: 'HED',
    emailVerified: true,
    verifiedAt: '29.04.2026',
    plan: 'PRO',
    lifecycle: 'Aktif Abonelik',
    usage: '4 asistan, 107 arama',
    status: 'Aktif',
  },
  {
    id: 6,
    name: 'Swiss Admin',
    email: 'admin@swisstransfer.test',
    business: 'SwissTransfer Destek',
    emailVerified: true,
    verifiedAt: '22.04.2026',
    plan: 'ENTERPRISE',
    lifecycle: 'İptal Planlı',
    usage: '12 asistan, 402 arama',
    status: 'Dondurulmuş',
  },
  {
    id: 7,
    name: 'Demo Starter',
    email: 'demo@starter.test',
    business: 'Demo Başlangıç',
    emailVerified: true,
    verifiedAt: '12.04.2026',
    plan: 'STARTER',
    lifecycle: 'Yenilenmeyen Paket',
    usage: '1 asistan, 12 arama',
    status: 'Aktif',
  },
];

const userStats = {
  total: 22,
  active: 21,
  suspended: 1,
  verified: 20,
  unverified: 2,
  risk: 3,
};

function percentage(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function cardStateClass(active, tone) {
  return [
    'group min-h-[86px] rounded-lg border bg-gradient-to-br p-3.5 text-left transition duration-150',
    'hover:-translate-y-0.5 hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-cyan-300/40',
    active ? `${tone.activeBorder} shadow-[0_0_0_1px_rgba(255,255,255,0.07)]` : tone.border,
    tone.bg,
  ].join(' ');
}

function StatusBadge({ children, tone = 'neutral' }) {
  const colors = {
    green: 'text-emerald-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
    violet: 'text-violet-300',
    neutral: 'text-slate-300',
  };

  return (
    <span className={`text-sm font-medium ${colors[tone]}`}>
      {children}
    </span>
  );
}

function AdminShell({ children }) {
  const navGroups = [
    ['Ürün', 'Rehber', 'Asistanlar', 'Bilgi Bankası', 'Sohbet Aracı'],
    ['Operasyon', 'Özel Veriler', 'Kampanyalar', 'E-posta', 'Sohbetler', 'Pazaryeri Q&A'],
    ['İzleme', 'Analitik', 'Geri Arama Talepleri', 'Arama Geçmişi', 'Sohbet Geçmişi'],
    ['Yönetim', 'Entegrasyonlar', 'Ekip', 'Telefon Numaraları', 'Abonelikler', 'Kullanıcılar'],
  ];

  return (
    <main className="min-h-screen bg-[#020817] text-slate-100 [letter-spacing:0]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[300px] shrink-0 border-r border-slate-800/80 bg-slate-900/86 lg:block">
          <div className="border-b border-slate-800 px-7 py-7">
            <div className="text-2xl font-bold tracking-normal text-white">Telyx</div>
          </div>
          <nav className="h-[calc(100vh-168px)] overflow-y-auto px-4 py-5">
            {navGroups.map(([title, ...items]) => (
              <div key={title} className="mb-4">
                <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {title}
                </div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const active = item === 'Abonelikler' || item === 'Kullanıcılar';
                    return (
                      <div
                        key={item}
                        className={`rounded-md px-3 py-2 text-sm font-medium ${
                          active ? 'bg-slate-800 text-blue-300' : 'text-slate-300'
                        }`}
                      >
                        {item}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-slate-800 px-5 py-4">
            <div className="rounded-lg border border-slate-700/80 bg-slate-950/34 px-4 py-3">
              <div className="text-sm font-semibold text-white">Nurettin Erzen</div>
              <div className="mt-1 text-xs text-blue-300">Kurumsal</div>
            </div>
          </div>
        </aside>
        <section className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10 xl:px-14">
          {children}
        </section>
      </div>
    </main>
  );
}

function SearchFilters({ page }) {
  const filters = page === 'users'
    ? ['E-posta Durumu', 'Kullanıcı Durumu', 'Yaşam Döngüsü']
    : ['Abonelik Durumu', 'Yaşam Döngüsü', 'Ödeme'];

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <div className="h-11 min-w-[260px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 text-sm text-slate-500 sm:max-w-[360px]">
        <div className="flex h-full items-center">E-posta, isim veya işletme ara...</div>
      </div>
      <button className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-5 text-sm font-medium text-white">
        Ara
      </button>
      {filters.map((filter) => (
        <button
          key={filter}
          className="h-11 min-w-[180px] rounded-lg border border-slate-800 bg-slate-900/80 px-4 text-left text-sm font-medium text-slate-200"
        >
          Tüm {filter}
        </button>
      ))}
    </div>
  );
}

function UsersMockup() {
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredRows = useMemo(() => {
    if (activeFilter === 'email') return userRows.filter((user) => !user.emailVerified);
    if (activeFilter === 'risk') {
      return userRows.filter((user) => ['Denemesi Biten', 'Yenilenmeyen Paket', 'İptal Planlı'].includes(user.lifecycle));
    }
    return userRows;
  }, [activeFilter]);

  const cards = [
    {
      key: 'all',
      title: 'Toplam Kullanıcı',
      value: userStats.total,
      percent: percentage(userStats.total, userStats.total),
      headline: 'Tüm işletme sahipleri',
      detail: `${userStats.active} aktif / ${userStats.suspended} dondurulmuş`,
      tone: planTones.ALL,
    },
    {
      key: 'email',
      title: 'Doğrulanmamış E-posta',
      value: userStats.unverified,
      percent: percentage(userStats.unverified, userStats.total),
      headline: 'aksiyon bekliyor',
      detail: `${userStats.verified} doğrulanmış`,
      tone: planTones.TRIAL_FREE,
    },
    {
      key: 'risk',
      title: 'Yaşam Döngüsü Riski',
      value: userStats.risk,
      percent: percentage(userStats.risk, userStats.total),
      headline: 'takip gerektiren',
      detail: 'denemesi biten / yenilenmeyen / iptal planlı',
      tone: planTones.ENTERPRISE,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-white">Kullanıcılar</h1>
          <p className="mt-2 text-base text-slate-400">Tüm platform kullanıcıları (22)</p>
        </div>
      </div>

      <div className="mt-7 grid gap-3 xl:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            aria-pressed={activeFilter === card.key}
            onClick={() => setActiveFilter(card.key)}
            className={cardStateClass(activeFilter === card.key, card.tone)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-slate-400">{card.title}</div>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${card.tone.badge}`}>
                %{card.percent}
              </span>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <div className="text-3xl font-semibold tracking-normal text-white">{card.value}</div>
              <div className="pb-1 text-sm text-slate-300">{card.headline}</div>
            </div>
            <div className="mt-3 border-t border-white/10 pt-2.5 text-xs font-medium text-slate-500">
              {card.detail}
            </div>
          </button>
        ))}
      </div>

      <SearchFilters page="users" />

      <div className="mt-7 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="text-sm font-semibold text-white">Kullanıcı tablosu</div>
          <div className="text-xs font-medium text-slate-500">{filteredRows.length} kayıt gösteriliyor</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Kullanıcı</th>
                <th className="px-5 py-3 font-semibold">İşletme</th>
                <th className="px-5 py-3 font-semibold">E-posta Doğrulama</th>
                <th className="px-5 py-3 font-semibold">Abonelik</th>
                <th className="px-5 py-3 font-semibold">Kullanım</th>
                <th className="px-5 py-3 font-semibold">Durum</th>
                <th className="px-5 py-3 font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRows.map((user) => (
                <tr key={user.id} className="bg-slate-950/85">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-white">{user.name}</div>
                    <div className="mt-1 text-slate-400">{user.email}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-300">{user.business}</td>
                  <td className="px-5 py-4">
                    <StatusBadge tone={user.emailVerified ? 'green' : 'amber'}>
                      {user.emailVerified ? 'Doğrulandı' : 'Doğrulanmadı'}
                    </StatusBadge>
                    <div className="mt-1 text-xs text-slate-500">
                      {user.emailVerified ? user.verifiedAt : 'Bekliyor'}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge tone="violet">{planLabels[user.plan]}</StatusBadge>
                    <div className="mt-1 text-xs text-slate-500">{user.lifecycle}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-300">{user.usage}</td>
                  <td className="px-5 py-4">
                    <StatusBadge tone={user.status === 'Aktif' ? 'green' : 'neutral'}>{user.status}</StatusBadge>
                  </td>
                  <td className="px-5 py-4 text-slate-400">...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SubscriptionsMockup() {
  const [activePlan, setActivePlan] = useState('ALL');

  const visibleRows = useMemo(() => {
    if (activePlan === 'ALL') return subscriptionRows;
    return subscriptionRows.filter((row) => row.plan === activePlan);
  }, [activePlan]);

  const cards = ['TRIAL_FREE', 'PAYG', 'STARTER', 'PRO', 'ENTERPRISE', 'ALL'];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-white">Abonelikler</h1>
          <p className="mt-2 text-base text-slate-400">Tüm platform abonelikleri (32)</p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {cards.map((plan) => {
          const tone = planTones[plan];
          const count = subscriptionCounts[plan];
          const label = plan === 'ALL' ? 'Toplam Kullanıcı' : planLabels[plan];

          return (
            <button
              key={plan}
              type="button"
              aria-pressed={activePlan === plan}
              onClick={() => setActivePlan(plan)}
              className={cardStateClass(activePlan === plan, tone)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-3xl font-semibold tracking-normal text-white">{count}</div>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${tone.badge}`}>
                  %{percentage(count, subscriptionCounts.ALL)}
                </span>
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-200">{label}</div>
            </button>
          );
        })}
      </div>

      <SearchFilters page="subscriptions" />

      <div className="mt-7 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="text-sm font-semibold text-white">Abonelik tablosu</div>
          <div className="text-xs font-medium text-slate-500">{visibleRows.length} kayıt gösteriliyor</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">İşletme</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Durum</th>
                <th className="px-5 py-3 font-semibold">Dakika</th>
                <th className="px-5 py-3 font-semibold">Dönem Sonu</th>
                <th className="px-5 py-3 font-semibold">Ödeme</th>
                <th className="px-5 py-3 font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visibleRows.map((sub) => (
                <tr key={sub.id} className="bg-slate-950/85">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-white">{sub.business}</div>
                    <div className="mt-1 text-slate-400">{sub.email}</div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge tone="violet">{planLabels[sub.plan]}</StatusBadge>
                    <div className="mt-1 text-xs text-slate-500">{sub.lifecycle}</div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge tone="green">{sub.status}</StatusBadge>
                  </td>
                  <td className="px-5 py-4 text-slate-300">{sub.minutes}</td>
                  <td className="px-5 py-4 text-slate-300">{sub.periodEnd}</td>
                  <td className="px-5 py-4 text-slate-300">{sub.payment}</td>
                  <td className="px-5 py-4 text-slate-400">...</td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr className="bg-slate-950/85">
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    Bu plan için örnek kayıt yok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminSummaryCardsMockupPage() {
  const [page, setPage] = useState('subscriptions');

  return (
    <AdminShell>
      <style jsx global>{`
        nextjs-portal {
          display: none !important;
        }
      `}</style>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-1">
            {[
              ['subscriptions', 'Abonelikler'],
              ['users', 'Kullanıcılar'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPage(key)}
                className={`h-10 rounded-md px-4 text-sm font-semibold transition ${
                  page === key ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {page === 'subscriptions' ? <SubscriptionsMockup /> : <UsersMockup />}
      </div>
    </AdminShell>
  );
}
