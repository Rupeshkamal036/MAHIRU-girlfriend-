import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

export const TARGET_FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'ai-studio-mahirugirlfriend-7a4a6211-3054-4b5b-97be-902107c88ad6';

export const TARGET_FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-mahirugirlfriend-7a4a6211-3054-4b5b-97be-902107c88ad6';

let adminDb: Firestore | null = null;
let firestoreChecked = false;
let firestoreAvailable = false;

export function isFirestoreAvailable(): boolean {
  return firestoreAvailable;
}

export function getAdminFirestore(): Firestore | null {
  if (adminDb) return adminDb;

  try {
    const apps = getApps();
    let app = apps.length > 0 ? apps[0] : null;

    if (!app) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          app = initializeApp({
            credential: cert(serviceAccount),
            projectId: TARGET_FIREBASE_PROJECT_ID,
          });
        } catch {
          app = initializeApp({ projectId: TARGET_FIREBASE_PROJECT_ID });
        }
      } else {
        app = initializeApp({ projectId: TARGET_FIREBASE_PROJECT_ID });
      }
    }

    try {
      // Initialize with specific target database ID
      adminDb = getFirestore(app, TARGET_FIRESTORE_DATABASE_ID);
      firestoreAvailable = true;
    } catch {
      adminDb = getFirestore(app);
      firestoreAvailable = true;
    }
  } catch (err) {
    console.warn('[FirebaseAdmin] Firestore Admin SDK initialization fallback to memory store:', err);
    firestoreAvailable = false;
    adminDb = null;
  }

  return adminDb;
}
