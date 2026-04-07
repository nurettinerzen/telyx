'use client';

import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { useLanguage } from '@/contexts/LanguageContext';
import { Shield } from 'lucide-react';

export default function PrivacyPage() {
  const { locale } = useLanguage();

  const content = {
    tr: {
      title: "Gizlilik Politikası (Privacy Policy)",
      lastUpdated: "Son güncelleme: 27 Ocak 2026",
      sections: [
        {
          title: "Toplanan Veriler",
          content: `Platformu kullandığınızda şu veriler toplanabilir:
• Hesap bilgileri: Ad, soyad, e-posta, şifre, telefon numarası
• İşletme bilgileri: İşletme adı, türü, açıklama
• Entegrasyon verileri: OAuth token'ları (Google, diğer sağlayıcılar)
• İletişim verileri: Gelen/giden telefon, WhatsApp, e-posta, chat görüşme kayıtları, müşteri bilgileri, işlem özeti, zaman damgası
• Kullanım/log verileri: IP adresi, tarayıcı bilgileri, erişim logları, hata raporları
• Kampanya ve otomasyon verileri: Oluşturduğunuz senaryolar, arama listeleri, mesajlaşma akışları`
        },
        {
          title: "Verilerin Kullanım Amaçları",
          content: `Toplanan veriler yalnızca şu amaçlarla kullanılır:
• Hizmeti sağlamak ve yönetmek (hesap oluşturma, kimlik doğrulama)
• Platform özelliklerinin çalışmasını sağlamak (entegrasyonlar, aramalar, raporlama)
• Güvenlik ve dolandırıcılık önleme
• Hizmetin iyileştirilmesi, teknik destek ve hata giderme
• Yasal yükümlülüklerin yerine getirilmesi

Verileriniz izniniz olmadan pazarlama amacıyla üçüncü kişilerle paylaşılmaz.`
        },
        {
          title: "Veri Koruma Mekanizmaları",
          content: `Verilerinizin güvenliğini sağlamak için:
• Veri tabanı şifreleme ve güvenli saklama
• HTTPS üzerinden şifreli iletişim
• OAuth 2.0 standartları ile güvenli entegrasyon
• Erişim kontrolleri ve yetkilendirme
• Düzenli güvenlik güncellemeleri`
        },
        {
          title: "Saklama / Retention / Silme Politikası",
          content: `• İletişim kayıtları (arama, chat, e-posta): Platform üzerinden istediğiniz zaman silebilirsiniz.
• Hesap bilgileri: Hesabınızı kapatana kadar saklanır.
• Yasal yükümlülükler: Bazı kayıtlar (fatura, ödeme bilgileri) yasal gereklilikler nedeniyle daha uzun süre saklanabilir (örn. vergi kanunları gereği).
• Hesap kapatıldığında: Kişisel verileriniz yasal saklama süreleri hariç makul sürede silinir veya anonim hale getirilir.`
        },
        {
          title: "Üçüncü Taraflarla Paylaşım",
          content: `Verileriniz şu durumlarda üçüncü taraflarla paylaşılabilir:
• Entegrasyon sağlayıcıları (Google, WhatsApp vb.): Sadece entegrasyon çalışması için gerekli kısım.
• Sesli arama ve yapay zeka servis sağlayıcıları (örn. ElevenLabs, OpenAI): Konuşma işleme ve asistan çalıştırmak için gerekli veriler.
• Ödeme işleyiciler: Abonelik ödemeleri için (kredi kartı bilgileriniz tarafımızca saklanmaz).
• Yasal zorunluluklar: Mahkeme kararı, resmi talep, yasal gereklilik durumunda.

Bu sağlayıcılar kendi gizlilik politikalarına tabidir. Platform, bu sağlayıcıların veri işleme şeklinden sorumlu değildir.`
        },
        {
          title: "Çerezler (Cookies)",
          content: `Platform, oturum yönetimi ve kullanıcı deneyiminin iyileştirilmesi için çerez kullanabilir. Tarayıcı ayarlarınızdan çerezleri yönetebilir veya reddedebilirsiniz; ancak bu durum bazı özelliklerin çalışmasını engelleyebilir.`
        },
        {
          title: "Kullanıcı Hakları (KVKK / GDPR uyumu)",
          content: `Verileriniz üzerinde şu haklara sahipsiniz:
• Erişim hakkı: Hangi verilerinizin toplandığını öğrenme
• Düzeltme hakkı: Yanlış veya eksik verilerin düzeltilmesini talep etme
• Silme hakkı: Verilerinizin silinmesini isteme (yasal saklama süreleri hariç)
• İtiraz hakkı: İşlemeye itiraz etme
• Veri taşınabilirliği: Verilerinizi yapılandırılmış formatta talep etme

Bu haklarınızı kullanmak için info@telyx.ai adresine başvurabilirsiniz.`
        },
        {
          title: "Çocukların Gizliliği",
          content: `Platform 18 yaş altı kullanıcılara yönelik değildir. Ebeveyn izni olmadan 18 yaş altındaki kişilerden bilerek veri toplamıyoruz.`
        },
        {
          title: "Değişiklikler",
          content: `Bu Gizlilik Politikası zaman zaman güncellenebilir. Önemli değişiklikler e-posta veya Platform bildirimi ile duyurulur. Platformu kullanmaya devam etmeniz güncellenmiş politikayı kabul ettiğiniz anlamına gelir.`
        },
        {
          title: "İletişim",
          content: `Gizlilik ile ilgili sorularınız için: info@telyx.ai`
        }
      ]
    },
    en: {
      title: "Privacy Policy",
      lastUpdated: "Last updated: January 27, 2026",
      sections: [
        {
          title: "Data Collected",
          content: `When you use the Platform, the following data may be collected:
• Account information: Name, surname, email, password, phone number
• Business information: Business name, type, description
• Integration data: OAuth tokens (Google, other providers)
• Communication data: Inbound/outbound phone, WhatsApp, email, chat conversation records, customer information, transaction summary, timestamps
• Usage/log data: IP address, browser information, access logs, error reports
• Campaign and automation data: Scenarios you create, call lists, messaging flows`
        },
        {
          title: "Data Usage Purposes",
          content: `Collected data is used only for the following purposes:
• Providing and managing the service (account creation, authentication)
• Enabling Platform features to function (integrations, calls, reporting)
• Security and fraud prevention
• Service improvement, technical support, and troubleshooting
• Fulfilling legal obligations

Your data is not shared with third parties for marketing purposes without your consent.`
        },
        {
          title: "Data Protection Mechanisms",
          content: `To ensure the security of your data:
• Database encryption and secure storage
• Encrypted communication over HTTPS
• Secure integration using OAuth 2.0 standards
• Access controls and authorization
• Regular security updates`
        },
        {
          title: "Retention / Deletion Policy",
          content: `• Communication records (calls, chats, emails): You can delete them at any time through the Platform.
• Account information: Retained until you close your account.
• Legal obligations: Some records (invoices, payment information) may be retained longer due to legal requirements (e.g., tax laws).
• When account is closed: Your personal data will be deleted or anonymized within a reasonable time, except for legal retention periods.`
        },
        {
          title: "Third-Party Sharing",
          content: `Your data may be shared with third parties in the following cases:
• Integration providers (Google, WhatsApp, etc.): Only the portion necessary for integration to function.
• Voice call and AI service providers (e.g., ElevenLabs, OpenAI): Data necessary for conversation processing and running assistants.
• Payment processors: For subscription payments (your credit card information is not stored by us).
• Legal obligations: In case of court orders, official requests, or legal requirements.

These providers are subject to their own privacy policies. The Platform is not responsible for how these providers process data.`
        },
        {
          title: "Cookies",
          content: `The Platform may use cookies for session management and improving user experience. You can manage or reject cookies from your browser settings; however, this may prevent some features from working.`
        },
        {
          title: "User Rights (KVKK / GDPR Compliance)",
          content: `You have the following rights over your data:
• Right of access: Learn what data is collected about you
• Right to rectification: Request correction of incorrect or incomplete data
• Right to erasure: Request deletion of your data (except legal retention periods)
• Right to object: Object to processing
• Data portability: Request your data in a structured format

To exercise these rights, you can contact info@telyx.ai.`
        },
        {
          title: "Children's Privacy",
          content: `The Platform is not intended for users under 18. We do not knowingly collect data from individuals under 18 without parental consent.`
        },
        {
          title: "Changes",
          content: `This Privacy Policy may be updated from time to time. Significant changes will be announced via email or Platform notification. Continuing to use the Platform means you accept the updated policy.`
        },
        {
          title: "Contact",
          content: `For questions regarding privacy: info@telyx.ai`
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
              <Shield className="w-8 h-8 md:w-10 md:h-10 text-white" />
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
