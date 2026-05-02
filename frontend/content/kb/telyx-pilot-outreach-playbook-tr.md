# Telyx Pilot Outreach Oyun Planı

Hazırlanma tarihi: 17 Nisan 2026

Bu doküman, Telyx'in mevcut pilot planı geciktiği durumda dışarıdaki firmalarla kontrollü pilot görüşmeleri yapmak için hazırlanmıştır.

## 1. Amaç

Amaç doğrudan agresif satış yapmak değil, uygun firmaları seçip:

- ihtiyacı doğrulamak
- canlı kullanım için istek toplamak
- deneme veya kısa pilot görüşmesine çevirmek
- gerçek itirazları ve soru tiplerini toplamak

## 2. Pilot Mesajı Nasıl Konumlandırılmalı?

En doğru yaklaşım:

- İlk cümlede "ürün tam oturmadı", "hala test ediyoruz", "eksiklerimiz var" gibi güven düşüren ifadelerle açılmamalı
- Bunun yerine "seçili firmalarla deneme/pilot görüşmeleri yapıyoruz" dili kullanılmalı
- Karşı taraf özellikle sorarsa ürünün yeni devreye alınan bir çözüm olduğu dürüstçe söylenmeli

Önerilen dil:

"Yeni devreye aldığımız AI müşteri iletişim çözümünü, seçili e-ticaret firmalarıyla ücretsiz ve taahhütsüz şekilde test ediyoruz."

Kaçınılması gereken dil:

"Daha çok yeniyiz, tam hazır değiliz, sizi biraz pilot gibi kullanmak istiyoruz."

## 3. Ne Zaman Pilot Olduğu Söylenmeli?

Şu sırayla gitmek en sağlıklısıdır:

1. Önce problemi konuş
2. Sonra çözümü kısa anlat
3. İlgi varsa deneme/pilot teklifini aç
4. Detay sorulursa yeni ve seçili firmalarla ilerlenen bir süreç olduğunu söyle

Yani pilot bilgisi gizlenmemeli ama açılış cümlesinin ana yükü de o olmamalı.

## 4. Kısa Açılış Cümlesi

Önerilen açılış:

"Merhaba, Telyx'ten arıyorum. E-ticaret firmalarının WhatsApp, telefon, chat ve e-posta tarafındaki tekrar eden müşteri sorularını otomatikleştirmesine yardımcı olan yeni bir çözümümüz var. Uygunsanız 20 saniyede anlatayım."

İlgi olursa ikinci cümle:

"Şu an seçili firmalarla ücretsiz ve taahhütsüz pilot görüşmeleri yapıyoruz; uygun bir senaryo varsa kısa bir deneme planlayabiliyoruz."

## 5. İdeal Hedef Profil

Öncelik verilecek firmalar:

- küçük ve orta ölçekli e-ticaret firmaları
- ürün çeşidi yüksek olan siteler
- kampanya dönemlerinde destek yükü artan markalar
- WhatsApp, sipariş durumu, iade ve ürün sorularında yoğunluk yaşayan ekipler
- ikas, Shopify, benzeri modern e-ticaret altyapıları kullanan markalar

## 6. Asistanın Sorması Gereken Keşif Soruları

- Müşteri sorularınız en çok hangi kanalda birikiyor?
- En çok tekrar eden soru tipleri neler?
- Bu sorulara bugün ekip içinde kim cevap veriyor?
- İlk etapta hangi kanalda otomasyon görmeyi daha değerli bulursunuz?
- WhatsApp, telefon, chat veya e-posta içinde önceliğiniz hangisi?

## 7. Kapanış Hedefi

Her aramada satış kapatmak zorunda değiliz. Başarılı sonuçlar:

- yetkili kişiye yönlenmek
- uygun zaman almak
- demo/pilot görüşmesi planlamak
- ilgisiz firmayı erken elemek
- tekrar aranmak istemeyeni net şekilde kaydetmek

## 8. Prompt Yerleşimi

Mevcut sistem davranışına göre:

- `firstMessage`: Açılış cümlesi için en kritik alan
- `systemPrompt`: Satış akışını ve pilot teklifinin nasıl anlatılacağını yönlendirir
- `customNotes`: Ürün gerçekleri, ICP, entegrasyon gücü ve sınırlar için en doğru alan

Not:
`systemPrompt`, outbound satış kurallarının üstüne ek talimat olarak eklenir. Yani mevcut satış davranışını tamamen silmez; onu yönlendirir.

## 9. Önerilen First Message

Merhaba, Telyx'ten arıyorum. E-ticaret firmalarının tekrar eden müşteri sorularını WhatsApp, telefon, chat ve e-posta üzerinden otomatikleştirmesine yardımcı oluyoruz. Uygunsanız çok kısa bilgi paylaşmak isterim.

## 10. Önerilen System Prompt

Satış araması yapıyorsun. Hedefin baskıcı satış yapmak değil, uygun firmaları kısa bir pilot veya demo görüşmesine çevirmek.

Kurallar:

- İlk 20-30 saniyede problemi ve değeri net anlat
- İlk cümlede "ürün eksik", "tam hazır değil", "sizi test etmek istiyoruz" gibi güven düşüren ifadeler kullanma
- Bunun yerine yalnızca uygun firmalara "ücretsiz ve taahhütsüz pilot/deneme görüşmesi" sunduğunu söyle
- Karşı taraf özellikle sorarsa dürüstçe "yeni devreye aldığımız bir çözüm ve seçili firmalarla pilot doğrulama yapıyoruz" de
- E-ticaret tarafındaki güçlü olduğumuz alanları öne çıkar
- Trendyol ve Hepsiburada için beta dilini koru
- Bilgi bankasında olmayan vaat, entegrasyon veya fiyat detayı uydurma
- İlgi görürsen hedefin demo veya kısa keşif görüşmesi planlamak olsun
- İlgisiz firmalarda konuşmayı uzatma
- Tekrar aranmak istemeyen firmalarda bunu net kabul et ve görüşmeyi kapat

## 11. Önerilen Custom Notes

- Telyx çok kanallı AI müşteri iletişim platformudur
- Güçlü alanlarımız: e-ticaret, WhatsApp, chat, e-posta, telefon
- E-ticaret tarafında tekrar eden sorular: sipariş durumu, iade, ürün bilgisi, kampanya soruları
- Telefon tarafında operatör değiliz; entegrasyon ve bağlantı katmanı sunuyoruz
- Türkiye'de Netgsm benzeri sağlayıcılarla kurulum senaryoları vardır
- Trendyol ve Hepsiburada bağlantıları beta çerçevesinde anlatılmalıdır
- Starter yazılı kanal paketidir; Pro ile telefon ve kampanyalar açılır
- Amaç ilk görüşmede ihtiyaç doğrulamak ve uygun firmaları deneme/pilot görüşmesine taşımaktır

## 12. Dürüstlük Çizgisi

Söylenebilir:

- yeni devreye aldığımız çözüm
- seçili firmalarla pilot görüşmeleri
- ücretsiz ve taahhütsüz deneme
- uygun firmalarda birlikte doğrulama yapmak istiyoruz

Söylenmemeli:

- sistem tam oturmadı
- eksiklerimiz çok
- sizi test etmek için arıyoruz
- canlıda sorun çıkabilir
