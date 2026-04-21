import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_NAVIGATION_ITEMS,
  ADMIN_SIDEBAR_SECTION,
  NAVIGATION_ITEMS,
  SIDEBAR_SECTIONS,
  getNavigationItemByKey,
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

test('critical sidebar items keep their intended permission and feature gates', () => {
  assert.equal(NAVIGATION_ITEMS.conversations.permission, 'whatsapp:view');
  assert.equal(NAVIGATION_ITEMS.phoneNumbers.permission, 'phone:view');
  assert.equal(NAVIGATION_ITEMS.campaigns.permission, 'campaigns:view');
  assert.equal(NAVIGATION_ITEMS.campaigns.featureId, 'batch_calls');
});

test('sidebar navigation items always define an icon key', () => {
  for (const [itemKey, item] of Object.entries(NAVIGATION_ITEMS)) {
    assert.ok(item.iconKey, `Missing iconKey for navigation item "${itemKey}"`);
  }

  for (const [itemKey, item] of Object.entries(ADMIN_NAVIGATION_ITEMS)) {
    assert.ok(item.iconKey, `Missing iconKey for admin navigation item "${itemKey}"`);
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

test('staff sidebar smoke test keeps conversations and phone numbers visible', () => {
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

test('admin section appears when admin access is enabled', () => {
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

test('extra sidebar items can be appended for connected integrations', () => {
  const canAccess = createRolePermissionChecker('OWNER');

  assert.deepEqual(
    getVisibleSidebarItemKeys({
      canAccess,
      featureVisibilityResolver: visibleFeatures,
      extraSectionItems: {
        operations: ['marketplaceQa', 'complaints'],
      },
    }),
    [
      'guides',
      'assistants',
      'knowledgeBase',
      'chatWidget',
      'inbox',
      'campaigns',
      'email',
      'conversations',
      'marketplaceQa',
      'complaints',
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
