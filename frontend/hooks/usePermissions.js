/**
 * usePermissions Hook
 * Provides role-based permission checking for the frontend
 * Includes subscription status checks (INCOMPLETE = limited access)
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';

// Permission definitions - must match backend
const ROLE_PERMISSIONS = {
  OWNER: ['*'], // Full access - includes all permissions
  MANAGER: [
    'dashboard:view',
    'assistants:view', 'assistants:create', 'assistants:edit',
    // 'assistants:delete' - NOT for MANAGER
    'calls:view', 'calls:download',
    'campaigns:view', 'campaigns:create', 'campaigns:control',
    // 'campaigns:delete' - NOT for MANAGER
    'knowledge:view', 'knowledge:edit', 'knowledge:delete',
    'integrations:view',
    // 'integrations:connect', 'integrations:disconnect' - NOT for MANAGER
    'email:view', 'email:send',
    'whatsapp:view',
    'widget:view', 'widget:edit',
    'settings:view', 'settings:edit',
    'team:view', 'team:invite',
    // 'team:role_change', 'team:remove' - NOT for MANAGER
    // 'billing:view', 'billing:edit' - NOT for MANAGER
    'analytics:view',
    'phone:view',
    'voices:view',
    'collections:view', 'collections:create'
  ],
  STAFF: [
    'dashboard:view',
    'assistants:view',
    // NO create, edit, delete for assistants
    'calls:view', 'calls:download',
    'campaigns:view',
    // NO create, control, delete for campaigns
    'knowledge:view',
    // NO edit, delete for knowledge
    // NO integrations:view - STAFF cannot see integrations
    'email:view', 'email:send',
    'whatsapp:view',
    'widget:view',
    // NO widget:edit
    'settings:view',
    // NO settings:edit
    // NO team:view - STAFF cannot see team
    // NO billing:view
    'analytics:view',
    'phone:view',
    'voices:view',
    'collections:view'
  ]
};

/**
 * Hook for checking user permissions
 * @returns {Object} Permission utilities
 */
export function usePermissions() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiClient.auth.me()
      .then((response) => {
        if (!mounted) return;
        setUser(response.data || null);
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Check if current user has a specific permission
   * @param {string} permission - Permission to check
   * @returns {boolean}
   */
  const can = useCallback((permission) => {
    if (!user || !user.role) return false;

    const permissions = ROLE_PERMISSIONS[user.role];
    if (!permissions) return false;

    // OWNER has wildcard access
    if (permissions.includes('*')) return true;

    return permissions.includes(permission);
  }, [user]);

  /**
   * Check if user has any of the given permissions
   * @param {string[]} permissions - Array of permissions (OR logic)
   * @returns {boolean}
   */
  const canAny = useCallback((permissions) => {
    return permissions.some(p => can(p));
  }, [can]);

  /**
   * Check if user has all of the given permissions
   * @param {string[]} permissions - Array of permissions (AND logic)
   * @returns {boolean}
   */
  const canAll = useCallback((permissions) => {
    return permissions.every(p => can(p));
  }, [can]);

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
    setUser(newUser);
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
    permissions: user?.role ? ROLE_PERMISSIONS[user.role] : []
  };
}

/**
 * Get role display name in Turkish
 * @param {string} role - Role code
 * @returns {string} Display name
 */
export function getRoleDisplayName(role) {
  const names = {
    OWNER: 'İşletme Sahibi',
    MANAGER: 'Yönetici',
    STAFF: 'Personel'
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
