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

/**
 * Hook for checking user permissions
 * @returns {Object} Permission utilities
 */
export function usePermissions() {
  // Try to get user from DashboardContext first (provided by dashboard layout)
  const dashboardCtx = useDashboardContext();
  const contextUser = dashboardCtx?.user || null;

  // Fallback: independent API call only when outside dashboard layout
  const [fetchedUser, setFetchedUser] = useState(null);
  const [fetchLoading, setFetchLoading] = useState(!contextUser);

  useEffect(() => {
    // Skip API call if we have user from context
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

  // Use context user if available, otherwise use fetched user
  const user = contextUser || fetchedUser;
  const loading = contextUser ? false : fetchLoading;

  /**
   * Check if current user has a specific permission
   * @param {string} permission - Permission to check
   * @returns {boolean}
   */
  const can = useCallback((permission) => {
    if (!user || !user.role) return false;
    return userHasPermission(user.role, permission);
  }, [user]);

  /**
   * Check if user has any of the given permissions
   * @param {string[]} permissions - Array of permissions (OR logic)
   * @returns {boolean}
   */
  const canAny = useCallback((permissions) => {
    return userHasAnyPermission(user?.role, permissions);
  }, [user?.role]);

  /**
   * Check if user has all of the given permissions
   * @param {string[]} permissions - Array of permissions (AND logic)
   * @returns {boolean}
   */
  const canAll = useCallback((permissions) => {
    return userHasAllPermissions(user?.role, permissions);
  }, [user?.role]);

  const isOwner = user?.role === 'OWNER';
  const isManager = user?.role === 'MANAGER';
  const isStaff = user?.role === 'STAFF';
  const role = user?.role;

  // Subscription status check
  const subscriptionStatus = user?.subscription?.status || user?.business?.subscription?.status;
  const isSubscriptionActive = ['ACTIVE', 'TRIAL', 'TRIALING'].includes(subscriptionStatus);
  const isSubscriptionIncomplete = subscriptionStatus === 'INCOMPLETE';

  /**
   * Check if subscription allows feature access
   * INCOMPLETE status means payment pending - limited access
   */
  const hasActiveSubscription = useCallback(() => {
    // Allow if no subscription data (backwards compatibility)
    if (!user?.subscription && !user?.business?.subscription) return true;
    // ACTIVE and TRIALING are allowed
    return ['ACTIVE', 'TRIAL', 'TRIALING'].includes(subscriptionStatus);
  }, [user, subscriptionStatus]);

  /**
   * Update user in state (call this after login/profile update)
   * @param {Object} newUser - Updated user object
   */
  const updateUser = useCallback((newUser) => {
    setFetchedUser(newUser);
  }, []);

  return {
    // Permission checks
    can,
    canAny,
    canAll,

    // Role checks
    isOwner,
    isManager,
    isStaff,
    role,

    // Subscription status checks
    isSubscriptionActive,
    isSubscriptionIncomplete,
    hasActiveSubscription,
    subscriptionStatus,

    // User state
    user,
    loading,
    updateUser,

    // Permission list (for debugging)
    permissions: user?.role ? getPermissionsForRole(user.role) : []
  };
}

/**
 * Get role display name in Turkish
 * @param {string} role - Role code
 * @returns {string} Display name
 */
export function getRoleDisplayName(role, locale = 'tr') {
  const isTr = locale === 'tr';
  const names = {
    OWNER: isTr ? 'İşletme Sahibi' : 'Business Owner',
    MANAGER: isTr ? 'Yönetici' : 'Manager',
    STAFF: isTr ? 'Personel' : 'Staff'
  };
  return names[role] || role;
}

/**
 * Get role badge color
 * @param {string} role - Role code
 * @returns {string} Tailwind color class
 */
export function getRoleBadgeColor(role) {
  const colors = {
    OWNER: 'bg-purple-100 text-purple-800',
    MANAGER: 'bg-blue-100 text-blue-800',
    STAFF: 'bg-gray-100 text-gray-800'
  };
  return colors[role] || 'bg-gray-100 text-gray-800';
}

export default usePermissions;
