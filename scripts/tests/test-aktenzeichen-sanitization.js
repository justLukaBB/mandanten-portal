/**
 * Test script for Aktenzeichen sanitization
 * Tests the sanitization and validation functions to ensure they properly handle
 * dangerous characters like "/" that could cause path traversal or URL routing issues
 */

const {
  isValidAktenzeichen,
  sanitizeAktenzeichen,
  sanitizeAktenzeichenSafe,
  AKTENZEICHEN_REGEX
} = require('./server/utils/sanitizeAktenzeichen');

console.log('🧪 Testing Aktenzeichen Sanitization\n');
console.log('=' .repeat(60));

// Test cases
const testCases = [
  // Valid cases
  { input: 'CASE123', expectedValid: true, description: 'Valid: Simple alphanumeric' },
  { input: 'CASE_123', expectedValid: true, description: 'Valid: With underscore' },
  { input: 'CASE-123', expectedValid: true, description: 'Valid: With dash' },
  { input: 'TEST_CC_1730000000', expectedValid: true, description: 'Valid: Test case format' },
  { input: 'AZ-2024-001', expectedValid: true, description: 'Valid: Year format' },

  // Invalid cases - Path traversal attempts
  { input: '../../../etc/passwd', expectedValid: false, description: 'Invalid: Path traversal with ../' },
  { input: '..\\..\\..\\windows\\system32', expectedValid: false, description: 'Invalid: Path traversal with ..\\ (Windows)' },

  // Invalid cases - Directory separators
  { input: 'CASE/123', expectedValid: false, description: 'Invalid: Forward slash' },
  { input: 'CASE\\123', expectedValid: false, description: 'Invalid: Backslash' },
  { input: 'CASE/SUB/DIR', expectedValid: false, description: 'Invalid: Multiple slashes' },

  // Invalid cases - Special characters
  { input: 'CASE 123', expectedValid: false, description: 'Invalid: Space' },
  { input: 'CASE@123', expectedValid: false, description: 'Invalid: @ symbol' },
  { input: 'CASE#123', expectedValid: false, description: 'Invalid: # symbol' },
  { input: 'CASE$123', expectedValid: false, description: 'Invalid: $ symbol' },
  { input: 'CASE%123', expectedValid: false, description: 'Invalid: % symbol' },

  // Edge cases
  { input: '', expectedValid: false, description: 'Invalid: Empty string' },
  { input: '  ', expectedValid: false, description: 'Invalid: Only spaces' },
  { input: 'AB', expectedValid: false, description: 'Invalid: Too short (2 chars)' },
  { input: 'A'.repeat(51), expectedValid: false, description: 'Invalid: Too long (51 chars)' },
  { input: '   CASE123   ', expectedValid: true, description: 'Valid: With trimming' },
];

console.log('\n📋 Test 1: Validation (isValidAktenzeichen)');
console.log('-'.repeat(60));

let validationPassed = 0;
let validationFailed = 0;

testCases.forEach(testCase => {
  const result = isValidAktenzeichen(testCase.input);
  const passed = result === testCase.expectedValid;

  if (passed) {
    validationPassed++;
    console.log(`✅ PASS: ${testCase.description}`);
  } else {
    validationFailed++;
    console.log(`❌ FAIL: ${testCase.description}`);
    console.log(`   Input: "${testCase.input}"`);
    console.log(`   Expected: ${testCase.expectedValid}, Got: ${result}`);
  }
});

console.log(`\n📊 Validation Results: ${validationPassed} passed, ${validationFailed} failed\n`);

// Test sanitization
console.log('📋 Test 2: Sanitization (sanitizeAktenzeichen)');
console.log('-'.repeat(60));

const sanitizationTests = [
  { input: 'CASE/123', expected: 'CASE_123', description: 'Replace / with _' },
  { input: 'CASE\\123', expected: 'CASE_123', description: 'Replace \\ with _' },
  { input: '../CASE', expected: 'CASE', description: 'Remove path traversal' },
  { input: 'CASE 123', expected: 'CASE_123', description: 'Replace space with _' },
  { input: '  CASE123  ', expected: 'CASE123', description: 'Trim whitespace' },
  { input: 'CASE@#$123', expected: 'CASE_123', description: 'Replace special chars (multiple consecutive underscores become one)' },
  { input: '___CASE___', expected: 'CASE', description: 'Remove leading/trailing underscores' },
];

let sanitizationPassed = 0;
let sanitizationFailed = 0;

sanitizationTests.forEach(testCase => {
  try {
    const result = sanitizeAktenzeichen(testCase.input);
    const passed = result === testCase.expected;

    if (passed) {
      sanitizationPassed++;
      console.log(`✅ PASS: ${testCase.description}`);
      console.log(`   "${testCase.input}" → "${result}"`);
    } else {
      sanitizationFailed++;
      console.log(`❌ FAIL: ${testCase.description}`);
      console.log(`   Input: "${testCase.input}"`);
      console.log(`   Expected: "${testCase.expected}", Got: "${result}"`);
    }
  } catch (error) {
    sanitizationFailed++;
    console.log(`❌ FAIL: ${testCase.description}`);
    console.log(`   Input: "${testCase.input}"`);
    console.log(`   Error: ${error.message}`);
  }
});

console.log(`\n📊 Sanitization Results: ${sanitizationPassed} passed, ${sanitizationFailed} failed\n`);

// Test safe sanitization (shouldn't throw)
console.log('📋 Test 3: Safe Sanitization (sanitizeAktenzeichenSafe)');
console.log('-'.repeat(60));

const safeSanitizationTests = [
  { input: '', shouldReturnNull: true, description: 'Empty string returns null' },
  { input: 'AB', shouldReturnNull: true, description: 'Too short returns null' },
  { input: 'A'.repeat(51), shouldReturnNull: true, description: 'Too long returns null' },
  { input: 'CASE123', shouldReturnNull: false, description: 'Valid input returns sanitized' },
];

let safeSanitizationPassed = 0;
let safeSanitizationFailed = 0;

safeSanitizationTests.forEach(testCase => {
  const result = sanitizeAktenzeichenSafe(testCase.input);
  const isNull = result === null;
  const passed = isNull === testCase.shouldReturnNull;

  if (passed) {
    safeSanitizationPassed++;
    console.log(`✅ PASS: ${testCase.description}`);
  } else {
    safeSanitizationFailed++;
    console.log(`❌ FAIL: ${testCase.description}`);
    console.log(`   Expected null: ${testCase.shouldReturnNull}, Got: ${result}`);
  }
});

console.log(`\n📊 Safe Sanitization Results: ${safeSanitizationPassed} passed, ${safeSanitizationFailed} failed\n`);

// Summary
console.log('=' .repeat(60));
console.log('📈 OVERALL SUMMARY\n');

const totalTests = testCases.length + sanitizationTests.length + safeSanitizationTests.length;
const totalPassed = validationPassed + sanitizationPassed + safeSanitizationPassed;
const totalFailed = validationFailed + sanitizationFailed + safeSanitizationFailed;

console.log(`Total Tests: ${totalTests}`);
console.log(`✅ Passed: ${totalPassed}`);
console.log(`❌ Failed: ${totalFailed}`);
console.log(`Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

if (totalFailed === 0) {
  console.log('\n🎉 All tests passed! Aktenzeichen sanitization is working correctly.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the implementation.\n');
  process.exit(1);
}
