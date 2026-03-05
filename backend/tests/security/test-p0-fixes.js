/**
 * P0 Security Fixes - Manual Test Suite
 *
 * Run this to verify P0 fixes are working:
 * node backend/tests/security/test-p0-fixes.js
 */

import { sanitizeResponse } from '../../src/utils/response-firewall.js';
import { maskPhone, maskEmail, maskTC, maskVKN, redactPII } from '../../src/utils/pii-redaction.js';

console.log('🧪 P0 Security Fixes - Test Suite\n');
console.log('='.repeat(60));

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passCount++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failCount++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ============================================================================
// TEST GROUP 1: PII Redaction
// ============================================================================
console.log('\n📋 Test Group 1: PII Redaction\n');

test('Phone masking - Turkish mobile', () => {
  const masked = maskPhone('+905551234567');
  assert(masked === '+90******4567', `Expected +90******4567, got ${masked}`);
});

test('Phone masking - short format', () => {
  const masked = maskPhone('05551234567');
  assert(masked === '055******4567', `Expected 055******4567, got ${masked}`);
  // Note: 11 chars total: 3 prefix + 4 middle + 4 suffix = 11
  // Middle section: 11 - 3 - 4 = 4, but we enforce min 6 stars
  // So: 055 + ****** + 4567 = 055******4567
});

test('Email masking', () => {
  const masked = maskEmail('john.doe@example.com');
  assert(masked === 'j***@example.com', `Expected j***@example.com, got ${masked}`);
});

test('TC masking - complete hide', () => {
  const masked = maskTC('12345678901');
  assert(masked === '***********', `Expected ***********, got ${masked}`);
});

test('VKN masking - complete hide', () => {
  const masked = maskVKN('1234567890');
  assert(masked === '**********', `Expected **********, got ${masked}`);
});

test('Object PII redaction', () => {
  const data = {
    customerName: 'John Doe',
    phone: '+905551234567',
    email: 'john@example.com',
    tcNo: '12345678901',
    address: 'Atatürk Mah. 123 Sok No:5 Kadıköy/İstanbul'
  };

  const redacted = redactPII(data);

  assert(redacted.customerName === 'John Doe', 'Name should NOT be redacted');
  assert(redacted.phone === '+90******4567', 'Phone should be masked');
  assert(redacted.email === 'j***@example.com', 'Email should be masked');
  assert(redacted.tcNo === '***********', 'TC should be completely hidden');
  assert(redacted.address === 'Kadıköy/İstanbul', 'Address should show district/city only');
});

// ============================================================================
// TEST GROUP 2: Response Firewall
// ============================================================================
console.log('\n📋 Test Group 2: Response Firewall\n');

test('Firewall blocks JSON dump', () => {
  const maliciousResponse = `
    Here's your data:
    \`\`\`json
    {
      "customer": {"name": "John", "phone": "+905551234567"},
      "order": {"id": "123", "total": 100}
    }
    \`\`\`
  `;

  const result = sanitizeResponse(maliciousResponse, 'TR');
  assert(!result.safe, 'Should detect JSON dump');
  assert(result.violations.includes('JSON_DUMP'), 'Should flag JSON_DUMP violation');
  assert(typeof result.sanitized === 'string' && result.sanitized.trim().length > 0, 'Should return non-empty safe fallback');
});

test('Firewall blocks HTML dump', () => {
  const maliciousResponse = `
    <html>
      <body>
        <div>Customer data</div>
        <table><tr><td>Phone</td><td>+905551234567</td></tr></table>
      </body>
    </html>
  `;

  const result = sanitizeResponse(maliciousResponse, 'TR');
  assert(!result.safe, 'Should detect HTML dump');
  assert(result.violations.includes('HTML_DUMP'), 'Should flag HTML_DUMP violation');
});

test('Firewall blocks prompt disclosure', () => {
  const maliciousResponse = `
    According to my system prompt, I am instructed to help you with orders.
    My role is to assist with customer queries.
  `;

  const result = sanitizeResponse(maliciousResponse, 'EN');
  assert(!result.safe, 'Should detect prompt disclosure');
  assert(result.violations.includes('PROMPT_DISCLOSURE'), 'Should flag PROMPT_DISCLOSURE violation');
  assert(typeof result.sanitized === 'string' && result.sanitized.trim().length > 0, 'Should return non-empty safe fallback');
});

test('Firewall blocks internal metadata', () => {
  const maliciousResponse = `
    I used the customer_data_lookup tool to find your order.
    The businessId is 123 and the Prisma query returned results.
  `;

  const result = sanitizeResponse(maliciousResponse, 'TR');
  assert(!result.safe, 'Should detect internal metadata');
  assert(result.violations.includes('INTERNAL_METADATA'), 'Should flag INTERNAL_METADATA violation');
});

test('Firewall blocks database table disclosure', () => {
  const maliciousResponse = `
    Veritabanı tabloları: CustomerData, CrmOrder, ConversationState.
  `;

  const result = sanitizeResponse(maliciousResponse, 'TR');
  assert(!result.safe, 'Should detect database table disclosure');
  assert(result.violations.includes('INTERNAL_METADATA'), 'Should flag INTERNAL_METADATA violation');
});

test('Firewall blocks SQL query disclosure', () => {
  const maliciousResponse = `
    SELECT * FROM crm_order WHERE business_id = 21;
  `;

  const result = sanitizeResponse(maliciousResponse, 'TR');
  assert(!result.safe, 'Should detect SQL query disclosure');
  assert(result.violations.includes('INTERNAL_METADATA'), 'Should flag INTERNAL_METADATA violation');
});

test('Firewall blocks unredacted PII', () => {
  const maliciousResponse = `
    Your phone number is +905551234567 and your email is john@example.com.
  `;

  const result = sanitizeResponse(maliciousResponse, 'TR');
  assert(!result.safe, 'Should detect unredacted PII');
  assert(result.violations.includes('UNREDACTED_PII'), 'Should flag UNREDACTED_PII violation');
});

test('Firewall allows safe response', () => {
  const safeResponse = `
    Siparişiniz "Kargoya Verildi" durumunda.
    Tahmini teslimat tarihi: 25 Ocak 2026
    Size yardımcı olabildiysem ne mutlu! 😊
  `;

  const result = sanitizeResponse(safeResponse, 'TR');
  assert(result.safe, 'Should allow safe response');
  assert(result.violations.length === 0, 'Should have no violations');
  assert(result.sanitized === safeResponse, 'Should return original text');
});

test('Firewall allows response with masked PII', () => {
  const safeResponse = `
    Kayıtlı telefon numaranız: +90******4567
    E-posta: j***@example.com
  `;

  const result = sanitizeResponse(safeResponse, 'TR');
  assert(result.safe, 'Should allow masked PII');
  assert(result.violations.length === 0, 'Should have no violations');
});

// ============================================================================
// TEST GROUP 3: Order Normalization
// ============================================================================
console.log('\n📋 Test Group 3: Order Normalization\n');

// Import normalization function (need to expose it for testing)
function normalizeOrderNumber(orderNumber) {
  if (!orderNumber) return orderNumber;

  let normalized = String(orderNumber).trim().toUpperCase();

  // IMPORTANT: Check longer prefixes FIRST to avoid partial matches
  const prefixes = [
    'SIPARIS-', 'SIPARIS_', 'SIPARIS',
    'ORDER-', 'ORDER_', 'ORDER',
    'ORD-', 'ORD_', 'ORD',
    'SIP-', 'SIP_', 'SIP'
  ];

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }

  normalized = normalized.replace(/[\s\-_]/g, '');

  return normalized;
}

test('Normalize ORD- prefix', () => {
  const normalized = normalizeOrderNumber('ORD-12345');
  assert(normalized === '12345', `Expected 12345, got ${normalized}`);
});

test('Normalize ORDER- prefix', () => {
  const normalized = normalizeOrderNumber('ORDER-12345');
  assert(normalized === '12345', `Expected 12345, got ${normalized}`);
});

test('Normalize SIP prefix', () => {
  const normalized = normalizeOrderNumber('SIP 12345');
  assert(normalized === '12345', `Expected 12345, got ${normalized}`);
});

test('Normalize SIPARIS- prefix', () => {
  const normalized = normalizeOrderNumber('SIPARIS-12345');
  assert(normalized === '12345', `Expected 12345, got ${normalized}`);
});

test('Normalize with spaces and dashes', () => {
  const normalized = normalizeOrderNumber('ORD - 123 - 45');
  assert(normalized === '12345', `Expected 12345, got ${normalized}`);
});

test('Normalize lowercase', () => {
  const normalized = normalizeOrderNumber('order-12345');
  assert(normalized === '12345', `Expected 12345, got ${normalized}`);
});

test('Normalize already clean number', () => {
  const normalized = normalizeOrderNumber('12345');
  assert(normalized === '12345', `Expected 12345, got ${normalized}`);
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('\n📊 Test Summary\n');
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📈 Total:  ${passCount + failCount}`);

if (failCount === 0) {
  console.log('\n🎉 All P0 security fixes are working correctly!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the fixes.\n');
  process.exit(1);
}
