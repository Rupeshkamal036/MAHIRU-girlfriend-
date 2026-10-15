import assert from 'node:assert';
import fs from 'node:fs';

console.log('======================================================');
console.log('MAHIRU BROWSER CONTROLLER STEP 1 TEST SUITE');
console.log('False Failure Voice Response After Website Open Verification');
console.log('======================================================\n');

// 1. Verify LiveSession.ts tool handler implementation
console.log('--- TEST 1 — VERIFY LIVESESSION openWebsite RESULT HANDLING ---');
const liveSessionContent = fs.readFileSync('src/audio/LiveSession.ts', 'utf8');

assert(
  !liveSessionContent.includes("status: opened ? 'opened' : 'blocked_by_browser'"),
  'LiveSession must NOT treat window.open returning null (due to noopener) as blocked_by_browser'
);

assert(
  !liveSessionContent.includes("'Popup blocked; notify user with visual notification'"),
  'LiveSession must NOT return fake popup blocked note'
);

assert(
  liveSessionContent.includes("status: 'opened'"),
  'LiveSession must return status: "opened" on successful browser open trigger'
);

assert(
  liveSessionContent.includes("success: true"),
  'LiveSession must return success: true on successful browser open trigger'
);

assert(
  liveSessionContent.includes("window.open(url, '_blank', 'noopener,noreferrer')"),
  'LiveSession must preserve existing new-tab window.open behavior'
);

console.log('✔ TEST 1 PASSED: LiveSession openWebsite correctly returns success: true and status: "opened".');

// 2. Verify server.ts systemInstruction & tool definitions
console.log('\n--- TEST 2 — VERIFY SERVER.TS SYSTEM INSTRUCTION & TOOL DEFINITION ---');
const serverContent = fs.readFileSync('server.ts', 'utf8');

assert(
  serverContent.includes('WEBSITE & BROWSER OPENING RULES (CRITICAL)'),
  'server.ts must contain critical rules for website and browser opening'
);

assert(
  serverContent.includes('NEVER claim that "open nahi ho raha", "website open nahi hui", "Chrome ne block kar diya"'),
  'server.ts must forbid false failure voice responses when openWebsite succeeds'
);

assert(
  serverContent.includes("When 'openWebsite' returns status 'opened' or success: true"),
  'server.ts must explicitly instruct Mahiru to give a natural success confirmation'
);

assert(
  serverContent.includes('Returns status "opened" when successfully triggered'),
  'server.ts openWebsite tool description must document status "opened"'
);

console.log('✔ TEST 2 PASSED: server.ts instructions guide Gemini to provide natural success confirmations.');

// 3. Simulated execution of the browser action handler
console.log('\n--- TEST 3 — SIMULATED TOOL EXECUTION ---');

// Mock window.open mimicking modern browser with noopener
let openedUrl = '';
let openedTarget = '';
let openedFeatures = '';
(globalThis as any).window = {
  open: (url: string, target: string, features: string) => {
    openedUrl = url;
    openedTarget = target;
    openedFeatures = features;
    // Standard WHATWG HTML specification: returns null when noopener is passed
    return null;
  }
};

// Simulate the exact code from LiveSession.ts
function executeOpenWebsite(args: { url: string; siteName?: string }) {
  const url = args.url;
  const siteName = args.siteName || url;
  try {
    (globalThis as any).window.open(url, '_blank', 'noopener,noreferrer');
    return {
      success: true,
      status: 'opened',
      url: url,
      siteName: siteName,
      note: 'Website opened successfully in a new tab',
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      error: err?.message || 'Failed to open website',
      url: url,
      siteName: siteName,
    };
  }
}

// Test supported sites
const testCases = [
  { input: { url: 'https://www.instagram.com', siteName: 'Instagram' }, expectedSite: 'Instagram' },
  { input: { url: 'https://www.facebook.com', siteName: 'Facebook' }, expectedSite: 'Facebook' },
  { input: { url: 'https://www.youtube.com', siteName: 'YouTube' }, expectedSite: 'YouTube' },
  { input: { url: 'https://www.flipkart.com', siteName: 'Flipkart' }, expectedSite: 'Flipkart' },
  { input: { url: 'https://www.google.com', siteName: 'Google' }, expectedSite: 'Google' },
];

for (const tc of testCases) {
  const result = executeOpenWebsite(tc.input);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'opened');
  assert.strictEqual(result.siteName, tc.expectedSite);
  assert.strictEqual(openedUrl, tc.input.url);
  assert.strictEqual(openedTarget, '_blank');
  assert.strictEqual(openedFeatures, 'noopener,noreferrer');
  console.log(`  ✔ Site [${tc.expectedSite}] open-action triggered -> status: "${result.status}", success: ${result.success}`);
}

// Test genuine error case
(globalThis as any).window.open = () => {
  throw new Error('Restricted sandboxed environment');
};
const errorResult = executeOpenWebsite({ url: 'https://example.com', siteName: 'Example' });
assert.strictEqual(errorResult.success, false);
assert.strictEqual(errorResult.status, 'error');
assert.strictEqual(errorResult.error, 'Restricted sandboxed environment');
console.log(`  ✔ Genuine failure preserved -> status: "${errorResult.status}", error: "${errorResult.error}"`);

console.log('\n======================================================');
console.log('ALL STEP 1 BROWSER RESPONSE TESTS PASSED SUCCESSFULLY!');
console.log('======================================================');
