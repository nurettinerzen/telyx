'use client';

import Navigation from '@/components/Navigation';
import { LandingPage } from '@/components/LandingPage';
import { Footer } from '@/components/Footer';
import ChatWidget from '@/components/ChatWidget';
import runtimeConfig from '@/lib/runtime-config';

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navigation />

      <LandingPage />

      <Footer />

      {runtimeConfig.landingChatEmbedKey && (
        <ChatWidget
          embedKey={runtimeConfig.landingChatEmbedKey}
          position="bottom-right"
          primaryColor="#051752"
          showBranding={false}
          buttonText="Bize Yazın"
        />
      )}
    </div>
  );
}
