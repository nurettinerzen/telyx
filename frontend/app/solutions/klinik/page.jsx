import HubByFilter from '@/components/landings/HubByFilter';
import { Stethoscope } from 'lucide-react';

export const dynamic = 'force-static';

export default function KlinikSolutionPage() {
  return (
    <HubByFilter
      filterType="industry"
      filterValue="klinik"
      eyebrow="Klinik & Sağlık"
      heroTitle="Klinikler İçin AI Müşteri Hizmetleri"
      heroSubtitle="Estetik klinikleri, sağlık merkezleri ve doktor muayenehaneleri için hazır AI çözümleri. WhatsApp, telefon, web ve Instagram'dan otomatik randevu, hatırlatma ve hasta iletişimi."
      IconComponent={Stethoscope}
    />
  );
}
