/**
 * UpgradeModal Component
 * Shows when user tries to access a locked feature
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFeature } from '@/lib/features';

export default function UpgradeModal({
  isOpen,
  onClose,
  featureId,
  featureName: customFeatureName,
  featureDescription: customDescription,
  requiredPlan: customRequiredPlan
}) {
  const router = useRouter();
  const { t } = useLanguage();

  // Get feature info from translation keys or use custom props
  const feature = getFeature(featureId);
  const featureName = customFeatureName || (featureId ? t(`featureConfig.${featureId}.name`) : '');
  const description = customDescription || (featureId ? t(`featureConfig.${featureId}.description`) : '');
  const requiredPlanKey = feature?.requiredPlan?.toLowerCase() || '';
  const requiredPlan = customRequiredPlan || (requiredPlanKey ? t(`planNames.${requiredPlanKey}`) : '');

  const handleUpgrade = () => {
    onClose();
    router.push('/dashboard/subscription');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary-600 dark:text-primary-400" />
          </div>
          <DialogTitle className="text-xl font-bold text-neutral-900 dark:text-white">
            {t('upgradeModal.featureRequiresPlan').replace('{plan}', requiredPlan)}
          </DialogTitle>
          <DialogDescription className="text-neutral-600 dark:text-neutral-400 mt-2">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-primary-100 dark:bg-primary-900/50 rounded-lg flex items-center justify-center">
                <Lock className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{featureName}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {t('upgradeModal.availableInPlan').replace('{plan}', requiredPlan)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            {t('common.close')}
          </Button>
          <Button
            onClick={handleUpgrade}
            className="w-full sm:w-auto order-1 sm:order-2 bg-gradient-to-r from-[#051752] via-[#000ACF] to-[#006FEB] hover:from-[#041240] hover:via-[#0008b0] hover:to-[#00C4E6]"
          >
            {t('dashboard.subscriptionPage.viewPlans')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
