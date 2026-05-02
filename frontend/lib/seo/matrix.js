// 4 channels × 4 industries = 16 long-tail landing pages.
// Each entry is a self-contained, keyword-rich page targeting a specific
// search intent like "whatsapp e-ticaret chatbot" or "telefon restoran ai".

const CHANNELS = {
  whatsapp: { label: 'WhatsApp', icon: 'whatsapp', gradient: 'from-emerald-500 to-green-600' },
  telefon: { label: 'Telefon', icon: 'telefon', gradient: 'from-[#051752] to-[#006FEB]' },
  'web-sohbet': { label: 'Web Sohbet', icon: 'web-sohbet', gradient: 'from-[#000ACF] to-[#00C4E6]' },
  'e-posta': { label: 'E-posta', icon: 'e-posta', gradient: 'from-purple-600 to-indigo-600' },
};

const INDUSTRIES = {
  'e-ticaret': { label: 'E-ticaret' },
  restoran: { label: 'Restoran' },
  salon: { label: 'Güzellik Salonu' },
  destek: { label: 'Müşteri Desteği' },
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
