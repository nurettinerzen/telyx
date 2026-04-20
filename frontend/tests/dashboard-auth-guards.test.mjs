import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldBypassEmailVerificationForRoute } from '../lib/dashboardAuthGuards.mjs';

test('bypasses email verification for Stripe return params on subscription page', () => {
  assert.equal(
    shouldBypassEmailVerificationForRoute(
      '/dashboard/subscription',
      '?success=true&session_id=cs_test_123'
    ),
    true
  );
});

test('does not bypass email verification for plain subscription visits', () => {
  assert.equal(
    shouldBypassEmailVerificationForRoute('/dashboard/subscription', ''),
    false
  );
});

test('always bypasses email verification on subscription callback route', () => {
  assert.equal(
    shouldBypassEmailVerificationForRoute('/dashboard/subscription/callback', ''),
    true
  );
});
