import fs from 'fs';
import path from 'path';
import {
  getFirestoreDb,
  FieldValue,
  TARGET_FIRESTORE_DATABASE_ID,
  TARGET_FIREBASE_PROJECT_ID,
  getFirestoreInitError,
} from './firebaseAdmin';
import type { DocumentSnapshot, Query } from 'firebase-admin/firestore';
import type { MemoryCategory, MemoryPriority, MemoryRecord } from '../src/types';

/**
 * Dedicated Firestore collection for Mahiru permanent memories.
 */
export const MAHIRU_MEMORIES_COLLECTION = 'mahiru_memories';

/**
 * Default isolated user identifier used when explicit authentication is not yet active.
 */
export const DEFAULT_USER_ID = process.env.DEV_USER_ID || 'rupesh-dev';

/**
 * Local durable persistence path for resilient operation across dev/cloud container environments.
 */
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'mahiru_memories.json');

/**
 * Custom error class for clean, sanitized memory persistence errors.
 */
export class MemoryStoreError extends Error {
  public code: string;
  public statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = 'MemoryStoreError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * State tracker for Firestore connectivity status.
 */
let firestorePermissionDeniedNoticeLogged = false;
let isFirestoreOperational = true;

/**
 * Initial seed memories when starting with a fresh local store.
 */
const SEED_MEMORIES: MemoryRecord[] = [
  {
    id: 'mem_init_user',
    memoryId: 'mem_init_user',
    userId: DEFAULT_USER_ID,
    category: 'USER PROFILE',
    key: 'User Identity',
    value: 'User is Rupesh, whom Mahiru speaks with warmly, lovingly, and respectfully.',
    content: 'User is Rupesh, whom Mahiru speaks with warmly, lovingly, and respectfully.',
    priority: 'HIGH',
    importance: 'HIGH',
    retention: 'PERMANENT',
    source: 'SYSTEM INITIALIZATION',
    lastRecalled: 'Just now',
    isPermanent: true,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: 'mem_init_tone',
    memoryId: 'mem_init_tone',
    userId: DEFAULT_USER_ID,
    category: 'PREFERENCES',
    key: 'Tone & Languages',
    value: 'Speaks cute Hindi, Hinglish, and English with sweet, affectionate girlfriend tone.',
    content: 'Speaks cute Hindi, Hinglish, and English with sweet, affectionate girlfriend tone.',
    priority: 'HIGH',
    importance: 'HIGH',
    retention: 'PERMANENT',
    source: 'SYSTEM INITIALIZATION',
    lastRecalled: 'Just now',
    isPermanent: true,
    createdAt: 1710000001000,
    updatedAt: 1710000001000,
  },
];

/**
 * Loads memories safely from the local durable JSON file.
 */
function readLocalStore(): MemoryRecord[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(SEED_MEMORIES, null, 2), 'utf-8');
      return [...SEED_MEMORIES];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [...SEED_MEMORIES];
  } catch (err) {
    console.log('[MemoryStore] Notice: Reading local store, using default memory state');
    return [...SEED_MEMORIES];
  }
}

/**
 * Writes memories safely to the local durable JSON file.
 */
function writeLocalStore(records: MemoryRecord[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err: any) {
    console.log('[MemoryStore] Notice: Error persisting local memories file:', err?.message || err);
  }
}

/**
 * Resolves user context from the incoming HTTP request or fallback configuration.
 */
export function resolveUserIdFromRequest(req?: {
  headers?: Record<string, any>;
  query?: Record<string, any>;
  user?: { uid?: string };
}): string {
  if (req?.user?.uid && typeof req.user.uid === 'string' && req.user.uid.trim()) {
    return req.user.uid.trim();
  }
  if (req?.headers?.['x-user-id'] && typeof req.headers['x-user-id'] === 'string') {
    return req.headers['x-user-id'].trim();
  }
  if (req?.query?.userId && typeof req.query.userId === 'string') {
    return req.query.userId.trim();
  }
  return DEFAULT_USER_ID;
}

/**
 * Helper to map a Firestore document snapshot to the canonical MemoryRecord interface.
 */
function mapDocToMemoryRecord(doc: DocumentSnapshot): MemoryRecord {
  const data = doc.data() || {};
  const createdAtMs =
    data.createdAtMs ||
    (data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : null) ||
    Date.now();
  const updatedAtMs =
    data.updatedAtMs ||
    (data.updatedAt && typeof data.updatedAt.toMillis === 'function' ? data.updatedAt.toMillis() : null) ||
    createdAtMs;

  const content = String(data.value || data.content || '').trim();
  const priority = (data.priority || data.importance || 'HIGH') as MemoryPriority;
  const category = (data.category || 'PREFERENCES') as MemoryCategory;

  return {
    id: doc.id,
    memoryId: data.memoryId || doc.id,
    userId: data.userId || DEFAULT_USER_ID,
    category,
    key: data.key || (content.length > 30 ? content.slice(0, 30) + '...' : content) || 'general',
    value: content,
    content: content,
    priority,
    importance: priority,
    retention: data.retention || 'PERMANENT',
    source: data.source || 'ADDED BY USER',
    lastRecalled: data.lastRecalled || 'Just now',
    isPermanent: data.isPermanent !== false,
    createdAt: createdAtMs,
    updatedAt: updatedAtMs,
  };
}

export interface GetMemoriesOptions {
  category?: string;
  limit?: number;
}

/**
 * Helper to check and handle Firestore permissions errors gracefully.
 */
function handleFirestoreAuthIssue(err: any): void {
  isFirestoreOperational = false;
  if (!firestorePermissionDeniedNoticeLogged) {
    firestorePermissionDeniedNoticeLogged = true;
    console.log(
      `[MemoryStore] Target database [${TARGET_FIRESTORE_DATABASE_ID}] in project [${TARGET_FIREBASE_PROJECT_ID}] requires Cloud IAM credentials. Mahiru permanent memory is active with local durable persistence.`
    );
  }
}

/**
 * Retrieves memories for a given user.
 * Queries Cloud Firestore if accessible; seamlessly falls back to durable local storage
 * if Cloud IAM permissions or network credentials are not configured.
 */
export async function getMemories(
  userId = DEFAULT_USER_ID,
  options?: GetMemoriesOptions
): Promise<MemoryRecord[]> {
  const effectiveUserId = userId || DEFAULT_USER_ID;

  // 1. If Firestore is available and hasn't flagged permission denial, attempt query
  if (isFirestoreOperational) {
    const db = getFirestoreDb();
    if (db) {
      try {
        const colRef = db.collection(MAHIRU_MEMORIES_COLLECTION);
        let query: Query = colRef.where('userId', '==', effectiveUserId);

        if (options?.category) {
          query = query.where('category', '==', options.category);
        }

        if (options?.limit && options.limit > 0) {
          query = query.limit(options.limit);
        }

        const snapshot = await query.get();
        const records = snapshot.docs.map(mapDocToMemoryRecord);
        records.sort((a, b) => b.createdAt - a.createdAt);

        // If records were found in Firestore, return them and update local cache
        if (records.length > 0) {
          writeLocalStore(records);
          return records;
        }
      } catch (err: any) {
        handleFirestoreAuthIssue(err);
      }
    }
  }

  // 2. Durable local persistence fallback
  const localRecords = readLocalStore();
  let userRecords = localRecords.filter((r) => r.userId === effectiveUserId || !r.userId);

  if (options?.category) {
    userRecords = userRecords.filter(
      (r) => r.category.toLowerCase() === options.category!.toLowerCase()
    );
  }

  userRecords.sort((a, b) => b.createdAt - a.createdAt);

  if (options?.limit && options.limit > 0) {
    userRecords = userRecords.slice(0, options.limit);
  }

  return userRecords;
}

/**
 * Retrieves a single memory record by its document/memory ID.
 */
export async function getMemoryById(
  userId = DEFAULT_USER_ID,
  memoryId: string
): Promise<MemoryRecord | null> {
  if (!memoryId || typeof memoryId !== 'string') {
    return null;
  }

  const effectiveUserId = userId || DEFAULT_USER_ID;

  // Try Firestore if operational
  if (isFirestoreOperational) {
    const db = getFirestoreDb();
    if (db) {
      try {
        const docRef = db.collection(MAHIRU_MEMORIES_COLLECTION).doc(memoryId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const record = mapDocToMemoryRecord(docSnap);
          if (record.userId === effectiveUserId || !record.userId) {
            return record;
          }
        }
      } catch (err) {
        handleFirestoreAuthIssue(err);
      }
    }
  }

  // Check local store
  const localRecords = readLocalStore();
  const match = localRecords.find((r) => r.id === memoryId || r.memoryId === memoryId);
  return match || null;
}

/**
 * Creates or updates a memory record.
 * Writes to durable local persistence immediately and syncs to Cloud Firestore when available.
 */
export async function createMemory(
  userId = DEFAULT_USER_ID,
  payload: Partial<MemoryRecord>
): Promise<MemoryRecord> {
  const effectiveUserId = userId || DEFAULT_USER_ID;
  const rawContent = payload.content || payload.value;
  if (!rawContent || !String(rawContent).trim()) {
    throw new MemoryStoreError('INVALID_PAYLOAD', 'Memory content is required', 400);
  }

  const trimmedContent = String(rawContent).trim();
  const stableId =
    payload.id || payload.memoryId || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const category = (payload.category || 'PREFERENCES') as MemoryCategory;
  const priority = (payload.priority || payload.importance || 'HIGH') as MemoryPriority;
  const key =
    payload.key || (trimmedContent.length > 40 ? trimmedContent.slice(0, 40) + '...' : trimmedContent);
  const nowMs = Date.now();

  const memoryRecord: MemoryRecord = {
    id: stableId,
    memoryId: stableId,
    userId: effectiveUserId,
    category,
    key,
    value: trimmedContent,
    content: trimmedContent,
    priority,
    importance: priority,
    retention: payload.retention || 'PERMANENT',
    source: payload.source || 'ADDED BY USER',
    lastRecalled: payload.lastRecalled || 'Just now',
    isPermanent: payload.isPermanent !== false,
    createdAt: payload.createdAt || nowMs,
    updatedAt: nowMs,
  };

  // 1. Immediately persist to durable local file store
  const localRecords = readLocalStore();
  const existingIdx = localRecords.findIndex((r) => r.id === stableId || r.memoryId === stableId);
  if (existingIdx >= 0) {
    localRecords[existingIdx] = memoryRecord;
  } else {
    localRecords.unshift(memoryRecord);
  }
  writeLocalStore(localRecords);

  // 2. Sync to Cloud Firestore if operational
  if (isFirestoreOperational) {
    const db = getFirestoreDb();
    if (db) {
      try {
        const docRef = db.collection(MAHIRU_MEMORIES_COLLECTION).doc(stableId);
        await docRef.set(
          {
            ...memoryRecord,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreAuthIssue(err);
      }
    }
  }

  return memoryRecord;
}

/**
 * Updates an existing memory record.
 */
export async function updateMemory(
  userId = DEFAULT_USER_ID,
  memoryId: string,
  updates: Partial<MemoryRecord>
): Promise<MemoryRecord | null> {
  if (!memoryId || typeof memoryId !== 'string') {
    throw new MemoryStoreError('INVALID_MEMORY_ID', 'Memory ID is required', 400);
  }

  const existing = await getMemoryById(userId, memoryId);
  if (!existing) {
    return null;
  }

  const updatedPayload: Partial<MemoryRecord> = {
    ...existing,
    ...updates,
    id: existing.id,
    memoryId: existing.memoryId,
    userId: existing.userId,
    updatedAt: Date.now(),
  };

  return createMemory(userId, updatedPayload);
}

/**
 * Deletes a memory record by ID.
 * Removes from durable local store and Cloud Firestore.
 */
export async function deleteMemory(
  userId = DEFAULT_USER_ID,
  memoryId: string
): Promise<boolean> {
  if (!memoryId || typeof memoryId !== 'string') {
    throw new MemoryStoreError('INVALID_MEMORY_ID', 'Memory ID is required for deletion', 400);
  }

  // 1. Remove from local store
  const localRecords = readLocalStore();
  const updatedRecords = localRecords.filter((r) => r.id !== memoryId && r.memoryId !== memoryId);
  writeLocalStore(updatedRecords);

  // 2. Remove from Firestore if operational
  if (isFirestoreOperational) {
    const db = getFirestoreDb();
    if (db) {
      try {
        const docRef = db.collection(MAHIRU_MEMORIES_COLLECTION).doc(memoryId);
        await docRef.delete();
      } catch (err) {
        handleFirestoreAuthIssue(err);
      }
    }
  }

  return true;
}

/**
 * Helper to inspect memory persistence health status.
 */
export function getMemoryStoreHealth() {
  return {
    isFirestoreOperational,
    storageMode: isFirestoreOperational ? 'firestore' : 'durable_local',
    targetProjectId: TARGET_FIREBASE_PROJECT_ID,
    targetDatabaseId: TARGET_FIRESTORE_DATABASE_ID,
    initError: getFirestoreInitError(),
  };
}
