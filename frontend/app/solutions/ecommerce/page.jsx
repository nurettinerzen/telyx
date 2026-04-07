'use client';

import SolutionPageTemplate from '@/components/solutions/SolutionPageTemplate';
import {
  ShoppingCart,
  Package,
  Truck,
  RotateCcw,
  Tag,
  ShoppingBag,
  ArrowUpRight,
  Globe,
} from 'lucide-react';

export default function EcommerceSolutionPage() {
  return (
    <SolutionPageTemplate
      sector="ecommerce"
      accentColor="#006FEB"
      accentLight="#00C4E6"
      heroIcon={ShoppingCart}
      badgeColorClasses="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
      statColorClasses="text-blue-600 dark:text-blue-400"
      ctaGradient="bg-gradient-to-br from-[#051752] via-[#000ACF] to-[#006FEB] dark:from-neutral-800 dark:to-neutral-800"
      ctaGlowColors={['bg-[#000ACF]/20', 'bg-[#00C4E6]/15']}
      ctaTextColor="text-blue-100 dark:text-neutral-400"
      howItWorksSteps={[
        { key: 'step1', color: 'from-[#000ACF] to-[#00C4E6]', icon: Package },
        { key: 'step2', color: 'from-[#051752] to-[#006FEB]', icon: RotateCcw },
        { key: 'step3', color: 'from-[#051752] to-[#006FEB]', icon: Tag },
      ]}
      useCases={[
        { key: 'uc1', icon: Package, titleKey: 'solutions.ecommerce.useCase1.title', descKey: 'solutions.ecommerce.useCase1.desc', color: 'from-[#000ACF] to-[#00C4E6]' },
        { key: 'uc2', icon: Truck, titleKey: 'solutions.ecommerce.useCase2.title', descKey: 'solutions.ecommerce.useCase2.desc', color: 'from-[#051752] to-[#006FEB]' },
        { key: 'uc3', icon: RotateCcw, titleKey: 'solutions.ecommerce.useCase3.title', descKey: 'solutions.ecommerce.useCase3.desc', color: 'from-[#051752] to-[#000ACF]' },
        { key: 'uc4', icon: ShoppingBag, titleKey: 'solutions.ecommerce.useCase4.title', descKey: 'solutions.ecommerce.useCase4.desc', color: 'from-orange-500 to-red-500' },
      ]}
      highlights={[
        { icon: ShoppingBag, key: 'item1', color: 'from-[#006FEB] to-[#051752]' },
        { icon: ArrowUpRight, key: 'item2', color: 'from-[#051752] to-[#006FEB]' },
        { icon: Globe, key: 'item3', color: 'from-[#051752] to-[#000ACF]' },
      ]}
    />
  );
}
