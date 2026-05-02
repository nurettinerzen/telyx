import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Telyx — AI-powered multi-channel customer service';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background:
            'linear-gradient(135deg, #051752 0%, #000ACF 45%, #006FEB 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: -0.5,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background:
                'linear-gradient(135deg, #00C4E6 0%, #006FEB 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            T
          </div>
          <span>Telyx</span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 980,
            }}
          >
            Yapay Zeka Destekli Çok Kanallı Müşteri Hizmetleri
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              opacity: 0.85,
              maxWidth: 980,
              lineHeight: 1.3,
            }}
          >
            Telefon · WhatsApp · Web Sohbet · E-posta — tek panelden 7/24 otomatik destek
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 22,
            opacity: 0.85,
          }}
        >
          <div style={{ display: 'flex', gap: 24 }}>
            <span style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#00C4E6' }}>●</span>
              <span>KVKK uyumlu</span>
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#00C4E6' }}>●</span>
              <span>Türkçe destek</span>
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#00C4E6' }}>●</span>
              <span>Ücretsiz deneme</span>
            </span>
          </div>
          <span style={{ fontWeight: 600 }}>telyx.ai</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
