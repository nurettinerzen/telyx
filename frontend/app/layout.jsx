import './globals.css';
import Script from 'next/script';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from 'next-themes';
import { Providers } from './providers';
import BetaEnvironmentBar from '@/components/BetaEnvironmentBar';
import PublicSiteChatWidget from '@/components/PublicSiteChatWidget';
import PageViewTracker from '@/components/PageViewTracker';
import runtimeConfig from '@/lib/runtime-config';

const metadataBase = runtimeConfig.siteUrl ? new URL(runtimeConfig.siteUrl) : undefined;
const iconVersion = '20260413';
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || 'GTM-MQ6NHMKP';
const META_PIXEL_ID = runtimeConfig.isBetaApp
  ? null
  : (process.env.NEXT_PUBLIC_META_PIXEL_ID || '1458852735458229');

export const metadata = {
  metadataBase,
  title: runtimeConfig.isBetaApp ? 'Telyx AI Beta' : 'Telyx AI',
  description: 'Yapay zeka destekli telefon, chat, e-posta ve WhatsApp ile işletme iletişiminizi otomatikleştirin.',
  robots: runtimeConfig.isBetaApp
    ? {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
        },
      }
    : {
        index: true,
        follow: true,
      },
  icons: {
    icon: [
      { url: `/favicon.ico?v=${iconVersion}`, sizes: 'any' },
      { url: `/favicon-light.png?v=${iconVersion}`, media: '(prefers-color-scheme: light)', type: 'image/png' },
      { url: `/favicon-dark.png?v=${iconVersion}`, media: '(prefers-color-scheme: dark)', type: 'image/png' },
      { url: `/favicon-v3.png?v=${iconVersion}`, type: 'image/png' },
      { url: `/icon.svg?v=${iconVersion}`, type: 'image/svg+xml' },
    ],
    shortcut: [{ url: `/favicon.ico?v=${iconVersion}` }],
    apple: [
      { url: `/apple-touch-icon.png?v=${iconVersion}` },
      { url: `/apple-icon-v3.png?v=${iconVersion}` },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        {GTM_ID ? (
          <Script
            id="google-tag-manager"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
            }}
          />
        ) : null}
        {META_PIXEL_ID ? (
          <Script
            id="meta-pixel"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');`,
            }}
          />
        ) : null}
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Flex:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {GTM_ID ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        ) : null}
        {META_PIXEL_ID ? (
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        ) : null}
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <LanguageProvider>
              <BetaEnvironmentBar />
              {META_PIXEL_ID ? <PageViewTracker /> : null}
              {children}
              <PublicSiteChatWidget />
            </LanguageProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
