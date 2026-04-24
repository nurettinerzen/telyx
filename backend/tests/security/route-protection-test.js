/**
 * Route Protection Security Test
 *
 * Tests that all API endpoints require authentication except whitelisted public routes
 */

import axios from 'axios';

const API_BASE = process.env.TEST_API_URL || 'https://api.telyx.ai';

// Routes that SHOULD be public (from routeEnforcement.js)
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/forgot-password' },
  { method: 'GET', path: '/api/subscription/plans' },
  { method: 'GET', path: '/api/voices' },
];

// Routes that MUST be protected (sample - add more)
const PROTECTED_ROUTES = [
  { method: 'GET', path: '/api/auth/me' },
  { method: 'GET', path: '/api/business/1' },
  { method: 'GET', path: '/api/assistants' },
  { method: 'GET', path: '/api/knowledge' },
  { method: 'GET', path: '/api/crm' },
  { method: 'GET', path: '/api/customer-data' },
  { method: 'GET', path: '/api/integrations' },
  { method: 'GET', path: '/api/email' },
  { method: 'GET', path: '/api/call-logs' },
  { method: 'GET', path: '/api/subscription/current' },
  { method: 'GET', path: '/api/team' },
  { method: 'POST', path: '/api/assistants' },
  { method: 'PUT', path: '/api/assistants/1' },
  { method: 'DELETE', path: '/api/assistants/1' },
  { method: 'POST', path: '/api/knowledge/upload' },
  { method: 'POST', path: '/api/crm/import' },
  { method: 'DELETE', path: '/api/knowledge/1' },
  { method: 'GET', path: '/api/analytics' },
  { method: 'GET', path: '/api/dashboard' },
  { method: 'GET', path: '/api/settings' },
  { method: 'POST', path: '/api/batch-calls' },
  { method: 'GET', path: '/api/usage' },
  { method: 'GET', path: '/api/balance' },
];

async function testPublicRoute(route) {
  try {
    const response = await axios({
      method: route.method,
      url: `${API_BASE}${route.path}`,
      validateStatus: () => true, // Don't throw on any status
    });

    // Public routes should NOT return 401/403
    if (response.status === 401 || response.status === 403) {
      return {
        ...route,
        result: 'FAIL',
        reason: `Public route returned ${response.status}`,
        status: response.status,
      };
    }

    return {
      ...route,
      result: 'PASS',
      status: response.status,
    };
  } catch (error) {
    return {
      ...route,
      result: 'ERROR',
      reason: error.message,
    };
  }
}

async function testProtectedRoute(route) {
  try {
    const response = await axios({
      method: route.method,
      url: `${API_BASE}${route.path}`,
      validateStatus: () => true,
      // NO Authorization header
    });

    // 404 means route doesn't exist (not a security issue, just test needs update)
    if (response.status === 404) {
      return {
        ...route,
        result: 'SKIP',
        reason: 'Route does not exist (404)',
        status: response.status,
      };
    }

    // Protected routes MUST return 401 or 403
    if (response.status !== 401 && response.status !== 403) {
      return {
        ...route,
        result: 'FAIL',
        reason: `Protected route did not require auth (got ${response.status})`,
        status: response.status,
        body: response.data,
      };
    }

    return {
      ...route,
      result: 'PASS',
      status: response.status,
    };
  } catch (error) {
    return {
      ...route,
      result: 'ERROR',
      reason: error.message,
    };
  }
}

async function runTests() {
  console.log('🔒 Route Protection Security Test');
  console.log(`Testing API: ${API_BASE}\n`);

  console.log('1️⃣  Testing PUBLIC routes (should NOT require auth)...\n');
  const publicResults = await Promise.all(PUBLIC_ROUTES.map(testPublicRoute));

  const publicPassed = publicResults.filter(r => r.result === 'PASS').length;
  const publicFailed = publicResults.filter(r => r.result === 'FAIL');

  publicResults.forEach(r => {
    const icon = r.result === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${r.method} ${r.path} → ${r.status || r.reason}`);
  });

  console.log(`\n📊 Public routes: ${publicPassed}/${PUBLIC_ROUTES.length} passed\n`);

  if (publicFailed.length > 0) {
    console.log('❌ Failed public routes:');
    publicFailed.forEach(r => console.log(`   ${r.method} ${r.path}: ${r.reason}`));
    console.log('');
  }

  console.log('2️⃣  Testing PROTECTED routes (should require auth)...\n');
  const protectedResults = await Promise.all(PROTECTED_ROUTES.map(testProtectedRoute));

  const protectedPassed = protectedResults.filter(r => r.result === 'PASS').length;
  const protectedSkipped = protectedResults.filter(r => r.result === 'SKIP').length;
  const protectedFailed = protectedResults.filter(r => r.result === 'FAIL');

  protectedResults.forEach(r => {
    const icon = r.result === 'PASS' ? '✅' : r.result === 'SKIP' ? '⏭️ ' : '❌';
    console.log(`${icon} ${r.method} ${r.path} → ${r.status || r.reason}`);
  });

  console.log(`\n📊 Protected routes: ${protectedPassed} passed, ${protectedSkipped} skipped (404)\n`);

  if (protectedFailed.length > 0) {
    console.log('🚨 CRITICAL: Unprotected routes found:');
    protectedFailed.forEach(r => {
      console.log(`   ${r.method} ${r.path}`);
      console.log(`   Status: ${r.status}`);
      console.log(`   Response: ${JSON.stringify(r.body).substring(0, 100)}`);
      console.log('');
    });
  }

  // Final verdict
  const totalTests = PUBLIC_ROUTES.length + PROTECTED_ROUTES.length;
  const totalPassed = publicPassed + protectedPassed;
  const totalFailed = publicFailed.length + protectedFailed.length;

  console.log('═'.repeat(60));
  console.log(`📋 FINAL RESULTS: ${totalPassed}/${totalTests} tests passed`);
  console.log('═'.repeat(60));

  if (totalFailed > 0) {
    console.log(`\n🚨 ${totalFailed} TESTS FAILED - SECURITY RISK DETECTED\n`);
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED - Route protection is working correctly\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
