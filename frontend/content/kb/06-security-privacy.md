# Güvenlik ve Gizlilik / Security & Privacy

## Veri Güvenliği

### Altyapı
- Veriler şifreli bağlantılar (TLS/SSL) üzerinden iletilir
- Veritabanı PostgreSQL, bulut altyapısında barındırılır
- Düzenli yedekleme ve felaket kurtarma planları

### Oturum Güvenliği
- JWT tabanlı kimlik doğrulama
- Oturum zaman aşımı ve otomatik çıkış
- IP tabanlı hız sınırlama (rate limiting)

### API Güvenliği
- API anahtarları ile kimlik doğrulama
- Webhook doğrulama imzaları
- CORS koruması

## Kişisel Verilerin Korunması (KVKK)

### Veri Minimizasyonu
- Sadece gerekli veriler toplanır ve işlenir
- Özel Veri yüklerken hassas bilgiler (TC kimlik, kredi kartı) eklenmemelidir
- Verilere yalnızca yetkili kullanıcılar erişebilir

### Müşteri Doğrulama
- Telefon görüşmelerinde arayan kişi doğrulama mekanizması
- Hassas bilgilere erişim için çok adımlı kimlik doğrulama
- Güvenlik korumaları (guardrails) LLM yanıtlarını filtreler

### Veri Saklama
- Arama kayıtları ve transkriptler güvenli ortamda saklanır
- Kullanıcı talebiyle veri silme
- Ekip üyeleri için rol tabanlı erişim kontrolü

## Yapay Zeka Güvenliği

### Guardrails (Koruma Katmanları)
- PII (Kişisel Bilgi) sızıntı filtreleri
- Uydurmaya karşı koruma (anti-confabulation)
- Kimlik eşleştirme ve doğrulama
- Araç kullanım zorunluluğu (tool-only data guard)

### İçerik Filtreleme
- Uygunsuz içerik üretimi engellenir
- Yanıtlar iş bağlamına uygun tutulur
- Belirsiz durumlarda insan temsilciye yönlendirme

---

## Data Security

### Infrastructure
- Data is transmitted over encrypted connections (TLS/SSL)
- PostgreSQL database hosted on cloud infrastructure
- Regular backups and disaster recovery plans

### Session Security
- JWT-based authentication
- Session timeout and auto-logout
- IP-based rate limiting

### API Security
- API key authentication
- Webhook verification signatures
- CORS protection

## Personal Data Protection

### Data Minimization
- Only necessary data is collected and processed
- Sensitive information (national ID, credit card) should not be included in Custom Data uploads
- Data is accessible only to authorized users

### Customer Verification
- Caller verification mechanism during phone conversations
- Multi-step identity verification for sensitive data access
- Security guardrails filter LLM responses

### Data Storage
- Call recordings and transcripts stored securely
- Data deletion upon user request
- Role-based access control for team members

## AI Safety

### Guardrails
- PII (Personal Identifiable Information) leak filters
- Anti-confabulation protection
- Identity matching and verification
- Tool-only data guard

### Content Filtering
- Inappropriate content generation is prevented
- Responses are kept relevant to business context
- Handoff to human agent in uncertain situations
