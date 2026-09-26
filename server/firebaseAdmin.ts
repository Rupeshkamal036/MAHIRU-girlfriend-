import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

export const TARGET_FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'proven-lodge-m5xj8';

export const TARGET_FIRESTORE_DATABASE_ID =
  process.env.FIREBASE_DATABASE_ID || 'ai-studio-059d2266-7332-4365-bdc2-4c4b26157049';

let dbInstance: Firestore | null = null;
let initAttempted = false;
let initErrorMessage: string | null = null;

/**
 * Initializes Firebase Admin SDK in a centralized, singleton manner.
 * Safe against duplicate initialization during development or dev server reloads.
 */
export function initializeFirebaseAdmin(): App | null {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0]!;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    TARGET_FIREBASE_PROJECT_ID;

  let credentialConfig: ReturnType<typeof cert> | undefined;

  // Check if a service account key is provided in environment variables
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      const parsed = raw.startsWith('{')
        ? JSON.parse(raw)
        : JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
      credentialConfig = cert(parsed);
    } catch (err: any) {
      console.warn('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err?.message);
    }
  }

  try {
    const app = initializeApp({
      ...(credentialConfig ? { credential: credentialConfig } : {}),
      projectId,
    });
    console.log(
      '[FirebaseAdmin] Initialized Firebase Admin SDK successfully.',
      `Project: ${projectId}`
    );
    return app;
  } catch (err: any) {
    initErrorMessage = err?.message || 'Failed to initialize Firebase Admin';
    console.warn('[FirebaseAdmin] Could not initialize Firebase Admin SDK:', initErrorMessage);
    return null;
  }
}

/**
 * Returns the Firestore database instance for the configured named database.
 */
export function getFirestoreDb(databaseId?: string): Firestore | null {
  if (!initAttempted) {
    initAttempted = true;
    initializeFirebaseAdmin();
  }

  const targetDatabaseId =
    databaseId ||
    process.env.FIREBASE_DATABASE_ID ||
    TARGET_FIRESTORE_DATABASE_ID;

  if (dbInstance && dbInstance.databaseId === targetDatabaseId) {
    return dbInstance;
  }

  const apps = getApps();
  if (apps.length > 0) {
    try {
      dbInstance = getFirestore(apps[0]!, targetDatabaseId);
      console.log(
        `[FirebaseAdmin] Connected to Firestore database [${targetDatabaseId}] in project [${apps[0]!.options.projectId || TARGET_FIREBASE_PROJECT_ID}]`
      );
      return dbInstance;
    } catch (err: any) {
      initErrorMessage = err?.message || 'Failed to acquire Firestore client';
      console.warn('[FirebaseAdmin] Error accessing Firestore instance:', initErrorMessage);
      return null;
    }
  }

  return null;
}

/**
 * Checks if Firestore is currently configured and initialized.
 */
export function isFirestoreAvailable(): boolean {
  return getFirestoreDb() !== null;
}

/**
 * Returns a safe diagnostic message if Firestore could not be initialized.
 */
export function getFirestoreInitError(): string | null {
  return initErrorMessage;
}

export { FieldValue, Timestamp };
