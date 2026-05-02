export const CHANNEL_LANDINGS = {
  whatsapp: {
    slug: 'whatsapp',
    title: 'WhatsApp AI Müşteri Hizmetleri — Telyx WhatsApp Business API',
    metaDescription:
      'WhatsApp Business API üzerinden 7/24 yapay zeka destekli müşteri hizmetleri. Sipariş takibi, randevu yönetimi, sepet kurtarma ve canlı temsilciye sorunsuz handoff. Türkçe destek.',
    hero: {
      eyebrow: 'WhatsApp',
      title: 'WhatsApp\'ta Müşterilerinize 7/24 Yapay Zeka Asistan',
      subtitle:
        'WhatsApp Business API üzerinden gelen her mesaja saniyeler içinde yanıt verin. Telyx\'in yapay zeka asistanı sipariş takip eder, randevu alır, ürün önerir ve gerektiğinde canlı temsilciye sorunsuz devreder.',
      ctaPrimary: 'Ücretsiz Deneyin',
      ctaSecondary: 'Demo İsteyin',
    },
    valueProps: [
      {
        title: 'Resmi WhatsApp Business API entegrasyonu',
        body:
          'Telyx, Meta\'nın resmi WhatsApp Business Cloud API\'siyle çalışır. Yasal şablonlar, doğrulanmış işletme profili ve güvenli mesajlaşma altyapısı kutudan çıkar.',
      },
      {
        title: 'Aynı konuşmada AI → Canlı temsilci handoff',
        body:
          'Yapay zeka cevaplayamadığında konuşma tarihçesiyle birlikte canlı temsilciye devredilir. Müşteri tekrar başa dönmez; ekibiniz konuyu anlayarak devralır.',
      },
      {
        title: 'Sektörel hazır akışlar',
        body:
          'E-ticaret sipariş takibi, restoran rezervasyon, salon randevu, destek talebi — sektörünüze göre hazır akışlar dakikalar içinde çalışır.',
      },
      {
        title: 'Kampanya ve hatırlatma mesajları',
        body:
          'Sepet kurtarma, randevu hatırlatması, tahsilat takibi, kampanya duyurusu — onay almış müşterilere zamanlı mesajlar otomatik gönderilir.',
      },
    ],
    useCases: [
      {
        industry: 'E-ticaret',
        body:
          'Müşteri "siparişim nerede?" yazdığında Telyx, sipariş numarasını ister, kargo durumunu API\'den çeker ve takip linkiyle birlikte saniyeler içinde yanıtlar. Sepet kurtarma için terk eden müşterilere otomatik WhatsApp mesajı gider.',
      },
      {
        industry: 'Restoran',
        body:
          '"Bu akşam 4 kişilik masa var mı?" sorusuna Telyx rezervasyon sisteminden boş slot kontrolü yapıp anında onay verir. Paket sipariş için menüyü gönderir, sipariş alır, mutfağa iletir.',
      },
      {
        industry: 'Güzellik salonu',
        body:
          'Müşteri WhatsApp\'tan "yarın saç kesimi için randevu" yazdığında Telyx, müsait slotları gösterir, seçimi alır, Google Calendar\'a kaydeder ve onay mesajı gönderir. Bir gün önce hatırlatma otomatik.',
      },
      {
        industry: 'Müşteri destek',
        body:
          'Sıkça sorulan soruları Telyx anında yanıtlar (kargo, iade, hesap, fiyat). Karmaşık konularda canlı temsilciye konuşma geçmişiyle devreder. Hafta sonu ve gece de operasyon kesilmez.',
      },
    ],
    faqs: [
      {
        question: 'WhatsApp Business API\'sine geçiş zor mu?',
        answer:
          'Hayır. Telyx, Meta\'nın onaylı WhatsApp Business çözüm sağlayıcısı altyapısıyla entegre çalışır. Mevcut WhatsApp numaranızı API\'ye taşıma sürecinde size yardımcı oluyoruz; tipik kurulum 1-3 iş günü içinde tamamlanır.',
      },
      {
        question: 'Mesajlar şablonlu mu olmak zorunda?',
        answer:
          'Müşteri size yazdıktan sonra 24 saat boyunca serbest metinle yanıt verebilirsiniz. 24 saatten sonra (örneğin sepet kurtarma) onay almış şablonlar kullanılır. Telyx şablon yönetimini ve onay akışını sizin için yönetir.',
      },
      {
        question: 'Mevcut numaramı koruyabilir miyim?',
        answer:
          'Evet. Mevcut WhatsApp numaranızı veya yeni bir iş numarasını WhatsApp Business API hesabınıza ekleyebiliriz. Mevcut numaranızdaki sohbet geçmişi korunur.',
      },
      {
        question: 'Müşteri canlı temsilci isterse ne olur?',
        answer:
          'Müşteri "canlı destek istiyorum" dediğinde veya yapay zeka cevaplayamadığında konuşma, tüm geçmişiyle birlikte canlı temsilcinize otomatik devredilir. Ekibiniz tek panelden tüm aktif konuşmaları görür.',
      },
      {
        question: 'KVKK uyumlu mu?',
        answer:
          'Evet. WhatsApp\'tan gelen tüm mesajlar şifreli olarak iletilir, AB ve Türkiye\'deki güvenli sunucularda saklanır. KVKK uyumlu veri silme, anonimleştirme ve müşteri rıza yönetimi araçları sağlanır.',
      },
    ],
    keywords: [
      'whatsapp ai chatbot',
      'whatsapp business api türkiye',
      'whatsapp müşteri hizmetleri otomasyonu',
      'whatsapp sipariş takip',
      'whatsapp randevu otomasyonu',
      'whatsapp sepet kurtarma',
      'whatsapp türkçe ai',
    ],
    serviceType: 'WhatsApp AI Customer Service',
  },
  telefon: {
    slug: 'telefon',
    title: 'Telefon AI Asistanı — Sesli Yapay Zeka Çağrı Merkezi',
    metaDescription:
      'Telyx sesli AI agent: gelen ve giden çağrılarda doğal Türkçe konuşan yapay zeka. Randevu alır, sipariş alır, soruları yanıtlar, kampanya araması yapar. Bulutfon ve Netgsm SIP entegrasyonu.',
    hero: {
      eyebrow: 'Telefon',
      title: 'Doğal Türkçe Konuşan Sesli Yapay Zeka Asistan',
      subtitle:
        'Çağrılarınıza saniyeler içinde yanıt veren sesli AI agent. Randevu alır, sipariş yönetir, sorularını cevaplar, kampanya araması yapar. Bulutfon ve Netgsm SIP trunk\'ları kutudan çıkar.',
      ctaPrimary: 'Sesli Demo Dinleyin',
      ctaSecondary: 'Ücretsiz Başlayın',
    },
    valueProps: [
      {
        title: 'Doğal Türkçe ses',
        body:
          'Robotik değil, doğal Türkçe konuşan sesli ajan. Aksanı, tonlamayı ve duraksamaları insan gibi yönetir. İngilizce dil seçeneği de mevcuttur.',
      },
      {
        title: 'Gelen ve giden çağrı yönetimi',
        body:
          'Müşterilerinizden gelen aramaları yanıtlar, gerektiğinde dış arama yapar. Toplu kampanya araması (CSV/XLSX listesinden) destekler.',
      },
      {
        title: 'Bulutfon ve Netgsm SIP entegrasyonu',
        body:
          '0850 ücretsiz numaralarla çalışır. Mevcut SIP trunk\'unuzu Telyx\'e bağlamak 5-10 dakika sürer; adım adım rehberler hazır.',
      },
      {
        title: 'Çağrı sonrası özet ve CRM\'e kayıt',
        body:
          'Her çağrının metne dökümü, özet ve müşteri etiketleri otomatik. Custom CRM veya HubSpot\'a webhook ile aktarılır.',
      },
    ],
    useCases: [
      {
        industry: 'E-ticaret',
        body:
          'Müşteri kargo durumu için aradığında, sesli AI sipariş numarasını alır, kargo entegrasyonundan durumu çeker ve sözlü olarak iletir. Karmaşık iade durumunda canlı temsilciye yönlendirir.',
      },
      {
        industry: 'Restoran',
        body:
          'Telefonla rezervasyon, paket sipariş ve menü soruları için 7/24 hizmet. Yoğun saatlerde müşteri kaybetmezsiniz; her arama yanıtlanır.',
      },
      {
        industry: 'Klinik / Salon',
        body:
          'Randevu alma, iptal, değişiklik ve hatırlatma çağrıları sesli AI tarafından yönetilir. Doktor / uzman müsaitliği takvime canlı bağlı.',
      },
      {
        industry: 'Tahsilat ve kampanya',
        body:
          'Borç hatırlatma, kampanya duyurusu, müşteri memnuniyet anketi gibi çıkış aramalarını CSV listesinden otomatik yapar. Sonuçları dashboard\'da raporlar.',
      },
    ],
    faqs: [
      {
        question: 'Hangi telefon altyapısıyla çalışır?',
        answer:
          'Telyx, SIP trunk üzerinden çalışır. Türkiye\'de Bulutfon ve Netgsm doğrudan entegredir; 0850, 0212, 0216 gibi numaralarla kullanılabilir. Diğer SIP sağlayıcılarıyla da çalışır.',
      },
      {
        question: 'AI sesi gerçekçi mi, yoksa robotik mi?',
        answer:
          'Yeni nesil ses modeli kullandığımız için AI agent doğal Türkçe konuşur — duraksamalar, vurgu ve tonlama insan gibi. Demo dinleyebilirsiniz.',
      },
      {
        question: 'Toplu arama (kampanya) yapabilir miyim?',
        answer:
          'Evet. Profesyonel ve Kurumsal planlarda CSV veya XLSX olarak yüklediğiniz numara listesine otomatik arama yapılır. Hatırlatma, kampanya, anket gibi kullanım örnekleri için idealdir.',
      },
      {
        question: 'Aşım ücreti nasıl çalışır?',
        answer:
          'Profesyonel planda 500 dakika dahildir; aşımı 23₺/dakika olarak ay sonu faturalandırılır. Kullandıkça Öde modelinde her dakika cüzdan bakiyesinden düşer (23₺/dk).',
      },
      {
        question: 'Çağrı kayıtları saklanıyor mu?',
        answer:
          'Çağrı ses kayıtları ve metin dökümleri (transcript) güvenli ortamda saklanır. KVKK gereği ses kaydı için müşteriye bilgilendirme yapılır; saklama süresini siz belirlersiniz.',
      },
    ],
    keywords: [
      'sesli yapay zeka',
      'ai çağrı merkezi',
      'telefon ai asistanı',
      'çağrı merkezi otomasyonu',
      'türkçe sesli ai',
      'bulutfon entegrasyonu',
      'netgsm sip entegrasyonu',
      'kampanya araması otomasyonu',
    ],
    serviceType: 'AI Voice Call Center',
  },
  'web-sohbet': {
    slug: 'web-sohbet',
    title: 'Web Sohbet AI — Sitenize Yapay Zeka Destekli Canlı Sohbet',
    metaDescription:
      'Telyx web sohbet widget\'ı ile sitenizi ziyaret eden müşterilere 7/24 yapay zeka destek. Tek satır kod ekleyin, dakikalar içinde aktif olsun. Sipariş, randevu, ürün önerisi ve canlı temsilci handoff.',
    hero: {
      eyebrow: 'Web Sohbet',
      title: 'Sitenize 5 Dakikada Yapay Zeka Sohbet Aracı',
      subtitle:
        'Tek satır embed kodu ile sitenize Telyx sohbet widget\'ını ekleyin. Ziyaretçiler sorular sorar, sipariş takip eder, ürün önerisi alır; ihtiyaç olunca canlı temsilciye sorunsuz geçiş.',
      ctaPrimary: 'Embed Kodunu Alın',
      ctaSecondary: 'Demo İsteyin',
    },
    valueProps: [
      {
        title: 'Tek satır embed kodu',
        body:
          'Sitenizin head bölümüne tek bir <script> etiketi eklersiniz; widget anında aktif olur. WordPress, Shopify, ikas, Webflow ve özel sitelerle uyumlu.',
      },
      {
        title: 'Bilgi tabanı entegrasyonu',
        body:
          'PDF, metin veya doğrudan yazdığınız SSS\'leri yükleyin; AI bu bilgilerden müşteri sorularına yanıt verir. Tutarlı, doğru cevaplar.',
      },
      {
        title: 'Canlı temsilciye sorunsuz handoff',
        body:
          'AI cevaplayamadığında ya da müşteri istediğinde konuşma canlı temsilciye geçer. Müşteri başa dönmez; ekibiniz tüm geçmişi görür.',
      },
      {
        title: 'Sohbet geçmişi ve analitik',
        body:
          'Her sohbet kaydedilir, etiketlenir ve analitik panelde raporlanır. Hangi sorular sık geliyor, çözüm oranı nedir — kararlarınızı veriyle alın.',
      },
    ],
    useCases: [
      {
        industry: 'E-ticaret',
        body:
          'Ziyaretçi ürün sayfasında "kaç günde gelir?" sorusuna anında yanıt alır. Sepet sorularına yardım eder, ödeme adımlarında takılan müşteriyi bırakmaz.',
      },
      {
        industry: 'Restoran',
        body:
          'Site ziyaretçisi menü, çalışma saatleri, rezervasyon imkanı sorduğunda anında bilgi alır. Online rezervasyon formuna yönlendirir.',
      },
      {
        industry: 'Hizmet ve klinik',
        body:
          'Hizmet detayları, fiyatlandırma, müsait randevu slotları gibi sorulara 7/24 yanıt. Randevu talebi alındığında takvime kaydedilir.',
      },
      {
        industry: 'SaaS ve B2B',
        body:
          'Demo talep eden ziyaretçiyi nitelikli lead\'e dönüştürür. Fiyatlandırma soruları, entegrasyon detayları ve onboarding adımları için ilk basamak destek.',
      },
    ],
    faqs: [
      {
        question: 'Widget\'ı hangi sitelere ekleyebilirim?',
        answer:
          'Tek bir <script> etiketi ile her HTML siteye eklenebilir. WordPress, Shopify, ikas, Wix, Webflow, Next.js, React, Vue — hepsi destekler.',
      },
      {
        question: 'Tasarımı kendi markama göre özelleştirebilir miyim?',
        answer:
          'Evet. Widget rengini, ikonunu, açılış mesajını, pozisyonunu (sağ alt / sol alt) ve dil tercihini özelleştirebilirsiniz. Marka tutarlılığı korunur.',
      },
      {
        question: 'Mobilde nasıl görünüyor?',
        answer:
          'Widget hem masaüstü hem mobil için optimize edilmiştir. Mobilde tam ekran sohbet, masaüstünde köşe pop-up şeklinde çalışır.',
      },
      {
        question: 'Birden fazla siteye aynı asistanı ekleyebilir miyim?',
        answer:
          'Evet. Aynı asistanı farklı sitelere veya alt domainlere embed edebilirsiniz. Veya her site için ayrı asistan oluşturup farklı bilgi tabanları tanımlayabilirsiniz.',
      },
      {
        question: 'Ziyaretçi datası nerede saklanıyor?',
        answer:
          'Sohbet kayıtları, ziyaretçi tercihleri ve etiketler güvenli ortamda KVKK uyumlu saklanır. Sadece yetkili kullanıcılar erişebilir; veri silme talebi karşılanır.',
      },
    ],
    keywords: [
      'web sohbet botu',
      'canlı sohbet ai',
      'site chatbot türkçe',
      'shopify chatbot',
      'wordpress chatbot',
      'web chat widget',
      'ziyaretçi sohbet otomasyonu',
    ],
    serviceType: 'Web Chat AI Widget',
  },
  'e-posta': {
    slug: 'e-posta',
    title: 'E-posta AI Otomasyonu — Yapay Zeka Destekli E-posta Yanıtlama',
    metaDescription:
      'Telyx ile gelen e-postalara 7/24 yapay zeka yanıtı. Gmail ve Outlook entegre. Sipariş, fatura, destek talepleri otomatik kategorize ve cevaplanır; karmaşık durumlar ekibinize iletilir.',
    hero: {
      eyebrow: 'E-posta',
      title: 'E-posta Kutunuza Yapay Zeka Asistan',
      subtitle:
        'Gelen kutunuza takılan müşteri e-postalarına Telyx anında yanıt verir. Gmail ve Outlook ile çalışır; sipariş, fatura, destek konularını AI çözer; karmaşık durumlar ekibinize iletilir.',
      ctaPrimary: 'Gmail/Outlook Bağlayın',
      ctaSecondary: 'Demo İsteyin',
    },
    valueProps: [
      {
        title: 'Gmail ve Outlook entegrasyonu',
        body:
          'Mevcut iş e-postanızı OAuth ile bağlayın; gelen mesajlar Telyx\'e iletilir. AI yanıt taslağını yazar, otomatik gönderir veya onayınıza sunar.',
      },
      {
        title: 'Otomatik kategorize ve etiketleme',
        body:
          'Gelen e-postalar konularına göre etiketlenir: sipariş, fatura, destek, lead, spam. Aciliyet seviyesi belirlenir, doğru ekip üyesine yönlendirilir.',
      },
      {
        title: 'AI yanıt + insan onayı modu',
        body:
          'İki çalışma modu: tam otomatik (AI gönderir) veya onaylı (AI taslak yazar, siz onaylayıp gönderirsiniz). Hassas iletişimler için onay modu.',
      },
      {
        title: 'Bilgi tabanı entegrasyonu',
        body:
          'Aynı bilgi tabanı (PDF, SSS, ürün dokümanları) e-posta için de kullanılır. Telefon, WhatsApp ve e-postada tutarlı, doğru yanıtlar.',
      },
    ],
    useCases: [
      {
        industry: 'E-ticaret',
        body:
          '"Faturamı bulamadım" tarzı yaygın e-postalara AI sipariş numarasını talep eder, faturayı sistemden çekip yanıt eki olarak gönderir. İade taleplerini protokole göre işler.',
      },
      {
        industry: 'B2B / SaaS',
        body:
          'Demo talepleri, teklif istekleri ve onboarding sorularına AI ilk yanıt verir. Sales-ready lead\'leri ekibinize ileterek değerlendirir, soğuk lead\'lere takip e-postası gönderir.',
      },
      {
        industry: 'Hukuk ve danışmanlık',
        body:
          'Müşteri "şu konuda görüş almak istiyorum" yazdığında AI ön bilgi toplar, randevu önerisi sunar, doküman talep eder. Avukat / danışman zaman kazanır.',
      },
      {
        industry: 'Müşteri destek',
        body:
          'Sıkça sorulan sorulara (kullanıcı adı sıfırlama, abonelik iptali, fatura kopyası) AI saniyeler içinde yanıt verir. Karmaşık durumlar destek ekibine iletilir.',
      },
    ],
    faqs: [
      {
        question: 'Gmail ve Outlook nasıl bağlanıyor?',
        answer:
          'OAuth ile güvenli bir tek-tıkla bağlantı. Telyx, e-postalarınıza okuma/yazma yetkisi alır; şifrenizi saklamaz. İstediğiniz zaman bağlantıyı kesebilirsiniz.',
      },
      {
        question: 'AI tüm e-postalara mı yanıt veriyor?',
        answer:
          'Hayır. Filtre kuralları siz tanımlarsınız: sadece belirli adreslere, belirli konulara veya belirli müşterilere AI yanıt vermesini sağlayabilirsiniz.',
      },
      {
        question: 'Yanlış yanıt verirse ne olur?',
        answer:
          'AI confidence skoru düşükse otomatik gönderim yapmaz; insan onayı moduna geçer veya konuyu ekibinize iletir. Tüm yanıtlar kayıt altında, geri çağırma mümkün.',
      },
      {
        question: 'Birden fazla e-posta hesabı bağlayabilir miyim?',
        answer:
          'Evet. Birden fazla Gmail veya Outlook hesabını aynı Telyx hesabına bağlayabilirsiniz. Her hesap için farklı bilgi tabanı, dil ve yanıt modu tanımlayabilirsiniz.',
      },
      {
        question: 'Hassas e-postalar (şifre, kart bilgisi) işleniyor mu?',
        answer:
          'AI hassas içerikli e-postaları (şifre, kart bilgisi, kişisel veri) tespit ettiğinde otomatik yanıt yerine ekibinize iletim modunu seçer. KVKK uyumlu işleme.',
      },
    ],
    keywords: [
      'e-posta otomasyonu',
      'gmail ai yanıt',
      'outlook ai entegrasyonu',
      'müşteri destek e-posta otomasyonu',
      'e-posta chatbot',
      'ai e-posta yanıtlayıcı',
    ],
    serviceType: 'AI Email Automation',
  },
};

export const CHANNEL_SLUGS = Object.keys(CHANNEL_LANDINGS);

export function getChannelLanding(slug) {
  return CHANNEL_LANDINGS[slug] || null;
}
