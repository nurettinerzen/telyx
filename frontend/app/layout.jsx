import './globals.css';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from 'next-themes';
import { Providers } from './providers';
import BetaEnvironmentBar from '@/components/BetaEnvironmentBar';
import PublicSiteChatWidget from '@/components/PublicSiteChatWidget';
import runtimeConfig from '@/lib/runtime-config';

const metadataBase = runtimeConfig.siteUrl ? new URL(runtimeConfig.siteUrl) : undefined;
const iconVersion = '20260413';

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
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Flex:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <LanguageProvider>
              <BetaEnvironmentBar />
              {children}
              <PublicSiteChatWidget />
            </LanguageProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
