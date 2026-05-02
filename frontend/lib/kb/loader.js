import { promises as fs } from 'fs';
import path from 'path';

const KB_DIR = path.join(process.cwd(), 'content', 'kb');

export const KB_MANIFEST = [
  {
    slug: 'genel-bakis',
    file: '01-overview.md',
    title: 'Telyx Nedir? Yapay Zeka Müşteri Hizmetleri Platformuna Genel Bakış',
    description:
      'Telyx; telefon, WhatsApp, web sohbeti ve e-postayı tek yapay zeka platformunda birleştiren çok kanallı müşteri hizmetleri çözümüdür. Ne yapar, kimler için, nasıl çalışır?',
    keywords: [
      'telyx nedir',
      'yapay zeka müşteri hizmetleri',
      'çok kanallı destek',
      'ai müşteri iletişimi',
      'whatsapp ai chatbot',
    ],
    summary:
      'Telyx\'in temel değer önerisi, hedef kitlesi ve neden farklı olduğu üzerine kısa bir genel bakış.',
  },
  {
    slug: 'nasil-calisir',
    file: '02-how-it-works.md',
    title: 'Telyx Nasıl Çalışır? Çok Kanallı AI Müşteri Hizmetleri Mimarisi',
    description:
      'Telyx altında ne var: Çağrı motoru, mesajlaşma katmanı, bilgi tabanı, asistan yönetimi ve entegrasyonlar. Müşteri mesajından AI yanıtına dek akış adım adım.',
    keywords: [
      'telyx mimari',
      'ai çağrı asistanı nasıl çalışır',
      'whatsapp business api entegrasyonu',
      'bilgi tabanı yönetimi',
      'çoklu kanal müşteri hizmetleri',
    ],
    summary:
      'Telyx\'in 4 kanal, asistan yönetimi, bilgi tabanı ve entegrasyon katmanları nasıl birlikte çalışıyor.',
  },
  {
    slug: 'ozellikler-detay',
    file: '03-features.md',
    title: 'Telyx Özellikleri — Tüm AI Müşteri Hizmetleri Yetenekleri',
    description:
      'Telyx özellikleri detaylı: telefon (sesli AI agent), WhatsApp Business API, web sohbet widget, e-posta otomasyonu, kampanya araması, bilgi tabanı, çoklu asistan, analitik ve KVKK uyumu.',
    keywords: [
      'telyx özellikleri',
      'sesli yapay zeka agent',
      'whatsapp ai chatbot',
      'web sohbet botu',
      'kampanya araması otomasyonu',
      'çoklu asistan yönetimi',
    ],
    summary:
      'Telyx\'in 4 kanalı, sesli agent yetenekleri, WhatsApp Business API, kampanya araması ve daha fazlasının ayrıntılı listesi.',
  },
  {
    slug: 'entegrasyonlar',
    file: '05-integrations.md',
    title: 'Telyx Entegrasyonları — Hangi Sistemlerle Çalışır?',
    description:
      'Telyx; WhatsApp Business API, Gmail, Outlook, Shopify, ikas, Ticimax, IdeaSoft, HubSpot, Custom CRM, Google Calendar, Webhook API ve Paraşüt ile entegre çalışır.',
    keywords: [
      'whatsapp business api entegrasyonu',
      'shopify whatsapp entegrasyonu',
      'ikas chatbot',
      'gmail otomasyonu',
      'crm entegrasyonu',
      'google calendar entegrasyonu',
      'webhook api',
    ],
    summary:
      'Mevcut ve yakında gelecek entegrasyonların listesi, kurulum yaklaşımı ve özel CRM bağlantı seçeneği.',
  },
  {
    slug: 'guvenlik-gizlilik',
    file: '06-security-privacy.md',
    title: 'Güvenlik ve Gizlilik — KVKK Uyumlu AI Müşteri Hizmetleri',
    description:
      'Telyx\'te veri güvenliği, KVKK uyumu, şifreleme, erişim kontrolü ve müşteri bilgilerinin nasıl korunduğu. Güvenli AI müşteri hizmetleri için tasarlanmış mimari.',
    keywords: [
      'kvkk uyumlu chatbot',
      'ai müşteri hizmetleri güvenlik',
      'gdpr uyumlu ai',
      'müşteri veri güvenliği',
      'şifreli ai platformu',
    ],
    summary:
      'Telyx\'in veri saklama, KVKK/GDPR uyumu, şifreleme ve erişim kontrolü politikaları.',
  },
];

export async function getAllResources() {
  return KB_MANIFEST.map(({ file, ...rest }) => rest);
}

export async function getResource(slug) {
  const meta = KB_MANIFEST.find((m) => m.slug === slug);
  if (!meta) return null;

  try {
    const filepath = path.join(KB_DIR, meta.file);
    const raw = await fs.readFile(filepath, 'utf-8');
    const turkishOnly = raw.split(/\n---\s*\n/)[0].trim();
    return { ...meta, content: turkishOnly };
  } catch (err) {
    return null;
  }
}

export async function getFaqMarkdown() {
  try {
    const filepath = path.join(KB_DIR, '07-faq.md');
    const raw = await fs.readFile(filepath, 'utf-8');
    const turkishOnly = raw.split(/\n---\s*\n/)[0].trim();
    return turkishOnly;
  } catch (err) {
    return null;
  }
}
