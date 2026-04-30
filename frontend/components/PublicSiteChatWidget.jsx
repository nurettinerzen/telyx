'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import runtimeConfig from '@/lib/runtime-config';

const ChatWidget = dynamic(() => import('@/components/ChatWidget'), {
  ssr: false,
  loading: () => null,
});

export default function PublicSiteChatWidget() {
  const pathname = usePathname();

  if (!runtimeConfig.landingChatEmbedKey) {
    return null;
  }

  if (pathname?.startsWith('/dashboard')) {
    return null;
  }

  return (
    <ChatWidget
      embedKey={runtimeConfig.landingChatEmbedKey}
      position="bottom-right"
      primaryColor="#051752"
      showBranding={false}
    />
  );
}
