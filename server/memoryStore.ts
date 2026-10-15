import { getAdminFirestore } from './firebaseAdmin';
import type { MemoryRecord } from '../src/types';

export const DEFAULT_USER_ID = 'default_user';

// Local memory store cache for tests and fallback
const inMemoryStore = new Map<string, Map<string, MemoryRecord>>();

function getUserStore(userId: string): Map<string, MemoryRecord> {
  const uid = userId || DEFAULT_USER_ID;
  if (!inMemoryStore.has(uid)) {
    inMemoryStore.set(uid, new Map<string, MemoryRecord>());
  }
  return inMemoryStore.get(uid)!;
}

export function resolveUserIdFromRequest(req: any): string {
  const uidHeader = req.headers?.['x-user-id'] || req.headers?.['user-id'];
  if (uidHeader && typeof uidHeader === 'string' && uidHeader.trim()) {
    return uidHeader.trim();
  }
  return DEFAULT_USER_ID;
}

export async function getMemories(userId: string = DEFAULT_USER_ID): Promise<MemoryRecord[]> {
  const uid = userId || DEFAULT_USER_ID;
  const db = getAdminFirestore();

  if (db) {
    try {
      const snap = await db
        .collection('mahiru_memories')
        .where('userId', '==', uid)
        .get();

      const memories: MemoryRecord[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        memories.push({
          id: doc.id,
          memoryId: doc.id,
          userId: data.userId || uid,
          category: data.category || 'important_facts',
          semanticCategory: data.semanticCategory || data.category,
          key: data.key || 'fact',
          semanticKey: data.semanticKey || data.key,
          value: data.value || data.content || '',
          content: data.content || data.value || '',
          priority: data.priority || 'HIGH',
          importance: data.importance || 'HIGH',
          retention: data.retention || 'PERMANENT',
          source: data.source || 'CONVERSATION',
          lastRecalled: data.lastRecalled || 'Recently',
          isPermanent: data.isPermanent !== false,
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
        });
      });

      // Keep in-memory cache synchronized
      const memMap = getUserStore(uid);
      memMap.clear();
      for (const m of memories) {
        memMap.set(m.id, m);
      }

      return memories;
    } catch (err) {
      console.warn('[MemoryStore] Firestore read error, returning memory cache:', err);
    }
  }

  // Fallback to local cache
  const memMap = getUserStore(uid);
  return Array.from(memMap.values());
}

export async function createMemory(
  recordOrUserId: any,
  dataIfSeparate?: any
): Promise<MemoryRecord> {
  const db = getAdminFirestore();
  let record: any = {};

  if (typeof recordOrUserId === 'string' && dataIfSeparate) {
    record = { ...dataIfSeparate, userId: recordOrUserId };
  } else {
    record = { ...recordOrUserId };
  }

  const uid = record.userId || DEFAULT_USER_ID;
  const memoryId =
    record.id ||
    record.memoryId ||
    `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const now = Date.now();
  const fullRecord: MemoryRecord = {
    id: memoryId,
    memoryId,
    userId: uid,
    category: record.category || 'important_facts',
    semanticCategory: record.semanticCategory || record.category || 'important_facts',
    key: record.key || record.semanticKey || 'fact',
    semanticKey: record.semanticKey || record.key || 'fact',
    value: record.value || record.content || '',
    content: record.content || record.value || '',
    priority: record.priority || 'HIGH',
    importance: record.importance || 'HIGH',
    retention: record.retention || 'PERMANENT',
    source: record.source || 'CONVERSATION',
    lastRecalled: record.lastRecalled || 'Just now',
    isPermanent: record.isPermanent !== false,
    createdAt: record.createdAt || now,
    updatedAt: now,
  };

  // Always update in-memory cache
  getUserStore(uid).set(memoryId, fullRecord);

  if (db) {
    try {
      await db.collection('mahiru_memories').doc(memoryId).set(fullRecord);
    } catch (err) {
      console.warn('[MemoryStore] Firestore write notice, cached locally:', err);
    }
  }

  return fullRecord;
}

export async function updateMemory(
  userIdOrId: string,
  memoryIdOrData: any,
  dataIfThreeArgs?: any
): Promise<MemoryRecord | null> {
  let uid = DEFAULT_USER_ID;
  let memId = '';
  let updates: any = {};

  if (dataIfThreeArgs) {
    uid = userIdOrId;
    memId = memoryIdOrData;
    updates = dataIfThreeArgs;
  } else {
    memId = userIdOrId;
    updates = memoryIdOrData;
    uid = updates.userId || DEFAULT_USER_ID;
  }

  const existing = getUserStore(uid).get(memId);
  const now = Date.now();

  const updated: MemoryRecord = {
    ...(existing || {
      id: memId,
      memoryId: memId,
      userId: uid,
      category: 'important_facts',
      key: 'fact',
      value: '',
      createdAt: now,
    }),
    ...updates,
    id: memId,
    memoryId: memId,
    updatedAt: now,
  };

  getUserStore(uid).set(memId, updated);

  const db = getAdminFirestore();
  if (db) {
    try {
      await db.collection('mahiru_memories').doc(memId).set(updated, { merge: true });
    } catch (err) {
      console.warn('[MemoryStore] Firestore update notice, cached locally:', err);
    }
  }

  return updated;
}

export async function deleteMemory(
  userIdOrId: string,
  idIfSeparate?: string
): Promise<boolean> {
  let uid = DEFAULT_USER_ID;
  let memId = '';

  if (idIfSeparate) {
    uid = userIdOrId;
    memId = idIfSeparate;
  } else {
    memId = userIdOrId;
  }

  getUserStore(uid).delete(memId);

  const db = getAdminFirestore();
  if (db) {
    try {
      await db.collection('mahiru_memories').doc(memId).delete();
      return true;
    } catch (err) {
      console.warn('[MemoryStore] Firestore delete notice, removed locally:', err);
    }
  }

  return true;
}

export function getMemoryStoreHealth(): {
  status: string;
  backend: string;
  cachedUsers: number;
} {
  return {
    status: 'healthy',
    backend: getAdminFirestore() ? 'cloud_firestore' : 'in_memory_cache',
    cachedUsers: inMemoryStore.size,
  };
}
