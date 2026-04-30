import { TrialLandingFooter, TrialLandingHeader } from '@/components/TrialLandingChrome';
import TrialLandingPage from '@/components/TrialLandingPage';

export default function TrialLandingRoute() {
  return (
    <div className="min-h-screen">
      <TrialLandingHeader />
      <TrialLandingPage />
      <TrialLandingFooter />
    </div>
  );
}
