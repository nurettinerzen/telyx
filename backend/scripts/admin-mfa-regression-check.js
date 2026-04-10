#!/usr/bin/env node

import axios from 'axios';

const CONFIG = {
  apiUrl: process.env.API_URL || 'https://api.telyx.ai',
  email: process.env.TEST_ADMIN_EMAIL || process.env.TEST_ACCOUNT_A_EMAIL,
  password: process.env.TEST_ADMIN_PASSWORD || process.env.TEST_ACCOUNT_A_PASSWORD,
};

const ENDPOINTS = [
  { name: 'admin', method: 'get', path: '/api/admin/security/config-integrity' },
  { name: 'admin-email-rag', method: 'get', path: '/api/admin/email-rag/metrics/overview' },
  { name: 'metrics', method: 'get', path: '/api/metrics/dashboard', headers: { 'X-Forwarded-For': '203.0.113.10' } },
  { name: 'whatsapp-send', method: 'post', path: '/api/whatsapp/send', data: {} },
];

function assertConfig() {
  const missing = [];
  if (!CONFIG.email) missing.push('TEST_ADMIN_EMAIL');
  if (!CONFIG.password) missing.push('TEST_ADMIN_PASSWORD');

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

async function loginUser() {
  const response = await axios.post(`${CONFIG.apiUrl}/api/auth/login`, {
    email: CONFIG.email,
    password: CONFIG.password,
  });

  return response.data?.token;
}

async function getCurrentUser(token) {
  const response = await axios.get(`${CONFIG.apiUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return response.data;
}

async function getAdminMfaStatus(token) {
  const response = await axios.get(`${CONFIG.apiUrl}/api/auth/admin-mfa/status`, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });

  return response;
}

async function callProtectedEndpoint(token, endpoint) {
  const response = await axios({
    method: endpoint.method,
    url: `${CONFIG.apiUrl}${endpoint.path}`,
    data: endpoint.data,
    headers: {
      Authorization: `Bearer ${token}`,
      ...endpoint.headers,
    },
    validateStatus: () => true,
  });

  return response;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  assertConfig();

  console.log(`Checking admin MFA regression against ${CONFIG.apiUrl}`);

  const token = await loginUser();
  assert(token, 'Login succeeded but no token was returned');
  console.log('Login successful');

  const me = await getCurrentUser(token);
  assert(me?.isAdmin === true, `TEST_ACCOUNT_A is not an admin on ${CONFIG.apiUrl}`);
  console.log(`Admin account verified (${me.email}, role=${me.adminRole || 'unknown'})`);

  const statusResponse = await getAdminMfaStatus(token);
  assert(statusResponse.status === 200, `Unexpected /api/auth/admin-mfa/status status: ${statusResponse.status}`);
  assert(statusResponse.data?.mfaVerified === false, 'Expected fresh login to have mfaVerified=false');
  assert(Number(statusResponse.data?.maxAgeMinutes) === 15, `Expected maxAgeMinutes=15, got ${statusResponse.data?.maxAgeMinutes}`);
  console.log('Admin MFA status verified (mfaVerified=false, maxAgeMinutes=15)');

  for (const endpoint of ENDPOINTS) {
    const response = await callProtectedEndpoint(token, endpoint);
    assert(
      response.status === 428,
      `${endpoint.path} expected 428, got ${response.status} with body ${JSON.stringify(response.data)}`
    );
    assert(
      response.data?.code === 'ADMIN_MFA_REQUIRED',
      `${endpoint.path} expected ADMIN_MFA_REQUIRED, got ${JSON.stringify(response.data)}`
    );
    console.log(`Protected endpoint enforced MFA: ${endpoint.path}`);
  }

  console.log('Admin MFA regression check passed');
}

main().catch((error) => {
  console.error(`Admin MFA regression check failed: ${error.message}`);
  process.exitCode = 1;
});
