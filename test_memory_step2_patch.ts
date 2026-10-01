import assert from 'assert';
import {
  evaluateMemoryDecision,
  isExactDuplicateMemory,
  normalizeMemoryValueForDuplicate,
} from './server/memoryCategorySchema';
import { extractWithRules } from './server/memoryExtractor';
import { createMemory, getMemories, deleteMemory } from './server/memoryStore';
import { persistMemoryCandidates } from './server/memoryPersistence';
import { isUpdateIntent } from './server/memoryResolver';

// Isolated test user namespace to never affect real user memories
const TEST_USER = `test_patch_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function runStep2PatchTestSuite() {
  console.log('======================================================');
  console.log('MAHIRU MEMORY SYSTEM — STEP 2 PATCH TEST SUITE');
  console.log('Similar-But-Not-Identical Decision Logic Verification');
  console.log('======================================================\n');

  // Existing memory fixture: favorite_anime -> Solo Leveling
  const existingAnimeSolo = {
    id: 'mem_anime_solo',
    userId: TEST_USER,
    category: 'watching_entertainment',
    semanticCategory: 'watching_entertainment',
    key: 'favorite_anime',
    semanticKey: 'favorite_anime',
    value: 'Solo Leveling',
    content: 'Solo Leveling',
    priority: 'HIGH' as const,
    importance: 'HIGH' as const,
    retention: 'PERMANENT',
    source: 'CONVERSATION',
    lastRecalled: 'Just now',
    isPermanent: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const existingFoodBiryani = {
    id: 'mem_food_biryani',
    userId: TEST_USER,
    category: 'food',
    semanticCategory: 'food',
    key: 'favorite_food',
    semanticKey: 'favorite_food',
    value: 'Biryani',
    content: 'Biryani',
    priority: 'HIGH' as const,
    importance: 'HIGH' as const,
    retention: 'PERMANENT',
    source: 'CONVERSATION',
    lastRecalled: 'Just now',
    isPermanent: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const existingDrinkChai = {
    id: 'mem_drink_chai',
    userId: TEST_USER,
    category: 'drinks',
    semanticCategory: 'drinks',
    key: 'favorite_drink',
    semanticKey: 'favorite_drink',
    value: 'Chai',
    content: 'Chai',
    priority: 'HIGH' as const,
    importance: 'HIGH' as const,
    retention: 'PERMANENT',
    source: 'CONVERSATION',
    lastRecalled: 'Just now',
    isPermanent: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const existingColorBlue = {
    id: 'mem_color_blue',
    userId: TEST_USER,
    category: 'favorites',
    semanticCategory: 'favorites',
    key: 'favorite_color',
    semanticKey: 'favorite_color',
    value: 'Blue',
    content: 'Blue',
    priority: 'HIGH' as const,
    importance: 'HIGH' as const,
    retention: 'PERMANENT',
    source: 'CONVERSATION',
    lastRecalled: 'Just now',
    isPermanent: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const existingMemoriesFixture = [
    existingAnimeSolo,
    existingFoodBiryani,
    existingDrinkChai,
    existingColorBlue,
  ];

  // -------------------------------------------------------------------
  // TEST 1 — EXACT DUPLICATE
  // Existing: favorite_anime → Solo Leveling
  // Input: "Mujhe Solo Leveling pasand hai."
  // Expected: EXACT_DUPLICATE, No new record, response: "Ye memory pehle se saved hai."
  // -------------------------------------------------------------------
  console.log('--- TEST 1 — EXACT DUPLICATE ---');
  const t1Candidates = extractWithRules('Mujhe Solo Leveling pasand hai.');
  assert(t1Candidates.length >= 1, 'Must extract candidate for Test 1');
  const t1Eval = evaluateMemoryDecision(t1Candidates[0], existingMemoriesFixture);
  assert.strictEqual(t1Eval.decision, 'EXACT_DUPLICATE', 'Decision must be EXACT_DUPLICATE');
  assert.strictEqual(t1Eval.message, 'Ye memory pehle se saved hai.');
  console.log(`✔ TEST 1 PASSED: Decision = ${t1Eval.decision}, message = "${t1Eval.message}"`);

  // -------------------------------------------------------------------
  // TEST 2 — INDEPENDENT NEW VALUE
  // Existing: favorite_anime → Solo Leveling
  // Input: "Mujhe Naruto bhi pasand hai."
  // Expected: NEW_MEMORY (Create favorite_anime → Naruto, do NOT ask update-or-new)
  // -------------------------------------------------------------------
  console.log('\n--- TEST 2 — INDEPENDENT NEW VALUE ---');
  const t2Candidates = extractWithRules('Mujhe Naruto bhi pasand hai.');
  assert(t2Candidates.length >= 1, 'Must extract candidate for Test 2');
  assert.strictEqual(t2Candidates[0].key, 'favorite_anime');
  assert.strictEqual(t2Candidates[0].value.toLowerCase(), 'naruto');
  const t2Eval = evaluateMemoryDecision(t2Candidates[0], existingMemoriesFixture);
  assert.strictEqual(t2Eval.decision, 'NEW_MEMORY', 'Decision must be NEW_MEMORY');
  console.log(`✔ TEST 2 PASSED: Naruto recognized as independent favorite. Decision = ${t2Eval.decision}`);

  // -------------------------------------------------------------------
  // TEST 3 — RELATED REFINEMENT
  // Existing: favorite_anime → Solo Leveling
  // Input: "Mujhe love story wale anime pasand hain."
  // Expected: SIMILAR_REQUIRES_USER_DECISION, No automatic creation, No overwrite.
  // -------------------------------------------------------------------
  console.log('\n--- TEST 3 — RELATED REFINEMENT ---');
  const t3Candidates = extractWithRules('Mujhe love story wale anime pasand hain.');
  assert(t3Candidates.length >= 1, 'Must extract candidate for Test 3');
  assert.strictEqual(t3Candidates[0].category, 'watching_entertainment');
  assert.strictEqual(t3Candidates[0].key, 'favorite_anime');
  const t3Eval = evaluateMemoryDecision(t3Candidates[0], existingMemoriesFixture);
  assert.strictEqual(
    t3Eval.decision,
    'SIMILAR_REQUIRES_USER_DECISION',
    'Decision must be SIMILAR_REQUIRES_USER_DECISION'
  );
  assert(t3Eval.clarificationPrompt, 'Must include clarification prompt');
  assert(
    t3Eval.clarificationPrompt.includes('Ye existing anime preference se related hai') &&
    t3Eval.clarificationPrompt.includes('Kya aap existing memory update karna chahte hain'),
    `Clarification prompt must match required text: "${t3Eval.clarificationPrompt}"`
  );
  console.log(`✔ TEST 3 PASSED: Decision = ${t3Eval.decision}`);
  console.log(`  Clarification prompt: "${t3Eval.clarificationPrompt}"`);

  // -------------------------------------------------------------------
  // TEST 4 — EXPLICIT NEW MEMORY
  // Existing: favorite_anime → Solo Leveling
  // Input: "New memory mein save karo ki mujhe love story wale anime pasand hain."
  // Expected: NEW_MEMORY (Create separate memory because user explicitly requested a new memory)
  // -------------------------------------------------------------------
  console.log('\n--- TEST 4 — EXPLICIT NEW MEMORY ---');
  const t4Candidates = extractWithRules('New memory mein save karo ki mujhe love story wale anime pasand hain.');
  assert(t4Candidates.length >= 1, 'Must extract candidate for Test 4');
  assert.strictEqual((t4Candidates[0] as any).isExplicitNew, true, 'Must flag explicit new memory');
  const t4Eval = evaluateMemoryDecision(t4Candidates[0], existingMemoriesFixture, {
    isExplicitNewMemory: true,
  });
  assert.strictEqual(
    t4Eval.decision,
    'NEW_MEMORY',
    'Explicit new memory directive overrides clarification for non-duplicate'
  );
  console.log(`✔ TEST 4 PASSED: Explicit "New memory" directive accepted. Decision = ${t4Eval.decision}`);

  // -------------------------------------------------------------------
  // TEST 5 — EXPLICIT UPDATE
  // Existing: favorite_color → Blue
  // Input: "Mera favorite color Blue se Red update kar do."
  // Expected: Existing update workflow. No creation decision.
  // -------------------------------------------------------------------
  console.log('\n--- TEST 5 — EXPLICIT UPDATE ---');
  const t5Input = 'Mera favorite color Blue se Red update kar do.';
  const isUpd = isUpdateIntent(t5Input);
  assert.strictEqual(isUpd, true, 'Must be recognized as an explicit update intent');
  console.log('✔ TEST 5 PASSED: Utterance routes to existing update workflow without creation decision.');

  // -------------------------------------------------------------------
  // TEST 6 — FOOD INDEPENDENT VALUE
  // Existing: favorite_food → Biryani
  // Input: "Mujhe Pizza bhi pasand hai."
  // Expected: NEW_MEMORY
  // -------------------------------------------------------------------
  console.log('\n--- TEST 6 — FOOD INDEPENDENT VALUE ---');
  const t6Candidates = extractWithRules('Mujhe Pizza bhi pasand hai.');
  assert(t6Candidates.length >= 1, 'Must extract candidate for Test 6');
  assert.strictEqual(t6Candidates[0].category, 'food');
  assert.strictEqual(t6Candidates[0].key, 'favorite_food');
  assert.strictEqual(t6Candidates[0].value.toLowerCase(), 'pizza');
  const t6Eval = evaluateMemoryDecision(t6Candidates[0], existingMemoriesFixture);
  assert.strictEqual(t6Eval.decision, 'NEW_MEMORY', 'Pizza must be an independent NEW_MEMORY');
  console.log(`✔ TEST 6 PASSED: Pizza recognized as independent food. Decision = ${t6Eval.decision}`);

  // -------------------------------------------------------------------
  // TEST 7 — DRINK INDEPENDENT VALUE
  // Existing: favorite_drink → Chai
  // Input: "Mujhe Coffee bhi pasand hai."
  // Expected: NEW_MEMORY
  // -------------------------------------------------------------------
  console.log('\n--- TEST 7 — DRINK INDEPENDENT VALUE ---');
  const t7Candidates = extractWithRules('Mujhe Coffee bhi pasand hai.');
  assert(t7Candidates.length >= 1, 'Must extract candidate for Test 7');
  assert.strictEqual(t7Candidates[0].category, 'drinks');
  assert.strictEqual(t7Candidates[0].key, 'favorite_drink');
  assert.strictEqual(t7Candidates[0].value.toLowerCase(), 'coffee');
  const t7Eval = evaluateMemoryDecision(t7Candidates[0], existingMemoriesFixture);
  assert.strictEqual(t7Eval.decision, 'NEW_MEMORY', 'Coffee must be an independent NEW_MEMORY');
  console.log(`✔ TEST 7 PASSED: Coffee recognized as independent drink. Decision = ${t7Eval.decision}`);

  // -------------------------------------------------------------------
  // TEST 8 — EXACT DUPLICATE WITH FORMATTING
  // Existing: favorite_anime → Solo Leveling
  // Input: "solo leveling."
  // Expected: EXACT_DUPLICATE
  // -------------------------------------------------------------------
  console.log('\n--- TEST 8 — EXACT DUPLICATE WITH FORMATTING ---');
  const t8Candidate = {
    category: 'watching_entertainment' as const,
    key: 'favorite_anime',
    value: 'solo leveling.',
  };
  const t8Eval = evaluateMemoryDecision(t8Candidate, existingMemoriesFixture);
  assert.strictEqual(t8Eval.decision, 'EXACT_DUPLICATE', 'Must detect formatted exact duplicate');
  assert.strictEqual(t8Eval.message, 'Ye memory pehle se saved hai.');
  console.log(`✔ TEST 8 PASSED: Formatted input recognized as duplicate. Decision = ${t8Eval.decision}`);

  // -------------------------------------------------------------------
  // TEST 9 — COMPOUND INPUT
  // Existing: favorite_anime → Solo Leveling
  // Input: "Mujhe Naruto aur One Punch Man bhi pasand hain."
  // Expected: Two independent NEW_MEMORY candidates. Do NOT ask update/new for either.
  // -------------------------------------------------------------------
  console.log('\n--- TEST 9 — COMPOUND INPUT ---');
  const t9Candidates = extractWithRules('Mujhe Naruto aur One Punch Man bhi pasand hain.');
  assert.strictEqual(t9Candidates.length, 2, 'Must extract exactly 2 candidates');
  assert(t9Candidates.some((c) => c.value.toLowerCase().includes('naruto')));
  assert(t9Candidates.some((c) => c.value.toLowerCase().includes('one punch man')));

  for (const c of t9Candidates) {
    const cEval = evaluateMemoryDecision(c, existingMemoriesFixture);
    assert.strictEqual(
      cEval.decision,
      'NEW_MEMORY',
      `Candidate "${c.value}" must be NEW_MEMORY, not prompt update/new`
    );
  }
  console.log('✔ TEST 9 PASSED: Both compound items evaluated cleanly as independent NEW_MEMORY.');

  // -------------------------------------------------------------------
  // TEST 10 — END-TO-END FIRESTORE LIFECYCLE IN ISOLATED TEST USER
  // -------------------------------------------------------------------
  console.log('\n--- TEST 10 — End-to-End Firestore Lifecycle in Isolated Namespace ---');
  // Seed initial memory: Solo Leveling
  const seedCandidates = extractWithRules('Mujhe Solo Leveling pasand hai.');
  const pSeed = await persistMemoryCandidates(seedCandidates, TEST_USER);
  assert.strictEqual(pSeed.persistedCount, 1, 'Initial memory must persist to Firestore');
  console.log('✔ Initial memory "Solo Leveling" saved to Cloud Firestore.');

  // 1. Refinement attempt: "love story wale anime" -> Must NOT save automatically!
  const refineCandidates = extractWithRules('Mujhe love story wale anime pasand hain.');
  const pRefine = await persistMemoryCandidates(refineCandidates, TEST_USER);
  assert.strictEqual(pRefine.persistedCount, 0, 'Must NOT persist refinement without user decision');
  assert.strictEqual(pRefine.results[0].status, 'similar_requires_decision');
  assert.strictEqual(pRefine.results[0].decision, 'SIMILAR_REQUIRES_USER_DECISION');
  console.log('✔ Refinement blocked from automatic creation: status = "similar_requires_decision".');

  // Verify only Solo Leveling exists in database
  const userMemsAfterRefine = await getMemories(TEST_USER);
  assert.strictEqual(userMemsAfterRefine.length, 1, 'Firestore must still only have 1 memory');
  assert.strictEqual(userMemsAfterRefine[0].value, 'Solo Leveling', 'Solo Leveling must NOT be overwritten');
  console.log('✔ Verified Solo Leveling was not overwritten or duplicated.');

  // 2. Independent favorite attempt: "Naruto" -> MUST save automatically!
  const narutoCandidates = extractWithRules('Mujhe Naruto bhi pasand hai.');
  const pNaruto = await persistMemoryCandidates(narutoCandidates, TEST_USER);
  assert.strictEqual(pNaruto.persistedCount, 1, 'Independent favorite Naruto must persist automatically');
  assert.strictEqual(pNaruto.results[0].status, 'created');
  console.log('✔ Independent favorite Naruto saved automatically to Cloud Firestore.');

  // 3. Explicit "New memory" refinement attempt -> MUST save because user gave explicit permission!
  const explicitRefine = extractWithRules('New memory mein save karo ki mujhe love story wale anime pasand hain.');
  const pExplicit = await persistMemoryCandidates(explicitRefine, TEST_USER);
  assert.strictEqual(pExplicit.persistedCount, 1, 'Explicit new memory refinement must persist');
  assert.strictEqual(pExplicit.results[0].status, 'created');
  console.log('✔ Explicit "New memory" refinement persisted with user authorization.');

  // 4. Clean up isolated test memories
  console.log('\nCleaning up isolated test memories...');
  const userMemsFinal = await getMemories(TEST_USER);
  for (const m of userMemsFinal) {
    await deleteMemory(TEST_USER, m.id);
  }
  const remaining = await getMemories(TEST_USER);
  assert.strictEqual(remaining.length, 0, 'Cleaned up isolated test memories');
  console.log('✔ Isolated test memories cleaned up.');

  console.log('\n======================================================');
  console.log('ALL STEP 2 PATCH TESTS (1 TO 9 + E2E) PASSED CLEANLY!');
  console.log('======================================================\n');
}

runStep2PatchTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
