'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { apiClient } from '@/lib/api';
import { Toaster } from 'sonner';
import { OnboardingModal } from '@/components/OnboardingModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDate, formatSessionHandle } from '@/lib/utils';
import { getPlanDisplayName } from '@/lib/planConfig';
import { subscribeLiveHandoffSync } from '@/lib/liveHandoffSync';
import { DashboardProvider } from '@/contexts/DashboardContext';
import UsageAlertsBanner from '@/components/UsageAlertsBanner';

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
  const { t, locale } = useLanguage();
  const whatsappLiveHandoffEnabled = process.env.NEXT_PUBLIC_WHATSAPP_LIVE_HANDOFF_V2 === 'true';
  const chatLiveHandoffEnabled = process.env.NEXT_PUBLIC_CHAT_LIVE_HANDOFF_V1 === 'true';
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [whatsappPendingCount, setWhatsappPendingCount] = useState(0);
  const [chatPendingCount, setChatPendingCount] = useState(0);
  const [liveSupportAlert, setLiveSupportAlert] = useState(null);
  const initialLoadDone = useRef(false);
  const knownPendingRequestsRef = useRef(new Map());

  const shouldBypassEmailVerification = () => {
    if (typeof window === 'undefined') return false;

    if (window.location.pathname === '/dashboard/subscription') {
      return true;
    }

    const params = new URLSearchParams(window.location.search || '');
    return Boolean(
      params.get('session_id')
      || params.get('wallet_topup')
      || params.get('addon')
      || params.get('success')
      || params.get('status')
    );
  };

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

  const loadUserData = useCallback(async (showLoading = true) => {
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
      if (!userData.emailVerified && !isInvitedMember && !shouldBypassEmailVerification()) {
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
        setUser(prev => (prev ? {
          ...prev,
          subscription: prev.subscription || {
            plan: 'FREE',
            status: 'UNKNOWN'
          }
        } : prev));
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
  }, [router]);

  useEffect(() => {
    const handleUserRefresh = () => {
      loadUserData(false);
    };

    window.addEventListener('telyx:user-updated', handleUserRefresh);
    return () => {
      window.removeEventListener('telyx:user-updated', handleUserRefresh);
    };
  }, [loadUserData]);

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

  useEffect(() => {
    if ((!whatsappLiveHandoffEnabled && !chatLiveHandoffEnabled) || !user?.businessId) {
      setWhatsappPendingCount(0);
      setChatPendingCount(0);
      setLiveSupportAlert(null);
      knownPendingRequestsRef.current = new Map();
      return;
    }

    let cancelled = false;

    const loadPendingHandoffs = async ({ silent = false } = {}) => {
      try {
        const response = await apiClient.get('/api/chat-logs', {
          params: {
            page: 1,
            limit: 50,
          }
        });

        if (cancelled) return;

        const pendingThreads = (response.data?.chatLogs || [])
          .filter((chat) => (
            chat?.status === 'active' &&
            chat?.handoff?.mode === 'REQUESTED' &&
            (
              (chat?.channel === 'WHATSAPP' && whatsappLiveHandoffEnabled) ||
              (chat?.channel === 'CHAT' && chatLiveHandoffEnabled)
            )
          ))
          .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));

        setWhatsappPendingCount(pendingThreads.filter((chat) => chat?.channel === 'WHATSAPP').length);
        setChatPendingCount(pendingThreads.filter((chat) => chat?.channel === 'CHAT').length);

        const requestMarkerFor = (chat) => (
          chat?.handoff?.requestedAt ||
          chat?.updatedAt ||
          chat?.createdAt ||
          ''
        );

        const previousMarkers = knownPendingRequestsRef.current;
        const nextMarkers = new Map();

        for (const chat of pendingThreads) {
          nextMarkers.set(chat.id, requestMarkerFor(chat));
        }

        const newThreads = pendingThreads.filter((chat) => {
          const nextMarker = requestMarkerFor(chat);
          const previousMarker = previousMarkers.get(chat.id);
          return previousMarker !== nextMarker;
        });

        knownPendingRequestsRef.current = nextMarkers;

        if (newThreads.length > 0) {
          const newestThread = newThreads[0];
          const destination = '/dashboard/chats';

          if (pathname === destination) {
            return;
          }

          setLiveSupportAlert({
            id: newestThread.id,
            channel: newestThread.channel,
            customerPhone: newestThread.customerPhone || null,
            sessionId: newestThread.sessionId || null,
          });
        }
      } catch (error) {
        if (!silent) {
          console.warn('Failed to load pending WhatsApp handoffs:', error?.message || error);
        }
      }
    };

    loadPendingHandoffs();

    const unsubscribeSync = subscribeLiveHandoffSync((event) => {
      if (!event?.type) return;

      if (event.chatId && (event.type === 'handoff_claimed' || event.type === 'handoff_released')) {
        setLiveSupportAlert((current) => (
          current?.id === event.chatId ? null : current
        ));
      }

      loadPendingHandoffs({ silent: true });
    });

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadPendingHandoffs({ silent: true });
      }
    }, 5000);

    return () => {
      cancelled = true;
      unsubscribeSync();
      clearInterval(interval);
    };
  }, [chatLiveHandoffEnabled, whatsappLiveHandoffEnabled, user?.businessId, pathname]);

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
  const hasScheduledPlanChange = Boolean(user?.subscription?.pendingPlanId) && !hasPendingEnterprise;
  const pendingPlanName = hasScheduledPlanChange
    ? getPlanDisplayName(user?.subscription?.pendingPlanId, locale)
    : null;
  const pendingPlanDate = user?.subscription?.currentPeriodEnd
    ? formatDate(user.subscription.currentPeriodEnd, 'short', locale)
    : null;
  const usageAlerts = Array.isArray(user?.subscription?.usageAlerts)
    ? user.subscription.usageAlerts
    : [];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <Sidebar
        user={user}
        credits={credits}
        business={user?.business}
        whatsappPendingCount={whatsappPendingCount}
        chatPendingCount={chatPendingCount}
      />

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
        {hasScheduledPlanChange && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-3">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>{t('dashboard.subscriptionPage.pendingPlanChange')}</strong>
                {' '}
                {pendingPlanDate
                  ? t('dashboard.subscriptionPage.pendingPlanChangeDesc')
                    .replace('{date}', pendingPlanDate)
                    .replace('{planName}', pendingPlanName)
                  : t('dashboard.subscriptionPage.pendingPlanChangeNoDate')
                    .replace('{planName}', pendingPlanName)}
              </p>
            </div>
          </div>
        )}
        <UsageAlertsBanner alerts={usageAlerts} locale={locale} />
        <main className="p-6 lg:p-8">
          <DashboardProvider user={user}>
            {children}
          </DashboardProvider>
        </main>
      </div>

      {/* Toast notifications */}
      <Toaster position="bottom-right" richColors />

      {liveSupportAlert && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-start justify-center px-4 pt-20">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-amber-900 dark:bg-neutral-950/95">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8.228 9c.549-1.165 1.918-2 3.772-2 2.485 0 4.5 1.567 4.5 3.5 0 1.423-1.093 2.648-2.662 3.203-.69.244-1.088.61-1.088 1.047V15m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {t('dashboard.conversationsPage.globalAlertTitle')}
                </h3>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                  {liveSupportAlert.channel === 'CHAT'
                    ? t('dashboard.conversationsPage.globalAlertDescriptionChat').replace('{session}', formatSessionHandle(liveSupportAlert.sessionId, 'chat'))
                    : t('dashboard.conversationsPage.globalAlertDescriptionWhatsapp').replace('{phone}', liveSupportAlert.customerPhone || 'WhatsApp')}
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLiveSupportAlert(null)}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
                  >
                    {t('common.close')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/dashboard/chats?chatId=${liveSupportAlert.id}`);
                      setLiveSupportAlert(null);
                    }}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600"
                  >
                    {t('dashboard.conversationsPage.openInbox')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
