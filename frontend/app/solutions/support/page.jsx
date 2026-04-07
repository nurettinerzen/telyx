'use client';

import SolutionPageTemplate from '@/components/solutions/SolutionPageTemplate';
import {
  HeadphonesIcon,
  MessageCircle,
  HelpCircle,
  Clock,
  BarChart3,
  BookOpen,
  ArrowUpRight,
  LayoutDashboard,
} from 'lucide-react';

export default function SupportSolutionPage() {
  return (
    <SolutionPageTemplate
      sector="support"
      accentColor="#051752"
      accentLight="#00C4E6"
      heroIcon={HeadphonesIcon}
      badgeColorClasses="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400"
      statColorClasses="text-green-600 dark:text-green-400"
      ctaGradient="bg-gradient-to-br from-[#051752] via-[#000ACF] to-[#00C4E6] dark:from-neutral-800 dark:to-neutral-800"
      ctaGlowColors={['bg-[#051752]/20', 'bg-[#00C4E6]/15']}
      ctaTextColor="text-green-100 dark:text-neutral-400"
      howItWorksSteps={[
        { key: 'step1', color: 'from-[#051752] to-[#006FEB]', icon: HelpCircle },
        { key: 'step2', color: 'from-[#051752] to-[#006FEB]', icon: BookOpen },
        { key: 'step3', color: 'from-[#000ACF] to-[#00C4E6]', icon: ArrowUpRight },
      ]}
      useCases={[
        { key: 'uc1', icon: MessageCircle, titleKey: 'solutions.support.useCase1.title', descKey: 'solutions.support.useCase1.desc', color: 'from-[#051752] to-[#006FEB]' },
        { key: 'uc2', icon: HelpCircle, titleKey: 'solutions.support.useCase2.title', descKey: 'solutions.support.useCase2.desc', color: 'from-[#000ACF] to-[#00C4E6]' },
        { key: 'uc3', icon: Clock, titleKey: 'solutions.support.useCase3.title', descKey: 'solutions.support.useCase3.desc', color: 'from-[#051752] to-[#000ACF]' },
        { key: 'uc4', icon: BarChart3, titleKey: 'solutions.support.useCase4.title', descKey: 'solutions.support.useCase4.desc', color: 'from-orange-500 to-red-500' },
      ]}
      highlights={[
        { icon: BookOpen, key: 'item1', color: 'from-[#051752] to-[#006FEB]' },
        { icon: ArrowUpRight, key: 'item2', color: 'from-[#000ACF] to-[#051752]' },
        { icon: LayoutDashboard, key: 'item3', color: 'from-[#000ACF] to-[#00C4E6]' },
      ]}
    />
  );
}
