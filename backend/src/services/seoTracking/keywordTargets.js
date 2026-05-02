/**
 * Keywords we expect Telyx to rank for.
 *
 * Each entry has:
 *  - query: the exact Turkish/English search query
 *  - targetUrl: the page that should rank for this query
 *  - tier: importance (1 = highest, 3 = nice-to-have)
 *  - clusterId: groups related queries; useful for reporting
 *
 * The seoMonitor pulls ranking data for each query from GSC and
 * compares it to the targetUrl + a baseline kept in storage. When
 * actual position drops by more than the configured threshold, an
 * alert is dispatched.
 */

export const KEYWORD_TARGETS = [
  // ─── Tier 1: Brand and core product ───
  { query: 'telyx', targetUrl: '/', tier: 1, clusterId: 'brand' },
  { query: 'telyx ai', targetUrl: '/', tier: 1, clusterId: 'brand' },
  { query: 'telyx fiyat', targetUrl: '/pricing', tier: 1, clusterId: 'brand' },
  { query: 'telyx nedir', targetUrl: '/kaynak/genel-bakis', tier: 1, clusterId: 'brand' },

  // ─── Tier 1: Channel hubs ───
  { query: 'whatsapp ai chatbot', targetUrl: '/whatsapp', tier: 1, clusterId: 'channel-whatsapp' },
  { query: 'whatsapp business api türkiye', targetUrl: '/whatsapp', tier: 1, clusterId: 'channel-whatsapp' },
  { query: 'whatsapp chatbot fiyat', targetUrl: '/pricing', tier: 1, clusterId: 'channel-whatsapp' },
  { query: 'sesli yapay zeka', targetUrl: '/telefon', tier: 1, clusterId: 'channel-telefon' },
  { query: 'telefon ai asistan', targetUrl: '/telefon', tier: 1, clusterId: 'channel-telefon' },
  { query: 'çağrı merkezi otomasyonu', targetUrl: '/telefon', tier: 1, clusterId: 'channel-telefon' },
  { query: 'web sohbet botu', targetUrl: '/web-sohbet', tier: 1, clusterId: 'channel-websohbet' },
  { query: 'site chatbot türkçe', targetUrl: '/web-sohbet', tier: 1, clusterId: 'channel-websohbet' },
  { query: 'gmail ai yanıt', targetUrl: '/e-posta', tier: 1, clusterId: 'channel-email' },
  { query: 'instagram dm chatbot', targetUrl: '/instagram', tier: 1, clusterId: 'channel-instagram' },

  // ─── Tier 1: Industry hubs ───
  { query: 'e-ticaret chatbot', targetUrl: '/solutions/ecommerce', tier: 1, clusterId: 'industry-ecommerce' },
  { query: 'shopify whatsapp entegrasyonu', targetUrl: '/cozumler/whatsapp-e-ticaret-chatbot', tier: 1, clusterId: 'industry-ecommerce' },
  { query: 'restoran rezervasyon otomasyonu', targetUrl: '/cozumler/whatsapp-restoran-rezervasyon', tier: 1, clusterId: 'industry-restaurant' },
  { query: 'güzellik salonu randevu otomasyonu', targetUrl: '/cozumler/whatsapp-salon-randevu', tier: 1, clusterId: 'industry-salon' },
  { query: 'klinik whatsapp randevu', targetUrl: '/cozumler/whatsapp-klinik-randevu', tier: 1, clusterId: 'industry-klinik' },
  { query: 'kurs kayıt otomasyonu', targetUrl: '/cozumler/whatsapp-egitim-kayit', tier: 1, clusterId: 'industry-egitim' },

  // ─── Tier 2: Long-tail intent queries ───
  { query: 'whatsapp sipariş takip', targetUrl: '/cozumler/whatsapp-e-ticaret-chatbot', tier: 2, clusterId: 'long-tail' },
  { query: 'whatsapp sepet kurtarma', targetUrl: '/cozumler/whatsapp-e-ticaret-chatbot', tier: 2, clusterId: 'long-tail' },
  { query: 'whatsapp randevu hatırlatma', targetUrl: '/cozumler/whatsapp-salon-randevu', tier: 2, clusterId: 'long-tail' },
  { query: 'kuaför randevu otomasyonu', targetUrl: '/cozumler/whatsapp-salon-randevu', tier: 2, clusterId: 'long-tail' },
  { query: 'doktor randevu whatsapp', targetUrl: '/cozumler/whatsapp-klinik-randevu', tier: 2, clusterId: 'long-tail' },
  { query: 'estetik klinik chatbot', targetUrl: '/solutions/klinik', tier: 2, clusterId: 'long-tail' },
  { query: 'restoran whatsapp rezervasyon', targetUrl: '/cozumler/whatsapp-restoran-rezervasyon', tier: 2, clusterId: 'long-tail' },
  { query: 'restoran no show', targetUrl: '/blog/restoran-no-show-azaltma-stratejisi', tier: 2, clusterId: 'long-tail' },
  { query: 'kvkk uyumlu chatbot', targetUrl: '/blog/kvkk-uyumlu-chatbot-rehberi', tier: 2, clusterId: 'long-tail' },
  { query: 'whatsapp business api nasıl alınır', targetUrl: '/blog/whatsapp-business-api-turkiye-2026', tier: 2, clusterId: 'long-tail' },
  { query: 'ai müşteri hizmetleri roi', targetUrl: '/blog/ai-musteri-hizmetleri-roi-hesabi', tier: 2, clusterId: 'long-tail' },

  // ─── Tier 3: Discovery / brand expansion ───
  { query: 'türkçe ai asistan', targetUrl: '/', tier: 3, clusterId: 'discovery' },
  { query: 'kobi müşteri hizmetleri otomasyonu', targetUrl: '/', tier: 3, clusterId: 'discovery' },
  { query: 'çok kanallı müşteri iletişimi', targetUrl: '/features', tier: 3, clusterId: 'discovery' },
  { query: 'ai çağrı merkezi türkiye', targetUrl: '/telefon', tier: 3, clusterId: 'discovery' },
];

export const POSITION_DROP_THRESHOLD = 5;
export const NEW_BAD_POSITION_THRESHOLD = 30;

export function tierAlertSeverity(tier) {
  if (tier === 1) return 'critical';
  if (tier === 2) return 'warning';
  return 'info';
}
