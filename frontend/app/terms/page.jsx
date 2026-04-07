'use client';

import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { useLanguage } from '@/contexts/LanguageContext';
import { FileText } from 'lucide-react';

export default function TermsPage() {
  const { locale } = useLanguage();

  const content = {
    tr: {
      title: "Kullanım Koşulları (Terms of Service)",
      lastUpdated: "Son güncelleme: 27 Ocak 2026",
      sections: [
        {
          title: "Hizmet Tanımı",
          content: `Telyx.ai ("Platform"), işletmelere yapay zeka destekli müşteri iletişimi ve operasyon yönetimi sunan bir SaaS (Hizmet Olarak Yazılım) ürünüdür. Platform; telefon, WhatsApp, chat ve e-posta kanallarından gelen talepleri tek bir merkezde toplamanıza, bu talepleri yapay zeka asistanları ile yanıtlamanıza ve kampanya/analitik gibi özelliklerle süreci yönetmenize yardımcı olur.`
        },
        {
          title: "Hesap Oluşturma ve Yetkilendirme",
          content: `Platformu kullanabilmek için bir hesap oluşturmanız gerekir.
Kabul edersiniz ki:
• Hesap bilgilerinizin doğru ve güncel olmasından siz sorumlusunuz.
• Hesabınızın güvenliğinden ve şifrenizin gizliliğinden siz sorumlusunuz.
• Yetkisiz erişim şüphesini gecikmeden bize bildirirsiniz.`
        },
        {
          title: "Üçüncü Taraf Entegrasyonları",
          content: `Platform, Google (Gmail, Google Calendar, Google Sheets gibi) ve diğer sağlayıcılar ile entegrasyon kurmanıza izin verebilir. Bu entegrasyonları bağladığınızda:
• İlgili sağlayıcının şartları da ayrıca geçerli olabilir.
• Entegrasyon bağlantısını dilediğiniz zaman Platform üzerinden kaldırabilirsiniz.
• Entegrasyon sağlayıcılarının hizmet kesintileri veya değişikliklerinden Platform sorumlu değildir.`
        },
        {
          title: "Kabul Edilebilir Kullanım",
          content: `Platformu kullanırken:
• Yasalara uygun hareket edeceğinizi,
• Spam, dolandırıcılık, kötüye kullanım veya zarar verici faaliyetlerde bulunmayacağınızı,
• Başkalarının haklarını ihlal etmeyeceğinizi,
• Güvenlik önlemlerini aşmaya çalışmayacağınızı kabul edersiniz.`
        },
        {
          title: "Planlar, Ücretlendirme ve Faturalandırma",
          content: `• Aylık/yıllık abonelik seçenekleri ve/veya kullanım bazlı (pay-as-you-go) ücretlendirme sunulabilir.
• Ücretler ve plan limitleri abonelik sayfanızda belirtilir.
• Abonelikler aksi belirtilmedikçe otomatik yenilenebilir.
• İptal, bir sonraki fatura döneminden itibaren geçerli olur.
• İade koşulları ayrıca belirtilmedikçe satın alma tarihinden itibaren 14 gün ile sınırlıdır.`
        },
        {
          title: "İçerik ve Veri Sorumluluğu",
          content: `Platforma yüklediğiniz içerik, entegrasyonlarla bağladığınız veriler ve asistanlara sağladığınız talimatlardan siz sorumlusunuz.
Platform, sizin adınıza otomasyon yapabilir ancak:
• Yanlış/yasa dışı içerik üretimi veya kullanımından Platform sorumlu değildir.
• Müşteri iletişimlerinizde yasal yükümlülüklerin (açık rıza, bilgilendirme, kayıt izinleri vb.) yerine getirilmesi sizin sorumluluğunuzdadır.`
        },
        {
          title: "Fikri Mülkiyet",
          content: `• Platformun yazılımı, arayüzü, tasarımı ve marka unsurları Telyx.ai'ye aittir.
• Siz, Platforma yüklediğiniz içeriklerin haklarını saklı tutarsınız.
• Tersine mühendislik, kopyalama, yetkisiz erişim ve benzeri eylemler yasaktır.`
        },
        {
          title: "Hizmet Seviyesi ve Sorumluluk Sınırları",
          content: `• Platform "olduğu gibi" sunulur; kesintisiz/hatasız çalışma garantisi verilmez.
• Dolaylı zararlardan sorumluluk kabul edilmez.
• Toplam sorumluluğumuz, ilgili dönemde ödediğiniz abonelik ücretleri ile sınırlıdır.
• Üçüncü taraf sağlayıcı kaynaklı kesintilerden Platform sorumlu değildir.`
        },
        {
          title: "Fesih ve Hesap Kapatma",
          content: `• Hesabınızı istediğiniz zaman kapatabilirsiniz.
• Şartların ihlali halinde hesabınız askıya alınabilir veya kapatılabilir.
• Hesap kapatma sonrası veriler, Gizlilik Politikası'nda belirtilen saklama/silme sürelerine göre işlenir.
• Yasal yükümlülükler nedeniyle bazı kayıtlar daha uzun süre saklanabilir.`
        },
        {
          title: "Değişiklikler",
          content: `Bu koşullar önceden bildirimle güncellenebilir. Önemli değişiklikler e-posta veya Platform içi bildirimle duyurulabilir. Platformu kullanmaya devam etmeniz, güncellenmiş koşulları kabul ettiğiniz anlamına gelir.`
        },
        {
          title: "İletişim",
          content: `Sorularınız için: info@telyx.ai`
        }
      ]
    },
    en: {
      title: "Terms of Service",
      lastUpdated: "Last updated: January 27, 2026",
      sections: [
        {
          title: "Service Definition",
          content: `Telyx.ai ("Platform") is a SaaS (Software as a Service) product that provides businesses with AI-powered customer communication and operations management. The Platform helps you centralize requests from phone, WhatsApp, chat, and email channels, respond to them with AI assistants, and manage the process with features like campaigns and analytics.`
        },
        {
          title: "Account Creation and Authorization",
          content: `To use the Platform, you must create an account.
You agree that:
• You are responsible for keeping your account information accurate and up-to-date.
• You are responsible for the security of your account and password confidentiality.
• You will promptly notify us of any suspected unauthorized access.`
        },
        {
          title: "Third-Party Integrations",
          content: `The Platform may allow you to integrate with Google (Gmail, Google Calendar, Google Sheets, etc.) and other providers. When you connect these integrations:
• The relevant provider's terms may also apply separately.
• You can remove the integration connection at any time through the Platform.
• The Platform is not responsible for service interruptions or changes from integration providers.`
        },
        {
          title: "Acceptable Use",
          content: `When using the Platform, you agree to:
• Act in accordance with laws,
• Not engage in spam, fraud, abuse, or harmful activities,
• Not violate the rights of others,
• Not attempt to bypass security measures.`
        },
        {
          title: "Plans, Pricing, and Billing",
          content: `• Monthly/annual subscription options and/or pay-as-you-go pricing may be offered.
• Fees and plan limits are specified on your subscription page.
• Subscriptions may auto-renew unless otherwise specified.
• Cancellation takes effect from the next billing period.
• Refund terms are limited to 14 days from purchase date unless otherwise specified.`
        },
        {
          title: "Content and Data Responsibility",
          content: `You are responsible for content you upload to the Platform, data you connect through integrations, and instructions you provide to assistants.
The Platform may automate on your behalf, however:
• The Platform is not responsible for incorrect/illegal content generation or use.
• Meeting legal obligations in your customer communications (explicit consent, disclosure, recording permissions, etc.) is your responsibility.`
        },
        {
          title: "Intellectual Property",
          content: `• The Platform's software, interface, design, and brand elements belong to Telyx.ai.
• You retain rights to content you upload to the Platform.
• Reverse engineering, copying, unauthorized access, and similar actions are prohibited.`
        },
        {
          title: "Service Level and Liability Limitations",
          content: `• The Platform is provided "as is"; no guarantee of uninterrupted/error-free operation is given.
• Liability for indirect damages is not accepted.
• Our total liability is limited to the subscription fees you paid in the relevant period.
• The Platform is not responsible for interruptions caused by third-party providers.`
        },
        {
          title: "Termination and Account Closure",
          content: `• You can close your account at any time.
• Your account may be suspended or closed in case of terms violation.
• After account closure, data is processed according to retention/deletion periods specified in the Privacy Policy.
• Some records may be retained longer due to legal obligations.`
        },
        {
          title: "Changes",
          content: `These terms may be updated with prior notice. Significant changes may be announced via email or in-Platform notification. Continuing to use the Platform means you accept the updated terms.`
        },
        {
          title: "Contact",
          content: `For questions: info@telyx.ai`
        }
      ]
    }
  };

  const currentContent = content[locale] || content.tr;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#edf3ff] via-white to-[#edfbff] dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      <Navigation />

      {/* Hero Section */}
      <section className="pt-28 md:pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-[#051752] via-[#000ACF] to-[#00C4E6] rounded-2xl flex items-center justify-center mx-auto mb-6 md:mb-8"
            >
              <FileText className="w-8 h-8 md:w-10 md:h-10 text-white" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold mb-4 text-gray-900 dark:text-white"
            >
              {currentContent.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-gray-600 dark:text-neutral-400"
            >
              {currentContent.lastUpdated}
            </motion.p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-white dark:bg-neutral-800 rounded-2xl p-8 md:p-12 shadow-sm border border-gray-100 dark:border-neutral-700"
            >
              <div className="prose prose-gray dark:prose-invert max-w-none">
                {currentContent.sections.map((section, index) => (
                  <div key={index} className={index > 0 ? 'mt-8' : ''}>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                      {index + 1}. {section.title}
                    </h2>
                    <p className="text-gray-600 dark:text-neutral-300 whitespace-pre-line">
                      {section.content}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
