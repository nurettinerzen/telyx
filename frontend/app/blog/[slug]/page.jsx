'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Sparkles,
  User,
} from 'lucide-react';

/* ── Animation helpers ── */
const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

/* ── Mouse-glow tracker for cards ── */
function useMouseGlow(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e) => {
      const cards = el.querySelectorAll('.ft-card');
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      });
    };
    el.addEventListener('mousemove', handleMove);
    return () => el.removeEventListener('mousemove', handleMove);
  }, [ref]);
}

function formatDate(dateStr, isTR) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(isTR ? 'tr-TR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/* ══════════════════════════════════════════════
   Blog Post Data
   ══════════════════════════════════════════════ */

const blogPosts = {
  'whatsapp-canli-destek-ai-handoff': {
    category: { tr: 'WhatsApp', en: 'WhatsApp' },
    title: {
      tr: 'WhatsApp Desteğinde AI’dan Canlı Temsilciye Geçiş Nasıl Kurgulanır?',
      en: 'How to Design AI-to-Human Handoff in WhatsApp Support',
    },
    excerpt: {
      tr: 'Aynı konuşma içinde AI ile başlayıp gerektiğinde canlı ekibe devreden destek akışının en doğru kurgusunu anlatıyoruz.',
      en: 'We explain the cleanest way to start with AI and hand the same conversation over to a live support team when needed.',
    },
    date: '2026-04-08',
    readTime: { tr: '7 dk', en: '7 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#051752] to-[#00C4E6]',
    content: {
      tr: [
        {
          type: 'paragraph',
          text: 'WhatsApp desteğinde en büyük hata, yapay zekayı ayrı bir kanal, canlı ekibi ayrı bir kanal gibi düşünmektir. Oysa müşteri için önemli olan kanal değil, konuşmanın kesintisiz devam etmesidir. En iyi deneyim, müşterinin aynı thread içinde önce AI’dan yardım alması, gerektiğinde de aynı yazışma içinden canlı desteğe geçebilmesidir.',
        },
        {
          type: 'heading',
          text: 'Handoff Yeni Sohbet Açmak Değildir',
        },
        {
          type: 'paragraph',
          text: 'Canlı destek isteyen müşteriyi farklı bir numaraya, yeni bir forma veya tekrar açıklama yapacağı ikinci bir ekrana yönlendirmek sürtünme yaratır. Handoff mantığında doğru kurgu, mevcut konuşmanın bağlamını korumak ve canlı temsilcinin kaldığı yerden devam etmesini sağlamaktır. Böylece müşteri tekrar sipariş numarası, sorun özeti veya iletişim bilgisi yazmak zorunda kalmaz.',
        },
        {
          type: 'heading',
          text: 'AI Ne Zaman Devreden Çıkmalı?',
        },
        {
          type: 'paragraph',
          text: 'AI destek süreci çoğu soruyu çözebilir; ancak üç durumda canlı desteğe geçiş kritik hale gelir: kullanıcı açıkça insan isterse, sistem aynı konuda iki kez takılırsa veya işlem yüksek güven gerektiriyorsa. Sipariş uyuşmazlıkları, ödeme konuları ve şikayet yönetimi gibi alanlarda canlı destek fallback’i hem müşteri memnuniyetini artırır hem de yanlış cevap riskini azaltır.',
        },
        {
          type: 'heading',
          text: 'Operasyon Ekibi İçin Doğru Arayüz',
        },
        {
          type: 'paragraph',
          text: 'Teknik handoff kadar önemli olan bir diğer konu da ekip arayüzüdür. Bekleyen konuşmaların ayrı görünmesi, bir temsilcinin konuşmayı sahiplenebilmesi, ekip içi çakışmaların engellenmesi ve gerekirse konuşmanın tekrar AI’a devredilebilmesi gerekir. Bu yüzden operasyon ekranında “bekliyor”, “canlıda”, “AI yönetiyor” gibi net durumlar kritik rol oynar.',
        },
        {
          type: 'heading',
          text: 'En Sağlıklı Akış',
        },
        {
          type: 'paragraph',
          text: 'Pratikte en iyi akış şöyledir: AI çözebiliyorsa devam eder, takıldığı yerde canlı desteği teklif eder, kullanıcı isterse aynı konuşma canlı ekibe geçer ve ekip işi tamamladıktan sonra gerekirse konuşmayı tekrar AI’a bırakır. Bu model hem operasyon ekibine hız kazandırır hem de müşterinin “yeniden başlıyorum” hissini ortadan kaldırır.',
        },
      ],
      en: [
        {
          type: 'paragraph',
          text: 'The biggest mistake in WhatsApp support is treating AI and live support as two separate channels. For the customer, the important thing is not the channel but the continuity of the conversation. The best experience starts with AI and, when needed, moves to a live agent within the same thread.',
        },
        {
          type: 'heading',
          text: 'Handoff Is Not Starting a New Conversation',
        },
        {
          type: 'paragraph',
          text: 'Sending a customer who asks for live support to a different number, form, or second screen creates friction. In a proper handoff model, the context of the current conversation is preserved and the live agent continues exactly where the AI left off. That means the customer does not need to repeat the order number, issue summary, or contact details.',
        },
        {
          type: 'heading',
          text: 'When Should AI Step Back?',
        },
        {
          type: 'paragraph',
          text: 'AI can handle most support interactions, but there are three moments when live support becomes critical: when the user explicitly asks for a human, when the system gets stuck on the same topic twice, or when the issue requires higher confidence. In topics like order disputes, payments, and complaints, live fallback improves customer satisfaction and reduces the risk of wrong answers.',
        },
        {
          type: 'heading',
          text: 'The Right Interface for the Operations Team',
        },
        {
          type: 'paragraph',
          text: 'The technical handoff is only half of the story. The team also needs the right interface: pending conversations should be visible, one agent should be able to claim the thread, agent collisions should be blocked, and the conversation should be returnable to AI when appropriate. That is why clear statuses such as waiting, live, and AI-managed matter so much.',
        },
        {
          type: 'heading',
          text: 'The Healthiest Flow',
        },
        {
          type: 'paragraph',
          text: 'In practice, the strongest model is simple: AI continues while it can solve the issue, offers live support when it gets stuck, hands the same thread to the live team when requested, and lets the team return the conversation to AI if appropriate. This removes the “I have to start over” feeling for the customer while keeping operations fast and controlled.',
        },
      ],
    },
  },

  'tahsilat-hatirlatma-otomasyonu': {
    category: { tr: 'Operasyon', en: 'Operations' },
    title: {
      tr: 'Tahsilat Hatırlatmalarında Yapay Zeka ile Daha Nazik ve Sistemli Süreçler',
      en: 'Using AI for More Structured and More Polite Payment Reminder Flows',
    },
    excerpt: {
      tr: 'Tahsilat hatırlatmalarını manuel takipten çıkarıp daha düzenli, ölçülebilir ve müşteri dostu hale getirmenin yollarını inceliyoruz.',
      en: 'We explore how to move payment reminders out of manual follow-up and turn them into a measurable, customer-friendly workflow.',
    },
    date: '2026-04-04',
    readTime: { tr: '6 dk', en: '6 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#000ACF] to-[#006FEB]',
    content: {
      tr: [
        {
          type: 'paragraph',
          text: 'Tahsilat hatırlatmaları birçok işletmede hâlâ manuel takip, Excel listeleri ve dağınık mesajlaşmalar üzerinden ilerliyor. Bu yapı hem operasyon ekibini yoruyor hem de müşteriye düzensiz ve sert görünen bir iletişim deneyimi bırakabiliyor. Yapay zeka destekli hatırlatma akışları ise süreci daha nazik, daha kontrollü ve çok daha ölçülebilir hale getiriyor.',
        },
        {
          type: 'heading',
          text: 'Manuel Takibin En Büyük Sorunu',
        },
        {
          type: 'paragraph',
          text: 'Manuel tahsilat takibinde en sık görülen problemler; kimi aradığınızı karıştırmak, hangi müşteriye ne zaman dönüş yapıldığını takip edememek ve ekip içinde aynı müşteriye çakışan hatırlatmalar göndermektir. Ayrıca tonlama sorunu da yaşanır; bazı hatırlatmalar gereğinden sert, bazıları ise fazla belirsiz kalabilir. Sonuç olarak hem ekip yorulur hem de müşteri deneyimi zarar görür.',
        },
        {
          type: 'heading',
          text: 'Yapay Zeka Burada Ne Değiştirir?',
        },
        {
          type: 'paragraph',
          text: 'AI destekli sistemler hatırlatmaları önceden tanımlanmış politikalara göre tetikleyebilir, müşterinin önceki yanıtlarını dikkate alabilir ve daha doğal bir dil kullanabilir. Böylece hatırlatma mesajları sadece “borcunuz var” diyen tekrarlar olmaktan çıkar; müşterinin durumuna göre nazik, açıklayıcı ve yönlendirici hale gelir. Aynı zamanda tüm sürecin kaydı tutulduğu için ekip hangi müşterinin ne zaman dönüş yaptığını rahatça görür.',
        },
        {
          type: 'heading',
          text: 'Doğru Kanalı Seçmek',
        },
        {
          type: 'paragraph',
          text: 'Her tahsilat hatırlatması telefonla yapılmak zorunda değildir. Bazı müşteriler için WhatsApp mesajı, bazıları için e-posta, bazıları için ise önce yazılı bildirim sonra telefonla takip modeli daha uygundur. Burada önemli olan tek bir kanal değil, kanal geçişlerini düzenli yönetebilmektir. Aynı operasyon ekranı üzerinden bu süreci izlemek ekip için büyük fark yaratır.',
        },
        {
          type: 'heading',
          text: 'Daha Sistemli, Daha Ölçülebilir',
        },
        {
          type: 'paragraph',
          text: 'Tahsilat hatırlatma sürecinin başarılı olması için sadece mesaj göndermek yetmez; hangi hatırlatmanın işe yaradığını da görmek gerekir. Yapay zeka destekli hatırlatma kurgusunda açılma oranı, yanıt oranı, dönüş süresi ve ödeme sonrası kapanış gibi metrikler kolayca izlenebilir. Bu sayede işletme sezgiyle değil, veriyle hareket eder ve tahsilat operasyonu daha öngörülebilir hale gelir.',
        },
      ],
      en: [
        {
          type: 'paragraph',
          text: 'Payment reminders in many businesses still rely on manual follow-ups, spreadsheet lists, and scattered messaging. This puts pressure on the operations team and can create a disorganized or overly harsh customer experience. AI-powered reminder flows make the process more polite, more controlled, and much easier to measure.',
        },
        {
          type: 'heading',
          text: 'The Biggest Problem with Manual Follow-Up',
        },
        {
          type: 'paragraph',
          text: 'The most common issues in manual collection workflows are losing track of who was contacted, not knowing when the customer was last followed up with, and sending overlapping reminders from different team members. Tone is also inconsistent: some reminders come across as too aggressive while others are too vague. The result is friction for both the team and the customer.',
        },
        {
          type: 'heading',
          text: 'What Does AI Change Here?',
        },
        {
          type: 'paragraph',
          text: 'AI-powered systems can trigger reminders according to defined policies, take earlier customer responses into account, and use more natural language. Instead of repeating the same “you have an unpaid balance” message, reminders become clearer, more polite, and more context-aware. Since the whole process is tracked, the team can instantly see who replied and when.',
        },
        {
          type: 'heading',
          text: 'Choosing the Right Channel',
        },
        {
          type: 'paragraph',
          text: 'Not every payment reminder needs a phone call. For some customers, WhatsApp is more effective; for others, email works better; and for some, a written reminder followed by a call is the healthiest model. The key is not a single channel but managing channel transitions in an orderly way. Doing this from one operations workspace makes a significant difference for the team.',
        },
        {
          type: 'heading',
          text: 'More Structured, More Measurable',
        },
        {
          type: 'paragraph',
          text: 'A strong reminder process is not only about sending messages but also about understanding which reminders actually work. In an AI-driven collection flow, metrics such as open rate, response rate, response time, and post-payment closure become easy to track. This helps businesses move from intuition to data and build a more predictable collection operation.',
        },
      ],
    },
  },

  'cok-kanalli-destek-operasyonlari': {
    category: { tr: 'Destek Operasyonları', en: 'Support Operations' },
    title: {
      tr: 'WhatsApp, Webchat ve E-postayı Tek Ekrandan Yönetmek Neden Fark Yaratır?',
      en: 'Why Managing WhatsApp, Webchat, and Email from One Screen Changes Operations',
    },
    excerpt: {
      tr: 'Kanallar ayrı ayrı yönetildiğinde ekipler zaman kaybediyor. Tek bir operasyon ekranının neden daha hızlı ve daha kontrollü çalıştığını anlatıyoruz.',
      en: 'Teams lose time when channels are managed separately. We explain why a unified operations workspace is faster and easier to control.',
    },
    date: '2026-03-27',
    readTime: { tr: '5 dk', en: '5 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#006FEB] to-[#00C4E6]',
    content: {
      tr: [
        {
          type: 'paragraph',
          text: 'Destek ekipleri çoğu zaman WhatsApp’ı ayrı, webchat’i ayrı, e-postayı ayrı araçlardan yönetiyor. Bu da sadece ekran sayısını artırmakla kalmıyor; ekip içinde önceliklendirme, sahiplenme ve takip süreçlerini de karmaşıklaştırıyor. Tek ekran yaklaşımı ise operasyonları sadeleştiriyor ve ekibin dikkatini doğru yere topluyor.',
        },
        {
          type: 'heading',
          text: 'Asıl Sorun Kanal Sayısı Değil, Dağınık Operasyon',
        },
        {
          type: 'paragraph',
          text: 'Kanal sayısının artması tek başına problem değildir. Problem, her kanalın kendi ayrı inbox’ı, kendi ayrı takibi ve kendi ayrı sahiplenme mantığıyla ilerlemesidir. Böyle olduğunda aynı müşteri bir yandan e-posta gönderirken diğer yandan WhatsApp’tan yazabilir ve ekip bu bağlantıyı kaçırabilir. Sonuç, geç cevaplar ve tekrarlayan iş yüküdür.',
        },
        {
          type: 'heading',
          text: 'Tek Ekran Ne Sağlar?',
        },
        {
          type: 'paragraph',
          text: 'Tek operasyon ekranı, ekibe önce en önemli işi gösterir. Hangi konuşma bekliyor, hangisi canlı destek istiyor, hangisi AI tarafından yönetiliyor, hangisi kapanmış; tüm bunlar tek listede görünür. Bu yaklaşım sadece hız kazandırmaz, aynı zamanda karar yorgunluğunu azaltır. Temsilciler “hangi sekmeye bakmalıyım” diye düşünmez, doğrudan sıradaki işe geçer.',
        },
        {
          type: 'heading',
          text: 'Handoff ve Sahiplenme Daha Temiz Çalışır',
        },
        {
          type: 'paragraph',
          text: 'Çok kanallı destek operasyonlarının kritik noktası sahiplenmedir. Bir temsilcinin konuşmayı devralması, diğer ekip arkadaşlarının bunu anında görmesi ve konuşmanın gereksiz yere iki kişi tarafından yönetilmemesi gerekir. Tek ekran modeli, bu tür çakışmaları azaltır ve canlı handoff akışını çok daha temiz hale getirir.',
        },
        {
          type: 'heading',
          text: 'Yönetim Açısından Da Daha Güçlü',
        },
        {
          type: 'paragraph',
          text: 'Tek bir operasyon ekranı sadece ekip için değil, yöneticiler için de avantaj sağlar. Hangi kanal daha çok yük üretiyor, nerede handoff artıyor, ekip hangi konularda en çok zorlanıyor gibi sorulara cevap bulmak kolaylaşır. Bu sayede kanal bazlı dağınık raporlar yerine tek bakışta okunabilen bir operasyon resmi oluşur.',
        },
      ],
      en: [
        {
          type: 'paragraph',
          text: 'Support teams often manage WhatsApp, webchat, and email from separate tools. This does not only increase the number of screens they watch; it also complicates prioritization, ownership, and follow-up. A single operations workspace simplifies support work and helps the team focus on what matters most.',
        },
        {
          type: 'heading',
          text: 'The Real Problem Is Not Channel Count, but Operational Fragmentation',
        },
        {
          type: 'paragraph',
          text: 'Having multiple channels is not the problem by itself. The problem starts when each channel comes with its own inbox, ownership rules, and follow-up habits. In that setup, the same customer can send an email while also writing on WhatsApp, and the team can easily miss the connection. The result is delayed responses and repeated work.',
        },
        {
          type: 'heading',
          text: 'What Does a Unified Workspace Provide?',
        },
        {
          type: 'paragraph',
          text: 'A unified operations screen shows the team the most important work first. Which conversation is waiting, which one needs live support, which one is AI-managed, and which one is already resolved can all be seen in a single list. This does not only make the team faster; it also reduces decision fatigue. Agents stop wondering which tab to check next.',
        },
        {
          type: 'heading',
          text: 'Handoff and Ownership Work More Cleanly',
        },
        {
          type: 'paragraph',
          text: 'Ownership is the critical point in multi-channel support operations. When one agent claims a conversation, the rest of the team should see that immediately, and the same conversation should not be actively handled by multiple people. A single-screen model reduces these collisions and makes live handoff flows far cleaner.',
        },
        {
          type: 'heading',
          text: 'It Is Stronger for Management Too',
        },
        {
          type: 'paragraph',
          text: 'A unified operations workspace is not only good for agents; it is also better for managers. It becomes easier to answer questions like which channel creates the most load, where handoff requests are increasing, and which topics challenge the team the most. Instead of fragmented channel-based reports, the business gets one clear operational picture.',
        },
      ],
    },
  },

  'ai-musteri-hizmetleri-gelecegi': {
    category: { tr: 'AI & Teknoloji', en: 'AI & Technology' },
    title: {
      tr: 'AI ile Müşteri Hizmetlerinin Geleceği: 2026 Trendleri',
      en: 'The Future of Customer Service with AI: 2026 Trends',
    },
    excerpt: {
      tr: 'Yapay zeka destekli müşteri hizmetleri hızla dönüşüyor. İşletmelerin bu değişime nasıl uyum sağlayabileceğini keşfedin.',
      en: 'AI-powered customer service is rapidly transforming. Discover how businesses can adapt to this change.',
    },
    date: '2026-03-15',
    readTime: { tr: '5 dk', en: '5 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#000ACF] to-[#00C4E6]',
    content: {
      tr: [
        {
          type: 'paragraph',
          text: 'Yapay zeka teknolojileri, müşteri hizmetleri alanında devrim yaratmaya devam ediyor. 2026 yılına geldiğimizde, işletmelerin müşterileriyle iletişim kurma biçimi kökten değişti. Artık müşteriler 7/24 anında yanıt bekliyor, kişiselleştirilmiş deneyimler talep ediyor ve çoklu kanal üzerinden kesintisiz hizmet almak istiyor. Bu beklentileri karşılamak için yapay zeka destekli çözümler vazgeçilmez hale geldi.',
        },
        {
          type: 'heading',
          text: 'Konuşanabilir Yapay Zeka Yeni Standart',
        },
        {
          type: 'paragraph',
          text: 'Eskiden chatbotlar belirli anahtar kelimelere göre önceden programlanmış yanıtlar verirdi. Bugün ise büyük dil modelleri (LLM) sayesinde yapay zeka asistanları doğal dilde anlama, bağlamsal yanıt üretme ve karmaşık sorunları çözme yeteneğine sahip. 2026\'da konuşanabilir AI, müşteri hizmetlerinde altın standart haline geldi. Müşteriler artık bir robotla değil, gerçekten anlayan ve yardımcı olan bir asistanla konuştuğunu hissediyor.',
        },
        {
          type: 'heading',
          text: 'Omnichannel Deneyim: Tek Noktadan Yönetim',
        },
        {
          type: 'paragraph',
          text: 'Müşteriler artık tek bir kanalda kalmak istemiyor. WhatsApp\'tan başlayan bir konuşmayı e-posta ile sürdürmeyi, web sitenizden başlatılan bir talebi telefonla takip etmeyi bekliyorlar. 2026\'nın en belirgin trendi, tüm kanalların tek bir yapay zeka asistanı tarafından yönetilmesi. Bu sayede müşteri hangi kanaldan ulaşırsa ulaşsın, önceki konuşmaları bilgi kaybetmeden sürdürülür ve işletmeniz tutarlı bir deneyim sunar.',
        },
        {
          type: 'heading',
          text: 'Proaktif Müşteri Hizmeti',
        },
        {
          type: 'paragraph',
          text: 'Reaktif yaklaşım, yani müşterinin sorun yaşayıp sizi aramasını beklemek artık geride kaldı. Yapay zeka destekli sistemler, müşteri davranışlarını analiz ederek potansiyel sorunları önceden tespit edebiliyor. Örneğin bir e-ticaret sitesinde kargonun gecikmesi tahmin edildiğinde, müşteri şikayetçiye dönmeden önce bilgilendirme mesajı gönderiliyor. Bu proaktif yaklaşım, müşteri memnuniyetini ortalama yüzde 35 artırıyor.',
        },
        {
          type: 'heading',
          text: 'İşletmeler Nasıl Uyum Sağlayabilir?',
        },
        {
          type: 'paragraph',
          text: 'Bu dönüşüme ayak uydurmak isteyen işletmelerin atması gereken adımlar net: İlk olarak, mevcut müşteri hizmetleri süreçlerinizi analiz edin ve tekrarlayan görevleri belirleyin. İkinci olarak, tüm kanallarınızı tek bir platformda birleştirin. Üçüncü olarak, yapay zeka çözümünüzü kendi iş süreçlerinize ve verilerinize göre eğiterek kişiselleştirilmiş yanıt üretme kapasitesini artırın. Son olarak, insan operatörler ile yapay zeka arasında sorunsuz bir geçiş mekanizması kurun. Telyx gibi entegre AI platformları, tüm bu adımları tek bir çatı altında sunarak işletmelerin dönüşüm sürecini hızlandırıyor.',
        },
      ],
      en: [
        {
          type: 'paragraph',
          text: 'Artificial intelligence technologies continue to revolutionize the customer service industry. As we enter 2026, the way businesses communicate with their customers has fundamentally changed. Customers now expect instant 24/7 responses, demand personalized experiences, and want seamless service across multiple channels. AI-powered solutions have become indispensable to meet these expectations.',
        },
        {
          type: 'heading',
          text: 'Conversational AI Is the New Standard',
        },
        {
          type: 'paragraph',
          text: 'In the past, chatbots gave pre-programmed responses based on specific keywords. Today, thanks to large language models (LLMs), AI assistants have the ability to understand natural language, generate contextual responses, and solve complex problems. In 2026, conversational AI has become the gold standard in customer service. Customers now feel like they are talking to an assistant that truly understands and helps them, not a robot.',
        },
        {
          type: 'heading',
          text: 'Omnichannel Experience: Single Point of Management',
        },
        {
          type: 'paragraph',
          text: 'Customers no longer want to stay on a single channel. They expect to continue a conversation that started on WhatsApp via email, and follow up a request initiated from your website by phone. The most prominent trend of 2026 is having all channels managed by a single AI assistant. This way, regardless of which channel the customer uses, their previous conversations continue without information loss and your business delivers a consistent experience.',
        },
        {
          type: 'heading',
          text: 'Proactive Customer Service',
        },
        {
          type: 'paragraph',
          text: 'The reactive approach of waiting for customers to experience a problem and contact you is now a thing of the past. AI-powered systems can analyze customer behavior and detect potential issues in advance. For example, when a shipping delay is predicted on an e-commerce site, an informational message is sent before the customer becomes a complainer. This proactive approach increases customer satisfaction by an average of 35 percent.',
        },
        {
          type: 'heading',
          text: 'How Can Businesses Adapt?',
        },
        {
          type: 'paragraph',
          text: 'The steps businesses need to take to keep up with this transformation are clear: First, analyze your existing customer service processes and identify repetitive tasks. Second, unify all your channels on a single platform. Third, train your AI solution on your own business processes and data to increase personalized response capacity. Finally, establish a seamless handoff mechanism between human operators and AI. Integrated AI platforms like Telyx accelerate the transformation process by offering all these steps under one roof.',
        },
      ],
    },
  },

  'whatsapp-business-api-rehberi': {
    category: { tr: 'Rehber', en: 'Guide' },
    title: {
      tr: 'WhatsApp Business API: Eksiksiz Başlangıç Rehberi',
      en: 'WhatsApp Business API: Complete Getting Started Guide',
    },
    excerpt: {
      tr: 'WhatsApp Business API nedir, nasıl entegre edilir ve işletmenize nasıl değer katar? Adım adım rehberimizle öğrenin.',
      en: 'What is WhatsApp Business API, how to integrate it, and how does it add value to your business? Learn with our step-by-step guide.',
    },
    date: '2026-03-01',
    readTime: { tr: '8 dk', en: '8 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#051752] to-[#006FEB]',
    content: {
      tr: [
        {
          type: 'paragraph',
          text: 'WhatsApp, dünya genelinde 2 milyardan fazla aktif kullanıcısıyla en popüler mesajlaşma platformu olmaya devam ediyor. Türkiye\'de ise neredeyse her akıllı telefon kullanıcısının günlük hayatında vazgeçilmez bir yere sahip. İşletmeler için WhatsApp Business API, müşterilerle doğal iletişim kurmanın, destek sunmanın ve hatta satış yapmanın en etkili yollarından biri haline geldi.',
        },
        {
          type: 'heading',
          text: 'WhatsApp Business API Nedir?',
        },
        {
          type: 'paragraph',
          text: 'WhatsApp Business API, standart WhatsApp Business uygulamasından farklı olarak işletmelere programatik erişim sağlayan bir arayüzdür. Bu API sayesinde otomatik mesaj gönderebilir, chatbot entegrasyonu yapabilir, CRM sisteminize bağlayabilir ve binlerce müşteriye aynı anda hizmet verebilirsiniz. Küçük işletmeler için tasarlanan WhatsApp Business uygulamasının aksine API, ölçeklenebilir ve kurumsal düzeyde çözümler sunar.',
        },
        {
          type: 'heading',
          text: 'WhatsApp Business API\'nin İşletmenize Kattığı Değer',
        },
        {
          type: 'paragraph',
          text: 'Müşterileriniz zaten WhatsApp kullanıyorsa, onlara en rahat ettikleri platformda ulaşabilmeniz büyük avantaj. API entegrasyonunun sağladığı temel faydalar şunlardır: Birincisi, mesaj açılma oranları e-postaya kıyasla çok daha yüksektir; ortalama yüzde 98 açılma oranı ile neredeyse her mesajınız okunur. İkincisi, 7/24 otomatik yanıt verme yeteneğiyle müşteri bekleme sürelerini sıfıra indirebilirsiniz. Üçüncüsü, sipariş takibi, randevu hatırlatma ve kampanya bildirimleri gibi işlemleri otomatikleştirerek operasyonel yükü azaltırsınız.',
        },
        {
          type: 'heading',
          text: 'Entegrasyon Adımları',
        },
        {
          type: 'paragraph',
          text: 'WhatsApp Business API entegrasyonu için izlemeniz gereken adımlar şunlardır: İlk olarak bir Meta Business hesabı oluşturun ve işletmenizi doğrulayın. Ardından bir Business Solution Provider (BSP) seçin; Telyx gibi platformlar bu süreci sizin için yönetir ve teknik karmaşıklığı ortadan kaldırır. Telefon numaranızı WhatsApp Business API\'ye kaydedin. Mesaj şablonlarınızı oluşturun ve Meta\'nın onayına gönderin. Son olarak webhook entegrasyonunuzu yapın ve gelen mesajları kendi sisteminize yönlendirin. Telyx kullanıyorsanız tüm bu adımlar tek bir panel üzerinden, kod yazmadan tamamlanabilir.',
        },
        {
          type: 'heading',
          text: 'Başarılı Bir WhatsApp Stratejisi İçin İpuçları',
        },
        {
          type: 'paragraph',
          text: 'WhatsApp Business API\'yi etkili kullanmak için bazı temel kurallara dikkat etmeniz önemlidir. Her şeyden önce, müşterilerinize spam göndermeyin; WhatsApp\'ın katı politikaları vardır ve ihlaller numaranızın engellenmesine yol açabilir. Mesaj şablonlarınızı kısa, net ve değer odaklı tutun. Chatbot ile insan operatörler arasında yumuşak bir geçiş mekanizması kurun; yapay zekanın çözemediği durumlarda müşterinin insan bir temsilciye ulaşabilmesini sağlayın. Son olarak, performans metriklerinizi düzenli takip edin: yanıt süresi, çözüm oranı ve müşteri memnuniyeti skorları size yol gösterecektir.',
        },
      ],
      en: [
        {
          type: 'paragraph',
          text: 'WhatsApp continues to be the most popular messaging platform worldwide with over 2 billion active users. In Turkey, it holds an indispensable place in almost every smartphone user\'s daily life. For businesses, WhatsApp Business API has become one of the most effective ways to communicate naturally with customers, provide support, and even make sales.',
        },
        {
          type: 'heading',
          text: 'What Is WhatsApp Business API?',
        },
        {
          type: 'paragraph',
          text: 'Unlike the standard WhatsApp Business app, WhatsApp Business API is an interface that provides businesses with programmatic access. With this API, you can send automated messages, integrate chatbots, connect to your CRM system, and serve thousands of customers simultaneously. Unlike the WhatsApp Business app designed for small businesses, the API offers scalable, enterprise-grade solutions.',
        },
        {
          type: 'heading',
          text: 'The Value WhatsApp Business API Adds to Your Business',
        },
        {
          type: 'paragraph',
          text: 'If your customers already use WhatsApp, being able to reach them on the platform where they are most comfortable is a huge advantage. The key benefits of API integration are: First, message open rates are much higher compared to email; with an average 98 percent open rate, almost every message you send is read. Second, with 24/7 automated response capability, you can reduce customer waiting times to zero. Third, you reduce operational burden by automating processes like order tracking, appointment reminders, and campaign notifications.',
        },
        {
          type: 'heading',
          text: 'Integration Steps',
        },
        {
          type: 'paragraph',
          text: 'The steps you need to follow for WhatsApp Business API integration are: First, create a Meta Business account and verify your business. Then choose a Business Solution Provider (BSP); platforms like Telyx manage this process for you and eliminate technical complexity. Register your phone number with WhatsApp Business API. Create your message templates and submit them for Meta approval. Finally, set up your webhook integration and route incoming messages to your own system. If you are using Telyx, all these steps can be completed through a single panel without writing code.',
        },
        {
          type: 'heading',
          text: 'Tips for a Successful WhatsApp Strategy',
        },
        {
          type: 'paragraph',
          text: 'To use WhatsApp Business API effectively, you need to pay attention to some fundamental rules. Above all, do not spam your customers; WhatsApp has strict policies and violations can lead to your number being blocked. Keep your message templates short, clear, and value-focused. Set up a smooth handoff mechanism between chatbot and human operators; ensure customers can reach a human representative when AI cannot resolve the issue. Finally, regularly track your performance metrics: response time, resolution rate, and customer satisfaction scores will guide you.',
        },
      ],
    },
  },

  'e-ticaret-chatbot-karsilastirma': {
    category: { tr: 'E-ticaret', en: 'E-commerce' },
    title: {
      tr: 'E-ticaret İçin En İyi Chatbot Çözümleri: 2026 Karşılaştırması',
      en: 'Best Chatbot Solutions for E-commerce: 2026 Comparison',
    },
    excerpt: {
      tr: 'E-ticaret siteniz için doğru chatbot çözümünü seçmek kritik. Piyasadaki seçenekleri ve Telyx\'in farkını karşılaştırıyoruz.',
      en: 'Choosing the right chatbot solution for your e-commerce site is critical. We compare market options and what sets Telyx apart.',
    },
    date: '2026-02-15',
    readTime: { tr: '6 dk', en: '6 min' },
    author: 'Telyx Ekibi',
    color: 'from-orange-500 to-red-500',
    content: {
      tr: [
        {
          type: 'paragraph',
          text: 'E-ticaret sektöründe rekabet her geçen gün artarken, müşteri deneyimini iyileştirmek ve satış dönüşüm oranlarını yükseltmek için chatbot çözümleri kritik bir araca dönüştü. Ancak piyasada onlarca farklı çözüm mevcut ve doğru seçimi yapmak kolay değil. Bu yazıda, 2026 itibarıyla e-ticaret işletmeleri için en iyi chatbot çözümlerini karşılaştırıyor ve işletmeniz için en uygun seçimi yapmanıza yardımcı oluyoruz.',
        },
        {
          type: 'heading',
          text: 'E-ticaret Chatbotlarında Dikkat Edilmesi Gerekenler',
        },
        {
          type: 'paragraph',
          text: 'Bir chatbot çözümü seçerken dikkat etmeniz gereken temel kriterler şunlardır: Doğal dil anlama kapasitesi (NLU), e-ticaret platformunuzla entegrasyon kolaylığı, çoklu kanal desteği (web, WhatsApp, Instagram, e-posta), sipariş takibi ve müşteri verilerine erişim yetkinliği, ölçeklenebilirlik ve maliyet yapısı. Ayrıca chatbotun öğrenim kapasitesi de önemlidir; zamanla müşteri davranışlarından öğrenebilen ve kendini geliştirebilen bir sistem, statik bir kural tabanlı bota göre çok daha fazla değer üretir.',
        },
        {
          type: 'heading',
          text: 'Piyasadaki Genel Eğilimler',
        },
        {
          type: 'paragraph',
          text: '2026 yılında e-ticaret chatbot pazarında belirgin eğilimler gözlemliyoruz. İlk olarak, kural tabanlı chatbotlar hızla yerini LLM destekli konuşanabilir AI sistemlerine bırakıyor. İkinci olarak, chatbotlar artık sadece destek değil, aktif satış aracı olarak da kullanılıyor; ürün önerisi, çoklu satış ve terk edilen sepet kurtarma gibi senaryolarda gerçek gelir yaratıyor. Üçüncü olarak, omnichannel yaklaşım artık bir lüks değil zorunluluk; müşteriler WhatsApp\'tan başladığı konuşmayı web\'de sürdürmeyi, e-postayla takip etmeyi bekliyor.',
        },
        {
          type: 'heading',
          text: 'Telyx Farkı: Yapay Zeka Öncelikli Mimari',
        },
        {
          type: 'paragraph',
          text: 'Telyx, e-ticaret chatbot pazarında farklı bir yaklaşım benimsemektedir. Birçoğu chatbot çözümü hâlâ kural tabanlı mantık üzerine kuruluyken, Telyx sıfırdan yapay zeka öncelikli bir mimariyle inşa edildi. Bu ne anlama geliyor? Telyx\'in AI asistanı, işletmenizin ürün kataloğunu, sipariş geçmişini ve müşteri verilerini anlayarak bağlamsal ve kişiselleştirilmiş yanıtlar üretiyor. Bir müşteri sipariş durumunu sorduğunda, asistan gerçek zamanlı olarak kargo bilgisine erişir ve doğru bilgiyi sunar; tahmin yürütmez.',
        },
        {
          type: 'heading',
          text: 'Doğru Çözümü Seçmek İçin Kontrol Listesi',
        },
        {
          type: 'paragraph',
          text: 'E-ticaret siteniz için chatbot çözümü seçerken şu soruları sorun: Çözüm, kullandığınız e-ticaret platformuyla (Shopify, WooCommerce, Trendyol, Hepsiburada vb.) sorunsuz entegre olabiliyor mu? Türkçe doğal dil anlama kapasitesi yeterli mi? Sipariş takibi ve müşteri doğrulama gibi gerçek iş süreçlerini yönetebiliyor mu? WhatsApp, e-posta ve web chat gibi tüm kanallarınızı tek bir yerden yönetmenize olanak tanıyor mu? Maliyet yapısı işletmenizin ölçeğine uygun mu? Bu sorulara olumlu yanıt veren bir çözüm, e-ticaret operasyonlarınızı bir üst seviyeye taşıyacaktır. Telyx, tüm bu kriterleri karşılayacak şekilde tasarlanmış entegre bir platformdur.',
        },
      ],
      en: [
        {
          type: 'paragraph',
          text: 'As competition in the e-commerce sector grows every day, chatbot solutions have become a critical tool for improving customer experience and increasing sales conversion rates. However, with dozens of different solutions available in the market, making the right choice is not easy. In this article, we compare the best chatbot solutions for e-commerce businesses as of 2026 and help you make the most suitable choice for your business.',
        },
        {
          type: 'heading',
          text: 'What to Look for in E-commerce Chatbots',
        },
        {
          type: 'paragraph',
          text: 'The key criteria to consider when choosing a chatbot solution are: Natural language understanding (NLU) capacity, ease of integration with your e-commerce platform, multi-channel support (web, WhatsApp, Instagram, email), order tracking and customer data access capabilities, scalability, and cost structure. Additionally, the chatbot\'s learning capacity is important; a system that can learn from customer behavior over time and improve itself generates much more value than a static rule-based bot.',
        },
        {
          type: 'heading',
          text: 'General Market Trends',
        },
        {
          type: 'paragraph',
          text: 'In 2026, we observe clear trends in the e-commerce chatbot market. First, rule-based chatbots are rapidly giving way to LLM-powered conversational AI systems. Second, chatbots are now used not just for support but as active sales tools; generating real revenue in scenarios like product recommendations, cross-selling, and abandoned cart recovery. Third, an omnichannel approach is no longer a luxury but a necessity; customers expect to continue a conversation started on WhatsApp on the web and follow up via email.',
        },
        {
          type: 'heading',
          text: 'The Telyx Difference: AI-First Architecture',
        },
        {
          type: 'paragraph',
          text: 'Telyx takes a different approach in the e-commerce chatbot market. While many chatbot solutions are still built on rule-based logic, Telyx was built from scratch with an AI-first architecture. What does this mean? Telyx\'s AI assistant understands your business\'s product catalog, order history, and customer data to generate contextual and personalized responses. When a customer asks about their order status, the assistant accesses real-time shipping information and presents accurate data; it does not guess.',
        },
        {
          type: 'heading',
          text: 'Checklist for Choosing the Right Solution',
        },
        {
          type: 'paragraph',
          text: 'When choosing a chatbot solution for your e-commerce site, ask these questions: Can the solution seamlessly integrate with the e-commerce platform you use (Shopify, WooCommerce, etc.)? Is its natural language understanding capacity sufficient for your language? Can it manage real business processes like order tracking and customer verification? Does it allow you to manage all your channels (WhatsApp, email, web chat) from one place? Is the cost structure suitable for your business scale? A solution that positively answers these questions will take your e-commerce operations to the next level. Telyx is an integrated platform designed to meet all these criteria.',
        },
      ],
    },
  },
};

const allSlugs = Object.keys(blogPosts);

export default function BlogPostPage() {
  const params = useParams();
  const { locale, t } = useLanguage();
  const isTR = locale === 'tr';
  const relatedRef = useRef(null);
  useMouseGlow(relatedRef);

  const slug = params.slug;
  const post = blogPosts[slug];

  if (!post) {
    return (
      <div className="features-page min-h-screen bg-white dark:bg-neutral-950">
        <Navigation />
        <div className="container mx-auto px-4 pt-36 pb-24 text-center">
          <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--ft-text-primary)' }}>
            {t('blog.notFound')}
          </h1>
          <Link href="/blog">
            <Button className="rounded-full bg-primary text-white hover:bg-primary/90">
              {t('blog.backToBlog')}
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const relatedSlugs = allSlugs.filter((s) => s !== slug).slice(0, 3);
  const content = isTR ? post.content.tr : post.content.en;

  return (
    <div className="features-page min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      {/* ═══ Hero ═══ */}
      <section className="relative pt-28 md:pt-36 pb-16 md:pb-24">
        <div className="ft-glow-blob" style={{ width: 600, height: 600, top: -200, left: '8%', background: '#006FEB' }} />
        <div className="ft-glow-blob" style={{ width: 450, height: 450, top: -40, right: '5%', background: '#00C4E6' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto">
            {/* Back link */}
            <motion.div initial={fadeUp} whileInView={visible} viewport={{ once: true }} transition={{ ...transition, delay: 0 }}>
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm font-medium mb-8 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
                style={{ color: 'var(--ft-text-muted)' }}
              >
                <ArrowLeft className="w-4 h-4" />
                {t('blog.allPosts')}
              </Link>
            </motion.div>

            {/* Category */}
            <motion.div initial={fadeUp} whileInView={visible} viewport={{ once: true }} transition={{ ...transition, delay: 0.04 }}>
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${post.color} mb-5`}
              >
                {isTR ? post.category.tr : post.category.en}
              </span>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.08 }}
              className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {isTR ? post.title.tr : post.title.en}
            </motion.h1>

            {/* Meta */}
            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.12 }}
              className="flex flex-wrap items-center gap-5 text-sm"
              style={{ color: 'var(--ft-text-muted)' }}
            >
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formatDate(post.date, isTR)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {isTR ? post.readTime.tr : post.readTime.en}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                {post.author}
              </span>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ Article Body ═══ */}
      <section className="pb-16 md:pb-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={fadeUp}
            whileInView={visible}
            viewport={vp}
            transition={transition}
            className="max-w-3xl mx-auto"
          >
            <div className="ft-card" style={{ padding: '40px 32px' }}>
              <div className="relative z-10 prose-container">
                {content.map((block, i) => {
                  if (block.type === 'heading') {
                    return (
                      <h2
                        key={i}
                        className="text-xl md:text-2xl font-bold mt-8 mb-4"
                        style={{ color: 'var(--ft-text-primary)' }}
                      >
                        {block.text}
                      </h2>
                    );
                  }
                  return (
                    <p
                      key={i}
                      className="text-base leading-relaxed mb-5"
                      style={{ color: 'var(--ft-text-secondary)' }}
                    >
                      {block.text}
                    </p>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ Related Posts ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-2xl md:text-3xl font-bold tracking-tight mb-8 text-center"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('blog.relatedPosts')}
            </motion.h2>

            <div ref={relatedRef} className="grid md:grid-cols-2 gap-6">
              {relatedSlugs.map((relSlug, index) => {
                const relPost = blogPosts[relSlug];
                return (
                  <motion.div
                    key={relSlug}
                    initial={fadeUp}
                    whileInView={visible}
                    viewport={vp}
                    transition={{ ...transition, delay: index * 0.08 }}
                  >
                    <Link href={`/blog/${relSlug}`}>
                      <div className="ft-card ft-card-sm h-full group cursor-pointer">
                        <div className="relative z-10">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${relPost.color} mb-3`}
                          >
                            {isTR ? relPost.category.tr : relPost.category.en}
                          </span>
                          <h3
                            className="text-lg font-bold mb-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors duration-200"
                            style={{ color: 'var(--ft-text-primary)' }}
                          >
                            {isTR ? relPost.title.tr : relPost.title.en}
                          </h3>
                          <p
                            className="text-sm leading-relaxed mb-3"
                            style={{ color: 'var(--ft-text-secondary)' }}
                          >
                            {isTR ? relPost.excerpt.tr : relPost.excerpt.en}
                          </p>
                          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--ft-text-muted)' }}>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDate(relPost.date, isTR)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {isTR ? relPost.readTime.tr : relPost.readTime.en}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-primary-700 dark:text-primary-300">
                            {t('blog.readMore')}
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA — Try Telyx ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={fadeUp}
            whileInView={visible}
            viewport={vp}
            transition={transition}
          >
            <div className="ft-cta text-center max-w-4xl mx-auto">
              <div className="relative z-10">
                <div className="mb-6">
                  <Sparkles className="w-12 h-12 text-white/80 mx-auto" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                  {t('blog.postCtaTitle')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('blog.postCtaSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/waitlist">
                    <Button
                      size="lg"
                      className="ft-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg"
                    >
                      {t('blog.postCtaApply')}
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8 transition-all duration-200"
                      style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}
                    >
                      {t('blog.postCtaContact')}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
