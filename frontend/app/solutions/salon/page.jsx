'use client';

import SolutionPageTemplate from '@/components/solutions/SolutionPageTemplate';
import {
  Scissors,
  Calendar,
  Bell,
  Users,
  Clock,
  CalendarClock,
  BookOpen,
} from 'lucide-react';

export default function SalonSolutionPage() {
  return (
    <SolutionPageTemplate
      sector="salon"
      accentColor="#000ACF"
      accentLight="#00C4E6"
      heroIcon={Scissors}
      badgeColorClasses="border-pink-200 dark:border-pink-800 bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400"
      statColorClasses="text-pink-600 dark:text-pink-400"
      ctaGradient="bg-gradient-to-br from-[#051752] via-[#000ACF] to-[#00C4E6] dark:from-neutral-800 dark:to-neutral-800"
      ctaGlowColors={['bg-[#000ACF]/20', 'bg-[#00C4E6]/15']}
      ctaTextColor="text-pink-100 dark:text-neutral-400"
      howItWorksSteps={[
        { key: 'step1', color: 'from-[#000ACF] to-[#00C4E6]', icon: Calendar },
        { key: 'step2', color: 'from-[#051752] to-[#006FEB]', icon: Bell },
        { key: 'step3', color: 'from-[#051752] to-[#006FEB]', icon: BookOpen },
      ]}
      useCases={[
        { key: 'uc1', icon: Calendar, titleKey: 'solutions.salon.useCase1.title', descKey: 'solutions.salon.useCase1.desc', color: 'from-[#000ACF] to-[#00C4E6]' },
        { key: 'uc2', icon: Bell, titleKey: 'solutions.salon.useCase2.title', descKey: 'solutions.salon.useCase2.desc', color: 'from-[#051752] to-[#000ACF]' },
        { key: 'uc3', icon: Users, titleKey: 'solutions.salon.useCase3.title', descKey: 'solutions.salon.useCase3.desc', color: 'from-[#006FEB] to-[#00C4E6]' },
        { key: 'uc4', icon: Clock, titleKey: 'solutions.salon.useCase4.title', descKey: 'solutions.salon.useCase4.desc', color: 'from-[#051752] to-[#006FEB]' },
      ]}
      highlights={[
        { icon: CalendarClock, key: 'item1', color: 'from-[#000ACF] to-[#00C4E6]' },
        { icon: Bell, key: 'item2', color: 'from-[#006FEB] to-[#051752]' },
        { icon: BookOpen, key: 'item3', color: 'from-[#051752] to-[#006FEB]' },
      ]}
    />
  );
}
