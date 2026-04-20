/**
 * usePermissions Hook
 * Provides role-based permission checking for the frontend
 * Includes subscription status checks (INCOMPLETE = limited access)
 *
 * Uses DashboardContext when available (inside dashboard layout) to avoid
 * duplicate API calls and prevent "Access Denied" flash during auth loading.
 * Falls back to independent API call when used outside dashboard.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { useDashboardContext } from '@/contexts/DashboardContext';
import {
  getPermissionsForRole,
  userHasAllPermissions,
  userHasAnyPermission,
  userHasPermission,
} from '@/lib/rolePermissions.mjs';

export function usePermissions() {
  const dashboardCtx = useDashboardContext();
  const contextUser = dashboardCtx?.user || null;

  const [fetchedUser, setFetchedUser] = useState(null);
  const [fetchLoading, setFetchLoading] = useState(!contextUser);

  useEffect(() => {
    if (contextUser) {
      setFetchLoading(false);
      return;
    }

    let mounted = true;
    apiClient.auth.me()
      .then((response) => {
        if (!mounted) return;
        setFetchedUser(response.data || null);
      })
      .catch(() => {
        if (!mounted) return;
        setFetchedUser(null);
      })
      .finally(() => {
        if (mounted) setFetchLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [contextUser]);

  const user = contextUser || fetchedUser;
  const loading = contextUser ? false : fetchLoading;

  const can = useCallback((permission) => {
    if (!user || !user.role) return false;
    return userHasPermission(user.role, permission);
  }, [user]);

  const canAny = useCallback((permissions) => {
    return userHasAnyPermission(user?.role, permissions);
  }, [user?.role]);

  const canAll = useCallback((permissions) => {
    return userHasAllPermissions(user?.role, permissions);
  }, [user?.role]);

  const isOwner = user?.role === 'OWNER';
  const isManager = user?.role === 'MANAGER';
  const isStaff = user?.role === 'STAFF';
  const role = user?.role;

  const subscriptionStatus = user?.subscription?.status || user?.business?.subscription?.status;
  const isSubscriptionActive = ['ACTIVE', 'TRIAL', 'TRIALING'].includes(subscriptionStatus);
  const isSubscriptionIncomplete = subscriptionStatus === 'INCOMPLETE';

  const hasActiveSubscription = useCallback(() => {
    if (!user?.subscription && !user?.business?.subscription) return true;
    return ['ACTIVE', 'TRIAL', 'TRIALING'].includes(subscriptionStatus);
  }, [user, subscriptionStatus]);

  const updateUser = useCallback((newUser) => {
    setFetchedUser(newUser);
  }, []);

  return {
    can,
    canAny,
    canAll,
    isOwner,
    isManager,
    isStaff,
    role,
    isSubscriptionActive,
    isSubscriptionIncomplete,
    hasActiveSubscription,
    subscriptionStatus,
    user,
    loading,
    updateUser,
    permissions: user?.role ? getPermissionsForRole(user.role) : []
  };
}

export function getRoleDisplayName(role, locale = 'tr') {
  const isTr = locale === 'tr';
  const names = {
    OWNER: isTr ? 'İşletme Sahibi' : 'Business Owner',
    MANAGER: isTr ? 'Yönetici' : 'Manager',
    STAFF: isTr ? 'Personel' : 'Staff'
  };
  return names[role] || role;
}

export function getRoleBadgeColor(role) {
  const colors = {
    OWNER: 'bg-purple-100 text-purple-800',
    MANAGER: 'bg-blue-100 text-blue-800',
    STAFF: 'bg-gray-100 text-gray-800'
  };
  return colors[role] || 'bg-gray-100 text-gray-800';
}

export default usePermissions;
