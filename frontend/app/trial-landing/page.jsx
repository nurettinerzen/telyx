'use client';

import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import TrialLandingPage from '@/components/TrialLandingPage';

export default function TrialLandingRoute() {
  return (
    <div className="min-h-screen">
      <Navigation />
      <TrialLandingPage />
      <Footer />
    </div>
  );
}
