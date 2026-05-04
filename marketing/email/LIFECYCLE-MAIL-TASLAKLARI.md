# Telyx Lifecycle Mail Taslakları

Bu paket, lead sonrası ve trial/paket yaşam döngüsü için sadeleştirilmiş mail akışını içerir.

## Gönderen Kimliği

- Önerilen genel sender: `Telyx <info@telyx.ai>`
- Önerilen reply-to: `info@telyx.ai`
- Ödeme/limit gibi transactional maillerde görünen ad: `Telyx Bildirim Merkezi`
- Lead/satış tarafı ileride ayrılacaksa alternatif: `Telyx Demo Ekibi <sales@telyx.ai>`

Kişisel avatar yerine tüm yeni taslaklarda Telyx ikon logosu + marka imzası kullanıldı.

## Taslaklar

| Dosya | Senaryo | Zamanlama |
| --- | --- | --- |
| `03-demo-started-no-signup.html` | Asistan demosunu başlattı/konuştu ama üye olmadı | 24-48 saat sonra |
| `04-trial-welcome-first-steps.html` | Üye oldu, trial başladı | Hemen |
| `05-trial-inactive-nudge.html` | Trial başladı ama anlamlı kurulum hareketi yok | 3 gün sonra |
| `06-trial-ending-soon.html` | Trial bitimine az kaldı, paket yok | Bitime 2-3 gün kala |
| `07-trial-ended.html` | Trial bitti, paket yok | Trial bitince |
| `08-payment-failed.html` | Ödeme başarısız | Anında |
| `09-package-not-renewed.html` | Paket yenilenmedi/iptal oldu | Paket pasife düşünce |
| `10-package-activated.html` | Paket/ödeme başarılı | Ödeme tamamlanınca |
| `11-usage-80-warning.html` | Kullanım %80 seviyesine ulaştı | Limitin %80'i kullanılınca |
| `12-limit-reached.html` | Kullanım limiti doldu | Limit dolunca |
| `13-low-balance-warning.html` | PAYG bakiyesi azaldı | Bakiye eşik altına inince |
| `14-overage-limit-reached.html` | Aşım limitine ulaşıldı | Aşım limiti dolunca |
| `15-auto-reload-failed.html` | Otomatik bakiye yükleme başarısız | Auto-reload başarısız olunca |

## Veri Bağlama Notları

- Mockup dosyalarındaki `{{...}}` alanları gerçek template değişkenleridir; otomasyona bağlanırken boş kalmasına izin verilmemelidir.
- Weekly summary şu an aktif otomasyona bağlanmayacak.
- Weekly summary için güvenli alanlar: toplam etkileşim, ortalama süre, kanal dağılımından en yoğun kanal, yazılı etkileşim sayısı ve top topic.
- Tüm kanallarda güvenilir bir "çözülme oranı" alanı bugün hazır olmadığı için weekly summary taslağından çıkarıldı.
- Bir metrik hesaplanamıyorsa mail gönderimi durmalı veya ilgili satır template içinde gizlenmelidir; kullanıcıya `{{placeholder}}` görünmemelidir.

## Frekans Kuralı

- Trial içinde eksik her aksiyon için ayrı mail gönderilmez.
- Onboarding tarafında tek ana kurulum maili, bir adet hareketsizlik hatırlatması ve trial kapanış mailleri yeterlidir.
- Kullanıcı ödeme yaptıysa, üyelikten çıktıysa, dönüş yaptıysa veya manuel olarak ilgisiz işaretlendiyse pazarlama/follow-up mailleri durmalıdır.
- Limit, ödeme ve abonelik durumu gibi transactional mailler frekans kuralından ayrı değerlendirilir.

## Park Edilen Taslaklar

| Dosya | Not |
| --- | --- |
| `16-weekly-summary.html` | Haftalık performans özeti aktif otomasyona alınmayacak. Veri tarafı netleşirse ileride yeniden değerlendirilebilir. |

## Sistem Mailleri

| Dosya | Senaryo | Durum |
| --- | --- | --- |
| `17-email-verification.html` | E-posta doğrulama | Backend'e bağlandı |
| `18-password-reset.html` | Şifre sıfırlama | Backend'e bağlandı |
| `19-password-changed.html` | Şifre değiştirildi bildirimi | Backend'e bağlandı |
| `20-email-change-verification.html` | E-posta değişikliği doğrulama | Backend'e bağlandı |
| `21-team-invitation.html` | Takım daveti | Backend'e bağlandı |
| `22-account-deletion-confirmation.html` | Hesap silme onayı | Backend'e bağlandı |
| `23-subscription-cancel-confirmation.html` | Abonelik iptali planlandı | Backend'e bağlandı |
