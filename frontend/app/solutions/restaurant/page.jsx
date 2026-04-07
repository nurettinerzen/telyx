'use client';

import SolutionPageTemplate from '@/components/solutions/SolutionPageTemplate';
import {
  UtensilsCrossed,
  Calendar,
  BookOpen,
  Clock,
  Phone,
  CalendarCheck,
  Wheat,
  AlertTriangle,
} from 'lucide-react';

export default function RestaurantSolutionPage() {
  return (
    <SolutionPageTemplate
      sector="restaurant"
      accentColor="#051752"
      accentLight="#006FEB"
      heroIcon={UtensilsCrossed}
      badgeColorClasses="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400"
      statColorClasses="text-orange-600 dark:text-orange-400"
      ctaGradient="bg-gradient-to-br from-[#051752] via-[#000ACF] to-[#006FEB] dark:from-neutral-800 dark:to-neutral-800"
      ctaGlowColors={['bg-[#051752]/20', 'bg-[#006FEB]/15']}
      ctaTextColor="text-orange-100 dark:text-neutral-400"
      howItWorksSteps={[
        { key: 'step1', color: 'from-orange-500 to-red-500', icon: Calendar },
        { key: 'step2', color: 'from-[#051752] to-[#006FEB]', icon: BookOpen },
        { key: 'step3', color: 'from-[#051752] to-[#006FEB]', icon: Phone },
      ]}
      useCases={[
        { key: 'uc1', icon: Calendar, titleKey: 'solutions.restaurant.useCase1.title', descKey: 'solutions.restaurant.useCase1.desc', color: 'from-orange-500 to-red-500' },
        { key: 'uc2', icon: BookOpen, titleKey: 'solutions.restaurant.useCase2.title', descKey: 'solutions.restaurant.useCase2.desc', color: 'from-amber-500 to-yellow-500' },
        { key: 'uc3', icon: Clock, titleKey: 'solutions.restaurant.useCase3.title', descKey: 'solutions.restaurant.useCase3.desc', color: 'from-[#000ACF] to-[#00C4E6]' },
        { key: 'uc4', icon: Phone, titleKey: 'solutions.restaurant.useCase4.title', descKey: 'solutions.restaurant.useCase4.desc', color: 'from-[#051752] to-[#006FEB]' },
      ]}
      highlights={[
        { icon: CalendarCheck, key: 'item1', color: 'from-[#006FEB] to-[#051752]' },
        { icon: Wheat, key: 'item2', color: 'from-orange-500 to-yellow-500' },
        { icon: AlertTriangle, key: 'item3', color: 'from-[#000ACF] to-[#00C4E6]' },
      ]}
    />
  );
}
