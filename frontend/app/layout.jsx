import './globals.css';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from 'next-themes';
import { Providers } from './providers';
import runtimeConfig from '@/lib/runtime-config';

const metadataBase = runtimeConfig.siteUrl ? new URL(runtimeConfig.siteUrl) : undefined;

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
      {
        url: '/favicon-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Flex:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {runtimeConfig.isBetaApp && (
          <div className="border-b border-amber-300 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-50 px-4 py-2.5 text-amber-950 shadow-sm">
            <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 text-center text-sm font-medium">
              <span className="rounded-full bg-amber-900 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.18em] text-amber-50">
                BETA
              </span>
              <span>
                Beta ortamındasınız. Yeni özellikleri burada test edin; canlı müşteri verisi ve gerçek ödemelerde dikkatli olun.
              </span>
            </div>
          </div>
        )}
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <LanguageProvider>
              {children}
            </LanguageProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
