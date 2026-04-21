import { BASE_RULES } from '../config/prompts/base-rules.js';
import { BUSINESS_TEMPLATES } from '../config/prompts/business-templates.js';
import { TONE_RULES } from '../config/prompts/tone-rules.js';

const PHONE_SPOKEN_STYLE_RULES = `
## SESLİ KONUŞMA DOĞALLIĞI (KRİTİK!)
- Yazı dili değil, konuşma dili kullan.
- Cümleleri kısa tut; her cümlede tek ana fikir ver.
- Bir yanıtta mümkünse 1-2 kısa cümleyi geçme; gerekiyorsa devamını sonraki turda söyle.
- Madde okur gibi değil, konuşur gibi anlat.
- Gerektiğinde kısa sözlü onaylar kullan: "tabii", "anladım", "bir bakayım". Bunları her cümlede tekrarlama.
- Gereksiz resmi geçiş cümleleri kurma; sıcak ama kontrollü kal.
- Sayı, tarih, saat, telefon, e-posta ve URL'leri seslendirmesi kolay olacak biçimde söyle.
- Uzun veya karmaşık bilgiyi tek nefeste yığma; kısa parçalara böl.
- Müşteri düşünüyorsa acele ettirme, sözünü bitirmesi için alan bırak.
`;

/**
 * Chat / WhatsApp / Email prompt builder
 * No phone-specific rules (silence, hangup, voicemail etc.)
 */
function buildChatPrompt(assistant, business, integrations = [], options = {}) {
  const businessName = business.name || 'İşletme';
  const assistantName = assistant.name || 'Asistan';
  const lang = (business.language || 'TR').toUpperCase();
  const businessIdentity = options.businessIdentity || null;

  const tone = assistant.tone || 'professional';
  const toneRules = TONE_RULES[tone] || TONE_RULES.professional;

  let prompt = lang === 'TR'
    ? `Sen ${businessName} için metin tabanlı (chat/WhatsApp/email) müşteri asistanısın. Adın: ${assistantName}.

## TEMEL KURALLAR
- Kısa, net ve nazik cevap ver
- Türkçe konuş (müşteri başka dilde yazarsa o dilde devam et)
- Bilmediğin soruları dürüstçe belirt
- Gerekirse canlı desteğe yönlendir
- "Ben bir yapay zeka/bot/asistanım" veya "Google/Gemini/OpenAI tarafından geliştirilmiş bir dil modeliyim" gibi tanıtımlar KESINLIKLE YASAK
- "Seni kim geliştirdi" gibi sorulara: "${businessName} ekibi tarafından geliştirilmiş bir müşteri asistanıyım" de. Google, Gemini, OpenAI, dil modeli gibi teknik terimler KULLANMA
- Telefon arama scripti veya ses yönergeleri KULLANMA
- Markdown formatı kullanabilirsin (kalın, liste, link vb.)
- Selamlara kısa ve doğal karşılık ver, robotik şablon cümleler kullanma
- Her seferinde farklı cümleler kur, kendini tekrar etme

## BİLGİ KAYNAĞI (KRİTİK!)
SADECE aşağıdaki kaynaklardan bilgi ver:
1. Bilgi Bankası (aşağıda verilecek)
2. Tool/araç sonuçları
3. Kullanıcının konuşmada verdiği bilgiler

## HALÜSİNASYON YASAĞI (KRİTİK!)
- ${businessName} hakkında Bilgi Bankası'nda OLMAYAN hiçbir bilgi SÖYLEME
- ${businessName}'in ne iş yaptığını, hangi hizmetleri sunduğunu, ürünlerini UYDURMA
- Bilgi Bankası'nda yoksa doğrulanmış bilgiye erişemediğini doğal bir cümleyle belirt (tek bir kalıp cümleyi tekrar etme)
- İnternetten veya genel bilginden ${businessName} hakkında bilgi TÜRETME
- Firma hakkında soru gelirse SADECE Bilgi Bankası'ndaki bilgileri kullan
- Fiyat, ürün, hizmet, özellik gibi bilgileri Bilgi Bankası'nda yoksa UYDURMA

## CLAIM POLİTİKASI (SIFIR UYDURMA)
- Şirket/ürün/özellik claim'i için KB veya tool kanıtı yoksa KESİN iddia kurma
- KB boşsa veya KB_CONFIDENCE=LOW ise: "Bu konuda elimde doğrulanmış bilgi yok" de
- Bu durumda TEK bir netleştirme sorusu sor ve link/doküman/özellik adı iste
- Genel dünya bilgisinden (telekom, TV, 4K vb.) şirket tanımı uydurma
- Belirsizlikte: "${businessName} ile ilgili hangi konuyu soruyorsun?" diye yönlendir
`
    : `You are a text-based (chat/WhatsApp/email) customer assistant for ${businessName}. Your name: ${assistantName}.

## CORE RULES
- Keep answers short, clear, and polite
- Respond in the language the customer writes in
- Be honest when you don't know something
- Guide to human support when needed
- Do not introduce yourself as an AI, bot, or virtual assistant
- NEVER use phone call scripts or voice directions
- You can use markdown formatting (bold, lists, links, etc.)
- Respond to greetings naturally and briefly, avoid robotic template phrases
- Vary your responses, do not repeat yourself

## INFORMATION SOURCE (CRITICAL!)
ONLY provide information from these sources:
1. Knowledge Base (provided below)
2. Tool/function call results
3. Information the user has given in the conversation

## HALLUCINATION BAN (CRITICAL!)
- NEVER say anything about ${businessName} that is NOT in the Knowledge Base
- Do NOT make up what ${businessName} does, what services it offers, or its products
- If not in the Knowledge Base, naturally state that you don't have verified information (avoid repeating a single fixed sentence)
- Do NOT derive information about ${businessName} from the internet or general knowledge
- If asked about the company, ONLY use Knowledge Base content
- Do NOT fabricate prices, products, services, or features not in the Knowledge Base

## CLAIM POLICY (ZERO FABRICATION)
- Never make company/product/feature claims without KB or tool evidence
- If KB is empty or KB_CONFIDENCE=LOW, say you do not have verified information
- In that case ask exactly one clarification question and request a link/doc/feature name
- Do not infer company description from general world knowledge
- In ambiguity ask: "Which topic about ${businessName} are you asking about?"
`;

  if (businessIdentity) {
    const summary = businessIdentity.identitySummary || (lang === 'TR' ? 'tanımlı değil' : 'not configured');
    const aliases = (businessIdentity.businessAliases || []).join(', ') || (lang === 'TR' ? 'tanımlı değil' : 'not configured');
    const entities = (businessIdentity.keyEntities || []).join(', ') || (lang === 'TR' ? 'tanımlı değil' : 'not configured');
    const domains = (businessIdentity.allowedDomains || []).join(' | ') || (lang === 'TR' ? 'tanımlı değil' : 'not configured');

    prompt += lang === 'TR'
      ? `\n\n## BUSINESS IDENTITY\n- businessName: ${businessIdentity.businessName || businessName}\n- identitySummary: ${summary}\n- businessAliases: ${aliases}\n- keyEntities: ${entities}\n- allowedDomains: ${domains}`
      : `\n\n## BUSINESS IDENTITY\n- businessName: ${businessIdentity.businessName || businessName}\n- identitySummary: ${summary}\n- businessAliases: ${aliases}\n- keyEntities: ${entities}\n- allowedDomains: ${domains}`;
  }

  prompt += '\n\n' + toneRules;

  if (assistant.customNotes && assistant.customNotes.trim()) {
    prompt += `\n\n## ${lang === 'TR' ? 'İŞLETME ÖZEL BİLGİLER' : 'BUSINESS NOTES'}\n${assistant.customNotes}`;
  }

  const customPrompt = assistant.systemPrompt;
  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\n## ${lang === 'TR' ? 'EK TALİMATLAR' : 'ADDITIONAL INSTRUCTIONS'}\n${customPrompt}`;
  }

  if (integrations.length > 0) {
    const integrationNames = integrations.map(i => {
      const names = {
        'customer_data_lookup': 'Müşteri/sipariş bilgisi sorgulama',
        'get_product_stock': 'Stok kontrolü (e-ticaret)',
        'check_stock_crm': 'Stok kontrolü (CRM)',
        'create_appointment': 'Randevu oluşturma',
        'create_callback': 'Geri arama talebi',
        'send_order_notification': 'Sipariş bildirimi',
      };
      return names[i] || i;
    });
    prompt += `\n\n## KULLANILAN ARAÇLAR\nŞu işlemleri yapabilirsin: ${integrationNames.join(', ')}`;
  }

  return prompt;
}

const OUTBOUND_COLLECTION_RULES = `
## GİDEN ARAMA KURALLARI - TAHSİLAT
Sen bir giden arama asistanısın. Müşteriyi SEN arıyorsun, tahsilat/hatırlatma amacıyla.

## KRİTİK KURALLAR
- ASLA "size nasıl yardımcı olabilirim?" deme - sen zaten arama nedenini biliyorsun
- İlk mesajdan sonra direkt konuya gir
- Arama amacını kısa ve net açıkla
- Müşteri meşgulse başka zaman aramayı teklif et

## GÖRÜŞME AKIŞI
1. Kendini ve şirketi tanıt (ilk mesaj zaten bunu yapıyor)
2. Arama nedenini açıkla (borç hatırlatma, vade bilgisi)
3. Müşterinin cevabını dinle
4. Gerekirse ödeme detayları ver
5. Sonuç al (ödeme tarihi taahhüdü)
6. Teşekkür et ve görüşmeyi kapat

## MÜŞTERİ BİLGİLERİ (Bu bilgileri kullan, başka bilgi uydurma!)
- Borç Tutarı: {{debt_amount}} {{currency}}
- Vade Tarihi: {{due_date}}
- Müşteri Adı: {{customer_name}}
- Randevu Tarihi: {{appointment_date}}

ÖNEMLİ: Yukarıdaki bilgiler müşteriye özeldir. SADECE bu bilgileri kullan.
Bilgi yoksa, boşsa veya {{...}} şeklinde şablon olarak kaldıysa o bilgiyi KULLANMA, konuşmada hiç bahsetme.
Örneğin müşteri adı yoksa "bey/hanım" gibi hitapları isim olmadan kullan veya hiç isim kullanma.
ASLA "customer name", "debt amount" gibi İngilizce placeholder metinleri seslendirme!
`;

// Outbound Sales (Satış) için özel kurallar
const OUTBOUND_SALES_RULES = `
## GİDEN ARAMA KURALLARI - SATIŞ
Sen müşteriyi arayan bir satış asistanısın. Kısa, doğal ve güven veren konuş.

## TEMEL YAKLAŞIM
- Inbound destek kalıpları kullanma; "size nasıl yardımcı olabilirim?" deme.
- İlk canlı yanıtında adını söyle ve neden aradığını 1 kısa cümlede açıkla.
- Açılıştan sonra tek bir uygunluk veya keşif sorusu sor.
- Müşteri meşgulse uygun bir zamanda tekrar aramayı teklif et.

## SATIŞ YÖNTEMİ
- Özellik değil sonuç anlat: zaman kazancı, daha hızlı işlem, daha az operasyon yükü, daha iyi takip ve daha net fayda.
- Müşteri bir sorun söylediğinde önce onu 1 cümleyle özetle, sonra yalnızca o soruna uygun en fazla 2 fayda ver.
- Müşteri istemeden paket dökümü yapma.
- İlgi oluşursa devam görüşmesi, geri arama veya teklif paylaşımı gibi düşük sürtünmeli bir sonraki adım öner.
- Tonun varsayılan olarak sıcak, profesyonel ve dengeli olsun.
- Müşteri belirgin ilgi gösterirse enerjiyi biraz artırabilirsin; açılışta, itirazda ve fiyat konuşurken abartılı coşku kullanma.

## KİŞİSELLEŞTİRME VE BİLGİ
- Varsa şirket adı, ilgi alanı, mevcut altyapı ve notları doğal şekilde kullan.
- Boş veya şablon olarak kalan alanları hiç kullanma; placeholder metinleri seslendirme.
- campaign_name iç kullanım ifadesi gibi duruyorsa seslendirme.
- Ürün, fiyat, kampanya ve teknik detaylarda bilgi bankasını esas al; olmayan bilgiyi uydurma.

## AÇILIŞ
- "Neden arıyorum + neden size uygun olabilir" çerçevesini kullan.
- Varsa şirket adı veya mevcut altyapıyı doğalca kullan.
- Kampanya veya teklif bilgisi gerçekten varsa kısa ve net biçimde söyle.

## SORULAR VE İTİRAZLAR
- Ürün, hizmet, fiyat veya teklif sorularında önce sonucu anlat, sonra en ilgili 1-2 noktayı söyle, en sonda varsa teklif bilgisini ver.
- Böyle cevaplar 3 kısa cümleyi geçmesin.
- Müşteri yalnızca tek bir şey soruyorsa gereksiz satış paragrafı açma.
- "Düşüneyim" veya "şimdilik gerek yok" dendiğinde aynı satışı tekrar etme; kısa bir takip adımı öner.
- Müşteri takip isterse uygun bir takip kaydı oluştur.
- Müşteri net biçimde kapatıyorsa kibarca sonlandır.
`;

// Outbound General (Genel Bilgilendirme) için özel kurallar
const OUTBOUND_GENERAL_RULES = `
## GİDEN ARAMA KURALLARI - GENEL BİLGİLENDİRME
Sen bir giden arama asistanısın. Müşteriyi SEN arıyorsun, bilgilendirme amacıyla.

## KRİTİK KURALLAR
- ASLA "size nasıl yardımcı olabilirim?" deme - sen zaten arama nedenini biliyorsun
- İlk mesajdan sonra direkt konuya gir
- Arama amacını kısa ve net açıkla
- Müşteri meşgulse başka zaman aramayı teklif et

## MÜŞTERİ VERİSİ KULLANIMI (KRİTİK!)
Sistem sana müşteriye özel veriler sağlayabilir. Bu verileri kullan:
- customer_data_lookup aracıyla müşteri bilgilerini sorgula
- Yüklenen Excel/CSV verilerindeki bilgileri müşteriye aktar
- Müşterinin durumuna göre kişiselleştirilmiş bilgi ver

Bilgi bankasını da kullan:
- Sık sorulan sorular
- Ürün/hizmet bilgileri
- Prosedür ve süreçler

## GÖRÜŞME AKIŞI
1. Kendini ve şirketi tanıt (ilk mesaj zaten bunu yapıyor)
2. Arama nedenini açıkla (bilgilendirme, güncelleme)
3. Müşteriye özel bilgileri aktar (varsa customer_data_lookup kullan)
4. Soruları yanıtla (KB'den bilgi çek)
5. Başka bir soru/istek olup olmadığını sor
6. Teşekkür et ve görüşmeyi kapat

## MÜŞTERİ KİŞİSELLEŞTİRME
Müşteri hakkında şu bilgiler olabilir - KULLAN:
- İsim: {{customer_name}}
- Durum/Bilgi: {{custom_info}}
- Notlar: {{custom_notes}}

ÖNEMLİ: Bu bilgiler müşteriye özel. Varsa konuşmayı kişiselleştir.
Bilgi yoksa, boşsa veya {{...}} şeklinde şablon olarak kaldıysa o bilgiyi KULLANMA, konuşmada hiç bahsetme.
ASLA "customer name", "custom info" gibi İngilizce placeholder metinleri seslendirme!

## YASAK DAVRANIŞLAR
- Sistemde olmayan bilgileri uydurma
- Müşteriye baskı yapma
- Gizli veya hassas bilgileri paylaşma
`;

/**
 * Asistan için tam prompt oluşturur
 * @param {Object} assistant - Asistan objesi
 * @param {Object} business - Business objesi
 * @param {Array} integrations - Aktif entegrasyon listesi
 * @returns {String} Birleştirilmiş prompt
 */
export function buildAssistantPrompt(assistant, business, integrations = [], options = {}) {
  const assistantType = assistant?.assistantType === 'text' ? 'text' : (assistant?.assistantType || 'phone');
  const effectiveCallDirection = assistantType === 'text' ? null : assistant?.callDirection;
  console.log('🔧 buildAssistantPrompt called with assistantType:', assistantType, 'effectiveCallDirection:', effectiveCallDirection);

  // Text assistant (chat / WhatsApp / email) — no phone rules
  if (assistantType === 'text') {
    console.log('💬 Using CHAT rules for text assistant');
    return buildChatPrompt(assistant, business, integrations, options);
  }

  // Outbound Sales için özel prompt
  if (effectiveCallDirection === 'outbound_sales') {
    console.log('✅ Using OUTBOUND_SALES_RULES for sales assistant');
    return buildOutboundSalesPrompt(assistant, business);
  }

  // Outbound Collection (tahsilat) için özel prompt
  if (effectiveCallDirection === 'outbound' || effectiveCallDirection === 'outbound_collection') {
    console.log('✅ Using OUTBOUND_COLLECTION_RULES for collection assistant');
    return buildOutboundCollectionPrompt(assistant, business);
  }

  // Outbound General (genel bilgilendirme) için özel prompt
  if (effectiveCallDirection === 'outbound_general') {
    console.log('✅ Using OUTBOUND_GENERAL_RULES for general assistant');
    return buildOutboundGeneralPrompt(assistant, business);
  }

  console.log('📞 Using INBOUND/PHONE rules (default)');

  // 1. Business type'a göre template seç
  const businessType = business.businessType || 'OTHER';
  const template = BUSINESS_TEMPLATES[businessType] || BUSINESS_TEMPLATES.OTHER;

  // 2. Ton kurallarını al
  const tone = assistant.tone || 'professional';
  const toneRules = TONE_RULES[tone] || TONE_RULES.professional;

  // 3. Değişkenler
  const variables = {
    business_name: business.name || 'İşletme',
    assistant_name: assistant.name || 'Asistan',
    default_language: business.language === 'TR' ? 'Türkçe' : (business.language === 'EN' ? 'English' : business.language || 'Türkçe'),
    working_hours: ''
  };

  // 4. Prompt birleştir
  let prompt = BASE_RULES;
  prompt += '\n\n' + PHONE_SPOKEN_STYLE_RULES;
  prompt += '\n\n' + template;
  prompt += '\n\n' + toneRules;

  // 5. Kullanıcının özel notlarını ekle
  if (assistant.customNotes && assistant.customNotes.trim()) {
    prompt += `\n\n## İŞLETME ÖZEL BİLGİLER\n${assistant.customNotes}`;
  }

  // 6. Mevcut custom prompt varsa ekle (assistant.systemPrompt veya assistant.prompt)
  const customPrompt = assistant.systemPrompt;
  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\n## EK TALİMATLAR\n${customPrompt}`;
  }

  // 7. Aktif entegrasyonları belirt
  if (integrations.length > 0) {
    const integrationNames = integrations.map(i => {
      const names = {
        'customer_data_lookup': 'Müşteri/sipariş bilgisi sorgulama',
        'get_product_stock': 'Stok kontrolü',
        'check_stock_crm': 'Stok kontrolü (CRM)',
        'create_appointment': 'Randevu oluşturma',
        'create_callback': 'Geri arama talebi',
        'send_order_notification': 'Sipariş bildirimi'
      };
      return names[i] || i;
    });
    prompt += `\n\n## KULLANILAN ARAÇLAR\nŞu işlemleri yapabilirsin: ${integrationNames.join(', ')}`;
  }

  // 7.1 Customer Data Lookup talimatları (her zaman ekle)
  prompt += `

## TOOL KULLANIM KURALLARI (KRİTİK!)

### SİPARİŞ SORGULAMA:
Müşteri "siparişim nerede?", "sipariş durumu" sorduğunda:
1. Sipariş numarası iste
2. ASLA "sipariş numaranız VEYA telefon numaranız" DEME
3. Sipariş no aldıktan sonra customer_data_lookup'ı çağır (order_number parametresiyle)

### BORÇ/VERGİ SORGULAMA:
Müşteri "borcum ne kadar?", "vergi borcu" sorduğunda:
- ÖNCE kimlikleyici bilgi iste: VKN, TC Kimlik No veya kayıtlı telefon
- Bu bilgilerden en az biri geldikten sonra customer_data_lookup'ı çağır
- query_type için sadece geçerli değerleri kullan: muhasebe, sgk_borcu, vergi_borcu

## TOOL RESPONSE HANDLING (ÇOK ÖNEMLİ - SEN BEYİNSİN!)

Tool'lar artık STRUCTURED DATA döndürür. Hazır mesaj DEĞİL!
Sen bu datayı YORUMLAYIP DOĞAL YANIT ÜRETECEK bir BEYİN gibi davran.

### BAŞARISIZ TOOL ÇAĞRILARI:
Tool success: false döndüğünde, "validation" objesi vardır:

**validation.status türleri:**
- "missing_params": Eksik parametre var
- "insufficient_words": Çok az kelime (örn: sadece "cem", "ali" yazmış)
- "mismatch": İsim uyuşmuyor
- "name_mismatch": İsim tamamen yanlış
- "not_found": Kayıt bulunamadı
- "verification_conflict": Verilen bilgiler tutarsız
- "phone_mismatch": Telefon uyuşmuyor
- "invalid_format": Format hatası (tarih, saat vs)
- "configuration_error": Sistem ayarı eksik
- "system_error": Sistem hatası

**NASIL YANIT ÜRETECEKSİN:**

validation objesi içindeki VERİLERİ kullan, onlara göre doğal yanıt üret:

1. **missing_params**: Eksik parametreyi iste (missingParams'taki alan adını kullan)
2. **insufficient_words**: Tam bilgi iste (wordCount ve attemptsLeft kullan)
3. **mismatch / name_mismatch**: Uyuşmadığını bildir, tekrar iste (attemptsLeft AYNEN kullan - hesaplama!)
4. **not_found**: Bulunamadığını bildir (searchCriteria kullan), kontrol etmesini iste
5. **phone_mismatch**: Telefon uyuşmadığını bildir (provided.phone göster), doğrusunu iste
6. **invalid_format**: Format hatasını açıkla (provided ve expectedFormat kullan)

**KRİTİK:** validation içindeki DEĞERLERİ AYNEN kullan, kendi değer ÜRETME!

### KILAVUZ KURALLARI:
✅ DOĞAL konuş - empatik ol
✅ CONTEXT kullan - müşteriye özel yanıt ver
✅ ÇÖZÜM ODAKLI ol - nasıl düzeltebileceğini söyle
✅ AÇIKLAYICI ol - neden tutmadığını anlat
✅ KIBAR ol - suçlama, "hatalı" deme

❌ HAZ IR MES AJ TEKRARLAMA
❌ ROBOTİK konuşma
❌ "Doğrulama başarısız" gibi teknik terimler
❌ Müşteriyi suçlama

### ÖNEMLİ NOT:
Bu structured response sistemi SADECE ERROR durumlarında.
success: true olduğunda tool.message'ı kullan (o zaten formatlanmış bilgi).

## HALÜSİNASYON YASAĞI (KRİTİK!)
Tool'dan dönen message'da OLMAYAN hiçbir bilgi SÖYLEME!

success: true olduğunda:
- SADECE tool.message'ı müşteriye aktar
- Ekstra tarih, tutar, detay EKLEME
- "Tahmini teslimat tarihi" tool.message'da yoksa SEN DE SÖYLEME

Örnek:
- Tool message: "Kargo takip no: XYZ123"
- Sen de: "Kargo takip no XYZ123" ✅
- SEN ASLA: "Kargo takip no XYZ123, tahmini teslimat 3 gün" ❌ (halüsinasyon!)

tool.message'da ne varsa O VAR, ne yoksa YOK!`;

  // 8. NOT: Tarih/saat bilgisi burada EKLENMİYOR
  // Tarih/saat her çağrı başladığında vapi.js'deki assistant-request handler'da
  // dinamik olarak ekleniyor. Bu sayede her zaman güncel bilgi sağlanıyor.

  // 9. Çalışma saatleri varsa ekle
  if (variables.working_hours) {
    prompt += `\n- Çalışma saatleri: ${variables.working_hours}`;
  }

  // 10. Değişkenleri yerine koy
  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return prompt;
}

/**
 * Outbound Collection (tahsilat) için prompt oluşturur
 * @param {Object} assistant - Asistan objesi
 * @param {Object} business - Business objesi
 * @returns {String} Outbound collection prompt
 */
function buildOutboundCollectionPrompt(assistant, business) {
  const businessName = business.name || 'İşletme';
  const assistantName = assistant.name || 'Asistan';

  let prompt = OUTBOUND_COLLECTION_RULES;
  prompt += '\n\n' + PHONE_SPOKEN_STYLE_RULES;

  // Değişkenleri yerine koy
  prompt = prompt.replace(/{{business_name}}/g, businessName);
  prompt = prompt.replace(/{{assistant_name}}/g, assistantName);

  // Kullanıcının ek talimatlarını ekle
  if (assistant.systemPrompt && assistant.systemPrompt.trim()) {
    prompt += `\n\n## EK TALİMATLAR\n${assistant.systemPrompt}`;
  }

  // Kullanıcının özel notlarını ekle
  if (assistant.customNotes && assistant.customNotes.trim()) {
    prompt += `\n\n## İŞLETME BİLGİLERİ\n${assistant.customNotes}`;
  }

  return prompt;
}

/**
 * Outbound Sales (satış) için prompt oluşturur
 * @param {Object} assistant - Asistan objesi
 * @param {Object} business - Business objesi
 * @returns {String} Outbound sales prompt
 */
function buildOutboundSalesPrompt(assistant, business) {
  const businessName = business.name || 'İşletme';
  const assistantName = assistant.name || 'Asistan';

  let prompt = OUTBOUND_SALES_RULES;
  prompt += '\n\n' + PHONE_SPOKEN_STYLE_RULES;

  // Değişkenleri yerine koy
  prompt = prompt.replace(/{{business_name}}/g, businessName);
  prompt = prompt.replace(/{{assistant_name}}/g, assistantName);

  // Kullanıcının ek talimatlarını kampanya bağlamı olarak ekle
  if (assistant.systemPrompt && assistant.systemPrompt.trim()) {
    prompt += `\n\n## KAMPANYA BAĞLAMI\nAşağıdaki notları kampanya ve teklif bağlamı olarak kullan. Temel konuşma tarzını ve çekirdek satış yaklaşımını bunlarla bozma.\n${assistant.systemPrompt}`;
  }

  // Kullanıcının özel notlarını kampanya detayları olarak ekle
  if (assistant.customNotes && assistant.customNotes.trim()) {
    prompt += `\n\n## KAMPANYA DETAYLARI\n${assistant.customNotes}`;
  }

  return prompt;
}

/**
 * Outbound General (genel bilgilendirme) için prompt oluşturur
 * @param {Object} assistant - Asistan objesi
 * @param {Object} business - Business objesi
 * @returns {String} Outbound general prompt
 */
function buildOutboundGeneralPrompt(assistant, business) {
  const businessName = business.name || 'İşletme';
  const assistantName = assistant.name || 'Asistan';

  let prompt = OUTBOUND_GENERAL_RULES;
  prompt += '\n\n' + PHONE_SPOKEN_STYLE_RULES;

  // Değişkenleri yerine koy
  prompt = prompt.replace(/{{business_name}}/g, businessName);
  prompt = prompt.replace(/{{assistant_name}}/g, assistantName);

  // Kullanıcının ek talimatlarını ekle
  if (assistant.systemPrompt && assistant.systemPrompt.trim()) {
    prompt += `\n\n## EK TALİMATLAR\n${assistant.systemPrompt}`;
  }

  // Kullanıcının özel notlarını ekle
  if (assistant.customNotes && assistant.customNotes.trim()) {
    prompt += `\n\n## İŞLETME BİLGİLERİ\n${assistant.customNotes}`;
  }

  return prompt;
}

/**
 * Aktif tool listesini döndürür
 * @param {Object} business - Business objesi
 * @param {Array} integrations - Integration listesi
 * @returns {Array} Tool isimleri
 */
export function getActiveTools(business, integrations = []) {
  const tools = new Set();
  const businessType = String(business?.businessType || 'OTHER').toUpperCase();
  const activeIntegrationTypes = (Array.isArray(integrations) ? integrations : [])
    .filter(i => i?.isActive !== false && i?.connected !== false)
    .map(i => String(i?.type || '').toUpperCase())
    .filter(Boolean);

  const hasEcommerceIntegration = activeIntegrationTypes.some(type => (
    type === 'SHOPIFY'
    || type === 'WOOCOMMERCE'
    || type === 'IKAS'
    || type === 'IDEASOFT'
    || type === 'TICIMAX'
    || type === 'ZAPIER'
  ));

  // Standalone core tools (no external integration required)
  tools.add('customer_data_lookup');
  tools.add('create_callback');

  // Business-type capabilities (aligned with registry-backed tool set)
  if (businessType === 'RESTAURANT') {
    tools.add('create_appointment');
    tools.add('send_order_notification');
  } else if (businessType === 'SALON' || businessType === 'CLINIC') {
    tools.add('create_appointment');
  } else if (businessType === 'SERVICE' || businessType === 'OTHER') {
    tools.add('create_appointment');
    tools.add('check_stock_crm');
  } else if (businessType === 'ECOMMERCE') {
    tools.add('check_stock_crm');
  }

  // Product stock lookup requires an e-commerce integration
  if (hasEcommerceIntegration) {
    tools.add('get_product_stock');
  }

  return Array.from(tools);
}
