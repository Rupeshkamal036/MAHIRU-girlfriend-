import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import config from '../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(config) : getApp();

export const db = getFirestore(app, config.firestoreDatabaseId);
export const auth = getAuth(app);

export default app;
