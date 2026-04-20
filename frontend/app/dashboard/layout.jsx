'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { apiClient } from '@/lib/api';
import { Toaster } from 'sonner';
import { OnboardingModal } from '@/components/OnboardingModal';
import { useLanguage } from '@/contexts/LanguageContext';

// Avoid storing user/session data in browser storage.
const USER_CACHE_KEY = 'dashboard_user_cache_disabled';
const ONBOARDING_COMPLETED_PREFIX = 'onboarding_completed_business_';

const getCachedUserData = () => null;

const setCachedUserData = () => {};

const getOnboardingStorageKey = (businessId) => `${ONBOARDING_COMPLETED_PREFIX}${businessId}`;

const isOnboardingMarkedCompleteLocally = (businessId) => {
  if (typeof window === 'undefined' || !businessId) return false;
  return localStorage.getItem(getOnboardingStorageKey(businessId)) === '1';
};

const markOnboardingCompleteLocally = (businessId) => {
  if (typeof window === 'undefined' || !businessId) return;
  localStorage.setItem(getOnboardingStorageKey(businessId), '1');
};

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    // Try to load from cache first for instant display
    // IMPORTANT: Only use cache if it has subscription data to prevent sidebar flash
    const cachedData = getCachedUserData();
    const hasCachedSubscription = cachedData?.user?.subscription?.plan;

    if (cachedData && hasCachedSubscription && !initialLoadDone.current) {
      setUser(cachedData.user);
      setCredits(cachedData.credits);
      setLoading(false);
      // Check onboarding from cached data
      if (
        cachedData.user?.onboardingCompleted === false &&
        !cachedData.isInvitedMember &&
        !isOnboardingMarkedCompleteLocally(cachedData.user?.businessId)
      ) {
        setShowOnboarding(true);
      }
    }

    // Load fresh user data
    // Show loading if no valid cache (with subscription), load in background if cache exists
    loadUserData(!hasCachedSubscription);
    initialLoadDone.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔥 YENİ: Ayrı useEffect - Sidebar scroll position'ını koru
  useEffect(() => {
    const sidebar = document.querySelector('[data-sidebar-nav]');
    if (sidebar) {
      const scrollPos = sessionStorage.getItem('sidebar-scroll');
      if (scrollPos) {
        sidebar.scrollTop = parseInt(scrollPos);
      }
    }
  }, [pathname]);

  const loadUserData = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      // Load user profile from /api/auth/me (includes onboardingCompleted)
      const userResponse = await apiClient.get('/api/auth/me');
      const userData = userResponse.data;
      setUser(userData);
      if (userData.onboardingCompleted === true && userData.businessId) {
        markOnboardingCompleteLocally(userData.businessId);
      }

      // Email verification check - redirect to pending page if not verified
      // Skip check for invited team members (they were invited via email, so implicitly verified)
      const isInvitedMember = userData.acceptedAt || (userData.role && userData.role !== 'OWNER');
      if (!userData.emailVerified && !isInvitedMember) {
        router.push('/auth/email-pending');
        return;
      }

      // Check if onboarding is needed
      // Team members (non-owners) who were invited should skip onboarding
      if (userData.onboardingCompleted === false) {
        // If user was invited (has acceptedAt) or is not owner, skip onboarding
        if (isInvitedMember) {
          // Auto-complete onboarding for invited members
          try {
            await apiClient.onboarding.complete();
          } catch (err) {
            console.warn('Auto-complete onboarding failed:', err);
          }
        } else {
          if (!isOnboardingMarkedCompleteLocally(userData.businessId)) {
            setShowOnboarding(true);
          }
        }
      }

      // Load subscription/credits - hatası olsa bile devam et
      let creditsValue = 0;
      let subscriptionData = null;
      try {
        const subResponse = await apiClient.subscription.getCurrent();
        creditsValue = subResponse.data.credits || 0;
        subscriptionData = subResponse.data;
        setCredits(creditsValue);
        // Add subscription info to user object for Sidebar feature visibility
        setUser(prev => ({
          ...prev,
          subscription: subResponse.data
        }));
      } catch (subError) {
        console.warn('Failed to load subscription:', subError);
        setCredits(0);
      }

      // Cache the data for next page navigation
      setCachedUserData({
        user: { ...userData, subscription: subscriptionData },
        credits: creditsValue,
        isInvitedMember
      });
    } catch (error) {
      console.error('Failed to load user data:', error);
      if (error.response?.status === 401) {
        sessionStorage.removeItem(USER_CACHE_KEY);
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingComplete = async () => {
    try {
      await apiClient.onboarding.complete();
      markOnboardingCompleteLocally(user?.businessId);
      setShowOnboarding(false);
      // Redirect to guide page after onboarding
      window.location.href = '/dashboard/guides';
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 dark:border-gray-800 border-t-primary-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Check if there's a pending enterprise payment
  // pendingPlanId = 'ENTERPRISE' ve enterprisePaymentStatus = 'pending' ise ödeme bekleniyor
  const hasPendingEnterprise = user?.subscription?.pendingPlanId === 'ENTERPRISE' &&
    user?.subscription?.enterprisePaymentStatus === 'pending';

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <Sidebar user={user} credits={credits} />

      {/* Main content - adjusted for 240px sidebar (w-60) */}
      <div className="flex-1 lg:ml-60 overflow-auto h-screen">
        {/* Payment pending banner for pending enterprise upgrade */}
        {hasPendingEnterprise && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-3">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {t('dashboard.enterprisePendingBanner')}
              </p>
            </div>
          </div>
        )}
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Toast notifications */}
      <Toaster position="bottom-right" richColors />

      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal
          open={showOnboarding}
          onClose={handleOnboardingComplete}
          business={user?.business}
          phoneInboundEnabled={Boolean(user?.business?.phoneInboundEnabled)}
        />
      )}
    </div>
  );
}
