import JsonLd from '@/components/seo/JsonLd';
import {
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, howToSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Netgsm SIP Trunk Kurulum Rehberi — Telyx';
const DESCRIPTION =
  'Netgsm SIP trunk\'unuzu Telyx ile adım adım bağlayın. 0850 numara, ücretsiz gelen arama ve sesli AI agent için 10 dakikalık kurulum rehberi.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: languageAlternates('/guides/netgsm-setup'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/guides/netgsm-setup',
    type: 'article',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Rehberler', path: '/guides' },
  { name: 'Netgsm Kurulumu', path: '/guides/netgsm-setup' },
]);

const howTo = howToSchema({
  name: 'Netgsm SIP trunk\'unu Telyx\'e nasıl bağlarsınız?',
  description: DESCRIPTION,
  totalTime: 'PT10M',
  path: '/guides/netgsm-setup',
  steps: [
    {
      name: 'Netgsm hesabınıza giriş yapın',
      text: 'Netgsm panelinize giriş yaparak SIP trunk yönetim sayfasını açın.',
    },
    {
      name: 'SIP kullanıcı bilgilerinizi alın',
      text: 'SIP server adresi, kullanıcı adı ve şifresini Netgsm panelinden kopyalayın.',
    },
    {
      name: 'Telyx telefon numaraları sayfasını açın',
      text: 'Dashboard üzerinden Telefon Numaraları > Yeni Numara Ekle yoluna gidin.',
    },
    {
      name: 'Netgsm bilgilerini Telyx\'e girin',
      text: 'Sağlayıcı olarak Netgsm seçin, SIP bilgilerinizi yapıştırın ve numarayı kaydedin.',
    },
    {
      name: 'Test araması yapın',
      text: 'Numarayı arayarak yapay zeka asistanınızın yanıt verdiğini doğrulayın.',
    },
  ],
});

export default function NetgsmSetupLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="guide-netgsm" data={[howTo, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
