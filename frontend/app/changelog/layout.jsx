import '@/styles/features.css';
import {
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';

const TITLE = 'Sürüm Notları — Telyx Geliştirme Günlüğü';
const DESCRIPTION =
  'Telyx AI sürüm notları: yeni özellikler, iyileştirmeler ve düzeltmeler. Çok kanallı yapay zeka müşteri hizmetleri platformunda neler değişti?';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: languageAlternates('/changelog'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/changelog',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

export default function ChangelogLayout({ children }) {
  return children;
}
