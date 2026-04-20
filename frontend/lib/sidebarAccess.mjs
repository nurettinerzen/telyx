import {
  ADMIN_NAVIGATION_ITEMS,
  ADMIN_SIDEBAR_SECTION,
  NAVIGATION_ITEMS,
  SIDEBAR_SECTIONS,
} from './navigationRegistry.mjs';
import { userHasPermission } from './rolePermissions.mjs';

export function createRolePermissionChecker(role) {
  return (permission) => {
    if (!permission) return true;
    return userHasPermission(role, permission);
  };
}

function getFeatureVisibility(item, featureVisibilityResolver) {
  if (!item.featureId) return 'VISIBLE';
  return featureVisibilityResolver?.(item) ?? 'VISIBLE';
}

function isNavigationItemVisible(item, canAccess, featureVisibilityResolver) {
  if (item.permission && !canAccess(item.permission)) return false;
  return getFeatureVisibility(item, featureVisibilityResolver) !== 'HIDDEN';
}

export function resolveSidebarSections({
  canAccess,
  isAdmin = false,
  adminAccessEnabled = false,
  featureVisibilityResolver,
} = {}) {
  const permissionChecker = canAccess || (() => false);

  const sections = SIDEBAR_SECTIONS.map((section) => {
    const itemKeys = section.itemKeys.filter((itemKey) => {
      const item = NAVIGATION_ITEMS[itemKey];
      return item && isNavigationItemVisible(item, permissionChecker, featureVisibilityResolver);
    });

    return {
      ...section,
      itemKeys,
    };
  }).filter((section) => section.itemKeys.length > 0);

  if (isAdmin || adminAccessEnabled) {
    sections.push({
      ...ADMIN_SIDEBAR_SECTION,
      itemKeys: ADMIN_SIDEBAR_SECTION.itemKeys.filter((itemKey) => Boolean(ADMIN_NAVIGATION_ITEMS[itemKey])),
    });
  }

  return sections;
}

export function getVisibleSidebarItemKeys(options = {}) {
  return resolveSidebarSections(options).flatMap((section) => section.itemKeys);
}

export function getVisibleSidebarSectionIds(options = {}) {
  return resolveSidebarSections(options).map((section) => section.id);
}
