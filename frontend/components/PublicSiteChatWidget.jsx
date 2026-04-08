'use client';

import { usePathname } from 'next/navigation';
import ChatWidget from '@/components/ChatWidget';
import runtimeConfig from '@/lib/runtime-config';

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
