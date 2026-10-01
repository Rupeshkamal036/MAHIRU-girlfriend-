import assert from 'assert';
import {
  MEMORY_CATEGORIES,
  classifyMemorySemantic,
  normalizeMemoryValueForDuplicate,
  normalizeSemanticKey,
  isExactDuplicateMemory,
  findExactDuplicateMemory,
} from './server/memoryCategorySchema';
import { extractWithRules } from './server/memoryExtractor';
import { createMemory, getMemories, deleteMemory } from './server/memoryStore';
import { persistMemoryCandidates } from './server/memoryPersistence';

// Isolated test user to never touch real user data
const TEST_USER = `test_step2_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function runStep2TestSuite() {
  console.log('======================================================');
  console.log('MAHIRU MEMORY SYSTEM — STEP 2 TEST SUITE');
  console.log('Exact Duplicate + Similar Memory + Creation Decision Logic');
  console.log('======================================================\n');

  // -------------------------------------------------------------------
  // TEST 1: Value Normalization for Exact Duplicates (Formatting Tolerance)
  // -------------------------------------------------------------------
  console.log('--- TEST 1: Formatting Tolerance Normalization ---');
  const variations = [
    'Solo Leveling',
    'solo leveling',
    'Solo Leveling.',
    ' Solo Leveling ',
    'Solo  Leveling',
    '"Solo Leveling"',
    "'Solo Leveling.'",
    '“Solo Leveling”',
  ];

  const normalizedResults = variations.map(normalizeMemoryValueForDuplicate);
  for (const n of normalizedResults) {
    assert.strictEqual(n, 'solo leveling', `Variation must normalize to 'solo leveling', got: ${n}`);
  }
  console.log('✔ All formatting variations cleanly normalized to "solo leveling" without aggressive fuzzy matching.');

  // Conservative check: meaningful distinctions are NOT collapsed
  assert.notStrictEqual(
    normalizeMemoryValueForDuplicate('Solo Leveling Season 2'),
    'solo leveling',
    'Distinct seasons must NOT collapse'
  );
  assert.notStrictEqual(
    normalizeMemoryValueForDuplicate('Solo Leveling Ragnarok'),
    'solo leveling',
    'Distinct titles must NOT collapse'
  );
  console.log('✔ Conservative normalization preserves distinct titles.');

  // -------------------------------------------------------------------
  // TEST 2: Exact Duplicate Rule (Category + Key + Value)
  // -------------------------------------------------------------------
  console.log('\n--- TEST 2: Exact Duplicate Rule ---');
  const existingRecord = {
    id: 'mem_existing_1',
    category: 'watching_entertainment',
    semanticCategory: 'watching_entertainment',
    key: 'favorite_anime',
    semanticKey: 'favorite_anime',
    value: 'Solo Leveling',
    content: 'Solo Leveling',
  };

  const exactCandidate1 = {
    category: 'watching_entertainment',
    semanticCategory: 'watching_entertainment',
    key: 'favorite_anime',
    semanticKey: 'favorite_anime',
    value: 'Solo Leveling',
  };
  assert.strictEqual(
    isExactDuplicateMemory(exactCandidate1, existingRecord),
    true,
    'Exact match must be true'
  );

  // Exact duplicate with harmless formatting difference
  const exactCandidateWithPunctuation = {
    category: 'watching_entertainment',
    key: 'favorite_anime',
    value: ' solo leveling. ',
  };
  assert.strictEqual(
    isExactDuplicateMemory(exactCandidateWithPunctuation, existingRecord),
    true,
    'Harmless formatting differences must be recognized as exact duplicate'
  );
  console.log('✔ Exact duplicate correctly detected across case, punctuation, and whitespace.');

  // -------------------------------------------------------------------
  // TEST 3: Explicit "New Memory" Command Does NOT Bypass Duplicate Protection
  // -------------------------------------------------------------------
  console.log('\n--- TEST 3: "New memory mein save karo" duplicate protection ---');
  const userTextWithCommand = 'New memory mein save karo: mujhe Solo Leveling pasand hai.';
  const extracted = extractWithRules(userTextWithCommand);
  assert(extracted.length >= 1, 'Must extract candidate even with command prefix');
  assert.strictEqual(extracted[0].category, 'watching_entertainment');
  assert.strictEqual(extracted[0].key, 'favorite_anime');
  assert(extracted[0].value.toLowerCase().includes('solo leveling'));
  console.log(`Extracted candidate: ${extracted[0].category}/${extracted[0].key} -> "${extracted[0].value}"`);

  // Candidate evaluated against existing memory
  assert.strictEqual(
    isExactDuplicateMemory(extracted[0], existingRecord),
    true,
    'Explicit new memory command candidate must be recognized as duplicate of existing memory'
  );
  console.log('✔ Explicit "New memory" command does NOT bypass duplicate detection.');

  // -------------------------------------------------------------------
  // TEST 4: Similar But Not Identical Memories (Additional items)
  // -------------------------------------------------------------------
  console.log('\n--- TEST 4: Similar but Not Identical Memories (Different Anime) ---');
  const candidateJujutsu = {
    category: 'watching_entertainment',
    key: 'favorite_anime',
    value: 'Jujutsu Kaisen',
  };
  const isDupJujutsu = isExactDuplicateMemory(candidateJujutsu, existingRecord);
  assert.strictEqual(isDupJujutsu, false, 'Jujutsu Kaisen is NOT a duplicate of Solo Leveling');

  const candidateAOT = {
    category: 'watching_entertainment',
    key: 'favorite_anime',
    value: 'Attack on Titan',
  };
  const isDupAOT = isExactDuplicateMemory(candidateAOT, existingRecord);
  assert.strictEqual(isDupAOT, false, 'Attack on Titan is NOT a duplicate of Solo Leveling');
  console.log('✔ Distinct anime correctly recognized as non-duplicates.');

  // -------------------------------------------------------------------
  // TEST 5: Full Firestore Persistence Lifecycle & Multi-Item Storage
  // -------------------------------------------------------------------
  console.log('\n--- TEST 5: Firestore Persistence Lifecycle in Test Namespace ---');
  // Step A: Save first memory "Solo Leveling"
  const c1 = extractWithRules('Mujhe Solo Leveling pasand hai.');
  const p1 = await persistMemoryCandidates(c1, TEST_USER);
  assert.strictEqual(p1.persistedCount, 1, 'First memory must persist');
  assert.strictEqual(p1.duplicateCount, 0, 'No duplicates yet');
  console.log('✔ First memory "Solo Leveling" saved to Firestore.');

  // Step B: User repeats identical memory -> DO NOT create, respond "Ye memory pehle se saved hai."
  const c2 = extractWithRules('Mujhe Solo Leveling pasand hai.');
  const p2 = await persistMemoryCandidates(c2, TEST_USER);
  assert.strictEqual(p2.persistedCount, 0, 'Must NOT create duplicate');
  assert.strictEqual(p2.duplicateCount, 1, 'Must detect 1 duplicate');
  assert.strictEqual(p2.results[0].status, 'duplicate');
  assert.strictEqual(p2.results[0].message, 'Ye memory pehle se saved hai.');
  console.log(`✔ Repeated memory blocked. Status: ${p2.results[0].status}, Message: "${p2.results[0].message}"`);

  // Step C: User says "New memory mein save karo: mujhe Solo Leveling pasand hai." -> STILL DUPLICATE!
  const c3 = extractWithRules('New memory mein save karo: mujhe Solo Leveling pasand hai.');
  const p3 = await persistMemoryCandidates(c3, TEST_USER);
  assert.strictEqual(p3.persistedCount, 0, 'Must NOT create duplicate even with "New memory" command');
  assert.strictEqual(p3.duplicateCount, 1, 'Must detect duplicate');
  assert.strictEqual(p3.results[0].status, 'duplicate');
  assert.strictEqual(p3.results[0].message, 'Ye memory pehle se saved hai.');
  console.log('✔ "New memory" explicit directive blocked from creating duplicate.');

  // Step D: User mentions a DIFFERENT anime: "Mujhe Jujutsu Kaisen bhi pasand hai." -> CREATE AS NEW MEMORY
  const c4 = extractWithRules('Mujhe Jujutsu Kaisen anime pasand hai.');
  const p4 = await persistMemoryCandidates(c4, TEST_USER);
  assert.strictEqual(p4.persistedCount, 1, 'Must persist distinct anime as new memory');
  assert.strictEqual(p4.duplicateCount, 0, 'Must not be marked duplicate');
  console.log('✔ Distinct anime "Jujutsu Kaisen" persisted as separate memory.');

  // Step E: Verify both memories exist side by side without overwriting
  const allMemories = await getMemories(TEST_USER);
  const animeMemories = allMemories.filter(
    (m) => m.category === 'watching_entertainment' && m.semanticKey === 'favorite_anime'
  );
  assert.strictEqual(animeMemories.length, 2, 'Must have exactly 2 distinct anime memories stored');
  const values = animeMemories.map((m) => m.value.toLowerCase());
  assert(values.some((v) => v.includes('solo leveling')), 'Solo Leveling must remain stored');
  assert(values.some((v) => v.includes('jujutsu kaisen')), 'Jujutsu Kaisen must remain stored');
  console.log(`✔ Both memories preserved in Firestore: [${values.join(', ')}]`);

  // Step F: Compound statement with 1 existing duplicate + 1 new anime
  // "Mujhe Solo Leveling aur Attack on Titan pasand hai."
  console.log('\n--- TEST 5F: Compound Statement (1 Duplicate + 1 New) ---');
  const cCompound = extractWithRules('Mujhe Solo Leveling aur Attack on Titan pasand hai.');
  assert.strictEqual(cCompound.length, 2, 'Must extract 2 candidates');
  const pCompound = await persistMemoryCandidates(cCompound, TEST_USER);
  assert.strictEqual(pCompound.duplicateCount, 1, 'Solo Leveling must be caught as duplicate');
  assert.strictEqual(pCompound.persistedCount, 1, 'Attack on Titan must be created');
  console.log('✔ Compound input handled correctly: 1 duplicate skipped, 1 new persisted.');

  // Verify total now 3
  const finalMemories = await getMemories(TEST_USER);
  const finalAnime = finalMemories.filter(
    (m) => m.category === 'watching_entertainment' && m.semanticKey === 'favorite_anime'
  );
  assert.strictEqual(finalAnime.length, 3, 'Must have 3 distinct anime stored');

  // Clean up isolated test memories
  console.log('\nCleaning up isolated test memories...');
  for (const m of finalMemories) {
    await deleteMemory(TEST_USER, m.id);
  }
  const remaining = await getMemories(TEST_USER);
  assert.strictEqual(remaining.length, 0, 'Isolated test memories cleaned up');
  console.log('✔ Cleaned up test namespace.');

  console.log('\n======================================================');
  console.log('ALL STEP 2 EXACT DUPLICATE & CREATION TESTS PASSED!');
  console.log('======================================================\n');
}

runStep2TestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
