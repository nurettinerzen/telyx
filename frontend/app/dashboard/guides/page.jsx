'use client';

import React from 'react';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Globe,
  BookOpen,
  Database,
  Megaphone,
  Puzzle,
  Zap,
  ArrowRight,
  AlertCircle,
  Phone,
  MessageSquare,
  Mail,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  FlowBadge,
  FlowPageShell,
  FlowPanel,
  FlowStatCard,
} from '@/components/dashboard/FlowPageShell';

/* ------------------------------------------------------------------ */
/*  Bilingual guide content                                           */
/* ------------------------------------------------------------------ */

const GUIDE_CONTENT = {
  tr: {
    sections: [
      {
        id: 'how-it-works',
        icon: Globe,
        title: 'Sistem Nasıl Çalışır?',
        body: [
          'Telyx, yapay zeka destekli bir iletişim platformudur. Dört ana kanal üzerinden müşterilerinizle otomatik iletişim kurarsınız:',
        ],
        channels: [
          { icon: Phone, label: 'Telefon', desc: 'Giden arama (outbound) kampanyaları ve gelen arama (inbound) karşılama.' },
          { icon: MessageCircle, label: 'WhatsApp', desc: 'WhatsApp Business API üzerinden otomatik mesajlaşma.' },
          { icon: Mail, label: 'E-posta', desc: 'AI destekli e-posta taslakları ve otomatik yanıtlar.' },
          { icon: MessageSquare, label: 'Chat Widget', desc: 'Web sitenize yerleştirilebilir canlı sohbet aracı.' },
        ],
        footer: 'Her kanalın çalışması için en az bir AI asistan ve ilgili içerik tabanı (Bilgi Bankası / Özel Veriler) gerekir.',
      },
      {
        id: 'knowledge-base',
        icon: BookOpen,
        title: 'Bilgi Bankası Ne İşe Yarar?',
        body: [
          'Bilgi Bankası, asistanın konuşma sırasında referans aldığı doküman ve SSS havuzudur.',
          'PDF, metin dosyaları veya doğrudan yazılmış içerikler yükleyerek asistanın bilgi tabanını oluşturursunuz.',
          'Sık Sorulan Sorular (SSS) bölümü, hızlı ve tutarlı yanıtlar için en etkili araçtır.',
          'İçerik kalitesi ne kadar yüksekse, asistan o kadar doğru yanıt verir. Çelişkili veya eski bilgilerden kaçının.',
        ],
        link: { href: '/dashboard/knowledge', label: 'Bilgi Bankası\'na git' },
      },
      {
        id: 'custom-data',
        icon: Database,
        title: 'Özel Veriler Ne İşe Yarar?',
        body: [
          'Müşteriye özel kayıtları (sipariş, randevu, borç, servis bilgisi vb.) yükleyerek görüşmeleri kişiselleştirirsiniz.',
          'Asistan, konuşma sırasında arayan kişiyi tanır ve ilgili veriye göre yanıt verir.',
          'Excel veya CSV formatında toplu veri yükleyebilir, mevcut kayıtları güncelleyebilirsiniz.',
        ],
        privacyNote: 'Kişisel veri içerdiği için sadece gerekli alanları yükleyin. Gereksiz hassas verileri (TC kimlik no, kredi kartı vb.) eklemeyin. Veri minimizasyonu ilkesini uygulayın.',
        link: { href: '/dashboard/customer-data', label: 'Özel Verilere git' },
      },
      {
        id: 'phone-numbers',
        icon: Phone,
        title: 'Telefon Numarası Yönetimi',
        body: [
          'Yapay zeka asistanınızın telefon görüşmesi yapabilmesi için bir telefon numarasına ihtiyacı vardır.',
          'Telefon Numaraları sayfasından yeni numara alabilir veya mevcut numaranızı bağlayabilirsiniz.',
          'Aldığınız numarayı bir AI asistana atayarak gelen ve giden aramalar için aktif hale getirirsiniz.',
        ],
        checklist: [
          { step: 'Telefon Numaraları sayfasına gidin.', href: '/dashboard/phone-numbers' },
          { step: '"Telefon Numarası Al" butonuna tıklayın ve ülke/alan kodu seçin.', href: '/dashboard/phone-numbers' },
          { step: 'Numaranızı bir AI asistana atayın (asistan kartında seçim yapın).', href: '/dashboard/phone-numbers' },
          { step: 'Numaranız aktif olduktan sonra kampanya oluşturabilir veya gelen aramaları karşılayabilirsiniz.', href: '/dashboard/batch-calls' },
        ],
        link: { href: '/dashboard/phone-numbers', label: 'Telefon Numaralarına git' },
      },
      {
        id: 'campaigns',
        icon: Megaphone,
        title: 'Kampanyalar (Giden Arama)',
        body: [
          'Toplu giden arama (outbound) kampanyaları oluşturarak müşteri listenizi otomatik olarak ararsınız.',
          'Kampanya başlatmak için en az bir outbound asistan ve kullanılabilir telefon numarası gerekir.',
          'CSV/XLSX dosyası yükleyip telefon kolonu eşlemesi yaparak aramaları otomatik dağıtırsınız.',
          'Çalışan kampanyalarda ilerleme, başarı oranı ve hata kayıtlarını canlı olarak takip edersiniz.',
        ],
        constraints: [
          'V1\'de gelen arama (inbound) akışları hesap/plan durumuna göre kapalı olabilir.',
          'Kampanya modülü outbound odaklıdır.',
          'Numara ve dakika limitleri plan seviyenize bağlıdır.',
        ],
        link: { href: '/dashboard/batch-calls', label: 'Kampanyalara git' },
      },
      {
        id: 'integrations',
        icon: Puzzle,
        title: 'Entegrasyonlar Ne Sağlar?',
        body: [
          'Shopify, ikas, CRM, WhatsApp, Google Calendar gibi servisleri bağlayarak AI yanıtlarını gerçek verilerle zenginleştirirsiniz.',
          'Bağlanan sistemler sipariş, müşteri ve operasyon verilerini asistana otomatik taşır.',
          'Her entegrasyon için bağlantı, test ve bağlantı kesme işlemlerini tek ekrandan yönetirsiniz.',
          'Bazı entegrasyonlar plan seviyesine göre kilitli olabilir.',
        ],
        link: { href: '/dashboard/integrations', label: 'Entegrasyonlara git' },
      },
      {
        id: 'quick-setup',
        icon: Zap,
        title: '5 Dakikada Kurulum',
        checklist: [
          { step: 'AI asistan oluşturun ve amacını belirleyin.', href: '/dashboard/assistant' },
          { step: 'Bilgi Bankası\'na temel doküman ve SSS ekleyin.', href: '/dashboard/knowledge' },
          { step: 'Özel Veriler ile müşteri kayıtlarını yükleyin.', href: '/dashboard/customer-data' },
          { step: 'Telefon numarası alın ve bir asistana atayın.', href: '/dashboard/phone-numbers' },
          { step: 'İlk kampanyanızı oluşturup test edin.', href: '/dashboard/batch-calls' },
        ],
      },
    ],
  },
  en: {
    sections: [
      {
        id: 'how-it-works',
        icon: Globe,
        title: 'How Does the System Work?',
        body: [
          'Telyx is an AI-powered communication platform. You automate customer interactions across four main channels:',
        ],
        channels: [
          { icon: Phone, label: 'Phone', desc: 'Outbound call campaigns and inbound call handling.' },
          { icon: MessageCircle, label: 'WhatsApp', desc: 'Automated messaging via WhatsApp Business API.' },
          { icon: Mail, label: 'Email', desc: 'AI-powered email drafts and auto-responses.' },
          { icon: MessageSquare, label: 'Chat Widget', desc: 'Embeddable live chat for your website.' },
        ],
        footer: 'Each channel requires at least one AI assistant and a content base (Knowledge Base / Custom Data).',
      },
      {
        id: 'knowledge-base',
        icon: BookOpen,
        title: 'What Is the Knowledge Base For?',
        body: [
          'The Knowledge Base is the document and FAQ pool that the assistant references during conversations.',
          'Upload PDFs, text files, or directly written content to build the assistant\'s knowledge foundation.',
          'The FAQ section is the most effective tool for fast, consistent answers.',
          'Higher content quality means more accurate responses. Avoid conflicting or outdated information.',
        ],
        link: { href: '/dashboard/knowledge', label: 'Go to Knowledge Base' },
      },
      {
        id: 'custom-data',
        icon: Database,
        title: 'What Is Custom Data For?',
        body: [
          'Upload customer-specific records (orders, appointments, balances, service info, etc.) to personalize conversations.',
          'The assistant recognizes the caller and responds with relevant data during the call.',
          'You can bulk-upload data in Excel or CSV format and update existing records.',
        ],
        privacyNote: 'Since this contains personal data, only upload necessary fields. Do not include unnecessary sensitive data (national ID, credit card numbers, etc.). Apply data minimization principles.',
        link: { href: '/dashboard/customer-data', label: 'Go to Custom Data' },
      },
      {
        id: 'phone-numbers',
        icon: Phone,
        title: 'Phone Number Management',
        body: [
          'Your AI assistant needs a phone number to make and receive calls.',
          'You can get a new number or connect your existing number from the Phone Numbers page.',
          'Assign the number to an AI assistant to activate it for inbound and outbound calls.',
        ],
        checklist: [
          { step: 'Go to the Phone Numbers page.', href: '/dashboard/phone-numbers' },
          { step: 'Click "Get Phone Number" and select country/area code.', href: '/dashboard/phone-numbers' },
          { step: 'Assign the number to an AI assistant (select in the assistant card).', href: '/dashboard/phone-numbers' },
          { step: 'Once active, you can create campaigns or handle incoming calls.', href: '/dashboard/batch-calls' },
        ],
        link: { href: '/dashboard/phone-numbers', label: 'Go to Phone Numbers' },
      },
      {
        id: 'campaigns',
        icon: Megaphone,
        title: 'Campaigns (Outbound Calls)',
        body: [
          'Create batch outbound calling campaigns to automatically call your customer list.',
          'You need at least one outbound assistant and an available phone number to start a campaign.',
          'Upload a CSV/XLSX file and map the phone column to automatically distribute calls.',
          'Track progress, success rates, and error logs in real-time for running campaigns.',
        ],
        constraints: [
          'In V1, inbound call flows may be disabled depending on your plan/entitlements.',
          'The campaigns module is outbound-focused.',
          'Number and minute limits depend on your plan level.',
        ],
        link: { href: '/dashboard/batch-calls', label: 'Go to Campaigns' },
      },
      {
        id: 'integrations',
        icon: Puzzle,
        title: 'What Do Integrations Provide?',
        body: [
          'Connect services like Shopify, ikas, CRM, WhatsApp, and Google Calendar to enrich AI responses with real data.',
          'Connected systems automatically feed order, customer, and operational data to the assistant.',
          'Manage connect, test, and disconnect flows for each integration from a single screen.',
          'Some integrations may be locked based on your plan level.',
        ],
        link: { href: '/dashboard/integrations', label: 'Go to Integrations' },
      },
      {
        id: 'quick-setup',
        icon: Zap,
        title: '5-Minute Setup',
        checklist: [
          { step: 'Create an AI assistant and define its purpose.', href: '/dashboard/assistant' },
          { step: 'Add core documents and FAQs to Knowledge Base.', href: '/dashboard/knowledge' },
          { step: 'Upload customer records via Custom Data.', href: '/dashboard/customer-data' },
          { step: 'Get a phone number and assign it to an assistant.', href: '/dashboard/phone-numbers' },
          { step: 'Create and test your first campaign.', href: '/dashboard/batch-calls' },
        ],
      },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Section renderers                                                 */
/* ------------------------------------------------------------------ */

const SECTION_ACCENTS = ['teal', 'lightBlue', 'deepBlue', 'navy', 'teal', 'lightBlue', 'deepBlue'];

function SectionCard({ section, locale, index }) {
  const Icon = section.icon;
  const accent = SECTION_ACCENTS[index % SECTION_ACCENTS.length];
  const accentStyles = {
    teal: { color: '#00C4E6', soft: 'rgba(0,196,230,0.12)' },
    lightBlue: { color: '#006FEB', soft: 'rgba(0,111,235,0.12)' },
    deepBlue: { color: '#000ACF', soft: 'rgba(0,10,207,0.14)' },
    navy: { color: '#051752', soft: 'rgba(5,23,82,0.14)' },
  }[accent];

  return (
    <FlowPanel className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-200/80 px-6 py-5 dark:border-white/[0.08]">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl border"
          style={{
            color: accentStyles.color,
            backgroundColor: accentStyles.soft,
            borderColor: `${accentStyles.color}40`,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <FlowBadge accent={accent}>{locale === 'tr' ? 'Rehber Bolumu' : 'Guide Section'}</FlowBadge>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{section.title}</h2>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-4 p-6">
        {/* Text paragraphs */}
        {section.body?.map((paragraph, i) => (
          <p key={i} className="text-sm leading-7 text-neutral-700 dark:text-neutral-300">
            {paragraph}
          </p>
        ))}

        {/* Channel grid (how-it-works section) */}
        {section.channels && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {section.channels.map((ch) => {
              const ChIcon = ch.icon;
              return (
                <div
                  key={ch.label}
                  className="flex items-start gap-3 rounded-2xl border border-neutral-100 bg-neutral-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]"
                >
                  <div
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
                    style={{
                      color: accentStyles.color,
                      backgroundColor: accentStyles.soft,
                      borderColor: `${accentStyles.color}35`,
                    }}
                  >
                    <ChIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">{ch.label}</p>
                    <p className="text-xs leading-6 text-neutral-600 dark:text-neutral-400">{ch.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {section.footer && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">{section.footer}</p>
        )}

        {/* Privacy note (custom-data section) */}
        {section.privacyNote && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700/40 dark:bg-amber-950/40">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200">{section.privacyNote}</p>
          </div>
        )}

        {/* Constraints (campaigns section) */}
        {section.constraints && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
              {locale === 'tr' ? 'Kısıtlar & Notlar' : 'Constraints & Notes'}
            </p>
            <ul className="space-y-1.5">
              {section.constraints.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                  <span className="text-neutral-400 dark:text-neutral-500 mt-0.5">&#8226;</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quick setup checklist */}
        {section.checklist && (
          <ol className="space-y-3">
            {section.checklist.map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white/70 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{
                    color: accentStyles.color,
                    backgroundColor: accentStyles.soft,
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-neutral-700 dark:text-neutral-300 flex-1">{item.step}</span>
                <Link href={item.href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    style={{ color: accentStyles.color }}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {/* Section link */}
        {section.link && (
          <div className="pt-2">
            <Link href={section.link.href}>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                {section.link.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </FlowPanel>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function GuidePage() {
  const { locale } = useLanguage();
  const pageHelp = getPageHelp('guides', locale);
  const content = GUIDE_CONTENT[locale === 'tr' ? 'tr' : 'en'];
  const guideStats = locale === 'tr'
    ? [
        { value: '4', label: 'Ana kanal', hint: 'Telefon, WhatsApp, e-posta ve chat' },
        { value: `${content.sections.length}`, label: 'Rehber modulu', hint: 'Kurulumdan entegrasyona kadar tum akislar' },
        { value: '5 dk', label: 'Hizli kurulum', hint: 'Ilk asistani ve ilk veri setini hizla hazirla' },
      ]
    : [
        { value: '4', label: 'Core channels', hint: 'Phone, WhatsApp, email, and chat' },
        { value: `${content.sections.length}`, label: 'Guide modules', hint: 'From setup to integrations in one place' },
        { value: '5 min', label: 'Quick setup', hint: 'Prepare your first assistant and first data set fast' },
      ];

  return (
    <div className="space-y-8 pb-12">
      <FlowPageShell className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <FlowBadge accent="teal">{locale === 'tr' ? 'Urun Rehberi' : 'Product Guide'}</FlowBadge>
            <PageIntro
              title={pageHelp.title}
              subtitle={pageHelp.subtitle}
              locale={locale}
              titleClassName="text-3xl md:text-4xl font-semibold text-neutral-900 dark:text-white"
              subtitleClassName="text-base leading-7 text-neutral-600 dark:text-slate-300"
              help={{
                tooltipTitle: pageHelp.tooltipTitle,
                tooltipBody: pageHelp.tooltipBody,
                quickSteps: pageHelp.quickSteps,
              }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:max-w-2xl">
            {guideStats.map((stat, index) => (
              <FlowStatCard
                key={stat.label}
                icon={[Globe, BookOpen, Zap][index]}
                value={stat.value}
                label={stat.label}
                hint={stat.hint}
                accent={SECTION_ACCENTS[index]}
              />
            ))}
          </div>
        </div>
      </FlowPageShell>

      <div className="mx-auto grid max-w-6xl gap-6">
        {content.sections.map((section, index) => (
          <SectionCard key={section.id} section={section} locale={locale} index={index} />
        ))}
      </div>
    </div>
  );
}
