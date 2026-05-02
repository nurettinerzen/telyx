import ChannelLanding from '@/components/landings/ChannelLanding';
import { getChannelLanding } from '@/lib/seo/channels';

export const dynamic = 'force-static';

export default function WhatsAppPage() {
  const data = getChannelLanding('whatsapp');
  return <ChannelLanding data={data} />;
}
