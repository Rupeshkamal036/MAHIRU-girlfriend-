import assert from 'assert';
import {
  MEMORY_CATEGORIES,
  classifyMemorySemantic,
  splitCompoundFacts,
  cleanEntityValue,
  isSemanticCategory,
  normalizeToSemanticCategory,
} from './server/memoryCategorySchema';
import { extractWithRules, extractMemoryCandidates } from './server/memoryExtractor';
import { createMemory, getMemories, deleteMemory } from './server/memoryStore';
import { persistMemoryCandidates } from './server/memoryPersistence';

// Isolated test user so real memories are NEVER touched
const TEST_USER = `test_cat_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function runStep1CategoryTestSuite() {
  console.log('======================================================');
  console.log('MAHIRU MEMORY SYSTEM — STEP 1 TEST SUITE');
  console.log('Category + Schema Foundation Tests');
  console.log('======================================================\n');

  // Verify that all 17 categories are defined
  assert.strictEqual(MEMORY_CATEGORIES.length, 17, 'Must have exactly 17 semantic categories');
  assert(MEMORY_CATEGORIES.includes('personal_profile'));
  assert(MEMORY_CATEGORIES.includes('interests'));
  assert(MEMORY_CATEGORIES.includes('watching_entertainment'));
  assert(MEMORY_CATEGORIES.includes('gaming'));
  assert(MEMORY_CATEGORIES.includes('food'));
  assert(MEMORY_CATEGORIES.includes('drinks'));
  assert(MEMORY_CATEGORIES.includes('activities'));
  assert(MEMORY_CATEGORIES.includes('learning'));
  assert(MEMORY_CATEGORIES.includes('travel'));
  assert(MEMORY_CATEGORIES.includes('music'));
  assert(MEMORY_CATEGORIES.includes('technology'));
  assert(MEMORY_CATEGORIES.includes('goals_and_projects'));
  assert(MEMORY_CATEGORIES.includes('relationships'));
  assert(MEMORY_CATEGORIES.includes('communication_style'));
  assert(MEMORY_CATEGORIES.includes('lifestyle_and_routines'));
  assert(MEMORY_CATEGORIES.includes('important_facts'));
  assert(MEMORY_CATEGORIES.includes('favorites'));
  console.log('✔ Verified all 17 semantic categories exist in schema.');

  // TEST 1: "Mujhe Solo Leveling pasand hai." -> watching_entertainment / favorite_anime
  console.log('\n--- TEST 1: "Mujhe Solo Leveling pasand hai." ---');
  const t1 = extractWithRules('Mujhe Solo Leveling pasand hai.');
  assert(t1.length >= 1, 'Test 1: Must extract candidate');
  assert.strictEqual(t1[0].category, 'watching_entertainment', 'Category must be watching_entertainment');
  assert.strictEqual(t1[0].key, 'favorite_anime', 'Semantic key must be favorite_anime');
  assert(t1[0].value.toLowerCase().includes('solo leveling'), 'Value must be Solo Leveling');
  console.log(`✔ TEST 1 PASSED: ${t1[0].category} / ${t1[0].key} -> "${t1[0].value}"`);

  // TEST 2: "Mujhe biryani pasand hai." -> food / favorite_food
  console.log('\n--- TEST 2: "Mujhe biryani pasand hai." ---');
  const t2 = extractWithRules('Mujhe biryani pasand hai.');
  assert(t2.length >= 1, 'Test 2: Must extract candidate');
  assert.strictEqual(t2[0].category, 'food', 'Category must be food');
  assert.strictEqual(t2[0].key, 'favorite_food', 'Semantic key must be favorite_food');
  assert(t2[0].value.toLowerCase().includes('biryani'), 'Value must be biryani');
  console.log(`✔ TEST 2 PASSED: ${t2[0].category} / ${t2[0].key} -> "${t2[0].value}"`);

  // TEST 3: "Mujhe chai pasand hai." -> drinks / favorite_drink
  console.log('\n--- TEST 3: "Mujhe chai pasand hai." ---');
  const t3 = extractWithRules('Mujhe chai pasand hai.');
  assert(t3.length >= 1, 'Test 3: Must extract candidate');
  assert.strictEqual(t3[0].category, 'drinks', 'Category must be drinks');
  assert.strictEqual(t3[0].key, 'favorite_drink', 'Semantic key must be favorite_drink');
  assert(t3[0].value.toLowerCase().includes('chai'), 'Value must be chai');
  console.log(`✔ TEST 3 PASSED: ${t3[0].category} / ${t3[0].key} -> "${t3[0].value}"`);

  // TEST 4: "Mujhe BGMI khelna pasand hai." -> gaming / favorite_game
  console.log('\n--- TEST 4: "Mujhe BGMI khelna pasand hai." ---');
  const t4 = extractWithRules('Mujhe BGMI khelna pasand hai.');
  assert(t4.length >= 1, 'Test 4: Must extract candidate');
  assert.strictEqual(t4[0].category, 'gaming', 'Category must be gaming');
  assert.strictEqual(t4[0].key, 'favorite_game', 'Semantic key must be favorite_game');
  assert(t4[0].value.toLowerCase().includes('bgmi'), 'Value must be BGMI');
  console.log(`✔ TEST 4 PASSED: ${t4[0].category} / ${t4[0].key} -> "${t4[0].value}"`);

  // TEST 5: "Mujhe trading seekhna pasand hai." -> learning / learning_interest
  console.log('\n--- TEST 5: "Mujhe trading seekhna pasand hai." ---');
  const t5 = extractWithRules('Mujhe trading seekhna pasand hai.');
  assert(t5.length >= 1, 'Test 5: Must extract candidate');
  assert.strictEqual(t5[0].category, 'learning', 'Category must be learning');
  assert.strictEqual(t5[0].key, 'learning_interest', 'Semantic key must be learning_interest');
  assert(t5[0].value.toLowerCase().includes('trading'), 'Value must be trading');
  console.log(`✔ TEST 5 PASSED: ${t5[0].category} / ${t5[0].key} -> "${t5[0].value}"`);

  // TEST 6: "Mujhe Ladakh ghoomna hai." -> travel / travel_destination
  console.log('\n--- TEST 6: "Mujhe Ladakh ghoomna hai." ---');
  const t6 = extractWithRules('Mujhe Ladakh ghoomna hai.');
  assert(t6.length >= 1, 'Test 6: Must extract candidate');
  assert.strictEqual(t6[0].category, 'travel', 'Category must be travel');
  assert.strictEqual(t6[0].key, 'travel_destination', 'Semantic key must be travel_destination');
  assert(t6[0].value.toLowerCase().includes('ladakh'), 'Value must be Ladakh');
  console.log(`✔ TEST 6 PASSED: ${t6[0].category} / ${t6[0].key} -> "${t6[0].value}"`);

  // TEST 7: "Mujhe anime, biryani aur chai pasand hai." -> three separate memory candidates
  console.log('\n--- TEST 7: "Mujhe anime, biryani aur chai pasand hai." ---');
  const t7 = extractWithRules('Mujhe anime, biryani aur chai pasand hai.');
  assert.strictEqual(t7.length, 3, 'Must extract exactly 3 separate candidates');

  const animeCand = t7.find((c) => c.category === 'watching_entertainment');
  assert(animeCand, 'Must have watching_entertainment candidate');
  assert.strictEqual(animeCand.key, 'favorite_anime', 'Key must be favorite_anime');

  const foodCand = t7.find((c) => c.category === 'food');
  assert(foodCand, 'Must have food candidate');
  assert.strictEqual(foodCand.key, 'favorite_food', 'Key must be favorite_food');

  const drinkCand = t7.find((c) => c.category === 'drinks');
  assert(drinkCand, 'Must have drinks candidate');
  assert.strictEqual(drinkCand.key, 'favorite_drink', 'Key must be favorite_drink');
  console.log('✔ TEST 7 PASSED: 3 separate distinct candidates extracted correctly:');
  console.log(`  1. ${animeCand.category}/${animeCand.key}: ${animeCand.value}`);
  console.log(`  2. ${foodCand.category}/${foodCand.key}: ${foodCand.value}`);
  console.log(`  3. ${drinkCand.category}/${drinkCand.key}: ${drinkCand.value}`);

  // TEST 7B: Multiple values of SAME category must remain separate
  console.log('\n--- TEST 7B: Multiple anime in one statement -> Separate records ---');
  const t7b = extractWithRules('Mujhe Solo Leveling, One Punch Man aur Naruto pasand hain.');
  assert.strictEqual(t7b.length, 3, 'Must extract 3 separate anime records');
  assert(t7b.every((c) => c.category === 'watching_entertainment'));
  assert(t7b.every((c) => c.key === 'favorite_anime'));
  assert(t7b.some((c) => c.value.toLowerCase().includes('solo leveling')));
  assert(t7b.some((c) => c.value.toLowerCase().includes('one punch man')));
  assert(t7b.some((c) => c.value.toLowerCase().includes('naruto')));
  console.log('✔ TEST 7B PASSED: Multiple anime values remain completely separate.');

  // TEST 8: Existing old-category memory recognized and semantically classified without changing actual info
  console.log('\n--- TEST 8: Existing old-category memory reclassification ---');
  const legacyRecord1 = {
    content: 'Solo Leveling is a favorite',
    key: 'favorite_anime',
    category: 'PREFERENCES',
  };
  const classified1 = classifyMemorySemantic(legacyRecord1);
  assert.strictEqual(classified1.category, 'watching_entertainment', 'Legacy anime preference must map to watching_entertainment');
  assert.strictEqual(classified1.semanticKey, 'favorite_anime', 'Key must be favorite_anime');
  assert(classified1.normalizedValue.toLowerCase().includes('solo leveling'), 'Value must be preserved');
  console.log(`✔ TEST 8A PASSED: "Solo Leveling is a favorite" [PREFERENCES] -> [${classified1.category}] key=${classified1.semanticKey}`);

  const legacyRecord2 = {
    content: 'chicken biryani',
    key: 'favorite_food',
    category: 'PREFERENCES',
  };
  const classified2 = classifyMemorySemantic(legacyRecord2);
  assert.strictEqual(classified2.category, 'food');
  assert.strictEqual(classified2.semanticKey, 'favorite_food');
  assert.strictEqual(classified2.normalizedValue, 'chicken biryani');
  console.log(`✔ TEST 8B PASSED: "chicken biryani" [PREFERENCES] -> [${classified2.category}] key=${classified2.semanticKey}`);

  const legacyRecord3 = {
    content: 'Rupesh',
    key: 'user_name',
    category: 'USER_PROFILE',
  };
  const classified3 = classifyMemorySemantic(legacyRecord3);
  assert.strictEqual(classified3.category, 'personal_profile');
  assert.strictEqual(classified3.semanticKey, 'user_name');
  assert.strictEqual(classified3.normalizedValue, 'Rupesh');
  console.log(`✔ TEST 8C PASSED: "Rupesh" [USER_PROFILE] -> [${classified3.category}] key=${classified3.semanticKey}`);

  // TEST 9: Persistence in Cloud Firestore with new schema (in isolated test namespace)
  console.log('\n--- TEST 9: Firestore Persistence with new category schema ---');
  const persistRes = await persistMemoryCandidates(t7, TEST_USER);
  assert.strictEqual(persistRes.persistedCount, 3, 'Must persist all 3 candidates to Firestore');
  
  const fetchedMemories = await getMemories(TEST_USER);
  assert.strictEqual(fetchedMemories.length, 3, 'Must fetch 3 memories from Firestore');
  
  const fAnime = fetchedMemories.find((m) => m.category === 'watching_entertainment');
  assert(fAnime, 'Fetched memory must have category watching_entertainment');
  assert.strictEqual(fAnime.semanticKey, 'favorite_anime');
  
  const fFood = fetchedMemories.find((m) => m.category === 'food');
  assert(fFood, 'Fetched memory must have category food');
  assert.strictEqual(fFood.semanticKey, 'favorite_food');
  
  const fDrink = fetchedMemories.find((m) => m.category === 'drinks');
  assert(fDrink, 'Fetched memory must have category drinks');
  assert.strictEqual(fDrink.semanticKey, 'favorite_drink');
  console.log('✔ TEST 9 PASSED: Firestore successfully saved and loaded records with new category & semanticKey schema.');

  // Clean up isolated test memories
  console.log('\nCleaning up isolated test memories in test namespace...');
  for (const m of fetchedMemories) {
    await deleteMemory(TEST_USER, m.id);
  }
  const remaining = await getMemories(TEST_USER);
  assert.strictEqual(remaining.length, 0, 'Cleaned up isolated test memories');
  console.log('✔ Test namespace cleaned up successfully.');

  console.log('\n======================================================');
  console.log('ALL STEP 1 MEMORY TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runStep1CategoryTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
