import ChannelLanding from '@/components/landings/ChannelLanding';
import { getChannelLanding } from '@/lib/seo/channels';

export const dynamic = 'force-static';

export default function WebSohbetPage() {
  const data = getChannelLanding('web-sohbet');
  return <ChannelLanding data={data} />;
}
