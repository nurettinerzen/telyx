/**
 * Sidebar Component
 * Retell AI inspired navigation sidebar
 * Clean, minimal design with grouped sections
 */

import React, { useEffect, useState } from 'react';
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
import {
  ADMIN_NAVIGATION_ITEMS,
  getNavigationItemByKey,
  getNavigationLabel,
} from '@/lib/navigationConfig';
import { resolveSidebarSections } from '@/lib/sidebarAccess.mjs';
import {
  useHepsiburadaStatus,
  useSikayetvarStatus,
  useTrendyolStatus,
} from '@/hooks/useIntegrations';
import {
  getDashboardDropdownItemClass,
  getDashboardOverlaySurfaceClass,
} from '@/components/dashboard/dashboardSurfaceTheme';

const SIDEBAR_ICON_MAP = {
  guides: BookMarked,
  assistants: Bot,
  knowledgeBase: BookOpen,
  chatWidget: MessageSquare,
  inbox: Database,
  campaigns: Megaphone,
  email: Mail,
  conversations: MessageCircle,
  marketplaceQa: Package,
  complaints: AlertTriangle,
  analytics: BarChart3,
  callbacks: PhoneCall,
  callHistory: Phone,
  chatHistory: MessageCircle,
  integrations: Puzzle,
  team: Users,
  phoneNumbers: Phone,
  subscription: CreditCard,
  account: Settings,
  adminPanel: Shield,
  redAlert: AlertTriangle,
  adminUsers: Users,
  adminAssistants: Bot,
  adminCalls: Phone,
  adminSubscriptions: CreditCard,
  adminEnterprise: Database,
  adminAuditLog: History,
};

export default function Sidebar({ user, credits, business }) {
  const pathname = usePathname();
  const { t, locale } = useLanguage();
  const { can } = usePermissions();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState([]);
  const [adminAccess, setAdminAccess] = useState({ enabled: false, mfaVerified: false });

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const isUserAdmin = user?.isAdmin === true || Boolean(user?.adminRole);
  const darkMenu = mounted && resolvedTheme === 'dark';

  const userPlan = user?.subscription?.plan || user?.plan || null;
  const userCountry = business?.country || user?.business?.country || 'TR';
  const isReady = mounted && userPlan !== null && userPlan !== undefined;
  const canViewOperations = can('campaigns:view');
  const { data: trendyolStatus } = useTrendyolStatus({ enabled: canViewOperations });
  const { data: hepsiburadaStatus } = useHepsiburadaStatus({ enabled: canViewOperations });
  const { data: sikayetvarStatus } = useSikayetvarStatus({ enabled: canViewOperations });
  const hasMarketplaceQaAccess = Boolean(trendyolStatus?.connected || hepsiburadaStatus?.connected);
  const hasComplaintAccess = Boolean(sikayetvarStatus?.connected);

  const SidebarSkeleton = () => (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      <div className="h-14 flex items-center px-4 border-b border-gray-200 dark:border-gray-800">
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="mb-6">
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2 animate-pulse" />
            <div className="space-y-1">
              {[1, 2].map((j) => (
                <div key={j} className="h-9 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  const handleLockedFeatureClick = (featureId) => {
    setSelectedFeatureId(featureId);
    setUpgradeModalOpen(true);
  };

  const getItemVisibility = (item) => {
    if (!item.featureId) return VISIBILITY.VISIBLE;
    return getFeatureVisibility(item.featureId, userPlan, userCountry);
  };

  const buildAdminHref = (href) => {
    if (!adminAccess.enabled || adminAccess.mfaVerified) {
      return href;
    }

    return `/dashboard/admin-auth?returnTo=${encodeURIComponent(href)}`;
  };

  const navigationSections = resolveSidebarSections({
    canAccess: can,
    isAdmin: isUserAdmin,
    adminAccessEnabled: adminAccess.enabled,
    featureVisibilityResolver: getItemVisibility,
    extraSectionItems: {
      operations: [
        ...(hasMarketplaceQaAccess ? ['marketplaceQa'] : []),
        ...(hasComplaintAccess ? ['complaints'] : []),
      ],
    },
  }).map((section) => ({
    ...section,
    label: t(section.labelKey),
    items: section.itemKeys.map((itemKey) => {
      const item = getNavigationItemByKey(itemKey);
      if (!item) return null;

      const isAdminItem = Boolean(ADMIN_NAVIGATION_ITEMS[itemKey]);

      return {
        key: itemKey,
        icon: SIDEBAR_ICON_MAP[item.iconKey] || Bot,
        label: getNavigationLabel(itemKey, locale),
        href: isAdminItem ? buildAdminHref(item.href) : item.href,
        featureId: item.featureId,
      };
    }).filter(Boolean),
  }));

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

  const getPlanDisplay = () => getPlanDisplayName(userPlan, locale);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      <div className="h-14 flex items-center px-4 border-b border-gray-200 dark:border-gray-800">
        <Link href="/dashboard/assistant" className="flex items-center">
          <TelyxLogoCompact darkMode={mounted && resolvedTheme === 'dark'} />
        </Link>
      </div>

      <nav
        data-sidebar-nav
        onScroll={(e) => {
          sessionStorage.setItem('sidebar-scroll', e.target.scrollTop);
        }}
        className="flex-1 min-h-0 overflow-y-auto py-2 px-3"
      >
        {navigationSections.map((section) => {
          const sectionLabel = section.label;
          const isCollapsed = collapsedSections.includes(sectionLabel);

          return (
            <div key={section.label} className="mb-1.5">
              <button
                onClick={() => toggleSection(sectionLabel)}
                className="flex items-center justify-between w-full px-3 py-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-[0.16em] hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <span>{sectionLabel}</span>
                {isCollapsed ? (
                  <ChevronRight className="h-2.5 w-2.5" />
                ) : (
                  <ChevronDown className="h-2.5 w-2.5" />
                )}
              </button>

              {!isCollapsed && (
                <div className="mt-1 space-y-0.5">
                  {section.items.map((item) => {
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
                          className="flex items-center justify-between w-full px-3 py-1 rounded-md text-[13px] text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                        onClick={() => setIsMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1 rounded-md text-[13px] font-medium transition-all',
                          isActive
                            ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-1.5 border-t border-gray-200 dark:border-gray-800">
        <LanguageSwitcher />
      </div>

      <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
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
                  <span className="inline-flex max-w-full truncate whitespace-nowrap rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                    {getPlanDisplay()}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={getDashboardOverlaySurfaceClass(darkMenu, 'w-56 p-1')}
          >
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className={cn('cursor-pointer', getDashboardDropdownItemClass(darkMenu))}
              >
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
                <DropdownMenuSubContent className={getDashboardOverlaySurfaceClass(darkMenu, 'p-1')}>
                  <DropdownMenuItem
                    onClick={() => setTheme('light')}
                    className={cn('cursor-pointer', getDashboardDropdownItemClass(darkMenu))}
                  >
                    <Sun className="h-4 w-4 mr-2" />
                    {t('dashboard.themeLight')}
                    {mounted && theme === 'light' && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTheme('dark')}
                    className={cn('cursor-pointer', getDashboardDropdownItemClass(darkMenu))}
                  >
                    <Moon className="h-4 w-4 mr-2" />
                    {t('dashboard.themeDark')}
                    {mounted && theme === 'dark' && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTheme('system')}
                    className={cn('cursor-pointer', getDashboardDropdownItemClass(darkMenu))}
                  >
                    <Monitor className="h-4 w-4 mr-2" />
                    {t('dashboard.themeSystem')}
                    {mounted && theme === 'system' && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className={cn(
                'cursor-pointer text-error-600 dark:text-error-400',
                getDashboardDropdownItemClass(darkMenu)
              )}
            >
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
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-900 rounded-md shadow-md border border-gray-200 dark:border-gray-800"
      >
        {isMobileOpen ? (
          <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        ) : (
          <Menu className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        )}
      </button>

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

      <div className="hidden lg:block w-60 border-r border-gray-200 dark:border-gray-800 fixed left-0 top-0 bottom-0 overflow-hidden">
        {isReady ? <SidebarContent /> : <SidebarSkeleton />}
      </div>

      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        featureId={selectedFeatureId}
      />
    </>
  );
}
