// 4 channels × 4 industries = 16 long-tail landing pages.
// Each entry is a self-contained, keyword-rich page targeting a specific
// search intent like "whatsapp e-ticaret chatbot" or "telefon restoran ai".

const CHANNELS = {
  whatsapp: { label: 'WhatsApp', icon: 'whatsapp', gradient: 'from-emerald-500 to-green-600' },
  telefon: { label: 'Telefon', icon: 'telefon', gradient: 'from-[#051752] to-[#006FEB]' },
  'web-sohbet': { label: 'Web Sohbet', icon: 'web-sohbet', gradient: 'from-[#000ACF] to-[#00C4E6]' },
  'e-posta': { label: 'E-posta', icon: 'e-posta', gradient: 'from-purple-600 to-indigo-600' },
  instagram: { label: 'Instagram DM', icon: 'instagram', gradient: 'from-pink-500 via-red-500 to-yellow-500' },
};

const INDUSTRIES = {
  'e-ticaret': { label: 'E-ticaret' },
  restoran: { label: 'Restoran' },
  salon: { label: 'Güzellik Salonu' },
  destek: { label: 'Müşteri Desteği' },
  klinik: { label: 'Klinik & Sağlık' },
  egitim: { label: 'Eğitim' },
};

export const MATRIX_LANDINGS = {
  // ───────────── WhatsApp ─────────────
  'whatsapp-e-ticaret-chatbot': {
    slug: 'whatsapp-e-ticaret-chatbot',
    channel: 'whatsapp',
    industry: 'e-ticaret',
    title: 'E-ticaret İçin WhatsApp Chatbot — Sipariş, Kargo, Sepet Kurtarma',
    metaDescription: 'E-ticaret siteniz için WhatsApp chatbot: sipariş takibi, kargo bilgisi, iade-değişim, sepet kurtarma ve ürün önerisi. Shopify, ikas, WooCommerce entegre. KVKK uyumlu.',
    heroTitle: 'E-ticaret Müşterilerinizin İlk Tercihi: WhatsApp',
    heroSubtitle: 'WhatsApp Business API üzerinden müşterilerinize sipariş takibi, kargo bilgisi, iade-değişim ve ürün önerisi sunun. Sepet kurtarma mesajları otomatik. AI cevaplayamadığında canlı temsilciye sorunsuz handoff.',
    useCases: [
      { title: 'Sipariş takibi', body: 'Müşteri "siparişim nerede?" yazdığında AI sipariş numarasını ister, kargo entegrasyonundan durumu çeker, takip linkiyle saniyeler içinde yanıtlar.' },
      { title: 'Sepet kurtarma', body: 'Sepetini terk eden müşteriye onay almış WhatsApp şablonu ile hatırlatma gider; indirim koduyla geri kazanım sağlanır.' },
      { title: 'İade ve değişim', body: 'AI iade politikalarını anlatır, talep formunu açar, kargo etiketi gönderir. Karmaşık iade durumları canlı temsilciye iletilir.' },
    ],
    benefits: [
      'Shopify, ikas, Ticimax, IdeaSoft entegrasyonu kutudan çıkar',
      'Yüzde 98 mesaj açılma oranı — duyurularınız gerçekten okunur',
      'Sepet kurtarma akışları yüzde 20\'ye varan dönüşüm artışı sağlar',
    ],
    keywords: ['e-ticaret whatsapp chatbot', 'shopify whatsapp chatbot', 'ikas whatsapp', 'sepet kurtarma whatsapp', 'whatsapp sipariş takip', 'e-ticaret ai müşteri hizmetleri', 'whatsapp business api e-ticaret'],
  },
  'whatsapp-restoran-rezervasyon': {
    slug: 'whatsapp-restoran-rezervasyon',
    channel: 'whatsapp',
    industry: 'restoran',
    title: 'Restoran İçin WhatsApp Rezervasyon — AI Destekli Otomatik Yönetim',
    metaDescription: 'Restoranlar için WhatsApp rezervasyon ve paket sipariş otomasyonu. AI; masa rezervasyonu alır, menü gönderir, sipariş işler. Yoğun saatlerde müşteri kaybetmezsiniz.',
    heroTitle: 'Restoranınıza WhatsApp\'tan Otomatik Rezervasyon ve Sipariş',
    heroSubtitle: 'AI yapay zeka asistanınız WhatsApp\'tan gelen rezervasyon taleplerini, paket sipariş isteklerini ve menü sorularını 7/24 yanıtlar. Müsait masaları kontrol eder, onay mesajı gönderir.',
    useCases: [
      { title: 'Masa rezervasyonu', body: '"Bu akşam 4 kişilik masa var mı?" sorusuna AI rezervasyon sisteminden boş slot kontrolü yapar, anında onay verir, hatırlatma mesajını günün sabahı gönderir.' },
      { title: 'Paket sipariş', body: 'Müşteri WhatsApp\'tan paket sipariş ister, AI menüyü gönderir, seçimleri alır, adres ve ödeme bilgisini toplar, mutfağa anında iletir.' },
      { title: 'Menü ve çalışma saatleri', body: 'Sıkça sorulan sorulara (menü, fiyat, saat, konum) AI anında yanıt verir; karmaşık özel istek olduğunda canlı temsilciye iletir.' },
    ],
    benefits: [
      'Yoğun saatlerde telefon meşgul olsa bile müşteri kaybetmezsiniz',
      'Menü ve fiyat değişiklikleri tek panelden anında güncellenir',
      'Hatırlatma mesajları no-show oranlarını yüzde 30\'a kadar düşürür',
    ],
    keywords: ['restoran whatsapp rezervasyon', 'restoran paket sipariş whatsapp', 'restoran chatbot', 'whatsapp masa rezervasyonu', 'restoran ai müşteri hizmetleri', 'cafe whatsapp otomasyon'],
  },
  'whatsapp-salon-randevu': {
    slug: 'whatsapp-salon-randevu',
    channel: 'whatsapp',
    industry: 'salon',
    title: 'Güzellik Salonu İçin WhatsApp Randevu Otomasyonu — AI Asistan',
    metaDescription: 'Güzellik salonu, kuaför ve estetik klinikleri için WhatsApp\'ta otomatik randevu, hatırlatma ve iptal yönetimi. Google Calendar entegre, AI 7/24 yanıt verir.',
    heroTitle: 'Salonunuza WhatsApp\'tan Otomatik Randevu Alın',
    heroSubtitle: 'WhatsApp üzerinden gelen randevu taleplerini AI asistanınız yönetir. Müsait saatleri gösterir, randevu kaydeder, Google Calendar\'a otomatik ekler ve bir gün önce hatırlatma yapar.',
    useCases: [
      { title: 'Otomatik randevu', body: 'Müşteri "yarın saç kesimi için randevu" yazdığında AI müsait slotları gösterir, seçimi alır, takvime kaydeder, onay mesajı gönderir.' },
      { title: 'Hatırlatma ve iptal', body: 'Bir gün önce ve 2 saat önce otomatik hatırlatma. Müşteri iptal isterse AI alternatif slot önerir, kaydı günceller.' },
      { title: 'Hizmet ve fiyat bilgisi', body: 'Hizmet listesi, süre ve fiyatlar AI tarafından anında iletilir. Personel tercihi varsa müsaitlik kontrol edilir.' },
    ],
    benefits: [
      'Google Calendar otomatik senkronizasyonu',
      'Hatırlatma mesajları no-show oranını yarıya düşürür',
      'Müşterileriniz hangi saatte olursa olsun randevu alabilir',
    ],
    keywords: ['güzellik salonu whatsapp randevu', 'kuaför randevu otomasyonu', 'estetik klinik chatbot', 'salon ai randevu', 'whatsapp randevu hatırlatma', 'güzellik merkezi randevu sistemi'],
  },
  'whatsapp-destek-otomasyonu': {
    slug: 'whatsapp-destek-otomasyonu',
    channel: 'whatsapp',
    industry: 'destek',
    title: 'Müşteri Desteği İçin WhatsApp Otomasyonu — AI + Canlı Temsilci',
    metaDescription: 'Müşteri destek operasyonlarınızı WhatsApp üzerinden AI ile otomatikleştirin. Sıkça sorulanlara anında yanıt, karmaşık konularda canlı temsilciye sorunsuz handoff.',
    heroTitle: 'Müşteri Desteğinizi WhatsApp\'tan AI ile Yönetin',
    heroSubtitle: 'WhatsApp\'tan gelen destek taleplerinin yüzde 70\'ini AI çözer; karmaşık ya da hassas konular canlı temsilciye konuşma geçmişiyle birlikte aktarılır. Tek panelden tüm operasyon.',
    useCases: [
      { title: 'Birinci basamak destek', body: 'AI sıkça sorulan soruları (kargo, iade, hesap, fiyat) anında yanıtlar. Müşteri tekrar etmek zorunda kalmaz, ekibiniz sadece karmaşık konuya odaklanır.' },
      { title: 'AI → canlı temsilci handoff', body: 'AI cevaplayamadığında veya müşteri canlı destek istediğinde konuşma, tüm geçmişiyle birlikte canlı temsilciye geçer. Müşteri başa dönmez.' },
      { title: '7/24 yanıt verme', body: 'Hafta sonu, gece, tatil — operasyonunuz hiç durmaz. Müşteri her zaman saniyeler içinde ilk yanıtı alır.' },
    ],
    benefits: [
      'Ekip yükünü ortalama yüzde 60 azaltır',
      'Çözüm süresini saatlerden saniyelere indirir',
      'Müşteri memnuniyet skoru (CSAT) ortalama yüzde 25 artar',
    ],
    keywords: ['whatsapp müşteri destek otomasyonu', 'whatsapp ai canlı destek', 'çağrı merkezi whatsapp', 'whatsapp helpdesk', 'müşteri destek chatbot türkçe'],
  },

  // ───────────── Telefon ─────────────
  'telefon-e-ticaret-ai': {
    slug: 'telefon-e-ticaret-ai',
    channel: 'telefon',
    industry: 'e-ticaret',
    title: 'E-ticaret İçin Telefon AI Asistanı — Sipariş ve Kargo Aramaları',
    metaDescription: 'E-ticaret siteniz için sesli AI çağrı asistanı. Müşteri telefonla sipariş durumu sorduğunda kargo entegrasyonundan bilgiyi çeker, doğru yanıtı doğal Türkçeyle iletir.',
    heroTitle: 'E-ticaret Çağrılarınızı Sesli AI ile Yönetin',
    heroSubtitle: 'Müşterileriniz telefonla aradığında doğal Türkçe konuşan AI asistan yanıt verir. Sipariş takibi, kargo bilgisi, iade talebi ve ürün soruları otomatik çözülür.',
    useCases: [
      { title: 'Sesli sipariş takibi', body: 'Müşteri arar, sipariş numarasını söyler, AI kargo entegrasyonundan durumu çeker ve sözlü olarak iletir. Tahmin yok, gerçek veri.' },
      { title: 'İade ve değişim aramaları', body: 'AI iade politikasını anlatır, ürün doğrulaması yapar, kargo etiketi gönderir. Karmaşık iade durumları operasyon ekibine yönlendirilir.' },
      { title: 'Stok ve teslimat soruları', body: '"Bu ürün ne zaman gelir?" gibi soruları AI ürün kataloğundan ve stok sisteminden bilgi çekerek anında yanıtlar.' },
    ],
    benefits: [
      'Telefon meşgul olduğu için kaçırılan satış sıfıra iner',
      'Bulutfon ve Netgsm SIP trunk\'larıyla 5-10 dakikada kurulum',
      'Sesi insan gibi doğal — robotik tonlama yok',
    ],
    keywords: ['e-ticaret telefon ai', 'sesli ai e-ticaret', 'telefon sipariş takip', 'e-ticaret çağrı merkezi otomasyonu', 'sesli yapay zeka e-ticaret'],
  },
  'telefon-restoran-ai': {
    slug: 'telefon-restoran-ai',
    channel: 'telefon',
    industry: 'restoran',
    title: 'Restoran İçin Telefon AI — Otomatik Rezervasyon ve Paket Sipariş',
    metaDescription: 'Restoranlar için sesli AI çağrı asistanı: telefon rezervasyonu, paket sipariş ve menü sorularını otomatik yanıtlar. Yoğun saatlerde müşteri kaybetmezsiniz.',
    heroTitle: 'Restoranınıza Telefonla Gelen Aramalara 7/24 AI Yanıtı',
    heroSubtitle: 'Müşteri telefonla aradığında doğal Türkçe konuşan sesli AI; rezervasyon alır, paket sipariş yönetir, menü hakkında bilgi verir, hatırlatma çağrısı yapar.',
    useCases: [
      { title: 'Telefon rezervasyonu', body: 'AI müsait masaları kontrol eder, müşteriden tarih, saat ve kişi sayısını alır, rezervasyon kaydeder, sözlü onay verir.' },
      { title: 'Paket sipariş aramaları', body: 'Müşteri menüden seçim yapar, AI sipariş kaydeder, adres ve ödeme bilgisini doğrular, mutfağa otomatik iletir.' },
      { title: 'Menü ve saat soruları', body: 'Hangi gün hangi yemek var, kapanış saati, konum gibi soruları AI saniyeler içinde yanıtlar.' },
    ],
    benefits: [
      'Yoğun saatlerde her arama yanıtlanır',
      'Bulutfon ve Netgsm 0850 numaraları kutudan çıkar',
      'No-show için otomatik hatırlatma araması',
    ],
    keywords: ['restoran telefon ai', 'restoran sesli rezervasyon', 'restoran çağrı otomasyonu', 'paket sipariş telefon ai', 'restoran çağrı merkezi'],
  },
  'telefon-salon-ai': {
    slug: 'telefon-salon-ai',
    channel: 'telefon',
    industry: 'salon',
    title: 'Güzellik Salonu İçin Telefon AI — Randevu ve Hatırlatma Aramaları',
    metaDescription: 'Salonlar için sesli AI çağrı asistanı: telefon randevusu alır, iptal yönetir, hatırlatma araması yapar. Google Calendar entegre, doğal Türkçe konuşma.',
    heroTitle: 'Salonunuza Telefon Üzerinden Otomatik Randevu',
    heroSubtitle: 'Müşterileriniz aradığında AI sesli asistan müsait saatleri sorar, hizmet tercihini alır, randevuyu kaydeder. Bir gün öncesinden hatırlatma çağrısı otomatik.',
    useCases: [
      { title: 'Telefonla randevu alma', body: 'Müşteri arar, "yarın saçımı kestirmek istiyorum" der; AI müsait slotları sözlü olarak iletir, tercihi alır, takvime kaydeder.' },
      { title: 'Hatırlatma çağrısı', body: 'Randevudan bir gün önce AI otomatik arar, "yarın saat 14:00 randevunuz var, devam mı?" diye sorar, yanıtı kayda alır.' },
      { title: 'İptal ve değişiklik', body: 'Müşteri iptal etmek istediğinde AI alternatif slot önerir, randevuyu günceller, müsait olduğu takdirde başka müşteriye yer açar.' },
    ],
    benefits: [
      'Resepsiyon yoğunken telefon kaçırılmaz',
      'Hatırlatma çağrıları no-show oranlarını yarıya indirir',
      'Google Calendar canlı entegrasyon',
    ],
    keywords: ['salon telefon ai', 'kuaför sesli randevu', 'estetik klinik çağrı otomasyonu', 'salon hatırlatma araması', 'güzellik merkezi telefon ai'],
  },
  'telefon-destek-ai': {
    slug: 'telefon-destek-ai',
    channel: 'telefon',
    industry: 'destek',
    title: 'Müşteri Destek İçin Telefon AI — Çağrı Merkezi Otomasyonu',
    metaDescription: 'Çağrı merkezi operasyonlarınızı AI ile otomatikleştirin: sesli AI birinci basamak destek verir, karmaşık konular canlı temsilciye yönlendirilir. Kampanya araması da yapılır.',
    heroTitle: 'Çağrı Merkezinizi AI ile Bir Sonraki Seviyeye Taşıyın',
    heroSubtitle: 'Sesli AI asistan gelen aramaları ilk basamakta yanıtlar, sıkça sorulan soruları çözer, gerektiğinde temsilciye yönlendirir. Çıkış aramalarında kampanya, hatırlatma ve anket yapar.',
    useCases: [
      { title: 'Birinci basamak destek', body: 'AI hesap bakiyesi, kullanıcı adı sıfırlama, fatura kopyası gibi sıkça sorulan soruları sözlü olarak yanıtlar; ekip sadece karmaşık konuyla ilgilenir.' },
      { title: 'Kampanya ve anket araması', body: 'CSV listesinden AI otomatik arama yapar; yeni ürün duyurur, müşteri memnuniyet anketi uygular, sonuçları dashboard\'da raporlar.' },
      { title: 'Tahsilat ve hatırlatma', body: 'Borç hatırlatma, randevu hatırlatma, abonelik yenileme aramalarını AI nazikçe yapar; ödemeleri ve onayları kayıt altına alır.' },
    ],
    benefits: [
      'Çağrı merkezi yükünü ortalama yüzde 50 azaltır',
      'Müşteri bekleme süresi sıfıra iner',
      'Toplu kampanya araması (CSV/XLSX) destekler',
    ],
    keywords: ['çağrı merkezi ai otomasyonu', 'telefon destek ai', 'kampanya araması ai', 'tahsilat hatırlatma ai', 'çağrı merkezi türkçe ai'],
  },

  // ───────────── Web Sohbet ─────────────
  'web-sohbet-e-ticaret': {
    slug: 'web-sohbet-e-ticaret',
    channel: 'web-sohbet',
    industry: 'e-ticaret',
    title: 'E-ticaret İçin Web Sohbet — Sitenize AI Destekli Canlı Sohbet',
    metaDescription: 'E-ticaret sitenize tek satır embed ile AI sohbet widget\'ı ekleyin. Ürün sorularına anında yanıt, sipariş takibi, sepet yardımı; canlı temsilciye sorunsuz geçiş.',
    heroTitle: 'E-ticaret Sitenize 5 Dakikada AI Sohbet Aracı',
    heroSubtitle: 'Sitenizin head bölümüne tek satır script ekleyin, widget anında aktif olsun. Ziyaretçi ürün sorar, sipariş takip eder, sepetinde takılırsa AI yardım eder.',
    useCases: [
      { title: 'Ürün sayfası soruları', body: 'Ziyaretçi "kaç günde gelir?" veya "kargo ücretsiz mi?" sorduğunda AI ürün ve gönderim verisinden anında yanıt verir.' },
      { title: 'Sepet yardımı', body: 'Ödeme adımlarında takılan müşteriyi AI yönlendirir; kupon kodu, ödeme yöntemi, teslimat sorularına anında yanıt verir.' },
      { title: 'Sipariş durumu', body: 'Giriş yapan müşterinin sipariş durumunu AI hesabından çeker ve widget içinde gösterir; tek tık ile takip ekranına yönlendirir.' },
    ],
    benefits: [
      'Tek <script> ile WordPress, Shopify, ikas, Webflow uyumlu',
      'Sepet terk oranını yüzde 15-25 azaltır',
      'Mobilde tam ekran, masaüstünde köşe pop-up',
    ],
    keywords: ['e-ticaret web chat', 'shopify chat widget', 'site chatbot türkçe', 'e-ticaret canlı sohbet', 'wordpress chat botu'],
  },
  'web-sohbet-restoran': {
    slug: 'web-sohbet-restoran',
    channel: 'web-sohbet',
    industry: 'restoran',
    title: 'Restoran İçin Web Sohbet — Sitenizden AI Destekli Rezervasyon',
    metaDescription: 'Restoran sitenize AI sohbet widget\'ı: ziyaretçilere menü, çalışma saatleri, rezervasyon ve paket sipariş hakkında 7/24 anında bilgi. Kurulum tek satır.',
    heroTitle: 'Restoran Sitenize Anında Bilgi Veren Sohbet Aracı',
    heroSubtitle: 'Sitenizi gezen müşteri, AI sohbet widget\'ı ile menü, çalışma saatleri ve rezervasyon hakkında anında bilgi alır. Ön rezervasyon talebi olursa form açılır.',
    useCases: [
      { title: 'Menü ve fiyat soruları', body: 'Ziyaretçi "vegan seçeneği var mı?" veya "akşam menüsü ne kadar?" diye sorduğunda AI menüden bilgi çekip anında yanıtlar.' },
      { title: 'Online rezervasyon talebi', body: 'Site üzerinden rezervasyon talebi alındığında AI tarihi, saati ve kişi sayısını sorar, kayıt eder, onay e-postası ya da WhatsApp mesajı gönderir.' },
      { title: 'Çalışma saatleri ve konum', body: 'AI saatleri, kapanış zamanını, mevcut yerleri ve harita linkini saniyeler içinde sunar.' },
    ],
    benefits: [
      'Site ziyaretçisi telefon açmadan rezervasyon yapar',
      'Mobil cihazlarda mükemmel deneyim',
      'Rezervasyonu Google Calendar\'a aktarır',
    ],
    keywords: ['restoran web chat', 'restoran site chatbot', 'restoran online rezervasyon', 'restoran site canlı sohbet', 'restoran ai widget'],
  },
  'web-sohbet-salon': {
    slug: 'web-sohbet-salon',
    channel: 'web-sohbet',
    industry: 'salon',
    title: 'Güzellik Salonu İçin Web Sohbet — Sitenizden Otomatik Randevu',
    metaDescription: 'Güzellik salonu sitenize AI sohbet widget\'ı ekleyin. Ziyaretçi hizmetler, fiyatlar ve randevu hakkında anında bilgi alır; randevu talebini doğrudan rezerve eder.',
    heroTitle: 'Salon Sitenize Otomatik Randevu Sohbeti',
    heroSubtitle: 'Sitenizi ziyaret eden müşteri AI widget üzerinden hizmet ve fiyat bilgisi alır, müsait saatleri görür, randevuyu site üzerinden alır. Salon panelinize anında düşer.',
    useCases: [
      { title: 'Hizmet ve fiyat görüntüleme', body: 'AI tüm hizmetlerinizi, sürelerini ve fiyatları widget içinde gösterir; kişiselleştirilmiş öneri yapar.' },
      { title: 'Online randevu talebi', body: 'Müşteri tarih ve saat seçer, AI Google Calendar\'dan müsaitlik kontrol eder, randevuyu kaydeder, onay verir.' },
      { title: 'Hizmet danışmanlığı', body: '"Hangi yüz bakımı bana uygun?" gibi sorularda AI bilgi tabanından danışmanlık verir, gerekirse uzmana yönlendirir.' },
    ],
    benefits: [
      'Resepsiyon meşgulken ziyaretçi randevu kaybetmez',
      'Site ziyaretinden randevuya dönüşüm artar',
      'Tek panelde site, WhatsApp ve telefon randevuları',
    ],
    keywords: ['güzellik salonu web chat', 'salon online randevu sistemi', 'kuaför site chatbot', 'salon web sohbet', 'estetik klinik widget'],
  },
  'web-sohbet-destek': {
    slug: 'web-sohbet-destek',
    channel: 'web-sohbet',
    industry: 'destek',
    title: 'Müşteri Destek İçin Web Sohbet — AI Destekli 7/24 Help Desk',
    metaDescription: 'Sitenize AI sohbet widget\'ı ekleyerek 7/24 müşteri desteği sunun. Sıkça sorulanlara anında yanıt, ticket açma, canlı temsilciye sorunsuz handoff.',
    heroTitle: 'Sitenizden 7/24 AI Müşteri Desteği',
    heroSubtitle: 'AI sohbet widget\'ınız müşterilerinizin sorularını saniyeler içinde yanıtlar; ticket açar, canlı temsilciye yönlendirir, geçmişi korur.',
    useCases: [
      { title: 'Bilgi tabanı yanıtları', body: 'Yüklediğiniz PDF, SSS ve dokümanlardan AI bağlam çekerek tutarlı, doğru yanıtlar üretir.' },
      { title: 'Canlı temsilci handoff', body: 'AI cevaplayamadığında veya müşteri istediğinde konuşma canlı temsilciye geçer; tüm sohbet geçmişi temsilcide görünür.' },
      { title: 'Ticket otomasyonu', body: 'Müşteri belirli kategoride ticket açtığında AI doğru ekibe yönlendirir, öncelik belirler, otomatik bildirim gönderir.' },
    ],
    benefits: [
      'Destek ekibi yükünü yüzde 60 azaltır',
      'Tüm sitelere tek <script> ile eklenir',
      'Sohbet geçmişi ve analitik raporlama',
    ],
    keywords: ['web sohbet destek', 'help desk chatbot', 'site canlı destek ai', 'müşteri destek widget', 'web chat helpdesk'],
  },

  // ───────────── E-posta ─────────────
  'email-e-ticaret-otomasyonu': {
    slug: 'email-e-ticaret-otomasyonu',
    channel: 'e-posta',
    industry: 'e-ticaret',
    title: 'E-ticaret İçin E-posta Otomasyonu — Gmail/Outlook AI Yanıt',
    metaDescription: 'E-ticaret e-posta yanıtlarını AI ile otomatikleştirin. Sipariş, fatura ve iade e-postalarına AI saniyeler içinde yanıt verir; hassas konular ekibinize iletilir.',
    heroTitle: 'E-posta Kutunuzu AI ile Yönetin',
    heroSubtitle: 'Gmail veya Outlook hesabınızı bağlayın; gelen müşteri e-postalarına AI doğru bilgileri çekerek yanıt taslağı yazar veya otomatik gönderir.',
    useCases: [
      { title: 'Sipariş ve kargo e-postaları', body: 'Müşteri "siparişim nerede?" yazdığında AI sipariş numarasını arar, kargo durumunu çeker ve yanıt eki olarak takip linkini gönderir.' },
      { title: 'Fatura talepleri', body: '"Faturamı bulamadım" e-postalarına AI sipariş numarasını talep eder, faturayı sistemden çekip PDF olarak gönderir.' },
      { title: 'İade taleplerini işleme', body: 'AI iade politikasını kontrol eder, ürün doğrulaması yapar, kargo etiketi hazırlar ve müşteriye yanıt verir.' },
    ],
    benefits: [
      'Gmail ve Outlook OAuth ile güvenli bağlantı',
      'AI confidence düşükse insan onayı modu otomatik aktif',
      'Aynı bilgi tabanı tüm kanallarda tutarlı yanıt',
    ],
    keywords: ['e-ticaret e-posta otomasyonu', 'gmail ai yanıt', 'outlook e-ticaret entegrasyonu', 'sipariş e-posta otomasyonu', 'e-ticaret destek e-posta'],
  },
  'email-restoran-bildirim': {
    slug: 'email-restoran-bildirim',
    channel: 'e-posta',
    industry: 'restoran',
    title: 'Restoran İçin E-posta Otomasyonu — Rezervasyon Onay ve Hatırlatma',
    metaDescription: 'Restoran rezervasyon e-postalarınızı AI ile otomatikleştirin: onay, hatırlatma, iptal mesajları otomatik. Özel etkinlik talepleri ekibinize iletilir.',
    heroTitle: 'Restoran E-posta İletişiminizi AI ile Yönetin',
    heroSubtitle: 'Rezervasyon onayı, hatırlatma, etkinlik talebi gibi e-postaları AI hızlı ve doğru şekilde yönetir; karmaşık talepler operasyona iletilir.',
    useCases: [
      { title: 'Rezervasyon onay e-postası', body: 'Online rezervasyon yapıldığında AI otomatik onay e-postası gönderir; menü, gün notu ve harita linkini ekler.' },
      { title: 'Etkinlik ve grup talepleri', body: 'Doğum günü, kurumsal yemek, özel mönü gibi taleplerde AI ön bilgi toplar, talebi yönetime iletir.' },
      { title: 'Hatırlatma ve takip', body: 'Rezervasyon öncesi otomatik hatırlatma, sonrası geri bildirim e-postası AI tarafından zamanlı gönderilir.' },
    ],
    benefits: [
      'Hatırlatma e-postaları no-show oranını düşürür',
      'Müşteri geri bildirimi otomatik toplanır',
      'Yönetim sadece özel taleplere odaklanır',
    ],
    keywords: ['restoran e-posta otomasyonu', 'rezervasyon onay e-postası', 'restoran müşteri iletişimi', 'restoran ai e-posta', 'restoran takip e-postası'],
  },
  'email-salon-takip': {
    slug: 'email-salon-takip',
    channel: 'e-posta',
    industry: 'salon',
    title: 'Güzellik Salonu İçin E-posta Otomasyonu — Randevu ve Sadakat',
    metaDescription: 'Güzellik salonu e-posta iletişiminizi AI ile yönetin: randevu onayı, hatırlatma, sadakat programı, kampanya bildirimi. Tüm yazışmalar profesyonel ve zamanlı.',
    heroTitle: 'Salon Müşteri İletişimini E-posta İle Profesyonelleştirin',
    heroSubtitle: 'AI randevu onaylarını, hatırlatmaları, sadakat puanlarını ve özel kampanyaları otomatik gönderir. Müşteriniz ihmal edilmiş hissetmez.',
    useCases: [
      { title: 'Randevu onay e-postası', body: 'AI rezerve edilen tarih, hizmet, fiyat ve notları içeren onay e-postasını anında gönderir.' },
      { title: 'Sadakat ve kampanya', body: 'Müşteri segmentine göre AI doğum günü tebriği, sadakat puanı bildirimi, özel kampanyaları zamanlı gönderir.' },
      { title: 'Pre-care ve aftercare bilgisi', body: 'Estetik işlem öncesi-sonrası bakım bilgileri AI tarafından doğru zamanda iletilir.' },
    ],
    benefits: [
      'Müşteri sadakati ölçülebilir şekilde artar',
      'Sezon kampanyaları otomatik tetiklenir',
      'Yönetim manuel e-posta yazma yükünden kurtulur',
    ],
    keywords: ['güzellik salonu e-posta otomasyonu', 'salon müşteri iletişimi', 'salon kampanya e-postası', 'salon ai e-posta', 'güzellik merkezi takip'],
  },
  'email-destek-otomasyonu': {
    slug: 'email-destek-otomasyonu',
    channel: 'e-posta',
    industry: 'destek',
    title: 'Müşteri Destek İçin E-posta Otomasyonu — AI Yanıt + İnsan Onayı',
    metaDescription: 'Müşteri destek e-postalarınızı AI ile otomatikleştirin. Sıkça sorulanlara saniyeler içinde yanıt, hassas konularda insan onayı. Gmail ve Outlook entegre.',
    heroTitle: 'Destek E-posta Kutunuzu AI ile Yönetin',
    heroSubtitle: 'AI gelen e-postaları kategorize eder, sıkça sorulanlara doğrudan yanıt verir, karmaşık ya da hassas konuları onay modunda ekibinize iletir.',
    useCases: [
      { title: 'Otomatik kategorize ve etiketleme', body: 'Gelen e-postalar konuya göre etiketlenir (sipariş, fatura, destek, lead, spam) ve doğru ekip üyesine yönlendirilir.' },
      { title: 'AI yanıt + insan onayı', body: 'AI yanıt taslağını yazar; siz onaylayıp gönderirsiniz veya AI confidence yüksekse otomatik gönderir.' },
      { title: 'Bilgi tabanı tabanlı yanıt', body: 'Yüklediğiniz dokümanlardan AI bağlam çekerek tutarlı, doğru yanıtlar üretir; tahmin yapmaz.' },
    ],
    benefits: [
      'Gmail ve Outlook OAuth ile güvenli',
      'Hassas e-postalar otomatik insan onayına iter',
      'Yanıt süresi saatlerden saniyelere düşer',
    ],
    keywords: ['e-posta destek otomasyonu', 'gmail ai yanıt', 'outlook destek otomasyonu', 'müşteri destek e-posta', 'e-posta chatbot'],
  },

  // ───────────── Klinik & Sağlık (4 channels) ─────────────
  'whatsapp-klinik-randevu': {
    slug: 'whatsapp-klinik-randevu',
    channel: 'whatsapp',
    industry: 'klinik',
    title: 'Klinik İçin WhatsApp Randevu Otomasyonu — Doktor & Estetik',
    metaDescription: 'Klinikler ve sağlık merkezleri için WhatsApp\'tan otomatik randevu, hatırlatma ve doktor seçimi. KVKK uyumlu, sağlık verisi korunur.',
    heroTitle: 'Kliniğinizin Randevu İletişimini WhatsApp\'tan Yönetin',
    heroSubtitle: 'Hastalarınız WhatsApp üzerinden doktor seçer, müsait slotları görür, randevu alır ve hatırlatmaları otomatik alır. AI sağlık verilerinizi KVKK uyumlu işler.',
    useCases: [
      { title: 'Doktor seçimi ve randevu', body: 'Hasta "kardiyoloji randevusu istiyorum" yazdığında AI uzmanları listeler, müsait slotları gösterir, randevuyu kaydeder.' },
      { title: 'Hatırlatma ve onay', body: 'Randevudan bir gün önce ve 2 saat önce otomatik hatırlatma. Hasta onaylar veya iptal eder, kayıt anında güncellenir.' },
      { title: 'Sıkça sorulan tıbbi olmayan sorular', body: 'Ücretler, çalışma saatleri, adres, otopark gibi soruları AI anında yanıtlar. Tıbbi konular asla AI tarafından yanıtlanmaz; sekreterye yönlendirilir.' },
    ],
    benefits: [
      'KVKK uyumlu sağlık veri yönetimi',
      'Hasta no-show oranı yüzde 40 azalır',
      'Sekreter yükü hafifler, sadece tıbbi konulara odaklanır',
    ],
    keywords: ['klinik whatsapp randevu', 'doktor randevu whatsapp', 'estetik klinik chatbot', 'sağlık merkezi otomasyon', 'tıbbi randevu otomasyonu'],
  },
  'telefon-klinik-randevu': {
    slug: 'telefon-klinik-randevu',
    channel: 'telefon',
    industry: 'klinik',
    title: 'Klinik İçin Telefon AI — Otomatik Randevu Aramaları',
    metaDescription: 'Klinikler için sesli AI çağrı asistanı: telefonla randevu alır, hatırlatma araması yapar, doktor müsaitliğini kontrol eder. Doğal Türkçe konuşma.',
    heroTitle: 'Hasta Aramalarınıza 7/24 Sesli AI Yanıtı',
    heroSubtitle: 'Hastalarınız telefonla aradığında AI sesli asistan doktor müsaitliğini kontrol eder, randevu alır, hatırlatma yapar. Sekreter meşgulken aramalar kaybolmaz.',
    useCases: [
      { title: 'Telefon randevu alma', body: 'AI hastayı dinler, hangi uzman istediğini anlar, takvimi kontrol eder, randevuyu sözlü olarak verir ve sisteme kaydeder.' },
      { title: 'Hatırlatma ve onay araması', body: 'Randevudan bir gün önce AI otomatik arar, hatırlatma verir, hasta gelmeyecekse iptali işler.' },
      { title: 'Sonuç bilgilendirme aramaları', body: 'Tahlil sonuçları hazır olduğunda AI nazikçe bilgilendirme yapar; tıbbi sonuç yorumu için doktora yönlendirir.' },
    ],
    benefits: [
      'Sekreter yokken hiçbir arama kaçmaz',
      'KVKK uyumlu sağlık veri akışı',
      'Bulutfon ve Netgsm SIP entegrasyonu',
    ],
    keywords: ['klinik telefon ai', 'doktor randevu sesli ai', 'sağlık merkezi çağrı otomasyonu', 'klinik sekreter ai', 'tıbbi telefon asistan'],
  },
  'web-sohbet-klinik': {
    slug: 'web-sohbet-klinik',
    channel: 'web-sohbet',
    industry: 'klinik',
    title: 'Klinik Sitesi İçin Web Sohbet — Online Randevu ve Bilgilendirme',
    metaDescription: 'Klinik sitenize AI sohbet widget\'ı: ziyaretçiler hizmet, fiyat ve randevu hakkında 7/24 bilgi alır, online randevu talebi oluşturur.',
    heroTitle: 'Klinik Sitenize AI Destekli Sohbet Aracı',
    heroSubtitle: 'Site ziyaretçileri uzman bilgilerini, hizmet detaylarını ve randevu olanaklarını AI sohbet widget\'ından öğrenir; randevu talebi anında alınır.',
    useCases: [
      { title: 'Hizmet ve fiyat bilgisi', body: 'Hasta hangi tedavinin ne kadar tuttuğunu, ne kadar sürdüğünü AI\'dan anında öğrenir; takip için iletişim formuna yönlendirilir.' },
      { title: 'Online randevu talebi', body: 'Müşteri tarih, saat ve uzman seçer; AI takvimden müsaitlik kontrol eder, randevu kaydeder.' },
      { title: 'Hekim biyografisi ve uzmanlık', body: 'Doktorların özgeçmişi, uzmanlık alanları ve referanslarını AI bilgi tabanından çekip sunar.' },
    ],
    benefits: [
      'Site ziyaretinden randevuya dönüşüm artar',
      'Tıbbi sorulara asla AI yanıt vermez (yönlendirme yapar)',
      'KVKK uyumlu hasta veri yönetimi',
    ],
    keywords: ['klinik web sohbet', 'klinik online randevu sistemi', 'sağlık merkezi chatbot', 'klinik site widget', 'doktor randevu sitesi'],
  },
  'email-klinik-bilgilendirme': {
    slug: 'email-klinik-bilgilendirme',
    channel: 'e-posta',
    industry: 'klinik',
    title: 'Klinik İçin E-posta Otomasyonu — Hatırlatma ve Sonuç Bildirimi',
    metaDescription: 'Klinik e-posta iletişiminizi AI ile yönetin: randevu onayı, hatırlatma, sonuç bilgilendirme, kontrol takibi. KVKK uyumlu, hasta gizliliği korunur.',
    heroTitle: 'Klinik Hasta İletişimi E-posta Otomasyonu',
    heroSubtitle: 'AI randevu onayı, hatırlatma, kontrol takibi ve sonuç bildirim e-postalarını otomatik gönderir. Hassas tıbbi konular insan onayına gider.',
    useCases: [
      { title: 'Randevu onay ve hatırlatma e-postası', body: 'Randevu kaydedildiğinde AI otomatik onay e-postası gönderir; bir gün önce hatırlatma e-postasıyla destekler.' },
      { title: 'Kontrol ve takip e-postaları', body: 'Tedavi sonrası AI takip e-postası gönderir; iyileşme süreci, ilaç hatırlatma, kontrol randevusu öner.' },
      { title: 'Sonuç bildirim e-postası', body: 'Tahlil hazır olduğunda AI nazikçe bilgilendirme e-postası gönderir; sonuç yorumu için doktor randevusu önerir.' },
    ],
    benefits: [
      'KVKK ve gizlilik uyumlu işleme',
      'Hassas tıbbi içerikler için insan onayı modu',
      'Randevu no-show oranı yüzde 35 azalır',
    ],
    keywords: ['klinik e-posta otomasyonu', 'doktor randevu e-postası', 'sağlık merkezi takip e-postası', 'hasta hatırlatma e-postası', 'klinik müşteri iletişimi'],
  },

  // ───────────── Eğitim (4 channels) ─────────────
  'whatsapp-egitim-kayit': {
    slug: 'whatsapp-egitim-kayit',
    channel: 'whatsapp',
    industry: 'egitim',
    title: 'Eğitim İçin WhatsApp — Kurs Kayıt ve Öğrenci Destek',
    metaDescription: 'Kurs ve eğitim kurumları için WhatsApp\'tan otomatik kayıt, ödeme bilgisi, öğrenci sorularına 7/24 yanıt. Veliler ve öğrenciler için ayrı akışlar.',
    heroTitle: 'Eğitim Kurumunuza WhatsApp\'tan Otomatik Kayıt ve Destek',
    heroSubtitle: 'Aday öğrenciler kurslara WhatsApp\'tan kaydolur, mevcut öğrenciler ödev ve devam bilgisi sorar; veliler bilgilendirilir. AI hepsini yönetir.',
    useCases: [
      { title: 'Kurs kayıt ve ödeme', body: 'Aday öğrenci kurs detayını sorar, AI program, fiyat ve seansları açıklar; kayıt formuna yönlendirir, ödeme linkini gönderir.' },
      { title: 'Öğrenci destek soruları', body: 'Mevcut öğrenciler "bu hafta ödev ne?" diye sorar; AI bilgi tabanından çekerek sözlü ya da yazılı cevap verir.' },
      { title: 'Veli bilgilendirme', body: 'Devamsızlık, sınav sonucu, etkinlik duyurusu için AI velilere otomatik mesaj gönderir; sorularını anında yanıtlar.' },
    ],
    benefits: [
      'Kayıt dönüşümü yüzde 25 artar',
      'Veli iletişimi sistematik ve düzenli olur',
      'Öğretmenler sadece eğitime odaklanır',
    ],
    keywords: ['eğitim whatsapp', 'kurs kayıt otomasyonu', 'okul whatsapp chatbot', 'öğrenci destek whatsapp', 'veli iletişimi otomasyonu'],
  },
  'telefon-egitim-kayit': {
    slug: 'telefon-egitim-kayit',
    channel: 'telefon',
    industry: 'egitim',
    title: 'Eğitim İçin Telefon AI — Kayıt ve Bilgilendirme Aramaları',
    metaDescription: 'Eğitim kurumları için sesli AI çağrı asistanı: telefon kayıt, kurs bilgisi, aday değerlendirme. Yoğun kayıt dönemlerinde her arama yanıtlanır.',
    heroTitle: 'Eğitim Kurumunuza Telefonla Gelen Soruları AI Yanıtlasın',
    heroSubtitle: 'Aday öğrenci ve veliler aradığında AI sesli asistan kurs detaylarını anlatır, kayıt sürecini başlatır, müsait randevu sunar. Kayıt sezonunda güçlü destek.',
    useCases: [
      { title: 'Kurs bilgisi ve kayıt aramaları', body: 'AI hangi kursun ne içerdiğini, fiyatını, seans sayısını anlatır, kayıt formuna yönlendirir veya WhatsApp linki gönderir.' },
      { title: 'Aday öğrenci ön değerlendirme', body: 'AI aday öğrencinin seviyesini, hedefini sorgular; uygun kurs önerir, danışman randevusu kaydeder.' },
      { title: 'Veli bilgilendirme aramaları', body: 'Devamsızlık, sınav sonucu, etkinlik duyurusu için AI otomatik veli aramaları yapar; geri dönüşleri kayıt eder.' },
    ],
    benefits: [
      'Kayıt sezonunda hiçbir arama kaçmaz',
      'Aday öğrenci dönüşüm oranı artar',
      'Bulutfon ve Netgsm SIP altyapısı kutudan çıkar',
    ],
    keywords: ['eğitim telefon ai', 'kurs kayıt çağrı otomasyonu', 'okul telefon asistan', 'öğrenci destek araması', 'eğitim çağrı merkezi'],
  },
  'web-sohbet-egitim': {
    slug: 'web-sohbet-egitim',
    channel: 'web-sohbet',
    industry: 'egitim',
    title: 'Eğitim Kurumu Sitesi İçin Web Sohbet — Online Kayıt',
    metaDescription: 'Eğitim kurumu sitenize AI sohbet widget\'ı: ziyaretçiler kurs detayı, fiyat, kayıt için 7/24 bilgi alır, kayıt talebi oluşturur.',
    heroTitle: 'Eğitim Sitenize AI Destekli Kayıt Sohbeti',
    heroSubtitle: 'Site ziyaretçileri kurs ararken AI widget kurslarınızı tanıtır, fiyat verir, kayıt için form açar. Aday lead\'ler kalitelidir.',
    useCases: [
      { title: 'Kurs arama ve eşleştirme', body: 'Ziyaretçi "İngilizce başlangıç kursu" gibi sorgu yapar; AI uygun seçenekleri listeler, eşleştirme yapar.' },
      { title: 'Kayıt talebi oluşturma', body: 'Ziyaretçi karar verince AI kayıt formunu açar, ödeme linkini gönderir veya danışman randevusu önerir.' },
      { title: 'Eğitmen tanıtımı', body: 'Eğitmen biyografileri, deneyim ve referansları AI bilgi tabanından çekip sunar; güven oluşturur.' },
    ],
    benefits: [
      'Site ziyaretinden lead\'e dönüşüm artar',
      'Mobilde mükemmel deneyim',
      'Kurs kataloğu otomatik güncellenir',
    ],
    keywords: ['eğitim web chat', 'okul site chatbot', 'kurs kayıt online', 'eğitim sitesi widget', 'kurs sohbet aracı'],
  },
  'email-egitim-bilgilendirme': {
    slug: 'email-egitim-bilgilendirme',
    channel: 'e-posta',
    industry: 'egitim',
    title: 'Eğitim İçin E-posta Otomasyonu — Veli ve Öğrenci Bildirimleri',
    metaDescription: 'Eğitim kurumları için AI e-posta otomasyonu: kayıt onayı, ders programı, sınav sonucu, veli bilgilendirme. Tüm iletişim profesyonel ve zamanlı.',
    heroTitle: 'Eğitim Kurumu E-posta İletişiminizi AI ile Yönetin',
    heroSubtitle: 'AI kayıt onaylarını, ders programlarını, sınav sonuçlarını ve etkinlik duyurularını öğrenci ve velilere zamanında ve profesyonelce gönderir.',
    useCases: [
      { title: 'Kayıt onay e-postası', body: 'Yeni kayıt yapıldığında AI hoş geldin e-postası gönderir; ders programı, kurallar ve iletişim bilgilerini ekler.' },
      { title: 'Sınav sonucu ve veli e-postası', body: 'Sınav sonuçları ve değerlendirmeler AI tarafından velilere düzenli gönderilir; performans grafikleri eklenir.' },
      { title: 'Etkinlik ve duyuru e-postaları', body: 'Konferans, gezi, kayıt yenileme dönemi gibi duyurular AI tarafından zamanında gönderilir.' },
    ],
    benefits: [
      'Veli memnuniyeti ölçülebilir şekilde artar',
      'Yönetim manuel e-posta yazmaktan kurtulur',
      'Aileye düzenli bilgi akışı oluşur',
    ],
    keywords: ['eğitim e-posta otomasyonu', 'okul veli bildirimi', 'kurs kayıt e-postası', 'eğitim takip e-postası', 'öğrenci iletişim sistemi'],
  },

  // ───────────── Instagram DM (6 industries) ─────────────
  'instagram-e-ticaret': {
    slug: 'instagram-e-ticaret',
    channel: 'instagram',
    industry: 'e-ticaret',
    title: 'E-ticaret İçin Instagram DM Chatbot — Sipariş ve Ürün Sorgusu',
    metaDescription: 'E-ticaret markanızın Instagram DM iletişimini AI ile otomatikleştirin. Ürün sorgusu, sipariş takibi ve sepet kurtarma. Reklamdan gelen DM\'ler kalifiye olur.',
    heroTitle: 'Instagram Mağazanıza Otomatik DM Yanıtı',
    heroSubtitle: 'Ürün postlarınıza ya da story sticker\'ınıza gelen mesajlara AI saniyeler içinde yanıt verir. Stok bilgisi, fiyat, sipariş ve kargo durumu sözlü olarak iletilir.',
    useCases: [
      { title: 'Ürün postu DM\'leri', body: '"Bu ürün stokta var mı?" sorusuna AI ürün katalogundan stok ve fiyat bilgisi çekerek anında yanıt verir; satın alma linkini sunar.' },
      { title: 'Sipariş takibi', body: 'Müşteri "siparişim nerede?" diye sorduğunda AI sipariş numarasını arar, kargo entegrasyonundan durumu çekip iletir.' },
      { title: 'Reklamdan gelen lead', body: 'Instagram reklamlarından DM gelen lead\'leri AI kalifiye eder, ihtiyaç sorgulaması yapar, satışa hazır olanları satış ekibine iletir.' },
    ],
    benefits: [
      'DM yanıt süresi saniyelere iner',
      'Reklam ROI\'si yüzde 30\'a kadar artar',
      'Tüm Meta ekosistem (Instagram + Facebook) tek panelde',
    ],
    keywords: ['instagram dm chatbot', 'instagram e-ticaret otomasyonu', 'instagram ai yanıt', 'instagram sipariş takip', 'meta dm otomasyonu'],
  },
  'instagram-restoran': {
    slug: 'instagram-restoran',
    channel: 'instagram',
    industry: 'restoran',
    title: 'Restoran İçin Instagram DM — Rezervasyon ve Menü Soruları',
    metaDescription: 'Restoranınızın Instagram DM iletişimini AI ile yönetin. Rezervasyon, menü, paket sipariş ve özel etkinlik soruları otomatik yanıtlanır.',
    heroTitle: 'Restoranınıza Instagram\'dan Gelen Mesajlara 7/24 AI Yanıtı',
    heroSubtitle: 'Story\'lerinize ve gönderilerinize gelen DM\'leri AI yanıtlar; rezervasyon alır, menü gösterir, paket sipariş işler. Sosyal medyadan satış kaçmaz.',
    useCases: [
      { title: 'Rezervasyon DM\'leri', body: '"Bu cumartesi 4 kişilik masa var mı?" sorusuna AI takvimi kontrol eder, müsait ise rezervasyonu kaydeder, onay verir.' },
      { title: 'Menü ve fiyat soruları', body: 'AI menü pdf\'ini gönderir, gün menüsünü açıklar, vegan/vejetaryen seçenekleri listeler.' },
      { title: 'Özel etkinlik talebi', body: 'Doğum günü, kurumsal yemek, özel mönü talepleri AI tarafından ön bilgi alındıktan sonra yöneticiye iletilir.' },
    ],
    benefits: [
      'Sosyal medyadan rezervasyon dönüşümü artar',
      'Hatırlatma mesajları no-show azaltır',
      'Instagram + WhatsApp aynı asistanla yönetilir',
    ],
    keywords: ['instagram restoran dm', 'restoran instagram rezervasyon', 'restoran sosyal medya otomasyon', 'instagram menü soru', 'restoran instagram chatbot'],
  },
  'instagram-salon': {
    slug: 'instagram-salon',
    channel: 'instagram',
    industry: 'salon',
    title: 'Güzellik Salonu İçin Instagram DM — Otomatik Randevu',
    metaDescription: 'Salonunuzun Instagram DM iletişimini AI ile yönetin. Story randevu sticker\'larından gelen mesajlar, fiyat soruları ve hizmet danışmanlığı otomatik.',
    heroTitle: 'Instagram\'dan Gelen Randevu Taleplerini AI Yönetsin',
    heroSubtitle: 'Story\'lerinize "randevu" sticker\'ı koyduğunuzda gelen DM\'lere AI saniyeler içinde yanıt verir; müsait saat sunar, randevuyu kaydeder.',
    useCases: [
      { title: 'Story randevu sticker DM\'leri', body: 'Story\'lere randevu sticker koyduğunuzda gelen otomatik mesajları AI yanıtlar, müsait slotları gösterir.' },
      { title: 'Hizmet ve fiyat danışmanlığı', body: 'Müşteri "saç boyası ne kadar?" gibi sorduğunda AI hizmet listesi, süre ve fiyat bilgisini iletir.' },
      { title: 'Önceki müşteri bağlantısı', body: 'Daha önce kayıt olmuş müşteriyse AI hatırlar, geçmiş randevuları referans verir, sadakat indirimini hatırlatır.' },
    ],
    benefits: [
      'Story\'lerden randevuya dönüşüm artar',
      'Sadakat programı otomatik takip',
      'Randevu sistemi Google Calendar ile senkron',
    ],
    keywords: ['salon instagram dm', 'kuaför instagram randevu', 'estetik klinik instagram', 'salon sosyal medya otomasyon', 'güzellik merkezi instagram'],
  },
  'instagram-destek': {
    slug: 'instagram-destek',
    channel: 'instagram',
    industry: 'destek',
    title: 'Müşteri Destek İçin Instagram DM Otomasyonu',
    metaDescription: 'Markanızın Instagram destek operasyonlarını AI ile otomatikleştirin. Sıkça sorulanlara saniyeler içinde yanıt, karmaşık konularda canlı temsilciye sorunsuz handoff.',
    heroTitle: 'Instagram Destek Operasyonunuzu AI ile Hızlandırın',
    heroSubtitle: 'Yorumlardan, story\'lerden ve gönderilerden gelen DM destek taleplerine AI hızlı yanıt verir. Karmaşık konular ekibe iletilir, müşteri başa dönmez.',
    useCases: [
      { title: 'SSS otomasyonu', body: 'Müşteri "iade nasıl yapılır?" sorduğunda AI politikayı anlatır, formu gönderir, iade kargosu hazırlar.' },
      { title: 'Şikayet yönetimi', body: 'Olumsuz yorumlardan gelen DM\'leri AI tonu yumuşatarak yanıtlar, çözüm önerir, gerekirse yöneticiye iletir.' },
      { title: 'Lead toplama', body: 'Marka takipçilerinden gelen sorgular AI tarafından kalifiye edilir, ilgi alanlarına göre etiketlenir, satış ekibine iletilir.' },
    ],
    benefits: [
      'DM bekleme süresi sıfıra iner',
      'Marka itibarı korunur',
      'Şikayet yönetimi sistematik hale gelir',
    ],
    keywords: ['instagram destek otomasyonu', 'instagram müşteri hizmetleri', 'instagram dm yönetimi', 'sosyal medya destek ai', 'meta destek otomasyonu'],
  },
  'instagram-klinik': {
    slug: 'instagram-klinik',
    channel: 'instagram',
    industry: 'klinik',
    title: 'Klinik İçin Instagram DM — Estetik ve Sağlık Sorgu Yanıtları',
    metaDescription: 'Estetik kliniği ve sağlık merkezleri için Instagram DM otomasyonu. Hizmet detayı, fiyat aralığı ve randevu için 7/24 yanıt. Tıbbi sorular doktora iletilir.',
    heroTitle: 'Klinik Instagram\'ınıza Gelen DM\'leri AI Yönetsin',
    heroSubtitle: 'Estetik öncesi-sonrası fotoğraflarınıza ve hizmet postlarınıza gelen DM\'leri AI bilgilendirir; tıbbi sorular doğrudan sekrekterye veya doktora iletilir.',
    useCases: [
      { title: 'Estetik hizmet bilgisi', body: 'AI hizmet detayını, süreyi ve fiyat aralığını iletir; randevu için takvim gösterir veya iletişim formuna yönlendirir.' },
      { title: 'Vaka fotoğraflarına gelen sorgu', body: '"Bu işlem ne kadar?" gibi sorulara AI standart fiyat aralığı verir; kişisel değerlendirme için ön muayene randevusu önerir.' },
      { title: 'Tıbbi soru filtrelemesi', body: 'AI tıbbi tanı/tedavi önerisi ASLA vermez; bu tür soruları doğrudan doktora veya sekrekterye yönlendirir.' },
    ],
    benefits: [
      'Tıbbi sorumluluk riski sıfır (AI tıbbi yorum yapmaz)',
      'Estetik kliniği lead\'leri kalifiye olur',
      'KVKK uyumlu hasta veri yönetimi',
    ],
    keywords: ['estetik klinik instagram', 'klinik dm otomasyonu', 'sağlık merkezi instagram', 'estetik hizmet sorgusu', 'klinik sosyal medya'],
  },
  'instagram-egitim': {
    slug: 'instagram-egitim',
    channel: 'instagram',
    industry: 'egitim',
    title: 'Eğitim Kurumu İçin Instagram DM — Kayıt ve Soru Yanıtları',
    metaDescription: 'Kurs ve eğitim kurumları için Instagram DM otomasyonu. Aday öğrenci sorularına anında yanıt, kurs bilgisi ve kayıt için tek tıkla form yönlendirme.',
    heroTitle: 'Eğitim Kurumu Instagram\'ından Gelen Soruları AI Yanıtlasın',
    heroSubtitle: 'Aday öğrenci ve veliler Instagram\'dan ders, fiyat ve kayıt soruları sorar; AI kursları açıklar, kayıt için form sunar, danışmanı bilgilendirir.',
    useCases: [
      { title: 'Kurs soruları', body: 'AI hangi kursun ne içerdiğini, başlangıç tarihini, eğitmenini açıklar; örnek ders linki sunar.' },
      { title: 'Kayıt yönlendirme', body: 'Karar veren aday için AI kayıt formunu DM\'den gönderir, ödeme linkini ekler, takip e-postası ayarlar.' },
      { title: 'Veli soruları', body: 'Veliler "çocuğum için hangi kurs?" gibi sorularda AI ön bilgi alır, danışman ile randevu önerir.' },
    ],
    benefits: [
      'Reklamdan gelen lead\'ler kalifiye olur',
      'Kayıt sezonunda DM yığılmaz',
      'Veli iletişimi sistematik hale gelir',
    ],
    keywords: ['eğitim instagram dm', 'kurs instagram kayıt', 'okul sosyal medya', 'eğitim kurumu instagram', 'kurs aday sorgusu instagram'],
  },
};

export const MATRIX_SLUGS = Object.keys(MATRIX_LANDINGS);

export function getMatrixLanding(slug) {
  return MATRIX_LANDINGS[slug] || null;
}

export function getChannel(channelSlug) {
  return CHANNELS[channelSlug];
}

export function getIndustry(industrySlug) {
  return INDUSTRIES[industrySlug];
}

export { CHANNELS, INDUSTRIES };
