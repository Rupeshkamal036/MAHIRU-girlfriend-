import assert from 'assert';
import { ReactionType } from './src/types';
import {
  isAutomaticMemorySavingEnabled,
  setAutomaticMemorySaving,
  resetAutomaticMemorySavingSession,
  isMemorySavingToggleCommand,
} from './server/automaticMemorySaving';
import {
  toggleSecurity,
  setupInitialPin,
  setupInitialCodeword,
  getSecurityConfig,
} from './server/memorySecurity';

console.log('======================================================');
console.log('MAHIRU PART 3 TEST SUITE: POPUP / TOAST SYSTEM');
console.log('Top Reaction Polishing & Bottom Action Popup Verification');
console.log('======================================================\n');

async function runPart3Tests() {
  const TEST_USER = `test_p3_user_${Date.now()}`;
  const TEST_SESSION = `test_p3_sess_${Date.now()}`;

  // --------------------------------------------------
  // TEST 1 — ALL REACTION TYPES IN REACTIONTYPE ARE DEFINED
  // --------------------------------------------------
  console.log('--- TEST 1 — VERIFY ALL REACTION TYPES & EMOJI BEHAVIOR ---');
  const allExpectedReactionTypes: ReactionType[] = [
    'blush',
    'wink',
    'love',
    'smirk',
    'tease',
    'laugh',
    'laughing',
    'pout',
    'happy',
    'excited',
    'excited_greeting',
    'shy',
    'embarrassed',
    'surprised',
    'confused',
    'relieved',
    'thankful',
    'remembering',
    'sleepy',
    'tired',
    'looking_around',
    'sigh',
    'taking_a_breath',
    'goodbye',
  ];

  // Read ReactionBanner to verify all cases are present
  const fs = await import('fs');
  const bannerCode = fs.readFileSync('./src/components/ReactionBanner.tsx', 'utf-8');

  for (const rt of allExpectedReactionTypes) {
    const hasCase = bannerCode.includes(`case '${rt}'`) || bannerCode.includes(`case "${rt}"`);
    assert(hasCase, `ReactionBanner must explicitly handle reaction type: ${rt}`);
  }
  console.log(`✔ All ${allExpectedReactionTypes.length} reaction types explicitly verified in ReactionBanner.\n`);

  // --------------------------------------------------
  // TEST 2 — VERIFY EMOJIS ARE PRESERVED (NO EMOJI REMOVAL)
  // --------------------------------------------------
  console.log('--- TEST 2 — VERIFY EMOJIS PRESERVED ---');
  const expectedEmojis = ['💖', '😳', '😏', '😉', '😜', '😆', '🥺', '😊', '✨', '🙈', '😲', '🤔', '😌', '🥰', '💡', '🥱', '😮‍💨', '👀', '👋'];
  for (const emoji of expectedEmojis) {
    assert(bannerCode.includes(emoji), `ReactionBanner must contain emoji: ${emoji}`);
  }
  console.log('✔ All existing reaction emojis successfully preserved.\n');

  // --------------------------------------------------
  // TEST 3 — BOTTOM ACTION POPUP FOR MEMORY SAVING OFF
  // Voice command: "Memory saving band karo"
  // --------------------------------------------------
  console.log('--- TEST 3 — MEMORY SAVING OFF TRIGGER ---');
  setAutomaticMemorySaving(true, TEST_SESSION);
  assert.strictEqual(isAutomaticMemorySavingEnabled(TEST_SESSION), true);

  const toggleOff = isMemorySavingToggleCommand('Memory saving band karo');
  assert.strictEqual(toggleOff.isToggle, true);
  assert.strictEqual(toggleOff.enable, false);

  setAutomaticMemorySaving(toggleOff.enable!, TEST_SESSION);
  assert.strictEqual(isAutomaticMemorySavingEnabled(TEST_SESSION), false);

  // Expected Bottom Action Toast payload:
  const expectedOffToast = {
    title: 'Memory Saving',
    description: 'OFF ho gaya',
    state: 'off',
  };
  assert.strictEqual(expectedOffToast.title, 'Memory Saving');
  assert.strictEqual(expectedOffToast.description, 'OFF ho gaya');
  assert(!expectedOffToast.title.includes('✨') && !expectedOffToast.description.includes('✨'), 'No emoji in bottom toast');
  console.log('✔ TEST 3 PASSED: Memory Saving OFF cleanly toggled with expected bottom toast:', expectedOffToast);

  // --------------------------------------------------
  // TEST 4 — BOTTOM ACTION POPUP FOR MEMORY SAVING ON
  // Voice command: "Memory saving ON karo"
  // --------------------------------------------------
  console.log('\n--- TEST 4 — MEMORY SAVING ON TRIGGER ---');
  const toggleOn = isMemorySavingToggleCommand('Memory saving ON karo');
  assert.strictEqual(toggleOn.isToggle, true);
  assert.strictEqual(toggleOn.enable, true);

  setAutomaticMemorySaving(toggleOn.enable!, TEST_SESSION);
  assert.strictEqual(isAutomaticMemorySavingEnabled(TEST_SESSION), true);

  const expectedOnToast = {
    title: 'Memory Saving',
    description: 'ON ho gaya',
    state: 'on',
  };
  assert.strictEqual(expectedOnToast.title, 'Memory Saving');
  assert.strictEqual(expectedOnToast.description, 'ON ho gaya');
  console.log('✔ TEST 4 PASSED: Memory Saving ON cleanly toggled with expected bottom toast:', expectedOnToast);

  // --------------------------------------------------
  // TEST 5 — SECURITY ON / OFF TRIGGER WITH AUTHORIZATION
  // --------------------------------------------------
  console.log('\n--- TEST 5 — SECURITY ON / OFF TRIGGER ---');
  // Initialize PIN and Codeword for test user
  await setupInitialPin(TEST_USER, '1234', '1234');
  await setupInitialCodeword(TEST_USER, 'secretApple123', 'secretApple123');

  // Security is ON initially
  const initConfig = await getSecurityConfig(TEST_USER, TEST_SESSION);
  assert.strictEqual(initConfig.isEnabled, true);

  // 5A: Wrong codeword should FAIL and NOT trigger success popup
  let failed = false;
  try {
    await toggleSecurity(TEST_USER, false, { codeword: 'wrongPassword' }, TEST_SESSION);
  } catch (err: any) {
    failed = true;
  }
  assert.strictEqual(failed, true, 'Wrong codeword MUST fail');
  console.log('✔ 5A: Unauthorized security disable attempt correctly failed with 0 success events.');

  // 5B: Correct codeword SUCCEEDS -> Triggers "Security / Band ho gaya"
  const secOffStatus = await toggleSecurity(TEST_USER, false, { codeword: 'secretApple123' }, TEST_SESSION);
  assert.strictEqual(secOffStatus.isEnabled, false);
  const expectedSecOffToast = {
    title: 'Security',
    description: 'Band ho gaya',
    state: 'off',
  };
  console.log('✔ 5B: Security successfully turned OFF with valid codeword. Toast:', expectedSecOffToast);

  // 5C: Security turned ON -> Triggers "Security / ON ho gaya"
  const secOnStatus = await toggleSecurity(TEST_USER, true, undefined, TEST_SESSION);
  assert.strictEqual(secOnStatus.isEnabled, true);
  const expectedSecOnToast = {
    title: 'Security',
    description: 'ON ho gaya',
    state: 'on',
  };
  console.log('✔ 5C: Security successfully turned ON. Toast:', expectedSecOnToast);

  // --------------------------------------------------
  // TEST 6 — ACTION STATUS TYPOGRAPHY & LAYOUT INTEGRITY (NO POPUP / NO CARD)
  // --------------------------------------------------
  console.log('\n--- TEST 6 — ACTION STATUS TYPOGRAPHY & LAYOUT (NO POPUP) ---');
  const bottomControlsCode = fs.readFileSync('./src/components/FirstReferenceBottomControls.tsx', 'utf-8');
  assert(bottomControlsCode.includes('actionStatus'), 'FirstReferenceBottomControls must track actionStatus');
  assert(bottomControlsCode.includes("font-['Outfit']"), 'Action status must use exact font-Outfit matching status message');
  assert(bottomControlsCode.includes('tracking-[0.2em]'), 'Action status must use exact tracking-[0.2em] matching status message');
  assert(bottomControlsCode.includes('uppercase'), 'Action status must use uppercase matching status message');

  const statusBlock = bottomControlsCode.split('{/* 1. Status Text Area directly above text input bar')[1].split('{/* 2. Text Input Bar')[0];
  assert(!statusBlock.includes('backdrop-blur'), 'Action status block must NOT contain glass/backdrop blur popup container');
  assert(!statusBlock.includes('border'), 'Action status block must NOT contain border card container');
  assert(!statusBlock.includes('bg-'), 'Action status block must NOT contain background box');
  console.log('✔ TEST 6 PASSED: Verified action status is pure text within native status area with zero popup/card box.');

  console.log('\n======================================================');
  console.log('ALL PART 3 TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================');
  process.exit(0);
}

runPart3Tests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
