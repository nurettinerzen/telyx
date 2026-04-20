'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ExternalLink, Check, Copy } from 'lucide-react';
import Link from 'next/link';

export default function NetgsmSetupGuide() {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // toast.success('İçerik kopyalandı!');
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/dashboard/phone-numbers">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Telefon Numaralarına Dön
            </Button>
          </Link>
          <h1 className="text-4xl font-bold text-neutral-900 mb-4">
            🇹🇷 Netgsm Kurulum Rehberi
          </h1>
          <p className="text-lg text-neutral-600">
            Netgsm SIP trunk&apos;unuzu Telyx.ai ile adım adım bağlayın
          </p>
          <div className="flex gap-2 mt-4">
            <Badge className="bg-green-100 text-green-800">Kolay Kurulum</Badge>
            <Badge variant="outline">~10 dakika</Badge>
            <Badge variant="outline">~$5/yıl</Badge>
          </div>
        </div>

        {/* What is Netgsm */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">💡 Netgsm Nedir?</h2>
          <p className="text-neutral-700 mb-4">
            Netgsm, Türkiye&apos;nin en büyük bulut iletişim platformlarından biridir.
            0850 ile başlayan ücretsiz numaralar ve SIP trunk desteği sunar.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">0850 Ücretsiz Numara</div>
                <div className="text-sm text-neutral-600">Gelen aramalar tamamen ücretsiz</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">SIP Trunk Desteği</div>
                <div className="text-sm text-neutral-600">VAPI ile kolay entegrasyon</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">Web Panel</div>
                <div className="text-sm text-neutral-600">Kolay yönetim arayüzü</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">API Entegrasyonu</div>
                <div className="text-sm text-neutral-600">Otomatik işlemler</div>
              </div>
            </div>
          </div>
        </div>

        {/* Step-by-step guide */}
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 text-white rounded-full font-bold">
                1
              </div>
              <h3 className="text-xl font-bold">Netgsm Hesabı Oluşturun</h3>
            </div>
            <p className="text-neutral-700 mb-4">
              Önce Netgsm&apos;de bir hesap oluşturmanız gerekiyor.
            </p>
            <a
              href="https://www.netgsm.com.tr/kayit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button>
                Netgsm&apos;e Kayıt Ol <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>

          {/* Step 2 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 text-white rounded-full font-bold">
                2
              </div>
              <h3 className="text-xl font-bold">0850 Numara Alın</h3>
            </div>
            <div className="space-y-3">
              <p className="text-neutral-700">
                1. Web portaldan <strong>Ses Hizmeti</strong> → <strong>Numara Al</strong> seçeneğine gidin
              </p>
              <p className="text-neutral-700">
                2. <strong>0850 Numara</strong> seçin (Ücretsiz gelen arama)
              </p>
              <p className="text-neutral-700">
                3. İstediğiniz numarayı seçin ve satın alın
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>İpucu:</strong> 0850 numaralar gelen aramalar için tamamen ücretsizdir. 
                  Sadece giden aramalar ücretlendirilir.
                </p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 text-white rounded-full font-bold">
                3
              </div>
              <h3 className="text-xl font-bold">SIP Bilgilerini Alın</h3>
            </div>
            <div className="space-y-3">
              <p className="text-neutral-700">
                1. Netgsm web portaldan <strong>Ses Hizmeti</strong> → <strong>Ayarlar</strong> → <strong>SIP Bilgileri</strong>&apos;ne gidin
              </p>
              <p className="text-neutral-700">
                2. Aşağıdaki bilgileri not alın:
              </p>
              <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <code className="text-sm">SIP Server: sip.netgsm.com.tr</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard('sip.netgsm.com.tr')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <code className="text-sm">SIP Username: [Sizin kullanıcı adınız]</code>
                </div>
                <div>
                  <code className="text-sm">SIP Password: [Sizin şifreniz]</code>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 text-white rounded-full font-bold">
                4
              </div>
              <h3 className="text-xl font-bold">Prefix Ayarı Yapın</h3>
            </div>
            <div className="space-y-3">
              <p className="text-neutral-700">
                Uluslararası format için +90 prefix&apos;i ekleyin:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-neutral-700">
                <li>Netgsm panel → <strong>Ses Hizmeti</strong> → <strong>Ayarlar</strong></li>
                <li><strong>Prefix Ayarları</strong> bölümüne gidin</li>
                <li>Gelen aramalar için <code className="bg-neutral-100 px-2 py-1 rounded">+90</code> ekleyin</li>
              </ol>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Önemli:</strong> Bu ayar olmadan numaranız uluslararası formatla çalışmaz!
                </p>
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 text-white rounded-full font-bold">
                5
              </div>
              <h3 className="text-xl font-bold">Telyx.ai&apos;de Bağlanma</h3>
            </div>
            <div className="space-y-3">
              <p className="text-neutral-700">
                1. Telyx.ai Dashboard → <strong>Telefon Numaraları</strong> sayfasına gidin
              </p>
              <p className="text-neutral-700">
                2. <strong>Telefon Numarası Ekle</strong> → <strong>BYOC</strong> seçin
              </p>
              <p className="text-neutral-700">
                3. Ülke: <strong>Türkiye</strong>, Sağlayıcı: <strong>Netgsm</strong> seçin
              </p>
              <p className="text-neutral-700">
                4. SIP bilgilerinizi girin ve bağlayın
              </p>
              <Link href="/dashboard/phone-numbers">
                <Button className="mt-4">
                  Telefon Numaraları Sayfasına Git
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
          <h2 className="text-2xl font-bold mb-4">❓ Sıkça Sorulan Sorular</h2>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">0850 numara ücretsiz mi?</h4>
              <p className="text-neutral-700 text-sm">
                Evet! 0850 numaraları gelen aramalar tamamen ücretsizdir. Sadece giden aramalar ücretlendirilir.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">SIP trunk maliyeti nedir?</h4>
              <p className="text-neutral-700 text-sm">
                Netgsm SIP trunk hizmeti yıllık yaklaşık $5&apos;tir. Gelen aramalar ücretsizdir.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Kurulum ne kadar sürer?</h4>
              <p className="text-neutral-700 text-sm">
                Hesap açıldıktan sonra 5-10 dakika içinde kurulum tamamlanabilir.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Destek nasıl alırım?</h4>
              <p className="text-neutral-700 text-sm">
                Netgsm&apos;in Türkçe müşteri desteği vardır. Telyx.ai ile ilgili sorular için bizimle iletişime geçin.
              </p>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 mt-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Yardıma mı İhtiyacınız Var?</h3>
          <p className="text-neutral-700 mb-4">
            Kurulum sırasında sorun yaşıyorsanız, destek ekibimiz size yardımcı olmaktan mutluluk duyar.
          </p>
          <Button variant="outline">
            Destek ile İletişime Geç
          </Button>
        </div>
      </div>
    </div>
  );
}
