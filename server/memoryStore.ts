import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { MemoryCategory, MemoryPriority, MemoryRecord } from '../src/types';
import { classifyMemorySemantic, isSemanticCategory } from './memoryCategorySchema';

let appletConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  // ignore
}

export const TARGET_FIREBASE_PROJECT_ID =
  appletConfig.projectId ||
  process.env.FIREBASE_PROJECT_ID ||
  'mahiru-girlfriend';

export const TARGET_FIRESTORE_DATABASE_ID =
  appletConfig.firestoreDatabaseId ||
  process.env.FIREBASE_DATABASE_ID ||
  'ai-studio-mahirugirlfriend-7a4a6211-3054-4b5b-97be-902107c88ad6';

export const MAHIRU_MEMORIES_COLLECTION = 'mahiru_memories';
export const DEFAULT_USER_ID = process.env.DEV_USER_ID || 'rupesh-dev';

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

let firestoreInstance: Firestore | null = null;

/**
 * Automatically retries transient Firestore network glitches (e.g. UNAVAILABLE, ECONNRESET).
 */
async function withFirestoreRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || '');
      const code = String(err?.code || '');
      const isTransient =
        code === '14' ||
        code === 'unavailable' ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('socket hang up');

      if (isTransient && attempt < retries) {
        console.warn(`[MemoryStore] Transient Firestore connection error (${code || msg}), retrying in ${(attempt + 1) * 300}ms...`);
        await new Promise((res) => setTimeout(res, (attempt + 1) * 300));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function getFirestoreInstance(): Firestore {
  if (firestoreInstance) return firestoreInstance;

  const app = getApps().length === 0
    ? initializeApp(appletConfig)
    : getApp();

  firestoreInstance = getFirestore(app, TARGET_FIRESTORE_DATABASE_ID);
  console.log(
    `[MemoryStore] Connected to real Cloud Firestore database [${TARGET_FIRESTORE_DATABASE_ID}] in project [${TARGET_FIREBASE_PROJECT_ID}]`
  );
  return firestoreInstance;
}

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

export interface GetMemoriesOptions {
  category?: string;
  limit?: number;
}

/**
 * Retrieves memories for a given user directly from Cloud Firestore.
 */
export async function getMemories(
  userId = DEFAULT_USER_ID,
  options?: GetMemoriesOptions
): Promise<MemoryRecord[]> {
  const effectiveUserId = userId || DEFAULT_USER_ID;
  const db = getFirestoreInstance();

  try {
    const colRef = collection(db, MAHIRU_MEMORIES_COLLECTION);
    const q = query(colRef, where('userId', '==', effectiveUserId));
    const snapshot = await withFirestoreRetry(() => getDocs(q));

    const records: MemoryRecord[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAtMs =
        data.createdAtMs ||
        (data.createdAt?.toMillis ? data.createdAt.toMillis() : null) ||
        data.createdAt ||
        Date.now();
      const updatedAtMs =
        data.updatedAtMs ||
        (data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null) ||
        data.updatedAt ||
        createdAtMs;

      const content = String(data.value || data.content || '').trim();
      const priority = (data.priority || data.importance || 'HIGH') as MemoryPriority;
      const rawCategory = (data.category || 'PREFERENCES') as string;
      const rawKey = data.key || (content.length > 30 ? content.slice(0, 30) + '...' : content) || 'general';

      const semantic = classifyMemorySemantic({
        content,
        key: rawKey,
        category: rawCategory,
      });

      const effectiveCategory = isSemanticCategory(rawCategory) ? (rawCategory as MemoryCategory) : semantic.category;
      const effectiveSemanticKey = data.semanticKey || semantic.semanticKey;

      return {
        id: docSnap.id,
        memoryId: data.memoryId || docSnap.id,
        userId: data.userId || effectiveUserId,
        category: effectiveCategory,
        semanticCategory: effectiveCategory,
        key: data.key || effectiveSemanticKey,
        semanticKey: effectiveSemanticKey,
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
    });

    records.sort((a, b) => b.createdAt - a.createdAt);

    let result = records;
    if (options?.category) {
      result = result.filter(
        (r) => r.category.toLowerCase() === options.category!.toLowerCase()
      );
    }
    if (options?.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  } catch (err: any) {
    console.error(
      `[MemoryStore] Direct Firestore query failed on project [${TARGET_FIREBASE_PROJECT_ID}], database [${TARGET_FIRESTORE_DATABASE_ID}]:`,
      err?.message || err
    );
    throw new MemoryStoreError(
      'FIRESTORE_QUERY_FAILED',
      `Firestore query failed on project [${TARGET_FIREBASE_PROJECT_ID}], database [${TARGET_FIRESTORE_DATABASE_ID}]: ${err?.message || err}`,
      500
    );
  }
}

/**
 * Retrieves a single memory record by ID from Cloud Firestore.
 */
export async function getMemoryById(
  userId = DEFAULT_USER_ID,
  memoryId: string
): Promise<MemoryRecord | null> {
  if (!memoryId || typeof memoryId !== 'string') return null;

  const db = getFirestoreInstance();
  try {
    const docRef = doc(db, MAHIRU_MEMORIES_COLLECTION, memoryId);
    const docSnap = await withFirestoreRetry(() => getDoc(docRef));
    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    const createdAtMs =
      data.createdAtMs ||
      (data.createdAt?.toMillis ? data.createdAt.toMillis() : null) ||
      data.createdAt ||
      Date.now();
    const updatedAtMs =
      data.updatedAtMs ||
      (data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null) ||
      data.updatedAt ||
      createdAtMs;
    const content = String(data.value || data.content || '').trim();
    const rawCategory = (data.category || 'PREFERENCES') as string;
    const rawKey = data.key || (content.length > 30 ? content.slice(0, 30) + '...' : content) || 'general';

    const semantic = classifyMemorySemantic({
      content,
      key: rawKey,
      category: rawCategory,
    });

    const effectiveCategory = isSemanticCategory(rawCategory) ? (rawCategory as MemoryCategory) : semantic.category;
    const effectiveSemanticKey = data.semanticKey || semantic.semanticKey;

    return {
      id: docSnap.id,
      memoryId: data.memoryId || docSnap.id,
      userId: data.userId || userId,
      category: effectiveCategory,
      semanticCategory: effectiveCategory,
      key: data.key || effectiveSemanticKey,
      semanticKey: effectiveSemanticKey,
      value: content,
      content: content,
      priority: (data.priority || data.importance || 'HIGH') as MemoryPriority,
      importance: (data.priority || data.importance || 'HIGH') as MemoryPriority,
      retention: data.retention || 'PERMANENT',
      source: data.source || 'ADDED BY USER',
      lastRecalled: data.lastRecalled || 'Just now',
      isPermanent: data.isPermanent !== false,
      createdAt: createdAtMs,
      updatedAt: updatedAtMs,
    };
  } catch (err: any) {
    console.error(
      `[MemoryStore] Direct Firestore getDoc failed on project [${TARGET_FIREBASE_PROJECT_ID}], database [${TARGET_FIRESTORE_DATABASE_ID}]:`,
      err?.message || err
    );
    throw new MemoryStoreError(
      'FIRESTORE_GET_FAILED',
      `Firestore get failed on project [${TARGET_FIREBASE_PROJECT_ID}], database [${TARGET_FIRESTORE_DATABASE_ID}]: ${err?.message || err}`,
      500
    );
  }
}

/**
 * Creates or updates a memory record directly in Cloud Firestore.
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
  const priority = (payload.priority || payload.importance || 'HIGH') as MemoryPriority;
  const rawKey = payload.key || (trimmedContent.length > 40 ? trimmedContent.slice(0, 40) + '...' : trimmedContent);
  const nowMs = Date.now();

  const semantic = classifyMemorySemantic({
    content: trimmedContent,
    key: rawKey,
    category: payload.category as string,
  });

  const category = (payload.category && isSemanticCategory(payload.category)
    ? payload.category
    : semantic.category) as MemoryCategory;
  const semanticKey = payload.semanticKey || semantic.semanticKey;
  const key = payload.key || semanticKey;

  const memoryRecord: MemoryRecord = {
    id: stableId,
    memoryId: stableId,
    userId: effectiveUserId,
    category,
    semanticCategory: category,
    key,
    semanticKey,
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

  const db = getFirestoreInstance();

  try {
    const docRef = doc(db, MAHIRU_MEMORIES_COLLECTION, stableId);
    await withFirestoreRetry(() =>
      setDoc(docRef, {
        ...memoryRecord,
        createdAtMs: memoryRecord.createdAt,
        updatedAtMs: memoryRecord.updatedAt,
        serverCreatedAt: serverTimestamp(),
        serverUpdatedAt: serverTimestamp(),
      })
    );

    console.log(
      `[MemoryStore] Successfully persisted memory in Cloud Firestore [${stableId}] in database [${TARGET_FIRESTORE_DATABASE_ID}] (project: ${TARGET_FIREBASE_PROJECT_ID})`
    );

    return memoryRecord;
  } catch (err: any) {
    console.error(
      `[MemoryStore] Direct Firestore write failed on project [${TARGET_FIREBASE_PROJECT_ID}], database [${TARGET_FIRESTORE_DATABASE_ID}]:`,
      err?.message || err
    );
    throw new MemoryStoreError(
      'FIRESTORE_WRITE_FAILED',
      `Firestore write failed on project [${TARGET_FIREBASE_PROJECT_ID}], database [${TARGET_FIRESTORE_DATABASE_ID}]: ${err?.message || err}`,
      500
    );
  }
}

/**
 * Updates an existing memory record in Cloud Firestore.
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
 * Deletes a memory record by ID directly from Cloud Firestore.
 */
export async function deleteMemory(
  userId = DEFAULT_USER_ID,
  memoryId: string
): Promise<boolean> {
  if (!memoryId || typeof memoryId !== 'string') {
    throw new MemoryStoreError('INVALID_MEMORY_ID', 'Memory ID is required for deletion', 400);
  }

  const db = getFirestoreInstance();

  try {
    const docRef = doc(db, MAHIRU_MEMORIES_COLLECTION, memoryId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      console.log(`[MemoryStore] Memory [${memoryId}] not found in Firestore for deletion`);
      return false;
    }

    const data = snap.data();
    if (data.userId && data.userId !== userId) {
      console.warn(`[MemoryStore] Unauthorized delete attempt on [${memoryId}] by user [${userId}]`);
      throw new MemoryStoreError('UNAUTHORIZED', 'Access denied to this memory', 403);
    }

    await withFirestoreRetry(() => deleteDoc(docRef));

    console.log(
      `[MemoryStore] Successfully deleted memory from Cloud Firestore [${memoryId}] in database [${TARGET_FIRESTORE_DATABASE_ID}] (project: ${TARGET_FIREBASE_PROJECT_ID})`
    );

    return true;
  } catch (err: any) {
    console.error(
      `[MemoryStore] Direct Firestore delete failed on project [${TARGET_FIREBASE_PROJECT_ID}], database [${TARGET_FIRESTORE_DATABASE_ID}]:`,
      err?.message || err
    );
    throw new MemoryStoreError(
      'FIRESTORE_DELETE_FAILED',
      `Firestore delete failed on project [${TARGET_FIREBASE_PROJECT_ID}], database [${TARGET_FIRESTORE_DATABASE_ID}]: ${err?.message || err}`,
      500
    );
  }
}

export function getMemoryStoreHealth() {
  return {
    targetProjectId: TARGET_FIREBASE_PROJECT_ID,
    targetDatabaseId: TARGET_FIRESTORE_DATABASE_ID,
    firestoreReady: true,
  };
}
