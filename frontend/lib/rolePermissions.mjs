export const ROLE_PERMISSIONS = {
  OWNER: ['*'],
  MANAGER: [
    'dashboard:view',
    'assistants:view', 'assistants:create', 'assistants:edit',
    'calls:view', 'calls:download',
    'campaigns:view', 'campaigns:create', 'campaigns:control',
    'knowledge:view', 'knowledge:edit', 'knowledge:delete',
    'integrations:view',
    'email:view', 'email:send',
    'whatsapp:view',
    'widget:view', 'widget:edit',
    'settings:view', 'settings:edit',
    'team:view', 'team:invite',
    'analytics:view',
    'phone:view',
    'voices:view',
    'collections:view', 'collections:create',
  ],
  STAFF: [
    'dashboard:view',
    'assistants:view',
    'calls:view', 'calls:download',
    'campaigns:view',
    'knowledge:view',
    'email:view', 'email:send',
    'whatsapp:view',
    'widget:view',
    'settings:view',
    'analytics:view',
    'phone:view',
    'voices:view',
    'collections:view',
  ],
};

export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function userHasPermission(role, permission) {
  if (!role || !permission) return false;

  const permissions = getPermissionsForRole(role);
  if (permissions.includes('*')) return true;

  return permissions.includes(permission);
}

export function userHasAnyPermission(role, permissions = []) {
  return permissions.some((permission) => userHasPermission(role, permission));
}

export function userHasAllPermissions(role, permissions = []) {
  return permissions.every((permission) => userHasPermission(role, permission));
}
