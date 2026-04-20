'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ExternalLink, Check, Copy } from 'lucide-react';
import Link from 'next/link';

export default function BulutfonSetupGuide() {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
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
            🇹🇷 Bulutfon Kurulum Rehberi
          </h1>
          <p className="text-lg text-neutral-600">
            Bulutfon SIP trunk&apos;unuzu Telyx.ai ile adım adım bağlayın
          </p>
          <div className="flex gap-2 mt-4">
            <Badge className="bg-green-100 text-green-800">Kolay Kurulum</Badge>
            <Badge variant="outline">~5 dakika</Badge>
            <Badge variant="outline">~$2/yıl</Badge>
          </div>
        </div>

        {/* What is Bulutfon */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">💡 Bulutfon Nedir?</h2>
          <p className="text-neutral-700 mb-4">
            Bulutfon, kolay kullanımı ve uygun fiyatı ile bilinen bir bulut santral hizmetidir. 
            0850 numaralar ve basit SIP desteği sunar.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">0850 Numara</div>
                <div className="text-sm text-neutral-600">Gelen aramalar ücretsiz</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">Basit Kurulum</div>
                <div className="text-sm text-neutral-600">5 dakikada hazir</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">Web Panel</div>
                <div className="text-sm text-neutral-600">Modern arayüz</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">Uygun Fiyat</div>
                <div className="text-sm text-neutral-600">~$2/yıl</div>
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
              <h3 className="text-xl font-bold">Bulutfon Hesabı Oluşturun</h3>
            </div>
            <p className="text-neutral-700 mb-4">
              Önce Bulutfon&apos;da bir hesap oluşturun.
            </p>
            <a
              href="https://www.bulutfon.com/kayit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button>
                Bulutfon&apos;a Kayıt Ol <ExternalLink className="ml-2 h-4 w-4" />
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
                1. Bulutfon panel → <strong>Numaralar</strong> bölümüne gidin
              </p>
              <p className="text-neutral-700">
                2. <strong>Yeni Numara Al</strong> butonuna tıklayın
              </p>
              <p className="text-neutral-700">
                3. <strong>0850</strong> seçip istediğiniz numarayı seçin
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>İpucu:</strong> Bulutfon&apos;da 0850 numaralar çok uygun fiyatlıdır (~$2/yıl).
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
                1. Bulutfon panel → <strong>Ayarlar</strong> → <strong>SIP Ayarları</strong>&apos;na gidin
              </p>
              <p className="text-neutral-700">
                2. SIP bilgilerinizi not alın:
              </p>
              <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <code className="text-sm">SIP Server: sip.bulutfon.com</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard('sip.bulutfon.com')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <code className="text-sm">Username: [Sizin Bulutfon numaranız]</code>
                </div>
                <div>
                  <code className="text-sm">Password: [API şifreniz]</code>
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
                3. Ülke: <strong>Türkiye</strong>, Sağlayıcı: <strong>Bulutfon</strong> seçin
              </p>
              <p className="text-neutral-700">
                4. SIP bilgilerinizi girin:
              </p>
              <ul className="list-disc list-inside text-neutral-700 text-sm ml-4 space-y-1">
                <li>SIP Server: <code>sip.bulutfon.com</code></li>
                <li>Username: Bulutfon numaranız</li>
                <li>Password: API şifreniz</li>
                <li>Phone Number: +90850... (uluslararası format)</li>
              </ul>
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
              <h4 className="font-semibold mb-2">Bulutfon maliyeti nedir?</h4>
              <p className="text-neutral-700 text-sm">
                0850 numaralar yıllık yaklaşık $2&apos;dir. Gelen aramalar ücretsizdir.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Kurulum ne kadar sürer?</h4>
              <p className="text-neutral-700 text-sm">
                5 dakikadan kısa sürede kurulum tamamlanabilir.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Netgsm&apos;den farkı nedir?</h4>
              <p className="text-neutral-700 text-sm">
                Bulutfon daha basit bir arayüze sahiptir ve genellikle daha ucuzdur. Netgsm daha fazla özellik sunar.
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
