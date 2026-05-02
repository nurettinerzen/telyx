import ChannelLanding from '@/components/landings/ChannelLanding';
import { getChannelLanding } from '@/lib/seo/channels';

export const dynamic = 'force-static';

export default function EPostaPage() {
  const data = getChannelLanding('e-posta');
  return <ChannelLanding data={data} />;
}
