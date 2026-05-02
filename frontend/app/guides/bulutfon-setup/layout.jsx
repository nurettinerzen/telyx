import JsonLd from '@/components/seo/JsonLd';
import {
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, howToSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Bulutfon SIP Kurulum Rehberi — Telyx';
const DESCRIPTION =
  'Bulutfon SIP trunk\'unuzu Telyx ile 5 dakikada bağlayın. 0850 numara, ücretsiz gelen arama ve yapay zeka destekli sesli asistan için adım adım rehber.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: languageAlternates('/guides/bulutfon-setup'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/guides/bulutfon-setup',
    type: 'article',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Rehberler', path: '/guides' },
  { name: 'Bulutfon Kurulumu', path: '/guides/bulutfon-setup' },
]);

const howTo = howToSchema({
  name: 'Bulutfon SIP trunk\'unu Telyx\'e nasıl bağlarsınız?',
  description: DESCRIPTION,
  totalTime: 'PT5M',
  path: '/guides/bulutfon-setup',
  steps: [
    {
      name: 'Bulutfon panelinize giriş yapın',
      text: 'Bulutfon yönetim paneline giriş yaparak SIP trunk yönetim sayfasını açın.',
    },
    {
      name: 'SIP bilgilerinizi alın',
      text: 'SIP server, kullanıcı adı ve şifre bilgilerinizi Bulutfon panelinden kopyalayın.',
    },
    {
      name: 'Telyx Telefon Numaraları sayfasını açın',
      text: 'Dashboard üzerinden Telefon Numaraları > Yeni Numara Ekle yoluna gidin.',
    },
    {
      name: 'Bulutfon bilgilerini Telyx\'e girin',
      text: 'Sağlayıcı olarak Bulutfon seçin, SIP bilgilerinizi yapıştırın ve numarayı kaydedin.',
    },
    {
      name: 'Test araması yapın',
      text: 'Numarayı arayarak yapay zeka asistanınızın yanıt verdiğini doğrulayın.',
    },
  ],
});

export default function BulutfonSetupLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="guide-bulutfon" data={[howTo, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
