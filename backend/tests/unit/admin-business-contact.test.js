import { describe, expect, it } from '@jest/globals';
import { buildAdminBusinessContact, pickPrimaryBusinessUser } from '../../src/utils/adminBusinessContact.js';

describe('admin business contact helpers', () => {
  it('prefers the owner even when listed after staff users', () => {
    const user = pickPrimaryBusinessUser([
      { id: 2, email: 'staff@example.com', role: 'STAFF' },
      { id: 5, email: 'owner@example.com', role: 'OWNER' }
    ]);

    expect(user?.id).toBe(5);
    expect(user?.email).toBe('owner@example.com');
  });

  it('falls back to the first available business user when owner role is missing', () => {
    const contact = buildAdminBusinessContact({
      suspended: false,
      users: [
        { id: 9, email: 'manager@example.com', name: 'Manager', role: 'MANAGER', suspended: false },
        { id: 11, email: 'staff@example.com', name: 'Staff', role: 'STAFF', suspended: false }
      ]
    });

    expect(contact.ownerUserId).toBe(9);
    expect(contact.ownerEmail).toBe('manager@example.com');
    expect(contact.hasOwner).toBe(false);
    expect(contact.accountSuspended).toBe(false);
  });

  it('marks account suspended when the business is suspended', () => {
    const contact = buildAdminBusinessContact({
      suspended: true,
      users: [
        { id: 3, email: 'owner@example.com', name: 'Owner', role: 'OWNER', suspended: false }
      ]
    });

    expect(contact.ownerEmail).toBe('owner@example.com');
    expect(contact.businessSuspended).toBe(true);
    expect(contact.accountSuspended).toBe(true);
  });

  it('marks account suspended when the primary user is suspended', () => {
    const contact = buildAdminBusinessContact({
      suspended: false,
      users: [
        { id: 7, email: 'owner@example.com', name: 'Owner', role: 'OWNER', suspended: true }
      ]
    });

    expect(contact.ownerSuspended).toBe(true);
    expect(contact.accountSuspended).toBe(true);
  });
});
