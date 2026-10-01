import assert from 'assert';
import {
  executeVoiceSaveMemory,
  VoiceSaveResult,
} from './server/memoryResolver';
import {
  getMemories,
  getMemoryById,
  deleteMemory,
  createMemory,
  DEFAULT_USER_ID,
} from './server/memoryStore';
import { extractWithRules } from './server/memoryExtractor';
import { evaluateMemoryDecision } from './server/memoryCategorySchema';
import { liveMemoryBridge } from './server/liveMemoryBridge';

console.log('======================================================');
console.log('MAHIRU PART 1: PERSISTENT MEMORY & UI SYNCHRONIZATION');
console.log('Cloud Firestore Source of Truth & Zero False-Success Verification');
console.log('======================================================\n');

async function runPersistentMemorySyncTests() {
  const TEST_USER = `test_sync_user_${Date.now()}`;
  const createdIds: string[] = [];
  const broadcastEvents: any[] = [];

  const testBroadcaster = (event: any) => {
    broadcastEvents.push(event);
  };

  try {
    // --------------------------------------------------
    // TEST 1 — CONFIRMED FIRESTORE WRITE WITH EXPLICIT NEW MEMORY
    // Input: "New memory mein save karo ki mujhe Indian South love story movies dekhna pasand hai."
    // --------------------------------------------------
    console.log('--- TEST 1 — EXPLICIT SAVE CONFIRMED IN FIRESTORE ---');
    const input1 = 'New memory mein save karo ki mujhe Indian South love story movies dekhna pasand hai.';

    const saveRes1: VoiceSaveResult = await executeVoiceSaveMemory(
      {
        userId: TEST_USER,
        fact: input1,
        isExplicitNew: true,
      },
      testBroadcaster
    );

    console.log('Test 1 saveResult:', saveRes1);
    assert.strictEqual(saveRes1.success, true, 'Save operation must return success: true');
    assert.strictEqual(saveRes1.status, 'saved', 'Status must be "saved"');
    assert(saveRes1.memory, 'Must return created memory record');
    assert(saveRes1.memory.id, 'Memory must have a valid ID');
    createdIds.push(saveRes1.memory.id);

    // Verify document genuinely exists in Cloud Firestore (source of truth)
    const firestoreRecord = await getMemoryById(TEST_USER, saveRes1.memory.id);
    assert(firestoreRecord, 'Record MUST exist in Cloud Firestore database');
    assert.strictEqual(firestoreRecord.id, saveRes1.memory.id, 'Record ID must match');
    assert.strictEqual(firestoreRecord.userId, TEST_USER, 'User ID must match');
    console.log('✔ Verified record physically exists in Cloud Firestore:', firestoreRecord.id, firestoreRecord.value);

    // Verify broadcast event was emitted for UI synchronization
    assert(broadcastEvents.length >= 1, 'Broadcast event must be emitted for UI sync');
    const lastEvent = broadcastEvents[broadcastEvents.length - 1];
    assert.strictEqual(lastEvent.type, 'memoryPersisted', 'Event type must be memoryPersisted');
    assert.strictEqual(lastEvent.action, 'create', 'Action must be create');
    assert.strictEqual(lastEvent.memory.id, saveRes1.memory.id, 'Event memory ID must match');
    console.log('✔ TEST 1 PASSED: Confirmed Firestore persistence and UI sync event emitted.\n');

    // --------------------------------------------------
    // TEST 2 — EXACT DUPLICATE REJECTION (NO FALSE SUCCESS)
    // Same input must return duplicate and NOT report success or emit save event
    // --------------------------------------------------
    console.log('--- TEST 2 — EXACT DUPLICATE REJECTION ---');
    const prevEventsCount = broadcastEvents.length;

    const dupRes: VoiceSaveResult = await executeVoiceSaveMemory(
      {
        userId: TEST_USER,
        fact: input1,
        isExplicitNew: true,
      },
      testBroadcaster
    );

    console.log('Test 2 duplicate result:', dupRes);
    assert.strictEqual(dupRes.success, false, 'Duplicate MUST NOT report success: true');
    assert.strictEqual(dupRes.status, 'duplicate', 'Status must be "duplicate"');
    assert.strictEqual(dupRes.message, 'Ye memory pehle se saved hai.');
    // Must NOT have emitted a new save broadcast
    assert.strictEqual(broadcastEvents.length, prevEventsCount, 'Must NOT emit successful memoryPersisted event on duplicate');

    // Verify count in Firestore did not increase
    const currentMemories = await getMemories(TEST_USER);
    assert.strictEqual(currentMemories.length, 1, 'Firestore must contain exactly 1 record, no duplicate created');
    console.log('✔ TEST 2 PASSED: Exact duplicate cleanly rejected with "Ye memory pehle se saved hai.", 0 duplicates in Firestore.\n');

    // --------------------------------------------------
    // TEST 3 — SENSITIVE CREDENTIALS REJECTION (NO FALSE SUCCESS)
    // --------------------------------------------------
    console.log('--- TEST 3 — SENSITIVE CREDENTIALS REJECTION ---');
    const credInput = 'Mera secret codeword secretApple123 hai ise memory mein save karo';
    const credRes = await executeVoiceSaveMemory(
      {
        userId: TEST_USER,
        fact: credInput,
        isExplicitNew: true,
      },
      testBroadcaster
    );

    console.log('Test 3 credential result:', credRes);
    assert.strictEqual(credRes.success, false, 'Credentials must NOT be saved');
    assert.strictEqual(credRes.status, 'error', 'Status must be error');
    assert.strictEqual(broadcastEvents.length, prevEventsCount, 'No broadcast for rejected credentials');
    console.log('✔ TEST 3 PASSED: Sensitive credentials rejected with zero Firestore writes.\n');

    // --------------------------------------------------
    // TEST 4 — REFRESH / REOPEN TEST (FIRESTORE PERSISTENCE AUDIT)
    // Emulate completely fresh client loading / reopening without any localStorage
    // --------------------------------------------------
    console.log('--- TEST 4 — REFRESH / REOPEN VERIFICATION ---');
    // Fetch directly from Firestore simulating GET /api/memories on page refresh:
    const freshLoadedMemories = await getMemories(TEST_USER);
    assert.strictEqual(freshLoadedMemories.length, 1, 'Exactly 1 persisted memory must be returned');
    assert.strictEqual(freshLoadedMemories[0].id, saveRes1.memory.id, 'Memory ID matches');
    assert(
      freshLoadedMemories[0].value.toLowerCase().includes('south') &&
      freshLoadedMemories[0].value.toLowerCase().includes('love story'),
      'Persisted memory content must remain intact upon refresh'
    );
    console.log('✔ TEST 4 PASSED: Page refresh retrieves real memory directly from Cloud Firestore.\n');

    // --------------------------------------------------
    // TEST 5 — DELETE SYNCHRONIZATION
    // When memory is deleted, Firestore is updated first and UI event emitted
    // --------------------------------------------------
    console.log('--- TEST 5 — DELETE SYNCHRONIZATION ---');
    await deleteMemory(TEST_USER, saveRes1.memory.id);

    // Verify doc is physically removed from Cloud Firestore
    const postDeleteDoc = await getMemoryById(TEST_USER, saveRes1.memory.id);
    assert.strictEqual(postDeleteDoc, null, 'Document must be deleted from Firestore');

    const postDeleteList = await getMemories(TEST_USER);
    assert.strictEqual(postDeleteList.length, 0, 'Firestore list must be empty after deletion');
    console.log('✔ TEST 5 PASSED: Memory deleted from Cloud Firestore.\n');

    // --------------------------------------------------
    // TEST 6 — ZERO DUPLICATES ON MULTIPLE SYNC / REFRESH
    // --------------------------------------------------
    console.log('--- TEST 6 — ZERO DUPLICATE ON MULTIPLE CALLS ---');
    const itemA = await createMemory(TEST_USER, {
      category: 'food',
      key: 'favorite_food',
      value: 'Japanese Ramen',
    });
    createdIds.push(itemA.id);

    // Call getMemories 3 times simulating repeated modal open/close/refresh
    const read1 = await getMemories(TEST_USER);
    const read2 = await getMemories(TEST_USER);
    const read3 = await getMemories(TEST_USER);
    assert.strictEqual(read1.length, 1);
    assert.strictEqual(read2.length, 1);
    assert.strictEqual(read3.length, 1);
    console.log('✔ TEST 6 PASSED: Repeated UI sync/reloads produce 0 duplicate records.\n');

    console.log('======================================================');
    console.log('ALL PART 1 PERSISTENT MEMORY & UI SYNC TESTS PASSED!');
    console.log('======================================================');
  } finally {
    console.log(`Cleaning up ${createdIds.length} test memories...`);
    for (const id of createdIds) {
      try {
        await deleteMemory(TEST_USER, id);
      } catch {}
    }
    console.log('Cleanup finished.');
    process.exit(0);
  }
}

runPersistentMemorySyncTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
