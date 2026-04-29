function normalizeUsers(users) {
  return Array.isArray(users) ? users.filter(Boolean) : [];
}

export function pickPrimaryBusinessUser(users = []) {
  const candidates = normalizeUsers(users);
  if (candidates.length === 0) return null;

  const owner = candidates.find((user) => user.role === 'OWNER');
  return owner || candidates[0] || null;
}

export function buildAdminBusinessContact(business = null) {
  const users = normalizeUsers(business?.users);
  const primaryUser = pickPrimaryBusinessUser(users);
  const hasOwner = users.some((user) => user.role === 'OWNER');

  return {
    ownerUserId: primaryUser?.id ?? null,
    ownerEmail: primaryUser?.email ?? null,
    ownerName: primaryUser?.name ?? null,
    ownerRole: primaryUser?.role ?? null,
    hasOwner,
    ownerSuspended: Boolean(primaryUser?.suspended),
    businessSuspended: Boolean(business?.suspended),
    accountSuspended: Boolean(business?.suspended || primaryUser?.suspended),
  };
}
