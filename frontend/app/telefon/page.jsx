import ChannelLanding from '@/components/landings/ChannelLanding';
import { getChannelLanding } from '@/lib/seo/channels';

export const dynamic = 'force-static';

export default function TelefonPage() {
  const data = getChannelLanding('telefon');
  return <ChannelLanding data={data} />;
}
