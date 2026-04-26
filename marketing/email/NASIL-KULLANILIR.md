# Telyx Email Template — Nasıl Kullanılır?

## 📂 Dosyalar

- `01-welcome-lead.html` — Facebook/Instagram form leadleri için welcome maili
- `telyx-logo.png` — Logo (transparan, 950×400)

## 👀 Önce Tarayıcıda Önizle

```bash
open /Users/nurettinerzen/Desktop/ai-assistant-saas/marketing/email/01-welcome-lead.html
```

Mobile görünüm için DevTools → toggle device toolbar (Cmd+Shift+M).

---

## ✏️ Göndermeden Önce Düzenle

HTML dosyasında şu değişkenleri **gerçek değerlerle** değiştir veya ESP'nin merge field'ı olarak bırak:

| Yer tutucu | Ne ile değiştir | Örnek |
|---|---|---|
| `[Ad]` | Lead'in adı | Mehmet, `{{first_name}}` |
| `nurettin@telyx.ai` | Senin gerçek mailın | (zaten doğruysa dokunma) |
| `{{unsubscribe_url}}` | ESP'nin unsubscribe link'i | Mailchimp/Resend otomatik doldurur |
| `https://telyx.ai` | Domain'iniz | (gerçek domainse dokunma) |

---

## 📤 Göndermek İçin 3 Yol

### A. Kişisel Olarak Gmail'den (en sıcak, az hacim için)

1. Tarayıcıda HTML'i aç
2. **Cmd+A** ile içeriği seç → **Cmd+C**
3. Gmail "Yeni Posta" → İçeriğe yapıştır (HTML olarak yapışır)
4. Subject: `[Ad], formunuza teşekkürler — sizi nasıl arayalım?`
5. Gönder

⚠️ Gmail logo path'ini bulamaz. Logo yerine inline yapıştırman lazım: HTML'i açıp logo image'ını sağ tık → kopyala, mailde yapıştır.

### B. Resend / Mailchimp / Customer.io (otomatik, ölçeklenebilir)

1. ESP'de yeni template oluştur
2. **HTML import** seçeneğini kullan, dosya içeriğini yapıştır
3. Logo'yu ESP'nin asset uploader'ına yükle, `src="telyx-logo.png"` yerine ESP'nin verdiği URL'i koy
4. `[Ad]` → ESP'nin merge tag'i (örn. `{{first_name}}` veya `*|FNAME|*`)
5. FB Lead Ads webhook ile ESP'yi bağla → form geldikçe otomatik tetiklenir

### C. Direct SMTP (kod ile)

Logo'yu CID attachment olarak gönderiyorsan HTML'deki `src="telyx-logo.png"` yerine `src="cid:telyx-logo"` kullan ve SMTP attachment olarak ekle (Content-ID: telyx-logo).

---

## 🎯 Subject Line Önerileri (A/B test için)

Üçünü farklı segmentlere gönder, hangisi daha iyi açılma getiriyor gör:

1. **"[Ad], formunuza teşekkürler — sizi nasıl arayalım?"** (öneri başlangıç)
2. **"Telyx — kısaca özet ve 15 dakikalık plan"**
3. **"[Ad], dün formu doldurmuştunuz — kısa bir not"**

---

## ⏰ Ne Zaman Gönder?

- **Form geldikten max 30 dakika içinde** — sıcaklık çok hızlı düşer
- Eğer form 22:00 sonrasında gelirse → ertesi gün sabah 09:00'da gönder
- **Pazar günleri gönderme** (B2B'de açılma düşer)

---

## 🔁 Cevap Gelmezse Drip Sequence

Bu mail **Day 0**. Sıralı seri için ben sana:

- **Day 3** — yumuşak hatırlatma maili
- **Day 7** — son şans + özel teklif maili

yazabilirim. Aynı tasarım dilinde olur. Söyle yeter.

---

## 🐛 Sık Sorunlar

**"Logo gözükmüyor"** → ESP'ye yüklediğinden ve URL'in doğru olduğundan emin ol. Local path (`telyx-logo.png`) sadece tarayıcı önizleme için.

**"Gmail'de mobile'da bozuk gözüküyor"** → Litmus veya Email on Acid ile test et. Çoğu iyi çıkar ama Outlook için bazen dokunmak gerekebilir.

**"Spam'a düşüyor"** → SPF/DKIM/DMARC ayarlarını kontrol et. Resend kullan, kendi SMTP yerine — deliverability çok daha iyi.
