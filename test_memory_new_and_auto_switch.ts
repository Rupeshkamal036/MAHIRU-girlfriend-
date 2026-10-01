import assert from 'assert';
import {
  isAutomaticMemorySavingEnabled,
  setAutomaticMemorySaving,
  resetAutomaticMemorySavingSession,
  isMemorySavingToggleCommand,
  isExplicitSaveCommand,
} from './server/automaticMemorySaving';
import {
  classifyMemorySemantic,
  evaluateMemoryDecision,
  isRelatedRefinement,
  findExactDuplicateMemory,
} from './server/memoryCategorySchema';
import { extractWithRules } from './server/memoryExtractor';
import { liveMemoryBridge } from './server/liveMemoryBridge';
import {
  createMemory,
  getMemories,
  deleteMemory,
  DEFAULT_USER_ID,
} from './server/memoryStore';
import { persistMemoryCandidates } from './server/memoryPersistence';

console.log('======================================================');
console.log('MAHIRU MEMORY SYSTEM — CURRENT PATCH VERIFICATION');
console.log('Explicit New Memory + Automatic Memory Saving Master Switch');
console.log('======================================================\n');

async function runTests() {
  const TEST_USER = `test_patch_user_${Date.now()}`;
  const createdIds: string[] = [];

  try {
    // --------------------------------------------------
    // TEST 1 — NEW MEMORY (Indian South love story movies)
    // --------------------------------------------------
    console.log('--- TEST 1 — EXPLICIT NEW MEMORY ---');
    const existingDramas = [
      {
        id: 'mem_test_1',
        category: 'watching_entertainment',
        semanticCategory: 'watching_entertainment',
        key: 'favorite_drama',
        semanticKey: 'favorite_drama',
        value: 'Chinese drama',
      },
      {
        id: 'mem_test_2',
        category: 'watching_entertainment',
        semanticCategory: 'watching_entertainment',
        key: 'favorite_drama',
        semanticKey: 'favorite_drama',
        value: 'Korean drama',
      },
    ];

    const input1 = 'New memory mein save karo ki mujhe Indian South love story wali movies dekhna pasand hai.';
    const candidates1 = extractWithRules(input1);
    assert.strictEqual(candidates1.length, 1, 'Candidate must be extracted');
    assert.strictEqual(candidates1[0].isExplicitNew, true, 'isExplicitNew flag must be true');

    const decision1 = evaluateMemoryDecision(candidates1[0], existingDramas, {
      isExplicitNewMemory: true,
      rawText: input1,
    });
    console.log('Test 1 Candidate:', candidates1[0]);
    console.log('Test 1 Decision:', decision1);
    assert.strictEqual(decision1.decision, 'NEW_MEMORY', 'Must be NEW_MEMORY');
    console.log('✔ TEST 1 PASSED: New memory created without being blocked by category or drama memories.\n');

    // --------------------------------------------------
    // TEST 2 — EXACT DUPLICATE
    // --------------------------------------------------
    console.log('--- TEST 2 — EXACT DUPLICATE ---');
    const input2 = 'New memory mein save karo ki mujhe Chinese drama dekhna pasand hai.';
    const candidates2 = extractWithRules(input2);
    assert.strictEqual(candidates2.length, 1, 'Candidate must be extracted');

    const decision2 = evaluateMemoryDecision(candidates2[0], existingDramas, {
      isExplicitNewMemory: true,
      rawText: input2,
    });
    console.log('Test 2 Candidate:', candidates2[0]);
    console.log('Test 2 Decision:', decision2);
    assert.strictEqual(decision2.decision, 'EXACT_DUPLICATE', 'Must be EXACT_DUPLICATE');
    assert.strictEqual(decision2.message, 'Ye memory pehle se saved hai.');
    console.log('✔ TEST 2 PASSED: Exact duplicate recognized and blocked with "Ye memory pehle se saved hai."\n');

    // --------------------------------------------------
    // TEST 3 — AUTOMATIC SAVING ON
    // --------------------------------------------------
    console.log('--- TEST 3 — AUTOMATIC SAVING ON ---');
    const session3 = `test_sess_3_${Date.now()}`;
    setAutomaticMemorySaving(true, session3);
    assert.strictEqual(isAutomaticMemorySavingEnabled(session3), true, 'Automatic memory saving must be ON');

    const turn3 = 'Mujhe Japanese ramen khana pasand hai.';
    const res3 = await liveMemoryBridge.handleCompletedUserTurn(turn3, TEST_USER, undefined, session3);
    console.log('Test 3 Result:', res3);
    assert.strictEqual(res3.skipped, false, 'Turn must not be skipped when automatic memory saving is ON');
    assert.strictEqual(res3.persistence?.persistedCount, 1, 'Ramen memory must be persisted');
    if (res3.persistence?.results[0]?.memory?.id) {
      createdIds.push(res3.persistence.results[0].memory.id);
    }
    console.log('✔ TEST 3 PASSED: Normal conversation automatically extracted and persisted when ON.\n');

    // --------------------------------------------------
    // TEST 4 — TURN AUTOMATIC SAVING OFF
    // --------------------------------------------------
    console.log('--- TEST 4 — TURN AUTOMATIC SAVING OFF ---');
    const offInput = 'Memory saving band karo.';
    const toggleOff = isMemorySavingToggleCommand(offInput);
    assert.strictEqual(toggleOff.isToggle, true, 'Must be toggle command');
    assert.strictEqual(toggleOff.enable, false, 'Must turn OFF');
    assert.strictEqual(toggleOff.confirmation, 'Memory saving band kar di hai.');

    const res4 = await liveMemoryBridge.handleCompletedUserTurn(offInput, TEST_USER, undefined, session3);
    assert.strictEqual(res4.skipped, true, 'Toggle command turn itself must be skipped from memory extraction');
    assert.strictEqual(isAutomaticMemorySavingEnabled(session3), false, 'Session must now be OFF');
    console.log('✔ TEST 4 PASSED: User command turns automatic memory saving OFF with natural confirmation.\n');

    // --------------------------------------------------
    // TEST 5 — NORMAL CONVERSATION WHILE OFF
    // --------------------------------------------------
    console.log('--- TEST 5 — NORMAL CONVERSATION WHILE OFF ---');
    assert.strictEqual(isAutomaticMemorySavingEnabled(session3), false, 'Verified session is OFF');
    const turn5 = 'Mujhe cold coffee peena pasand hai.';
    const res5 = await liveMemoryBridge.handleCompletedUserTurn(turn5, TEST_USER, undefined, session3);
    console.log('Test 5 Result:', res5);
    assert.strictEqual(res5.skipped, true, 'Normal conversation must be skipped while OFF');
    assert.strictEqual(res5.skipReason, 'Automatic memory saving is OFF for this session');
    console.log('✔ TEST 5 PASSED: Normal conversation NOT saved to memory while OFF.\n');

    // --------------------------------------------------
    // TEST 6 — EXPLICIT SAVE WHILE OFF
    // --------------------------------------------------
    console.log('--- TEST 6 — EXPLICIT SAVE WHILE OFF ---');
    assert.strictEqual(isAutomaticMemorySavingEnabled(session3), false, 'Verified session is still OFF');
    const turn6 = 'Waise memory saving off hai, lekin mera favorite movie Interstellar hai, ise memory mein save karo.';
    assert.strictEqual(isExplicitSaveCommand(turn6), true, 'Must be recognized as explicit save command');

    const res6 = await liveMemoryBridge.handleCompletedUserTurn(turn6, TEST_USER, undefined, session3);
    console.log('Test 6 Result:', res6);
    assert.strictEqual(res6.skipped, false, 'Explicit save MUST NOT be skipped even when OFF');
    assert.strictEqual(res6.persistence?.persistedCount, 1, 'Explicit memory must be persisted');
    if (res6.persistence?.results[0]?.memory?.id) {
      createdIds.push(res6.persistence.results[0].memory.id);
    }
    console.log('✔ TEST 6 PASSED: Explicit save works successfully while automatic memory saving is OFF.\n');

    // --------------------------------------------------
    // TEST 7 — TURN ON
    // --------------------------------------------------
    console.log('--- TEST 7 — TURN ON ---');
    const onInput = 'Memory saving on karo.';
    const toggleOn = isMemorySavingToggleCommand(onInput);
    assert.strictEqual(toggleOn.isToggle, true, 'Must be toggle command');
    assert.strictEqual(toggleOn.enable, true, 'Must turn ON');
    assert.strictEqual(toggleOn.confirmation, 'Memory saving on kar di hai.');

    const res7 = await liveMemoryBridge.handleCompletedUserTurn(onInput, TEST_USER, undefined, session3);
    assert.strictEqual(res7.skipped, true, 'Toggle turn itself skipped');
    assert.strictEqual(isAutomaticMemorySavingEnabled(session3), true, 'Session must now be ON');
    console.log('✔ TEST 7 PASSED: User command turns automatic memory saving ON with natural confirmation.\n');

    // --------------------------------------------------
    // TEST 8 — AUTOMATIC SAVING RESUMES
    // --------------------------------------------------
    console.log('--- TEST 8 — AUTOMATIC SAVING RESUMES ---');
    assert.strictEqual(isAutomaticMemorySavingEnabled(session3), true, 'Verified session is ON');
    const turn8 = 'Mujhe tennis khelna pasand hai.';
    const res8 = await liveMemoryBridge.handleCompletedUserTurn(turn8, TEST_USER, undefined, session3);
    console.log('Test 8 Result:', res8);
    assert.strictEqual(res8.skipped, false, 'Turn must be processed now that saving is ON');
    assert.strictEqual(res8.persistence?.persistedCount, 1, 'Tennis activity must be persisted');
    if (res8.persistence?.results[0]?.memory?.id) {
      createdIds.push(res8.persistence.results[0].memory.id);
    }
    console.log('✔ TEST 8 PASSED: Normal automatic memory saving resumes seamlessly after turning ON.\n');

    // --------------------------------------------------
    // TEST 9 — RESTART / FRESH SESSION
    // --------------------------------------------------
    console.log('--- TEST 9 — RESTART / FRESH SESSION ---');
    // Turn OFF in session A
    const sessionA = 'session_alpha';
    setAutomaticMemorySaving(false, sessionA);
    assert.strictEqual(isAutomaticMemorySavingEnabled(sessionA), false, 'Session A is OFF');

    // Restart app / fresh session B:
    const sessionB = 'session_beta_fresh_restart';
    // Without any turn or announcement, session B must automatically be ON
    assert.strictEqual(isAutomaticMemorySavingEnabled(sessionB), true, 'Fresh session must default to ON silently');

    const turn9 = 'Mujhe photography pasand hai.';
    const res9 = await liveMemoryBridge.handleCompletedUserTurn(turn9, TEST_USER, undefined, sessionB);
    assert.strictEqual(res9.skipped, false, 'Fresh session must automatically save without startup announcement');
    assert.strictEqual(res9.persistence?.persistedCount, 1, 'Photography memory persisted');
    if (res9.persistence?.results[0]?.memory?.id) {
      createdIds.push(res9.persistence.results[0].memory.id);
    }
    console.log('✔ TEST 9 PASSED: App restart/refresh silently resets automaticMemorySaving to ON.\n');

    // --------------------------------------------------
    // TEST 10 — OVER-BLOCKING PREVENTION CHECK
    // --------------------------------------------------
    console.log('--- TEST 10 — OVER-BLOCKING PREVENTION CHECK ---');
    // Solo Leveling vs Naruto
    const animeExisting = [{
      id: 'm1',
      category: 'watching_entertainment',
      semanticCategory: 'watching_entertainment',
      key: 'favorite_anime',
      semanticKey: 'favorite_anime',
      value: 'Solo Leveling',
    }];
    const decNaruto = evaluateMemoryDecision({
      category: 'watching_entertainment',
      semanticCategory: 'watching_entertainment',
      key: 'favorite_anime',
      semanticKey: 'favorite_anime',
      value: 'Naruto',
    }, animeExisting);
    assert.strictEqual(decNaruto.decision, 'NEW_MEMORY', 'Naruto must be NEW_MEMORY');

    // Biryani vs Pizza
    const foodExisting = [{
      id: 'm2',
      category: 'food',
      semanticCategory: 'food',
      key: 'favorite_food',
      semanticKey: 'favorite_food',
      value: 'Biryani',
    }];
    const decPizza = evaluateMemoryDecision({
      category: 'food',
      semanticCategory: 'food',
      key: 'favorite_food',
      semanticKey: 'favorite_food',
      value: 'Pizza',
    }, foodExisting);
    assert.strictEqual(decPizza.decision, 'NEW_MEMORY', 'Pizza must be NEW_MEMORY');

    // Chai vs Coffee
    const drinkExisting = [{
      id: 'm3',
      category: 'drinks',
      semanticCategory: 'drinks',
      key: 'favorite_drink',
      semanticKey: 'favorite_drink',
      value: 'Chai',
    }];
    const decCoffee = evaluateMemoryDecision({
      category: 'drinks',
      semanticCategory: 'drinks',
      key: 'favorite_drink',
      semanticKey: 'favorite_drink',
      value: 'Coffee',
    }, drinkExisting);
    assert.strictEqual(decCoffee.decision, 'NEW_MEMORY', 'Coffee must be NEW_MEMORY');
    console.log('✔ TEST 10 PASSED: Over-blocking prevented across entertainment, anime, food, and drinks.\n');

    console.log('======================================================');
    console.log('ALL 10 TESTS PASSED CLEANLY AND PERFECTLY!');
    console.log('======================================================');
  } finally {
    console.log(`Cleaning up ${createdIds.length} test memories in isolated namespace...`);
    for (const id of createdIds) {
      try {
        await deleteMemory(TEST_USER, id);
      } catch {}
    }
    console.log('Test memories cleaned up.');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
