// ============================================================================
// DASHBOARD SIDEBAR COMPONENT
// ============================================================================
// FILE: frontend/components/DashboardSidebar.jsx
//
// Collapsible sidebar navigation for dashboard
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  Mic,
  Phone,
  TrendingUp,
  Settings,
  CreditCard,
  Book,
  Menu,
  X,
  Lock,
  LogOut,
  Shield,
  Users,
  Bot,
  PhoneForwarded,
  FileText,
  Building2,
} from 'lucide-react';
import { TelyxLogoCompact } from '@/components/TelyxLogo';
import { cn } from '@/lib/utils';
import { PLAN_HIERARCHY, hasPlanAccess } from '@/lib/planConfig';
import { apiClient } from '@/lib/api';

const NAVIGATION_ITEMS = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    requiresPlan: null
  },
  {
    title: 'Assistant',
    href: '/dashboard/assistant',
    icon: Mic,
    requiresPlan: null
  },
  {
    title: 'Call Logs',
    href: '/dashboard/analytics',
    icon: Phone,
    requiresPlan: 'STARTER'
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: TrendingUp,
    requiresPlan: 'STARTER',
    badge: 'PRO',
    badgeCondition: (plan) => plan === 'PRO' || plan === 'ENTERPRISE'
  },
  {
    title: 'Integrations',
    href: '/dashboard/integrations',
    icon: Book,
    requiresPlan: 'STARTER'
  },
  {
    title: 'Billing',
    href: '/dashboard/settings?tab=billing',
    icon: CreditCard,
    requiresPlan: null
  },
  {
    title: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    requiresPlan: null
  }
];

const ADMIN_NAVIGATION_ITEMS = [
  {
    title: 'Admin Panel',
    href: '/dashboard/admin',
    icon: Shield,
  },
  {
    title: 'Kullanıcılar',
    href: '/dashboard/admin/users',
    icon: Users,
  },
  {
    title: 'Asistanlar',
    href: '/dashboard/admin/assistants',
    icon: Bot,
  },
  {
    title: 'Aramalar',
    href: '/dashboard/admin/calls',
    icon: Phone,
  },
  {
    title: 'Callbacks',
    href: '/dashboard/admin/callbacks',
    icon: PhoneForwarded,
  },
  {
    title: 'Abonelikler',
    href: '/dashboard/admin/subscriptions',
    icon: CreditCard,
  },
  {
    title: 'Kurumsal',
    href: '/dashboard/admin/enterprise',
    icon: Building2,
  },
  {
    title: 'Audit Log',
    href: '/dashboard/admin/audit-log',
    icon: FileText,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchSubscription();
    fetchUserInfo();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const res = await apiClient.auth.me();
      setIsAdmin(Boolean(res.data?.isAdmin));
    } catch (error) {
      console.error('User info fetch error:', error);
    }
  };

  const fetchSubscription = async () => {
    try {
      const res = await apiClient.subscription.getCurrent();
      setSubscription(res.data);
      setLoading(false);
    } catch (error) {
      console.error('Subscription fetch error:', error);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.auth.logout();
    } catch (_error) {
      // Ignore and continue redirect.
    }
    router.push('/login');
  };

  const canAccessRoute = (item) => {
    if (!item.requiresPlan) return true;
    if (!subscription) return false;

    // Use centralized plan hierarchy
    const userPlanLevel = PLAN_HIERARCHY[subscription.plan] || 0;
    const requiredLevel = PLAN_HIERARCHY[item.requiresPlan] || 0;

    return userPlanLevel >= requiredLevel;
  };

  const shouldShowBadge = (item) => {
    if (!item.badge) return false;
    if (item.badgeCondition) {
      return !item.badgeCondition(subscription?.plan);
    }
    return true;
  };

  const plan = subscription?.plan || 'FREE';

  return (
    <>
      {/* Mobile Toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="sidebar-toggle"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-700 transition-transform duration-300 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="dashboard-sidebar"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-gray-200 dark:border-neutral-700">
            <TelyxLogoCompact darkMode={mounted && resolvedTheme === 'dark'} />
            {!loading && (
              <Badge
                variant={plan === 'FREE' ? 'secondary' : 'default'}
                className="mt-2"
              >
                {plan}
              </Badge>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {NAVIGATION_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || 
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const canAccess = canAccessRoute(item);
              const showBadge = shouldShowBadge(item);

              return (
                <Button
                  key={item.href}
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={cn(
                    "w-full justify-start",
                    isActive && "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-blue-200 hover:bg-primary-100 dark:hover:bg-primary-900/45",
                    !canAccess && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => {
                    if (canAccess) {
                      router.push(item.href);
                      setIsOpen(false);
                    }
                  }}
                  disabled={!canAccess}
                  data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  <span className="flex-1 text-left">{item.title}</span>
                  {!canAccess && <Lock className="w-4 h-4 text-gray-400 dark:text-gray-600" />}
                  {showBadge && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              );
            })}

            {/* Admin Navigation */}
            {isAdmin && (
              <>
                <div className="my-4 border-t border-gray-200 dark:border-neutral-700" />
                <div className="px-2 mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</span>
                </div>
                {ADMIN_NAVIGATION_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href ||
                    (item.href !== '/dashboard/admin' && pathname.startsWith(item.href));

                  return (
                    <Button
                      key={item.href}
                      variant={isActive ? 'secondary' : 'ghost'}
                      className={cn(
                        "w-full justify-start",
                        isActive && "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
                      )}
                      onClick={() => {
                        router.push(item.href);
                        setIsOpen(false);
                      }}
                      data-testid={`admin-nav-${item.title.toLowerCase().replace(' ', '-')}`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      <span className="flex-1 text-left">{item.title}</span>
                    </Button>
                  );
                })}
              </>
            )}
          </nav>

          {/* Bottom Section */}
          <div className="p-4 border-t border-gray-200 dark:border-neutral-700 space-y-2">
            {/* Upgrade CTA for FREE users */}
            {plan === 'FREE' && (
              <div className="p-3 bg-gradient-to-r from-primary-50 dark:from-primary-900/30 to-info-50 dark:to-info-900/20 rounded-lg mb-2">
                <p className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">Upgrade to unlock all features</p>
                <Button 
                  size="sm" 
                  className="w-full bg-[#051752] hover:bg-[#000ACF]"
                  onClick={() => {
                    router.push('/pricing');
                    setIsOpen(false);
                  }}
                  data-testid="upgrade-cta"
                >
                  Upgrade Now
                </Button>
              </div>
            )}

            {/* Help & Docs */}
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => window.open('https://docs.telyx.ai', '_blank')}
            >
              <Book className="w-5 h-5 mr-3" />
              Help & Docs
            </Button>

            {/* Logout */}
            <Button
              variant="ghost"
              className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Spacer (for desktop) */}
      <div className="hidden lg:block w-64" />
    </>
  );
}

export default DashboardSidebar;
