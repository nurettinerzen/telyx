import HubByFilter from '@/components/landings/HubByFilter';
import { Instagram } from 'lucide-react';

export const dynamic = 'force-static';

export default function InstagramHubPage() {
  return (
    <HubByFilter
      filterType="channel"
      filterValue="instagram"
      eyebrow="Instagram DM"
      heroTitle="Instagram DM'lerine 7/24 Yapay Zeka Yanıtı"
      heroSubtitle="Markanızın Instagram'ından gelen DM'leri AI saniyeler içinde yanıtlar. Story randevu sticker'larından, reklam DM'lerinden ve organik gönderilerden gelen mesajlar tek panelde toplanır."
      IconComponent={Instagram}
    />
  );
}
