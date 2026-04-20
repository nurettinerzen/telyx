import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_NAVIGATION_ITEMS,
  ADMIN_SIDEBAR_SECTION,
  getNavigationItemByKey,
  SIDEBAR_SECTIONS,
} from '../lib/navigationRegistry.mjs';
import {
  createRolePermissionChecker,
  getVisibleSidebarItemKeys,
  getVisibleSidebarSectionIds,
} from '../lib/sidebarAccess.mjs';

const visibleFeatures = () => 'VISIBLE';

test('sidebar config only references registered navigation items', () => {
  for (const section of SIDEBAR_SECTIONS) {
    for (const itemKey of section.itemKeys) {
      assert.ok(
        getNavigationItemByKey(itemKey),
        `Missing navigation item definition for sidebar key "${itemKey}"`
      );
    }
  }

  for (const itemKey of ADMIN_SIDEBAR_SECTION.itemKeys) {
    assert.ok(
      ADMIN_NAVIGATION_ITEMS[itemKey],
      `Missing admin navigation item definition for sidebar key "${itemKey}"`
    );
  }
});

test('owner sidebar smoke test covers all core sections and items', () => {
  const canAccess = createRolePermissionChecker('OWNER');

  assert.deepEqual(
    getVisibleSidebarSectionIds({ canAccess, featureVisibilityResolver: visibleFeatures }),
    ['product', 'operations', 'monitoring', 'management']
  );

  assert.deepEqual(
    getVisibleSidebarItemKeys({ canAccess, featureVisibilityResolver: visibleFeatures }),
    [
      'guides',
      'assistants',
      'knowledgeBase',
      'chatWidget',
      'inbox',
      'campaigns',
      'email',
      'conversations',
      'analytics',
      'callbacks',
      'callHistory',
      'chatHistory',
      'integrations',
      'team',
      'phoneNumbers',
      'subscription',
      'account',
    ]
  );
});

test('manager sidebar smoke test keeps non-billing operational items', () => {
  const canAccess = createRolePermissionChecker('MANAGER');

  assert.deepEqual(
    getVisibleSidebarItemKeys({ canAccess, featureVisibilityResolver: visibleFeatures }),
    [
      'guides',
      'assistants',
      'knowledgeBase',
      'chatWidget',
      'inbox',
      'campaigns',
      'email',
      'conversations',
      'analytics',
      'callbacks',
      'callHistory',
      'chatHistory',
      'integrations',
      'team',
      'phoneNumbers',
      'account',
    ]
  );
});

test('staff sidebar smoke test hides management areas without permission', () => {
  const canAccess = createRolePermissionChecker('STAFF');

  assert.deepEqual(
    getVisibleSidebarItemKeys({ canAccess, featureVisibilityResolver: visibleFeatures }),
    [
      'guides',
      'assistants',
      'knowledgeBase',
      'chatWidget',
      'inbox',
      'campaigns',
      'email',
      'conversations',
      'analytics',
      'callbacks',
      'callHistory',
      'chatHistory',
      'phoneNumbers',
      'account',
    ]
  );
});

test('admin fallback section appears when admin access is enabled', () => {
  const canAccess = createRolePermissionChecker('OWNER');

  assert.deepEqual(
    getVisibleSidebarSectionIds({
      canAccess,
      featureVisibilityResolver: visibleFeatures,
      adminAccessEnabled: true,
    }),
    ['product', 'operations', 'monitoring', 'management', 'admin']
  );

  assert.deepEqual(
    getVisibleSidebarItemKeys({
      canAccess,
      featureVisibilityResolver: visibleFeatures,
      adminAccessEnabled: true,
    }).slice(-8),
    [
      'adminPanel',
      'redAlert',
      'adminUsers',
      'adminAssistants',
      'adminCalls',
      'adminSubscriptions',
      'adminEnterprise',
      'adminAuditLog',
    ]
  );
});
