import './globals.css';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from 'next-themes';
import { Providers } from './providers';
import BetaEnvironmentBar from '@/components/BetaEnvironmentBar';
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
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <LanguageProvider>
              <BetaEnvironmentBar />
              {children}
            </LanguageProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
