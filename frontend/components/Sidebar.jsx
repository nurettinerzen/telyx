/**
 * Sidebar Component
 * Retell AI inspired navigation sidebar
 * Clean, minimal design with grouped sections
 */

import React, { useState, useEffect } from 'react';
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
  Sparkles,
  Shield,
  MessageSquare,
  Mail,
  PhoneCall,
  MessageCircle,
  History,
  AlertTriangle,
  BookMarked,
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

export default function Sidebar({ user, credits, business }) {
  const pathname = usePathname();
  const { t, locale } = useLanguage();
  const { can } = usePermissions();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState([]);

  // Prevent hydration mismatch for theme
  useEffect(() => {
    setMounted(true);
  }, []);

  // Upgrade modal state
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);

  // Get user's current plan and country
  // Only use actual plan from subscription - don't assume STARTER as default
  // This prevents flash where features appear/disappear as plan loads
  const userPlan = user?.subscription?.plan || user?.plan || null;
  const userCountry = business?.country || user?.business?.country || 'TR';

  // Show skeleton until BOTH conditions are met:
  // 1. Component is mounted (hydration complete)
  // 2. Plan is loaded from API (not null/undefined)
  // This prevents the "flash" where sidebar shows wrong state
  const isReady = mounted && userPlan !== null && userPlan !== undefined;

  // Sidebar Skeleton while loading
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

  // Navigation structure - 4 groups using translation keys
  const NAVIGATION = [
    {
      label: t('dashboard.sidebar.product'),
      items: [
        { icon: BookMarked, label: locale === 'tr' ? 'Rehber' : 'Guide', href: NAVIGATION_ITEMS.guides.href, permission: 'assistants:view' },
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
      ],
    },
    {
      label: t('dashboard.sidebar.monitoring'),
      items: [
        { icon: BarChart3, label: t('dashboard.analytics'), href: NAVIGATION_ITEMS.analytics.href, permission: 'analytics:view' },
        { icon: PhoneCall, label: t('dashboard.sidebar.callbacks'), href: NAVIGATION_ITEMS.callbacks.href, permission: 'campaigns:view' },
        { icon: Phone, label: t('dashboard.sidebar.callHistory'), href: NAVIGATION_ITEMS.callHistory.href, permission: 'analytics:view' },
        { icon: MessageCircle, label: t('dashboard.sidebar.chatHistory'), href: NAVIGATION_ITEMS.chatHistory.href, permission: 'analytics:view' },
      ],
    },
    {
      label: t('dashboard.sidebar.management'),
      items: [
        { icon: Puzzle, label: t('dashboard.sidebar.integrations'), href: NAVIGATION_ITEMS.integrations.href, permission: 'integrations:view' },
        { icon: Users, label: t('dashboard.sidebar.team'), href: NAVIGATION_ITEMS.team.href, permission: 'team:view' },
        { icon: CreditCard, label: t('dashboard.subscription'), href: NAVIGATION_ITEMS.subscription.href, permission: 'billing:view' },
        { icon: Settings, label: t('dashboard.sidebar.account'), href: NAVIGATION_ITEMS.account.href, permission: 'settings:view' },
      ],
    },
  ];

  // Admin-only navigation
  const isUserAdmin = user?.isAdmin === true;
  const ADMIN_NAVIGATION = isUserAdmin ? [
    {
      label: 'Admin',
      items: [
        { icon: Shield, label: 'Admin Panel', href: '/dashboard/admin' },
        { icon: AlertTriangle, label: 'Red Alert', href: '/dashboard/admin/red-alert' },
        { icon: Users, label: 'Kullanıcılar', href: '/dashboard/admin/users' },
        { icon: Bot, label: 'Asistanlar', href: '/dashboard/admin/assistants' },
        { icon: Phone, label: 'Aramalar', href: '/dashboard/admin/calls' },
        { icon: CreditCard, label: 'Abonelikler', href: '/dashboard/admin/subscriptions' },
        { icon: Database, label: 'Kurumsal', href: '/dashboard/admin/enterprise' },
        { icon: BarChart3, label: 'Audit Log', href: '/dashboard/admin/audit-log' },
      ],
    },
  ] : [];

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

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-200 dark:border-gray-800">
        <Link href="/dashboard/assistant" className="flex items-center">
          <TelyxLogoCompact darkMode={mounted && resolvedTheme === 'dark'} />
        </Link>
      </div>

      {/* Navigation */}
      <nav
        data-sidebar-nav
        onScroll={(e) => {
          sessionStorage.setItem('sidebar-scroll', e.target.scrollTop);
        }}
        className="flex-1 min-h-0 overflow-y-auto py-2 px-3"
      >
        {[...NAVIGATION, ...ADMIN_NAVIGATION].map((section) => {
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
                className="flex items-center justify-between w-full px-3 py-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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

      {/* Language Switcher */}
      <div className="px-4 py-1.5 border-t border-gray-200 dark:border-gray-800">
        <LanguageSwitcher />
      </div>

      {/* User profile */}
      <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary-600 text-white text-sm">
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {getPlanDisplay()} Plan
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
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
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-900 rounded-md shadow-md border border-gray-200 dark:border-gray-800"
      >
        {isMobileOpen ? (
          <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        ) : (
          <Menu className="h-5 w-5 text-gray-700 dark:text-gray-300" />
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
      <div className="hidden lg:block w-60 border-r border-gray-200 dark:border-gray-800 fixed left-0 top-0 bottom-0 overflow-hidden">
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
