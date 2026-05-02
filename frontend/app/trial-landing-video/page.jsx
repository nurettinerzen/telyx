'use client';

import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import TrialLandingPage from '@/components/TrialLandingPage';

export default function TrialLandingVideoRoute() {
  return (
    <div className="min-h-screen">
      <Navigation />
      <TrialLandingPage variant="video" />
      <Footer />
    </div>
  );
}
