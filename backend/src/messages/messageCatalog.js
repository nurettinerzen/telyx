import { buildDeterministicSeed, selectVariant } from './variant-selector.js';

const VARIANT_MODE_OFF_VALUES = new Set(['0', 'false', 'off', 'legacy']);

function isVariantModeEnabled() {
  const raw = process.env.VARIANT_MODE;
  if (!raw) return true;
  return !VARIANT_MODE_OFF_VALUES.has(String(raw).trim().toLowerCase());
}

export function normalizeLanguage(language = 'TR') {
  const normalized = String(language || 'TR').trim().toUpperCase();
  return normalized === 'EN' ? 'EN' : 'TR';
}

function interpolate(template, variables = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (!(key in variables)) return match;
    return String(variables[key]);
  });
}

const MESSAGE_CATALOG = {
  ASSISTANT_DEFAULT_FIRST_MESSAGE: {
    TR: [
      'Merhaba, ben {name}. Size nasıl destek olabilirim?',
      'Merhaba, ben {name}. Bugün hangi konuda yardımcı olmamı istersiniz?',
      'Merhaba, ben {name}. Nereden başlamak istersiniz?'
    ],
    EN: [
      "Hello, I'm {name}. How can I support you today?",
      "Hello, I'm {name}. What would you like help with today?",
      "Hello, I'm {name}. Where would you like to start?"
    ]
  },
  CHATTER_GREETING_IDLE: {
    TR: [
      'Selam, buradayım. Ne kontrol etmemi istersiniz?',
      'Merhaba, hoş geldiniz. Kısa bir not bırakın, hemen ilgileneyim.',
      'Selamlar, yardımcı olmaya hazırım.'
    ],
    EN: [
      "Hi, I'm here. What would you like me to check?",
      'Hello, welcome. Share a quick note and I will jump in.',
      'Hey there, I am ready to help.'
    ]
  },
  CHATTER_GREETING_ACTIVE: {
    TR: [
      'Selam, kaldığımız yerden devam edelim.',
      'Merhaba tekrar, mevcut konuyu birlikte tamamlayalım.',
      'Selam, süreç açık. Son adımı bitirelim.'
    ],
    EN: [
      'Hi again, let us continue from where we left off.',
      'Hello again, we can finish the current task together.',
      'Hey, the process is still open. Let us complete the next step.'
    ]
  },
  CHATTER_THANKS_IDLE: {
    TR: [
      'Rica ederim.',
      'Ne demek, memnuniyetle.',
      'Her zaman, buradayım.'
    ],
    EN: [
      'You are welcome.',
      'My pleasure.',
      'Anytime, I am here.'
    ]
  },
  CHATTER_THANKS_ACTIVE: {
    TR: [
      'Rica ederim. Hazırsanız mevcut işlemi tamamlayalım.',
      'Memnun oldum. Devam etmek için bir sonraki adımı geçebiliriz.',
      'Ne demek. İsterseniz aynı konudan devam edelim.'
    ],
    EN: [
      'You are welcome. If you are ready, we can finish the current request.',
      'Glad to help. We can move to the next step now.',
      'Anytime. We can continue with the same topic.'
    ]
  },
  CHATTER_GENERIC_IDLE: {
    TR: [
      'Sizi dinliyorum.',
      'Buradayım, devam edebiliriz.',
      'Tamam, hazırım.'
    ],
    EN: [
      'I am listening.',
      'I am here, we can continue.',
      'Sure, I am ready.'
    ]
  },
  CHATTER_GENERIC_ACTIVE: {
    TR: [
      'Mesajınızı aldım. Mevcut adımı tamamlayalım.',
      'Anladım. Süreci sürdürmek için bir sonraki bilgiyle devam edebiliriz.',
      'Tamamdır, aynı işlemdeyiz. Devam edelim.'
    ],
    EN: [
      'Got your message. Let us complete the current step.',
      'Understood. We can continue the process with the next detail.',
      'All right, we are in the same flow. Let us proceed.'
    ]
  },
  VERIFICATION_REQUEST_PHONE_LAST4: {
    TR: [
      'Kaydınızı buldum. Güvenlik doğrulaması için telefon numaranızın son 4 hanesini paylaşır mısınız?',
      'Kayda ulaştım. Devam edebilmem için telefonunuzun son 4 hanesini teyit eder misiniz?',
      'Kayıt mevcut görünüyor. Doğrulama için telefon numaranızın son 4 rakamını alabilir miyim?'
    ],
    EN: [
      'I found your record. For security verification, could you share the last 4 digits of your phone number?',
      'Your record is available. To continue securely, please confirm the last 4 digits of your phone number.',
      'I can see your record. For verification, may I have the last 4 digits of your phone number?'
    ]
  },
  VERIFICATION_REQUEST_NAME: {
    TR: [
      'Kaydınızı buldum. Güvenlik doğrulaması için adınızı ve soyadınızı paylaşır mısınız?',
      'Kayda ulaştım. Devam etmeden önce ad-soyad bilginizi teyit edebilir misiniz?',
      'Kayıt mevcut. Doğrulama için adınızı ve soyadınızı alabilir miyim?'
    ],
    EN: [
      'I found your record. For security verification, could you share your full name?',
      'Your record is available. Before we continue, please confirm your full name.',
      'I can see your record. For verification, may I have your full name?'
    ]
  },
  VERIFICATION_FAILED: {
    TR: [
      'Paylaştığınız bilgi kayıtla eşleşmiyor. Güvenlik nedeniyle detay paylaşamıyorum.',
      'Bu bilgi kayıtla doğrulanmadı. Güvenlik nedeniyle detay veremiyorum.',
      'Doğrulama bilgisi eşleşmedi. Güvenlik gereği bu aşamada detay paylaşamıyorum.'
    ],
    EN: [
      'The information you shared does not match our records. I cannot share details for security reasons.',
      'This verification information did not match our records. I cannot provide details for security reasons.',
      'Verification did not match. For security, I cannot share details at this stage.'
    ]
  },
  VERIFICATION_REGEN_ORDER_AND_PHONE: {
    TR: [
      'Sipariş bilgilerine erişebilmem için doğrulama gerekiyor. Sipariş numaranızı ve telefon numaranızın son 4 hanesini paylaşır mısınız?',
      'Devam etmek için güvenlik doğrulaması gerekli. Sipariş numaranızı ve telefonunuzun son 4 hanesini alabilir miyim?',
      'Sipariş detaylarını açabilmem için doğrulama yapmam gerekiyor. Sipariş numarasıyla birlikte telefonun son 4 hanesini iletir misiniz?'
    ],
    EN: [
      'Verification is required to access your order details. Please share your order number and the last 4 digits of your phone.',
      'To continue securely, I need your order number and the last 4 digits of your phone number.',
      'I need to verify your identity before opening order details. Please provide your order number and the last 4 digits of your phone.'
    ]
  },
  VERIFICATION_REGEN_ORDER_ONLY: {
    TR: [
      'Bu bilgiyi kontrol etmem için sipariş numaranızı paylaşır mısınız?',
      'Kontrol sağlayabilmem için sipariş numaranızı iletir misiniz?',
      'Devam edebilmem için sipariş numarasına ihtiyacım var, paylaşabilir misiniz?'
    ],
    EN: [
      'Could you share your order number so I can check this for you?',
      'I need your order number to verify this information. Could you provide it?',
      'Please share your order number so I can continue.'
    ]
  },
  CALLBACK_INFO_REQUIRED: {
    TR: [
      'Sizi arayabilmemiz için {fields} paylaşır mısınız?',
      'Geri arama kaydı açabilmem için {fields} bilgisine ihtiyacım var.',
      'Bu talebi iletebilmem için lütfen {fields} bilgisini yazın.'
    ],
    EN: [
      'To arrange your callback, could you share your {fields}?',
      'I need your {fields} to create a callback request.',
      'Please share your {fields} so I can submit this callback request.'
    ]
  },
  ORDER_PHONE_LAST4_REQUIRED: {
    TR: [
      'Sipariş numarasını aldım. Devam edebilmem için kayıtlı telefon numaranızın son 4 hanesini paylaşır mısınız?',
      'Devam etmek için siparişe bağlı telefon numaranızın son 4 rakamını rica ederim.',
      'Bu siparişte ilerlemek için telefonunuzun son 4 hanesini yazabilir misiniz?'
    ],
    EN: [
      'I have your order number. To continue, please share the last 4 digits of your registered phone number.',
      'To proceed, could you confirm the last 4 digits of the phone linked to this order?',
      'Please provide the last 4 digits of your phone number so I can continue with this order.'
    ]
  },
  TERMINATED_CONVERSATION: {
    TR: [
      'Bu görüşme sonlandırılmıştır.',
      'Bu oturum şu an kapalı görünüyor.',
      'Bu görüşme güvenlik politikası gereği kapatılmıştır.'
    ],
    EN: [
      'This conversation has ended.',
      'This session is currently closed.',
      'This conversation has been closed under our security policy.'
    ]
  },
  FATAL_ERROR: {
    TR: [
      'Özür dilerim, bir hata oluştu. Lütfen tekrar deneyin.',
      'Şu anda bir teknik sorun yaşıyorum. Biraz sonra tekrar dener misiniz?',
      'Geçici bir hata oluştu. Lütfen kısa bir süre sonra yeniden deneyin.'
    ],
    EN: [
      'I apologize, an error occurred. Please try again.',
      'I am facing a temporary technical issue. Could you try again shortly?',
      'A temporary error occurred. Please try again in a moment.'
    ]
  },
  FIREWALL_FALLBACK: {
    TR: [
      'Üzgünüm, yanıtımda bir sorun oluştu. Size daha iyi yardımcı olabilmem için sorunuzu farklı bir şekilde sorar mısınız?',
      'Üzgünüm, bu yanıtı güvenlik nedeniyle yeniden oluşturmam gerekiyor. Sorunuzu farklı şekilde yazabilir misiniz?',
      'Üzgünüm, yanıtı güvenli biçimde tekrar üretmem gerekiyor. Soruya farklı bir ifadeyle devam edebilir miyiz?'
    ],
    EN: [
      'Sorry, there was an issue with my response. Could you please rephrase your question so I can help you better?',
      'Sorry, I need to regenerate that response safely. Could you rephrase your question?',
      'Sorry, I need to provide this in a safer format. Could you ask in a different way?'
    ]
  },
  LOCK_ABUSE: {
    TR: [
      'Bu dil nedeniyle sohbet kapatıldı. Lütfen daha sonra tekrar deneyin.',
      'Kullandığınız dil nedeniyle oturum geçici olarak kapatıldı. Bir süre sonra yeniden deneyebilirsiniz.',
      'Güvenli iletişim kuralı nedeniyle bu oturum kapatıldı. Biraz sonra tekrar yazabilirsiniz.'
    ],
    EN: [
      'Conversation closed due to inappropriate language. Please try again later.',
      'This session was temporarily closed due to language used. Please try again later.',
      'This session has been closed under safe communication rules. Please try again after a short time.'
    ]
  },
  LOCK_THREAT: {
    TR: [
      'Güvenlik nedeniyle sohbet kalıcı olarak kapatılmıştır.',
      'Tehdit içerikli dil nedeniyle bu görüşme kalıcı olarak sonlandırılmıştır.',
      'Güvenlik politikamız gereği bu oturum kalıcı olarak kapatıldı.'
    ],
    EN: [
      'Conversation permanently closed for security reasons.',
      'This conversation has been permanently terminated due to threatening language.',
      'This session has been permanently closed under our security policy.'
    ]
  },
  LOCK_PII_RISK: {
    TR: [
      'Güvenlik nedeniyle sohbet kapatıldı. Lütfen daha sonra tekrar deneyin.',
      'Hassas veri güvenliği nedeniyle oturum geçici olarak kapatıldı. Biraz sonra tekrar deneyebilirsiniz.',
      'Bu oturum güvenlik denetimi nedeniyle kapatıldı. Daha sonra tekrar deneyin.'
    ],
    EN: [
      'Conversation closed for security reasons. Please try again later.',
      'This session was temporarily closed due to sensitive data protection. Please try again later.',
      'This session has been closed for a security review. Please try again later.'
    ]
  },
  LOCK_SECURITY_BYPASS: {
    TR: [
      'Güvenlik kurallarını devre dışı bırakarak devam edemem. Lütfen 30 dakika sonra tekrar deneyin.',
      'Doğrulama ve güvenlik adımları zorunludur. Bu oturum 30 dakika süreyle kapatıldı.',
      'Güvenlik önlemlerini atlamaya yönelik denemeler nedeniyle bu görüşme geçici olarak durduruldu. 30 dakika sonra tekrar deneyin.'
    ],
    EN: [
      'I cannot continue by disabling security rules. Please try again in 30 minutes.',
      'Verification and security steps are mandatory. This session has been paused for 30 minutes.',
      'This conversation has been temporarily stopped due to attempts to bypass required safeguards. Please try again in 30 minutes.'
    ]
  },
  LOCK_LOOP: {
    TR: [
      'Teknik sorun nedeniyle sohbet geçici olarak kapatıldı. 10 dakika sonra tekrar deneyin.',
      'Sistem döngüsü tespit edildiği için bu görüşme geçici olarak durduruldu. 10 dakika sonra yeniden deneyin.',
      'Geçici teknik koruma nedeniyle oturum kapatıldı. 10 dakika sonra tekrar yazabilirsiniz.'
    ],
    EN: [
      'Technical issue detected. Please try again in 10 minutes.',
      'A system loop was detected, so this session was paused. Please try again in 10 minutes.',
      'Session temporarily closed due to technical protection. Please try again in 10 minutes.'
    ]
  },
  LOCK_SPAM: {
    TR: [
      'Spam tespit edildi. Lütfen 5 dakika sonra tekrar deneyin.',
      'Çok sık istek nedeniyle oturum kısa süreliğine kapatıldı. 5 dakika sonra tekrar deneyin.',
      'Yoğun tekrar nedeniyle bu oturum durduruldu. 5 dakika sonra yeniden yazabilirsiniz.'
    ],
    EN: [
      'Spam detected. Please try again in 5 minutes.',
      'This session was temporarily closed due to repeated requests. Please try again in 5 minutes.',
      'Frequent repeated messages were detected. Please try again in 5 minutes.'
    ]
  },
  LOCK_ENUMERATION: {
    TR: [
      'Çok fazla başarısız doğrulama denemesi. Lütfen 2 dakika sonra tekrar deneyin.',
      'Doğrulama denemesi limiti aşıldı. 2 dakika sonra tekrar deneyebilirsiniz.',
      'Güvenlik nedeniyle kısa bekleme süresi uygulandı. 2 dakika sonra tekrar deneyin.'
    ],
    EN: [
      'Too many failed verification attempts. Please try again in 2 minutes.',
      'Verification attempt limit reached. You can try again in 2 minutes.',
      'A short security cooldown has been applied. Please try again in 2 minutes.'
    ]
  },
  LOCK_UNKNOWN: {
    TR: [
      'Sohbet kapatılmıştır.',
      'Bu oturum kapatıldı.',
      'Görüşme şu anda kapalı.'
    ],
    EN: [
      'Conversation has been closed.',
      'This session has been closed.',
      'This conversation is currently closed.'
    ]
  },
  SECURITY_PRODUCT_NOT_FOUND: {
    TR: [
      'Bu ürünü sistemimizde bulamadım. Ürün adını, model numarasını veya barkodunu paylaşır mısınız? Böylece daha doğru bir arama yapabilirim.',
      'Bu ürün için eşleşen bir kayıt bulunamadı. Ürün adı, model no veya barkod ile tekrar kontrol edebilirim.',
      'Bu ürün şu anda kayıtlarda bulunamadı. İsterseniz ürün adı ya da barkod bilgisiyle yeniden arayabilirim.'
    ],
    EN: [
      "I couldn't find this product in our system. Could you share the product name, model number, or barcode so I can search more accurately?",
      'No matching product record was found. I can recheck if you share the product name, model number, or barcode.',
      'This product could not be found in our records. I can search again with the product name or barcode.'
    ]
  },
  SECURITY_ORDER_NOT_FOUND_FABRICATION: {
    TR: [
      'Bu sipariş numarasıyla eşleşen bir kayıt bulunamadı. Sipariş numaranızı kontrol edip tekrar paylaşır mısınız? Alternatif olarak, siparişi verirken kullandığınız telefon numarası veya e-posta adresiyle de arama yapabilirim.',
      'Bu sipariş için eşleşen kayıt bulunamadı. Sipariş numarasını yeniden kontrol edip paylaşabilir misiniz? Dilerseniz telefon veya e-posta ile de arama yapabilirim.',
      'Bu sipariş numarası kayıtlarda bulunamadı. Sipariş numarasını tekrar iletir misiniz? İsterseniz kayıtlı telefon ya da e-posta ile de bakabilirim.'
    ],
    EN: [
      'No record was found matching this order number. Could you double-check and share it again? Alternatively, I can search using the phone number or email used for the order.',
      'I could not find a matching record for this order number. Please verify it and share again, or I can search by phone or email.',
      'This order number was not found in our records. Please resend it, or I can check via the phone number or email used at purchase.'
    ]
  },
  SECURITY_ORDER_NOT_FOUND_NOT_ACK: {
    TR: [
      'Bu sipariş numarasıyla eşleşen bir kayıt bulunamadı. Sipariş numaranızı kontrol edip tekrar paylaşır mısınız?',
      'Bu sipariş için eşleşen kayıt bulunamadı. Sipariş numarasını doğrulayıp yeniden iletir misiniz?',
      'Bu sipariş numarası kayıtlarda bulunamadı. Lütfen numarayı kontrol edip tekrar paylaşın.'
    ],
    EN: [
      'No record was found matching this order number. Could you please verify and share it again?',
      'I could not find a record for this order number. Please double-check and send it again.',
      'This order number was not found in our records. Please verify it and resend.'
    ]
  },
  NOT_FOUND_REPEAT: {
    TR: [
      'Bu bilgilerle daha önce arama yaptım ve kayıt bulunamadı. Farklı bir sipariş numarası, telefon numarası veya e-posta adresi paylaşırsanız tekrar kontrol edebilirim.',
      'Aynı bilgilerle kayıt bulunamadı. Lütfen sipariş numaranızı kontrol edin veya farklı bir bilgi (telefon, e-posta) ile deneyelim.',
      'Bu bilgiyle eşleşen kayıt yok. Sipariş numarasını tekrar kontrol eder misiniz? Alternatif olarak telefon numaranızla da arayabilirim.'
    ],
    EN: [
      'I already searched with this information and no record was found. Could you share a different order number, phone number, or email so I can check again?',
      'No record found with the same information. Please verify your order number or try with a different identifier.',
      'No matching record for this information. Could you double-check the order number? I can also search by phone or email.'
    ]
  },
  SECURITY_TOOL_REQUIRED_PRODUCT_SPEC: {
    TR: [
      'Bu ürünün teknik özellikleri şu an sistemimde yok. Ürün adını, linkini veya ürün kodunu paylaşırsanız kontrol edebilirim.',
      'Sorduğunuz ürünle ilgili detaylı bilgi elimde bulunmuyor. Ürün kodu veya tam adını paylaşır mısınız? Ayrıca web sitemizden de kontrol edebilirsiniz.',
      'Bu ürünün özelliklerini görüntüleyemiyorum. Bana ürün kodunu veya linkini iletirseniz yardımcı olmaya çalışırım.'
    ],
    EN: [
      "I don't have the technical specs for this product in my system right now. Could you share the product name, link, or SKU so I can look it up?",
      "I don't have detailed information about that product. If you share the product code or full name, I can try to help. You can also check our website for details.",
      "I can't access specifications for this product. Could you provide the product code or a link? I'll do my best to help."
    ]
  },
  SECURITY_TOOL_REQUIRED_STOCK_CHECK: {
    TR: [
      'Stok durumunu kontrol edebilmem için ürün adını veya ürün kodunu paylaşır mısınız?',
      'Hangi ürünün stok durumunu merak ediyorsunuz? Ürün adını veya kodunu iletirseniz bakabilirim.',
      'Stok bilgisine erişebilmem için ürünü belirtmeniz gerekiyor. Ürün adı veya kodu paylaşabilir misiniz?'
    ],
    EN: [
      'Could you share the product name or code so I can check stock availability for you?',
      'Which product are you asking about? If you share the product name or SKU, I can look into it.',
      'I need the product name or code to check stock. Could you provide that?'
    ]
  },
  SECURITY_IDENTITY_MISMATCH_HARD_DENY: {
    TR: [
      'Güvenliğiniz için, bu bilgileri sadece hesap sahibiyle paylaşabilirim. Lütfen hesabınıza kayıtlı bilgilerle doğrulama yapın.',
      'Bu kayıt farklı bir hesaba ait görünüyor. Güvenlik nedeniyle sadece hesap sahibi doğrulama yaptığında bilgi paylaşabilirim.',
      'Güvenlik gereği bu bilgi yalnızca hesap sahibiyle paylaşılabilir. Lütfen kayıtlı bilgilerle doğrulama yapın.'
    ],
    EN: [
      'For your security, I can only share this information with the account holder. Please verify with your registered account details.',
      'This record appears to belong to a different account. For security, I can only proceed after account-holder verification.',
      'For security reasons, this information can only be shared with the account holder after verification.'
    ]
  },
  TOOL_FAIL_CREATE_CALLBACK: {
    TR: [
      'Şu an talebinizi sistemimize kaydedemedim. Yardım almak için:\n• Birkaç dakika sonra tekrar deneyebilirsiniz\n• Müşteri hizmetlerimizi arayabilirsiniz\n• Web sitemizden destek talebi oluşturabilirsiniz',
      'Talebinizi şu anda sisteme işleyemedim. İsterseniz:\n• Birkaç dakika sonra yeniden deneyin\n• Müşteri hizmetlerini arayın\n• Web sitemizden destek kaydı açın'
    ],
    EN: [
      'I could not record your request right now. To get help:\n• Try again in a few minutes\n• Call our customer service\n• Submit a support request on our website',
      'I could not process your request in the system right now. You can:\n• Try again in a few minutes\n• Call customer service\n• Open a support request on our website'
    ]
  },
  TOOL_FAIL_CUSTOMER_DATA_LOOKUP: {
    TR: [
      'Bilgilerinizi sorgularken bir sorun oluştu. Yardım almak için:\n• Birkaç dakika sonra tekrar deneyebilirsiniz\n• Sipariş numaranızı kontrol edebilirsiniz\n• Müşteri hizmetlerimize ulaşabilirsiniz',
      'Kayıt sorgusunda geçici bir sorun yaşadım. Şu adımlar işe yarayabilir:\n• Kısa süre sonra tekrar deneyin\n• Sipariş numaranızı kontrol edin\n• Müşteri hizmetlerimize ulaşın'
    ],
    EN: [
      'There was an issue looking up your information. To get help:\n• Try again in a few minutes\n• Check your order number\n• Contact our customer service',
      'I ran into a temporary issue while checking your records. You can:\n• Try again shortly\n• Verify your order number\n• Contact customer service'
    ]
  },
  TOOL_FAIL_CALENDLY: {
    TR: [
      'Randevu sistemine bağlanırken bir sorun oluştu. Yardım almak için:\n• Birkaç dakika sonra tekrar deneyebilirsiniz\n• Web sitemizden randevu alabilirsiniz\n• Bizi arayarak randevu oluşturabilirsiniz',
      'Randevu sistemine şu an erişemedim. Şunları deneyebilirsiniz:\n• Birkaç dakika sonra tekrar deneyin\n• Web sitemizden randevu alın\n• Bizi arayıp randevu oluşturun'
    ],
    EN: [
      'Could not connect to appointment system. To get help:\n• Try again in a few minutes\n• Book an appointment on our website\n• Call us to schedule an appointment',
      'I could not access the appointment system right now. You can:\n• Try again shortly\n• Book via our website\n• Call us to schedule'
    ]
  },
  TOOL_FAIL_DEFAULT: {
    TR: [
      'Şu an sistemsel bir aksaklık yaşıyoruz. Yardım almak için:\n• Birkaç dakika sonra tekrar deneyebilirsiniz\n• Müşteri hizmetlerimize e-posta gönderebilirsiniz\n• Destek hattımızı arayabilirsiniz',
      'Geçici bir sistem sorunu yaşıyoruz. Yardım almak için:\n• Kısa süre sonra tekrar deneyin\n• Müşteri hizmetlerine e-posta gönderin\n• Destek hattımızı arayın'
    ],
    EN: [
      'We are experiencing a system issue. To get help:\n• Try again in a few minutes\n• Email our customer service\n• Call our support line',
      'We are facing a temporary system issue. You can:\n• Try again shortly\n• Email customer service\n• Call the support line'
    ]
  },
  TOOL_FAIL_ACTION_CLAIM: {
    TR: [
      'Özür dilerim, talebinizi şu an işleme alamadım. Yardım almak için şu adımları izleyebilirsiniz:\n• Birkaç dakika sonra tekrar deneyebilirsiniz\n• Müşteri hizmetlerimize e-posta gönderebilirsiniz\n• Destek hattımızı arayabilirsiniz',
      'Üzgünüm, işlemi şu anda tamamlayamadım. Yardım için:\n• Kısa süre sonra yeniden deneyin\n• Müşteri hizmetlerine e-posta gönderin\n• Destek hattımızı arayın'
    ],
    EN: [
      'I apologize, I could not process your request right now. To get help, you can:\n• Try again in a few minutes\n• Email our customer service\n• Call our support line',
      'Sorry, I could not complete this request right now. You can:\n• Try again shortly\n• Email customer service\n• Call support'
    ]
  },
  EMAIL_TOOL_REQUIRED_ORDER: {
    TR: ['Sipariş bilgilerinize ulaşabilmem için sipariş numaranızı veya kayıtlı telefon numaranızı paylaşır mısınız?'],
    EN: ['Could you please provide your order number or registered phone number so I can look up your order details?']
  },
  EMAIL_TOOL_REQUIRED_BILLING: {
    TR: ['Fatura bilgilerinize erişebilmem için kayıtlı telefon numaranızı veya fatura numarasını paylaşır mısınız?'],
    EN: ['Could you please provide your registered phone number or invoice number so I can access your billing information?']
  },
  EMAIL_TOOL_REQUIRED_APPOINTMENT: {
    TR: ['Randevu bilgilerinize ulaşabilmem için kayıtlı telefon numaranızı paylaşır mısınız?'],
    EN: ['Could you please provide your registered phone number so I can look up your appointment details?']
  },
  EMAIL_TOOL_REQUIRED_SUPPORT: {
    TR: ['Servis kaydınızı kontrol edebilmem için servis numaranızı veya kayıtlı telefon numaranızı paylaşır mısınız?'],
    EN: ['Could you please provide your service ticket number or registered phone number so I can check your service status?']
  },
  EMAIL_TOOL_REQUIRED_COMPLAINT: {
    TR: ['Şikayetinizi inceleyebilmem için sipariş numaranızı veya kayıtlı telefon numaranızı paylaşır mısınız?'],
    EN: ['Could you please provide your order number or registered phone number so I can investigate your complaint?']
  },
  EMAIL_TOOL_REQUIRED_TRACKING: {
    TR: ['Kargo durumunuzu kontrol edebilmem için takip numaranızı veya sipariş numaranızı paylaşır mısınız?'],
    EN: ['Could you please provide your tracking number or order number so I can check your shipment status?']
  },
  EMAIL_TOOL_REQUIRED_PRICING: {
    TR: ['Güncel fiyat bilgisini verebilmem için ürün adını veya kodunu belirtir misiniz?'],
    EN: ['Could you please specify the product name or code so I can provide current pricing information?']
  },
  EMAIL_TOOL_REQUIRED_STOCK: {
    TR: ['Stok durumunu kontrol edebilmem için ürün adını veya stok kodunu belirtir misiniz?'],
    EN: ['Could you please provide the product name or SKU so I can check stock availability?']
  },
  EMAIL_TOOL_REQUIRED_RETURN: {
    TR: ['İade işleminizi takip edebilmem için sipariş numaranızı veya iade numaranızı paylaşır mısınız?'],
    EN: ['Could you please provide your order number or return number so I can track your return request?']
  },
  EMAIL_TOOL_REQUIRED_REFUND: {
    TR: ['İade sürecini kontrol edebilmem için sipariş numaranızı veya kayıtlı telefon numaranızı paylaşır mısınız?'],
    EN: ['Could you please provide your order number or registered phone number so I can check your refund status?']
  },
  EMAIL_TOOL_REQUIRED_ACCOUNT: {
    TR: ['Hesap bilgilerinize erişebilmem için kayıtlı telefon numaranızı veya email adresinizi paylaşır mısınız?'],
    EN: ['Could you please provide your registered phone number or email address so I can access your account information?']
  },
  EMAIL_SYSTEM_ERROR_FALLBACK: {
    TR: ['Sistemimizde geçici bir sorun yaşanıyor. Kısa süre içinde size dönüş yapacağız.'],
    EN: ['We are experiencing a temporary system issue. We will get back to you shortly.']
  },
  EMAIL_NOT_FOUND_GENERIC: {
    TR: ['Kayıtlarımızda bu bilgiye ulaşamadım. Lütfen {fields} bilgisini kontrol edip tekrar paylaşır mısınız?'],
    EN: ['I could not find this information in our records. Could you please verify your {fields}?']
  }
};

export function hasMessageKey(key) {
  return Boolean(MESSAGE_CATALOG[key]);
}

export function getMessageVariant(key, options = {}) {
  const {
    language = 'TR',
    sessionId = '',
    directiveType = '',
    severity = '',
    channel = '',
    intent = '',
    seedHint = '',
    avoidVariantIndex = null,
    avoidVariantIndexes = [],
    variables = {}
  } = options;

  const lang = normalizeLanguage(language);
  const entry = MESSAGE_CATALOG[key];

  if (!entry) {
    return {
      text: '',
      messageKey: key,
      language: lang,
      variantIndex: 0
    };
  }

  const variants = entry[lang] || entry.TR || entry.EN || [];
  const normalizedVariants = Array.isArray(variants) ? variants : [variants];
  const seed = buildDeterministicSeed([
    key,
    sessionId,
    directiveType,
    severity,
    channel,
    intent,
    seedHint
  ]);

  const selected = isVariantModeEnabled()
    ? selectVariant(normalizedVariants, seed)
    : { value: normalizedVariants[0] || '', index: 0 };
  const avoidSet = new Set(
    [
      ...(Array.isArray(avoidVariantIndexes) ? avoidVariantIndexes : []),
      avoidVariantIndex
    ].filter(index => Number.isInteger(index))
  );

  let finalIndex = selected.index;
  if (normalizedVariants.length > 1 && avoidSet.has(finalIndex)) {
    for (let offset = 1; offset < normalizedVariants.length; offset += 1) {
      const candidate = (selected.index + offset) % normalizedVariants.length;
      if (!avoidSet.has(candidate)) {
        finalIndex = candidate;
        break;
      }
    }
  }
  const finalValue = normalizedVariants[finalIndex] || '';

  return {
    text: interpolate(finalValue, variables),
    messageKey: key,
    language: lang,
    variantIndex: finalIndex
  };
}

export function getMessage(key, options = {}) {
  return getMessageVariant(key, options).text;
}

export default {
  hasMessageKey,
  getMessage,
  getMessageVariant,
  normalizeLanguage
};
