import HubByFilter from '@/components/landings/HubByFilter';
import { GraduationCap } from 'lucide-react';

export const dynamic = 'force-static';

export default function EgitimSolutionPage() {
  return (
    <HubByFilter
      filterType="industry"
      filterValue="egitim"
      eyebrow="Eğitim"
      heroTitle="Eğitim Kurumları İçin AI Müşteri Hizmetleri"
      heroSubtitle="Kurslar, dil okulları, eğitim merkezleri ve özel okullar için hazır AI çözümleri. Aday öğrenci kayıt, mevcut öğrenci destek ve veli iletişimi tek panelde."
      IconComponent={GraduationCap}
    />
  );
}
