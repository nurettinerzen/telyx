/**
 * Sidebar Component
 * Retell AI inspired navigation sidebar
 * Clean, minimal design with grouped sections
 */

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Bot,
  Phone,
  BarChart3,
  Settings,
  CreditCard,
  Puzzle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Megaphone,
  Users,
  Lock,
  Check,
  Database,
  Shield,
  MessageSquare,
  Mail,
  PhoneCall,
  MessageCircle,
  History,
  AlertTriangle,
  BookMarked,
  Package,
  Building2
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import LanguageSwitcher from './LanguageSwitcher';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import UpgradeModal from './UpgradeModal';
import { apiClient } from '@/lib/api';
import { VISIBILITY, getFeatureVisibility } from '@/lib/features';
import { getPlanDisplayName } from '@/lib/planConfig';
import { TelyxLogoCompact } from './TelyxLogo';
import { NAVIGATION_ITEMS } from '@/lib/navigationConfig';
import { useSubscription } from '@/hooks/useSubscription';
import { useHepsiburadaStatus, useSikayetvarStatus, useTrendyolStatus } from '@/hooks/useIntegrations';
import { getDashboardFlowSurfaceStyle } from '@/components/dashboard/DashboardFlowBackdrop';

export default function Sidebar({ user, credits, business, whatsappPendingCount = 0, chatPendingCount = 0 }) {
  const whatsappLiveHandoffEnabled = process.env.NEXT_PUBLIC_WHATSAPP_LIVE_HANDOFF_V2 === 'true';
  const chatLiveHandoffEnabled = process.env.NEXT_PUBLIC_CHAT_LIVE_HANDOFF_V1 === 'true';
  const pathname = usePathname();
  const { t, locale } = useLanguage();
  const { can } = usePermissions();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState([]);
  const [adminAccess, setAdminAccess] = useState({ enabled: false, mfaVerified: false });
  const navRef = useRef(null);
  const sidebarScrollRef = useRef(0);

  // Prevent hydration mismatch for theme
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const savedScroll = sessionStorage.getItem('sidebar-scroll');
    if (!savedScroll) return;

    const nextScroll = Number.parseInt(savedScroll, 10);
    if (Number.isNaN(nextScroll)) return;

    sidebarScrollRef.current = nextScroll;

    requestAnimationFrame(() => {
      if (navRef.current) {
        navRef.current.scrollTop = nextScroll;
      }
    });
  }, []);

  useEffect(() => {
    const restoreScroll = sidebarScrollRef.current;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (navRef.current) {
          navRef.current.scrollTop = restoreScroll;
        }
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadAdminAccess = async () => {
      if (!user?.email) {
        setAdminAccess({ enabled: false, mfaVerified: false });
        return;
      }

      try {
        const response = await apiClient.auth.adminMfaStatus({
          validateStatus: () => true,
          suppressExpected403: true,
        });

        if (cancelled) return;

        if (response.status === 200) {
          setAdminAccess({
            enabled: true,
            mfaVerified: response.data?.mfaVerified === true,
          });
          return;
        }
      } catch (error) {
        console.warn('Failed to determine admin sidebar access:', error);
      }

      if (!cancelled) {
        setAdminAccess({ enabled: false, mfaVerified: false });
      }
    };

    loadAdminAccess();

    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  // Upgrade modal state
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const { data: liveSubscription } = useSubscription();
  const { data: trendyolStatus } = useTrendyolStatus();
  const { data: hepsiburadaStatus } = useHepsiburadaStatus();
  const { data: sikayetvarStatus } = useSikayetvarStatus();

  // Get user's current plan and country
  // Only use actual plan from subscription - don't assume STARTER as default
  // This prevents flash where features appear/disappear as plan loads
  const userPlan = liveSubscription?.plan || user?.subscription?.plan || user?.plan || null;
  const userCountry = business?.country || user?.business?.country || 'TR';
  const hasMarketplaceQaAccess = Boolean(trendyolStatus?.connected || hepsiburadaStatus?.connected);
  const hasComplaintAccess = Boolean(sikayetvarStatus?.connected);
  const isDarkTheme = mounted && resolvedTheme === 'dark';

  // Show skeleton until BOTH conditions are met:
  // 1. Component is mounted (hydration complete)
  // 2. Plan is loaded from API (not null/undefined)
  // This prevents the "flash" where sidebar shows wrong state
  const isReady = mounted && userPlan !== null && userPlan !== undefined;

  // Sidebar Skeleton while loading
  const SidebarSkeleton = () => (
    <div
      className="flex h-full flex-col bg-gray-50 dark:bg-[linear-gradient(180deg,rgba(3,10,32,0.98),rgba(4,10,28,0.94))]"
      style={isDarkTheme ? getDashboardFlowSurfaceStyle(true, 'sidebar') : undefined}
    >
      <div className="h-16 flex items-center px-4 border-b border-gray-200 dark:border-white/[0.08]">
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="mb-6">
            <div className="h-3 w-16 bg-gray-200 dark:bg-white/10 rounded mb-2 animate-pulse" />
            <div className="space-y-1">
              {[1, 2].map((j) => (
                <div key={j} className="h-10 bg-gray-200 dark:bg-white/[0.05] rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  // Navigation structure - 4 groups using translation keys
  const NAVIGATION = [
    {
      label: t('dashboard.sidebar.product'),
      items: [
        { icon: BookMarked, label: t('dashboard.sidebar.guides'), href: NAVIGATION_ITEMS.guides.href, permission: 'assistants:view' },
        { icon: Bot, label: t('dashboard.assistants'), href: NAVIGATION_ITEMS.assistants.href, permission: 'assistants:view' },
        { icon: BookOpen, label: t('dashboard.knowledgeBase'), href: NAVIGATION_ITEMS.knowledgeBase.href, permission: 'knowledge:view' },
        { icon: MessageSquare, label: t('dashboard.sidebar.chatWidget'), href: NAVIGATION_ITEMS.chatWidget.href, permission: 'assistants:view' },
      ],
    },
    {
      label: t('dashboard.sidebar.operations'),
      items: [
        { icon: Database, label: t('dashboard.sidebar.inbox'), href: NAVIGATION_ITEMS.inbox.href, permission: 'campaigns:view' },
        { icon: Megaphone, label: t('dashboard.sidebar.campaigns'), href: NAVIGATION_ITEMS.campaigns.href, permission: 'campaigns:view', featureId: 'batch_calls' },
        { icon: Mail, label: t('dashboard.sidebar.email'), href: NAVIGATION_ITEMS.email.href, permission: 'campaigns:view' },
        ...((whatsappLiveHandoffEnabled || chatLiveHandoffEnabled)
          ? [{ icon: MessageSquare, label: t('dashboard.sidebar.conversations'), href: NAVIGATION_ITEMS.conversations.href, permission: 'campaigns:view' }]
          : []),
        ...(hasMarketplaceQaAccess ? [{ icon: Package, label: locale === 'tr' ? NAVIGATION_ITEMS.marketplaceQa.labelTr : NAVIGATION_ITEMS.marketplaceQa.labelEn, href: NAVIGATION_ITEMS.marketplaceQa.href, permission: 'campaigns:view' }] : []),
        ...(hasComplaintAccess ? [{ icon: AlertTriangle, label: locale === 'tr' ? NAVIGATION_ITEMS.complaints.labelTr : NAVIGATION_ITEMS.complaints.labelEn, href: NAVIGATION_ITEMS.complaints.href, permission: 'campaigns:view' }] : []),
      ],
    },
    {
      label: t('dashboard.sidebar.monitoring'),
      items: [
        { icon: BarChart3, label: t('dashboard.analytics'), href: NAVIGATION_ITEMS.analytics.href, permission: 'analytics:view' },
        { icon: PhoneCall, label: t('dashboard.sidebar.callbacks'), href: NAVIGATION_ITEMS.callbacks.href, permission: 'campaigns:view' },
        { icon: Phone, label: t('dashboard.sidebar.callHistory'), href: NAVIGATION_ITEMS.callHistory.href, permission: 'analytics:view' },
      ],
    },
    {
      label: t('dashboard.sidebar.management'),
      items: [
        { icon: Puzzle, label: t('dashboard.sidebar.integrations'), href: NAVIGATION_ITEMS.integrations.href, permission: 'integrations:view' },
        { icon: Users, label: t('dashboard.sidebar.team'), href: NAVIGATION_ITEMS.team.href, permission: 'team:view' },
        { icon: Phone, label: t('dashboard.sidebar.phoneNumbers'), href: NAVIGATION_ITEMS.phoneNumbers.href, permission: 'settings:view' },
        { icon: CreditCard, label: t('dashboard.subscription'), href: NAVIGATION_ITEMS.subscription.href, permission: 'billing:view' },
        { icon: Settings, label: t('dashboard.sidebar.account'), href: NAVIGATION_ITEMS.account.href, permission: 'settings:view' },
      ],
    },
    ...(adminAccess.enabled ? [{
      label: t('dashboard.sidebar.adminSection'),
      items: [
        { icon: Shield, label: t('dashboard.sidebar.adminPanel'), href: buildAdminHref() },
        { icon: AlertTriangle, label: t('dashboard.sidebar.redAlert'), href: buildAdminHref('/red-alert') },
        { icon: Users, label: t('dashboard.sidebar.adminUsers'), href: buildAdminHref('/users') },
        { icon: Building2, label: t('dashboard.sidebar.adminEnterprise'), href: buildAdminHref('/enterprise') },
        { icon: CreditCard, label: t('dashboard.sidebar.adminSubscriptions'), href: buildAdminHref('/subscriptions') },
        { icon: History, label: t('dashboard.sidebar.adminAuditLog'), href: buildAdminHref('/audit-log') },
      ],
    }] : []),
  ];

  const handleLockedFeatureClick = (featureId) => {
    setSelectedFeatureId(featureId);
    setUpgradeModalOpen(true);
  };

  const getItemVisibility = (item) => {
    if (!item.featureId) return VISIBILITY.VISIBLE;
    return getFeatureVisibility(item.featureId, userPlan, userCountry);
  };

  const toggleSection = (label) => {
    setCollapsedSections((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  };

  const handleLogout = async () => {
    try {
      await apiClient.auth.logout();
    } catch (_error) {
      // Ignore network issues during logout.
    } finally {
      window.location.href = '/login';
    }
  };

  // Get plan display name from centralized config
  const getPlanDisplay = () => getPlanDisplayName(userPlan, locale);

  function buildAdminHref(path = '') {
    const target = `/dashboard/admin${path}`;
    if (adminAccess.mfaVerified) {
      return target;
    }

    return `/dashboard/admin-auth?returnTo=${encodeURIComponent(target)}`;
  }

  const SidebarContent = () => (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-gray-50 dark:bg-[linear-gradient(180deg,rgba(3,10,32,0.98),rgba(4,10,28,0.94))]"
      style={isDarkTheme ? getDashboardFlowSurfaceStyle(true, 'sidebar') : undefined}
    >
      {isDarkTheme ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute -left-12 top-16 h-36 w-36 rounded-full blur-3xl"
            style={{ background: 'rgba(0,196,230,0.16)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-20 right-0 h-40 w-40 rounded-full blur-3xl"
            style={{ background: 'rgba(0,111,235,0.14)' }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_18%,transparent_82%,rgba(255,255,255,0.03))]" />
        </>
      ) : null}

      {/* Logo */}
      <div className="relative z-10 h-16 flex items-center px-4 border-b border-gray-200 dark:border-white/[0.08]">
        <Link href="/dashboard/assistant" className="flex items-center">
          <TelyxLogoCompact darkMode={mounted && resolvedTheme === 'dark'} />
        </Link>
      </div>

      {/* Navigation */}
      <nav
        data-sidebar-nav
        ref={navRef}
        onScroll={(event) => {
          sidebarScrollRef.current = event.currentTarget.scrollTop;
          sessionStorage.setItem('sidebar-scroll', String(event.currentTarget.scrollTop));
        }}
        className="relative z-10 flex-1 min-h-0 overflow-y-auto py-3 px-3"
      >
        {NAVIGATION.map((section) => {
          const sectionLabel = section.label;
          const isCollapsed = collapsedSections.includes(sectionLabel);

          // Filter visible items
          const visibleItems = section.items.filter((item) => {
            if (item.permission && !can(item.permission)) return false;
            const visibility = getItemVisibility(item);
            return visibility !== VISIBILITY.HIDDEN;
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label} className="mb-1.5">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionLabel)}
                className="flex items-center justify-between w-full px-3 py-1 text-[10px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-[0.18em] hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                <span>{sectionLabel}</span>
                {isCollapsed ? (
                  <ChevronRight className="h-2.5 w-2.5" />
                ) : (
                  <ChevronDown className="h-2.5 w-2.5" />
                )}
              </button>

              {/* Section items */}
              {!isCollapsed && (
                <div className="mt-1 space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    const visibility = getItemVisibility(item);
                    const isLocked = visibility === VISIBILITY.LOCKED;

                    if (isLocked) {
                      return (
                        <button
                          key={item.href}
                          onClick={() => {
                            setIsMobileOpen(false);
                            handleLockedFeatureClick(item.featureId);
                          }}
                          className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-[13px] text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            <span>{item.label}</span>
                          </div>
                          <Lock className="h-3 w-3" />
                        </button>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(event) => {
                          event.currentTarget.blur();
                          setIsMobileOpen(false);
                        }}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all border',
                          isActive
                            ? 'bg-white text-primary-600 border-primary-100 shadow-sm dark:text-white dark:border-white/[0.08] dark:shadow-[0_16px_36px_rgba(2,6,23,0.35)]'
                            : 'text-gray-700 border-transparent dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/[0.05] dark:hover:border-white/[0.06]'
                        )}
                        style={isActive && isDarkTheme ? getDashboardFlowSurfaceStyle(true, 'elevated') : undefined}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.href === NAVIGATION_ITEMS.conversations.href && (whatsappPendingCount + chatPendingCount) > 0 && (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {(whatsappPendingCount + chatPendingCount) > 99 ? '99+' : (whatsappPendingCount + chatPendingCount)}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Language Switcher */}
      <div className="relative z-10 px-4 py-2 border-t border-gray-200 dark:border-white/[0.08]">
        <LanguageSwitcher />
      </div>

      {/* User profile */}
      <div className="relative z-10 px-3 py-2 border-t border-gray-200 dark:border-white/[0.08]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-3 w-full rounded-2xl border border-gray-200/80 bg-white/90 px-3 py-3 text-left shadow-sm transition-colors hover:bg-gray-50 dark:border-white/[0.08] dark:bg-transparent dark:hover:bg-white/[0.04]"
              style={isDarkTheme ? getDashboardFlowSurfaceStyle(true, 'elevated') : undefined}
            >
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarFallback className="bg-primary-600 text-white text-sm font-semibold">
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {user?.name || t('dashboard.userFallback')}
                </p>
                <div className="mt-1 flex items-center">
                  <span className="inline-flex max-w-full truncate whitespace-nowrap rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-[#00C4E6]/15 dark:text-[#7DD3FC] dark:border dark:border-[#00C4E6]/25">
                    {getPlanDisplay()}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                {mounted && theme === 'dark' ? (
                  <Moon className="h-4 w-4 mr-2" />
                ) : mounted && theme === 'light' ? (
                  <Sun className="h-4 w-4 mr-2" />
                ) : (
                  <Monitor className="h-4 w-4 mr-2" />
                )}
                {t('dashboard.theme')}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer">
                    <Sun className="h-4 w-4 mr-2" />
                    {t('dashboard.themeLight')}
                    {mounted && theme === 'light' && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer">
                    <Moon className="h-4 w-4 mr-2" />
                    {t('dashboard.themeDark')}
                    {mounted && theme === 'dark' && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer">
                    <Monitor className="h-4 w-4 mr-2" />
                    {t('dashboard.themeSystem')}
                    {mounted && theme === 'system' && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-error-600 dark:text-error-400">
              <LogOut className="h-4 w-4 mr-2" />
              {t('dashboard.logOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-[#071224] rounded-xl shadow-md border border-gray-200 dark:border-white/[0.08]"
      >
        {isMobileOpen ? (
          <X className="h-5 w-5 text-gray-700 dark:text-slate-200" />
        ) : (
          <Menu className="h-5 w-5 text-gray-700 dark:text-slate-200" />
        )}
      </button>

      {/* Mobile sidebar */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        >
          <div
            className="w-60 h-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {isReady ? <SidebarContent /> : <SidebarSkeleton />}
          </div>
        </div>
      )}

      {/* Desktop sidebar - 240px width as per spec */}
      <div className="hidden lg:block w-60 border-r border-gray-200 dark:border-white/[0.08] fixed left-0 top-0 bottom-0 overflow-hidden">
        {isReady ? <SidebarContent /> : <SidebarSkeleton />}
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        featureId={selectedFeatureId}
      />
    </>
  );
}
