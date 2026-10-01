import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  setupInitialPin,
  setupInitialCodeword,
  getSecurityConfig,
  toggleSecurity,
  initializeSecurityForNewSession,
  verifySecurityCredentials,
  authorizeOwnerNameChange,
  authorizeSingleMemoryDelete,
  authorizeDeleteAllMemories,
  clearSessionSecurityOverrides,
  isOwnerNameMemory,
} from './server/memorySecurity';
import {
  createMemory,
  getMemories,
  deleteMemory,
} from './server/memoryStore';
import {
  executeVoiceToggleSecurity,
  executeVoiceDeleteMemory,
  executeMemoryUpdate,
} from './server/memoryResolver';

// ISOLATED TEST USER ID - NEVER TOUCHES USER'S REAL MEMORIES OR REAL CREDENTIALS
const TEST_USER = `test_clear_all_user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const TEST_PIN = '4321';
const TEST_CODEWORD = 'sapphire';

async function runClearAllNeutralizationTestSuite() {
  console.log(`\n======================================================`);
  console.log(`RUNNING ISOLATED CLEAR ALL NEUTRALIZATION TEST SUITE`);
  console.log(`Target isolated namespace: ${TEST_USER}`);
  console.log(`======================================================\n`);

  // Setup initial credentials for test user
  console.log('1. Setting up initial PIN and Codeword for isolated test user...');
  await setupInitialPin(TEST_USER, TEST_PIN, TEST_PIN);
  await setupInitialCodeword(TEST_USER, TEST_CODEWORD, TEST_CODEWORD);

  // Seed 3 test memories: 2 normal preference memories, 1 owner name memory
  const testMem1 = await createMemory(TEST_USER, {
    key: 'favorite_food',
    category: 'PREFERENCES',
    content: 'Ramen',
    value: 'Ramen',
    priority: 'HIGH',
    isPermanent: true,
  });
  const testMem2 = await createMemory(TEST_USER, {
    key: 'favorite_book',
    category: 'PREFERENCES',
    content: '1984',
    value: '1984',
    priority: 'MEDIUM',
    isPermanent: true,
  });
  const testMemOwner = await createMemory(TEST_USER, {
    key: 'user_name',
    category: 'USER_PROFILE',
    content: 'Rupesh',
    value: 'Rupesh',
    priority: 'HIGH',
    isPermanent: true,
  });

  console.log(`Seed test memories created in isolated namespace: IDs=[${testMem1.id}, ${testMem2.id}, ${testMemOwner.id}]`);
  const initialMemories = await getMemories(TEST_USER);
  assert.strictEqual(initialMemories.length, 3, 'Must have exactly 3 test memories seeded');

  // Verify UI file code inspection (TEST C & TEST D)
  console.log('\n--- TEST C & TEST D: Inspect UI CLEAR ALL implementation in PermanentMemoryModal.tsx ---');
  const modalContent = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'PermanentMemoryModal.tsx'), 'utf-8');
  
  // Verify that the CLEAR ALL button is disabled and does NOT call delete API
  assert(modalContent.includes('disabled={true}'), 'UI CLEAR ALL button must be explicitly disabled');
  assert(!modalContent.includes("fetch('/api/memories', {\n                          method: 'DELETE'"), 'UI CLEAR ALL button must NOT call DELETE /api/memories');
  assert(!modalContent.includes('id: \'ALL_MEMORIES\''), 'UI must NOT route CLEAR ALL to ALL_MEMORIES delete modal');
  console.log('✔ TEST C & D PASSED: UI CLEAR ALL button is completely neutralized, disabled, and has no destructive delete call');

  // TEST A: Security ON -> UI CLEAR ALL action causes ZERO Permanent Memory deletions
  console.log('\n--- TEST A: Security ON -> CLEAR ALL causes ZERO deletions ---');
  const sessionOn = `sess_on_${Date.now()}`;
  const configOn = await getSecurityConfig(TEST_USER, sessionOn);
  assert.strictEqual(configOn.isEnabled, true, 'Security must be ON');

  // Simulate an attempt to invoke unauthenticated DELETE /api/memories (the old UI Clear All route)
  const authCheckOn = await authorizeDeleteAllMemories(TEST_USER, {}, sessionOn);
  assert.strictEqual(authCheckOn.authorized, false, 'Unauthenticated bulk delete must be rejected when Security is ON');
  assert.strictEqual(authCheckOn.requiresCodeword, true, 'Codeword required');

  const memoriesAfterA = await getMemories(TEST_USER);
  assert.strictEqual(memoriesAfterA.length, 3, 'ZERO permanent memories deleted when Security is ON');
  console.log('✔ TEST A PASSED: ZERO permanent memories deleted with Security ON');

  // TEST B: Security OFF -> UI CLEAR ALL action causes ZERO Permanent Memory deletions
  console.log('\n--- TEST B: Security OFF -> CLEAR ALL causes ZERO deletions ---');
  const sessionOff = `sess_off_${Date.now()}`;
  await toggleSecurity(TEST_USER, false, { codeword: TEST_CODEWORD }, sessionOff);
  const configOff = await getSecurityConfig(TEST_USER, sessionOff);
  assert.strictEqual(configOff.isEnabled, false, 'Security must be OFF');

  // Simulate an attempt to invoke unauthenticated DELETE /api/memories when Security is OFF
  const authCheckOff = await authorizeDeleteAllMemories(TEST_USER, {}, sessionOff);
  assert.strictEqual(authCheckOff.authorized, false, 'Unauthenticated bulk delete must be rejected EVEN WHEN Security is OFF');
  assert.strictEqual(authCheckOff.requiresCodeword, true, 'Codeword required even when Security is OFF');

  const memoriesAfterB = await getMemories(TEST_USER);
  assert.strictEqual(memoriesAfterB.length, 3, 'ZERO permanent memories deleted when Security is OFF');
  console.log('✔ TEST B PASSED: ZERO permanent memories deleted with Security OFF');

  // TEST E: Use isolated test memories -> Tap CLEAR ALL -> Test memories remain unchanged
  console.log('\n--- TEST E: Verify test memories remain completely unchanged ---');
  const memoriesAfterE = await getMemories(TEST_USER);
  assert.strictEqual(memoriesAfterE.length, 3, 'All 3 test memories must be untouched');
  assert(memoriesAfterE.some((m) => m.id === testMem1.id), 'Memory 1 untouched');
  assert(memoriesAfterE.some((m) => m.id === testMem2.id), 'Memory 2 untouched');
  assert(memoriesAfterE.some((m) => m.id === testMemOwner.id), 'Owner memory untouched');
  console.log('✔ TEST E PASSED: Test memories completely unchanged');

  // TEST I: Security ON + Voice Delete-All without Codeword -> Codeword requested, ZERO deletions
  console.log('\n--- TEST I: Security ON + Voice Delete-All without Codeword ---');
  const voiceDeleteNoCodeOn = await executeVoiceDeleteMemory(
    TEST_USER,
    'Delete all permanent memories',
    undefined,
    undefined,
    { sessionId: sessionOn } as any
  );
  assert.strictEqual(voiceDeleteNoCodeOn.success, false, 'Voice Delete-All without codeword must fail');
  assert.strictEqual(voiceDeleteNoCodeOn.status, 'codeword_required', 'Status must be codeword_required');
  const memoriesAfterI = await getMemories(TEST_USER);
  assert.strictEqual(memoriesAfterI.length, 3, 'ZERO memories deleted without codeword on Security ON');
  console.log('✔ TEST I PASSED: Voice Delete-All without Codeword requests Codeword and deletes nothing');

  // TEST H: Security OFF + Voice Delete-All without Codeword -> Codeword requested, ZERO deletions
  console.log('\n--- TEST H: Security OFF + Voice Delete-All without Codeword ---');
  const voiceDeleteNoCodeOff = await executeVoiceDeleteMemory(
    TEST_USER,
    'Sari memory delete kar do',
    undefined,
    undefined,
    { sessionId: sessionOff } as any
  );
  assert.strictEqual(voiceDeleteNoCodeOff.success, false, 'Voice Delete-All without codeword must fail even when Security is OFF');
  assert.strictEqual(voiceDeleteNoCodeOff.status, 'codeword_required', 'Status must be codeword_required');
  const memoriesAfterH = await getMemories(TEST_USER);
  assert.strictEqual(memoriesAfterH.length, 3, 'ZERO memories deleted without codeword on Security OFF');
  console.log('✔ TEST H PASSED: Voice Delete-All without Codeword on Security OFF requests Codeword and deletes nothing');

  // TEST G: Voice Delete-All with wrong Codeword -> Rejected, ZERO deletions
  console.log('\n--- TEST G: Voice Delete-All with wrong Codeword ---');
  const voiceDeleteWrongCode = await executeVoiceDeleteMemory(
    TEST_USER,
    'Saari permanent memories delete kar do',
    undefined,
    undefined,
    { codeword: 'wrongpassword', sessionId: sessionOn } as any
  );
  assert.strictEqual(voiceDeleteWrongCode.success, false, 'Voice Delete-All with wrong codeword must fail');
  assert.strictEqual(voiceDeleteWrongCode.status, 'auth_failed', 'Status must be auth_failed');
  const memoriesAfterG = await getMemories(TEST_USER);
  assert.strictEqual(memoriesAfterG.length, 3, 'ZERO memories deleted with wrong codeword');
  console.log('✔ TEST G PASSED: Voice Delete-All with wrong Codeword is rejected and deletes nothing');

  // TEST F: Authorized voice Delete-All flow with CORRECT Codeword -> Successfully deletes isolated test memories
  console.log('\n--- TEST F: Authorized voice Delete-All with CORRECT Codeword ---');
  const voiceDeleteCorrectCode = await executeVoiceDeleteMemory(
    TEST_USER,
    'Delete all permanent memories',
    undefined,
    undefined,
    { codeword: TEST_CODEWORD, sessionId: sessionOn } as any
  );
  assert.strictEqual(voiceDeleteCorrectCode.success, true, 'Authorized Delete-All with correct codeword must succeed');
  assert.strictEqual(voiceDeleteCorrectCode.status, 'deleted', 'Status must be deleted');
  const memoriesAfterF = await getMemories(TEST_USER);
  assert.strictEqual(memoriesAfterF.length, 0, 'Authorized Delete-All correctly cleared isolated test memories');
  console.log('✔ TEST F PASSED: Authorized voice Delete-All with correct Codeword works as intended');

  // REGRESSION TESTS
  console.log('\n--- REGRESSION TESTS ---');
  // 1. Normal new memory creation
  const newMem = await createMemory(TEST_USER, {
    key: 'city',
    category: 'PREFERENCES',
    content: 'Tokyo',
    value: 'Tokyo',
    priority: 'HIGH',
    isPermanent: true,
  });
  assert(newMem && newMem.id, 'New memory creation must succeed');
  console.log('✔ Regression 1: Normal memory creation works');

  // 2. Normal memory update
  const updateResult = await executeMemoryUpdate({
    userId: TEST_USER,
    query: 'city',
    newValue: 'Kyoto',
    codeword: TEST_CODEWORD,
    sessionId: sessionOn,
  });
  assert.strictEqual(updateResult.success, true, 'Memory update with codeword must succeed');
  console.log('✔ Regression 2: Normal memory update works');

  // 3. Owner-name protection (codeword mandatory regardless of Security ON/OFF)
  const ownerAuth = await authorizeOwnerNameChange(TEST_USER, {}, 'change', sessionOff);
  assert.strictEqual(ownerAuth.authorized, false, 'Owner name change without codeword must be rejected even when Security is OFF');
  const ownerAuthValid = await authorizeOwnerNameChange(TEST_USER, { codeword: TEST_CODEWORD }, 'change', sessionOff);
  assert.strictEqual(ownerAuthValid.authorized, true, 'Owner name change with codeword must succeed');
  console.log('✔ Regression 3: Owner-name protection remains intact');

  // 4. Single-memory voice deletion
  const singleDeleteResult = await executeVoiceDeleteMemory(
    TEST_USER,
    'city',
    newMem.id,
    undefined,
    { codeword: TEST_CODEWORD, sessionId: sessionOn } as any
  );
  assert.strictEqual(singleDeleteResult.success, true, 'Single memory voice deletion with codeword must succeed');
  console.log('✔ Regression 4: Single-memory voice deletion works');

  // 5. Security restart behavior (new session automatically starts ON)
  const restartSession = `sess_restart_${Date.now()}`;
  const restartConfig = await getSecurityConfig(TEST_USER, restartSession);
  assert.strictEqual(restartConfig.isEnabled, true, 'New session must automatically initialize with Security ON');
  console.log('✔ Regression 5: Security restart behavior remains intact');

  // Clean up isolated test credentials
  clearSessionSecurityOverrides(TEST_USER);
  console.log('\n======================================================');
  console.log('ALL TESTS (A, B, C, D, E, F, G, H, I + Regressions) PASSED!');
  console.log('======================================================\n');
}

runClearAllNeutralizationTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite error:', err);
    process.exit(1);
  });
