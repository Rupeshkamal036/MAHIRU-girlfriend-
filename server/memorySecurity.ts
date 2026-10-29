import crypto from 'crypto';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getFirestoreInstance,
  DEFAULT_USER_ID,
  TARGET_FIREBASE_PROJECT_ID,
  TARGET_FIRESTORE_DATABASE_ID,
} from './memoryStore.js';

export const MAHIRU_SECURITY_COLLECTION = 'mahiru_security';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds

export interface SecurityActivityItem {
  timestamp: number;
  action: string;
  success: boolean;
  details?: string;
}

export interface MemorySecurityConfig {
  userId: string;
  isEnabled: boolean;
  hasPin: boolean;
  hasCodeword: boolean;
  pinHash?: string;
  pinSalt?: string;
  codewordHash?: string;
  codewordSalt?: string;
  failedAttempts: number;
  lockedUntil?: number;
  lastAttemptAt?: number;
  updatedAt: number;
  history: SecurityActivityItem[];
}

export interface SanitizedSecurityStatus {
  isEnabled: boolean;
  hasPin: boolean;
  hasCodeword: boolean;
  failedAttempts: number;
  isLocked: boolean;
  lockRemainingSeconds: number;
  lastAttemptAt: number | null;
  updatedAt: number;
  recentActivity: SecurityActivityItem[];
}

export class MemorySecurityError extends Error {
  public code: string;
  public statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'MemorySecurityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// In-memory fallback / cache in case of Firestore connectivity latency
const securityCache = new Map<string, MemorySecurityConfig>();

/**
 * Normalizes codeword text (lowercase, collapse whitespace and punctuation, trim)
 * to ensure robust matching across speech and typing.
 */
export function normalizeCodeword(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .replace(/[\s\-_.,!?'"():;\[\]{}<>\/\\@#$%^&*+=~`]+/g, ' ')
    .trim();
}

/**
 * Checks if a codeword string is empty, null, or a common LLM placeholder.
 * Placeholders must be treated as "no codeword provided" rather than an incorrect codeword attempt.
 */
export function isBlankOrPlaceholderCodeword(codeword?: string | null): boolean {
  if (!codeword || typeof codeword !== 'string') return true;
  const trimmed = codeword.trim().toLowerCase();
  if (!trimmed) return true;

  const placeholders = new Set([
    'none',
    'null',
    'undefined',
    'n/a',
    'na',
    'not provided',
    'not_provided',
    'not-provided',
    'not provided by user',
    'not yet provided',
    'unknown',
    'no',
    'false',
    'empty',
    'optional',
    'required',
    'codeword',
    'code_word',
    'secret',
    'secret_word',
    'ask user',
    'not given',
    'missing',
    'unspecified',
    'not specified',
    'pending',
  ]);

  return placeholders.has(trimmed);
}

/**
 * Generates a secure cryptographic salt.
 */
function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Computes a strong one-way hash using scrypt.
 */
function hashSecret(secret: string, salt: string): string {
  return crypto.scryptSync(secret, salt, 64).toString('hex');
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
function timingSafeVerify(secret: string, salt: string, expectedHash: string): boolean {
  try {
    const computed = hashSecret(secret, salt);
    const bufA = Buffer.from(computed, 'hex');
    const bufB = Buffer.from(expectedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Robust verification for voice and UI codewords.
 * Handles speech recognition artifacts (trailing punctuation, quotes,
 * conversational filler like "the codeword is ...", "mera codeword ... hai").
 */
export function verifyCodeword(rawInput: string, salt: string, expectedHash: string): boolean {
  if (!rawInput || typeof rawInput !== 'string') return false;
  if (isBlankOrPlaceholderCodeword(rawInput)) return false;

  const norm = normalizeCodeword(rawInput);
  if (!norm) return false;

  // 1. Direct normalized match
  if (timingSafeVerify(norm, salt, expectedHash)) {
    return true;
  }

  // 2. Strip conversational prefixes/suffixes common in voice & speech-to-text
  const stripped = norm
    .replace(/^(?:the|my|our|secret|user|mera|meri|mere|apna)?\s*(?:secret\s*)?(?:code\s*word|codeword|passcode|password|code|secret)\s*(?:is|hai|tha|=|:)?\s*/i, '')
    .replace(/^(?:mera|meri|mere|apna|secret)?\s*(?:code\s*word|codeword|code|passcode)\s*(?:hai|tha|is)?\s*/i, '')
    .replace(/^(?:it\s*is|it's|its|ab|ab\s+se)\s*/i, '')
    .replace(/\s*(?:hai|tha|h|please|karo|bhi|ji|sir|maam|rakhna|rakho)$/i, '')
    .trim();

  if (stripped && stripped !== norm && timingSafeVerify(stripped, salt, expectedHash)) {
    return true;
  }

  // 3. Extract words and check 1-word, 2-word, and 3-word n-grams for natural language turns
  const words = norm.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.length <= 60) {
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
      if (cleanWord.length >= 3 && timingSafeVerify(cleanWord, salt, expectedHash)) {
        return true;
      }
    }
    for (let i = 0; i < words.length - 1; i++) {
      const cleanW1 = words[i].replace(/[^a-zA-Z0-9]/g, '');
      const cleanW2 = words[i + 1].replace(/[^a-zA-Z0-9]/g, '');
      const bigram = `${cleanW1} ${cleanW2}`.trim();
      if (timingSafeVerify(bigram, salt, expectedHash)) {
        return true;
      }
    }
    for (let i = 0; i < words.length - 2; i++) {
      const cleanW1 = words[i].replace(/[^a-zA-Z0-9]/g, '');
      const cleanW2 = words[i + 1].replace(/[^a-zA-Z0-9]/g, '');
      const cleanW3 = words[i + 2].replace(/[^a-zA-Z0-9]/g, '');
      const trigram = `${cleanW1} ${cleanW2} ${cleanW3}`.trim();
      if (timingSafeVerify(trigram, salt, expectedHash)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Robust verification for PIN.
 * Supports exact numeric string as well as natural spoken expressions like:
 * "1234", "my pin is 1234", "pin 1234 hai", "PIN: 1234", "1234 hai"
 */
export function verifyPin(rawInput: string, salt: string, expectedHash: string): boolean {
  if (!rawInput || typeof rawInput !== 'string') return false;

  const trimmed = rawInput.trim();
  if (!trimmed) return false;

  // 1. Direct trimmed match
  if (timingSafeVerify(trimmed, salt, expectedHash)) {
    return true;
  }

  // 2. Extract numeric sequences (4 to 8 digits)
  const matches = trimmed.match(/\b\d{4,8}\b/g);
  if (matches) {
    for (const match of matches) {
      if (timingSafeVerify(match, salt, expectedHash)) {
        return true;
      }
    }
  }

  return false;
}

function getDocId(userId: string): string {
  return `sec_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

// Tracks runtime session security state overrides:
// key: `${userId}:${sessionId || 'default'}` -> boolean (true = ON, false = OFF)
const sessionSecurityStates = new Map<string, boolean>();

export function getSessionKey(userId: string, sessionId?: string): string {
  const cleanSessionId = sessionId && typeof sessionId === 'string' && sessionId.trim()
    ? sessionId.trim()
    : 'default';
  return `${userId}:${cleanSessionId}`;
}

/**
 * Retrieves the raw security configuration from Firestore (or fallback cache).
 * Respects session-specific runtime security state.
 * Brand-new sessions (or initial startups) ALWAYS initialize with Security ON.
 */
export async function getSecurityConfig(
  userId: string = DEFAULT_USER_ID,
  sessionId?: string
): Promise<MemorySecurityConfig> {
  const docId = getDocId(userId);
  let baseConfig = securityCache.get(userId);

  if (!baseConfig) {
    try {
      const db = getFirestoreInstance();
      const docRef = doc(db, MAHIRU_SECURITY_COLLECTION, docId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data() as Partial<MemorySecurityConfig>;
        baseConfig = {
          userId,
          isEnabled: true, // Project rule: Session initialization ALWAYS enforces Security ON
          hasPin: Boolean(data.hasPin || data.pinHash),
          hasCodeword: Boolean(data.hasCodeword || data.codewordHash),
          pinHash: data.pinHash,
          pinSalt: data.pinSalt,
          codewordHash: data.codewordHash,
          codewordSalt: data.codewordSalt,
          failedAttempts: data.failedAttempts || 0,
          lockedUntil: data.lockedUntil || 0,
          lastAttemptAt: data.lastAttemptAt || 0,
          updatedAt: data.updatedAt || Date.now(),
          history: Array.isArray(data.history) ? data.history : [],
        };
        securityCache.set(userId, baseConfig);
      }
    } catch (err: any) {
      console.warn(`[MemorySecurity] Firestore read failed, falling back to cache:`, err?.message || err);
    }
  }

  // Return existing cache or default empty security config
  if (!baseConfig) {
    baseConfig = {
      userId,
      isEnabled: true,
      hasPin: false,
      hasCodeword: false,
      failedAttempts: 0,
      lockedUntil: 0,
      lastAttemptAt: 0,
      updatedAt: Date.now(),
      history: [
        {
          timestamp: Date.now(),
          action: 'SECURITY_INITIALIZED',
          success: true,
          details: 'Default security profile created',
        },
      ],
    };
    securityCache.set(userId, baseConfig);
  }

  // Resolve session-specific runtime isEnabled state
  const sessionKey = getSessionKey(userId, sessionId);
  let sessionEnabled: boolean;

  if (sessionSecurityStates.has(sessionKey)) {
    sessionEnabled = sessionSecurityStates.get(sessionKey)!;
  } else {
    // Brand new session (e.g. fresh page load, refresh, reopen, or new session ID):
    // MUST automatically initialize as ON!
    sessionEnabled = true;
    sessionSecurityStates.set(sessionKey, true);
  }

  return {
    ...baseConfig,
    isEnabled: sessionEnabled,
  };
}

/**
 * Persists the security configuration to Firestore and memory cache.
 * Note: isEnabled in Firestore ALWAYS enforces true so that cold starts and
 * new application startups initialize with Security ON.
 */
async function saveSecurityConfig(config: MemorySecurityConfig): Promise<void> {
  config.updatedAt = Date.now();

  const docId = getDocId(config.userId);
  try {
    const db = getFirestoreInstance();
    const docRef = doc(db, MAHIRU_SECURITY_COLLECTION, docId);

    // Build explicit Firestore payload without any undefined fields
    const firestoreData: Record<string, any> = {
      userId: config.userId,
      // Project rule: Persistent state in Firestore ALWAYS enforces Security ON for new sessions/startups.
      isEnabled: true,
      hasPin: Boolean(config.hasPin),
      hasCodeword: Boolean(config.hasCodeword),
      failedAttempts: typeof config.failedAttempts === 'number' ? config.failedAttempts : 0,
      lockedUntil: typeof config.lockedUntil === 'number' ? config.lockedUntil : 0,
      lastAttemptAt: typeof config.lastAttemptAt === 'number' ? config.lastAttemptAt : 0,
      updatedAt: config.updatedAt,
      history: Array.isArray(config.history) ? config.history : [],
      firestoreUpdatedAt: serverTimestamp(),
    };

    if (config.pinHash !== undefined && config.pinHash !== null) {
      firestoreData.pinHash = config.pinHash;
    }
    if (config.pinSalt !== undefined && config.pinSalt !== null) {
      firestoreData.pinSalt = config.pinSalt;
    }
    if (config.codewordHash !== undefined && config.codewordHash !== null) {
      firestoreData.codewordHash = config.codewordHash;
    }
    if (config.codewordSalt !== undefined && config.codewordSalt !== null) {
      firestoreData.codewordSalt = config.codewordSalt;
    }

    await setDoc(docRef, firestoreData, { merge: true });
    securityCache.set(config.userId, config);
    console.log(`[MemorySecurity] Security state saved to Firestore doc [${docId}]`);
  } catch (err: any) {
    console.error(`[MemorySecurity] Firestore save failed for doc [${docId}]:`, err?.message || err);
    throw new MemorySecurityError(
      'PERSISTENCE_FAILED',
      `Failed to persist security configuration to database: ${err?.message || 'Unknown database error'}`,
      500
    );
  }
}

/**
 * Converts a raw security config into a sanitized public view.
 * Guarantees that hashes and salts are NEVER transmitted.
 */
export function getSanitizedSecurityStatus(config: MemorySecurityConfig): SanitizedSecurityStatus {
  const now = Date.now();
  const isLocked = Boolean(config.lockedUntil && config.lockedUntil > now);
  const lockRemainingSeconds = isLocked ? Math.ceil((config.lockedUntil! - now) / 1000) : 0;

  return {
    isEnabled: Boolean(config.isEnabled),
    hasPin: Boolean(config.hasPin && config.pinHash),
    hasCodeword: Boolean(config.hasCodeword && config.codewordHash),
    failedAttempts: config.failedAttempts || 0,
    isLocked,
    lockRemainingSeconds,
    lastAttemptAt: config.lastAttemptAt || null,
    updatedAt: config.updatedAt,
    recentActivity: (config.history || []).slice(-15).reverse(),
  };
}

/**
 * Resets security credentials to a clean, first-time setup state.
 * Clears PIN hash/salt, Codeword hash/salt, lockouts, and disables security.
 */
export async function resetSecurityCredentials(userId: string = DEFAULT_USER_ID): Promise<SanitizedSecurityStatus> {
  const docId = getDocId(userId);
  const cleanConfig: MemorySecurityConfig = {
    userId,
    isEnabled: false,
    hasPin: false,
    hasCodeword: false,
    pinHash: undefined,
    pinSalt: undefined,
    codewordHash: undefined,
    codewordSalt: undefined,
    failedAttempts: 0,
    lockedUntil: 0,
    lastAttemptAt: 0,
    updatedAt: Date.now(),
    history: [
      {
        timestamp: Date.now(),
        action: 'SECURITY_INITIALIZED',
        success: true,
        details: 'First-time setup state ready',
      },
    ],
  };

  securityCache.set(userId, cleanConfig);

  try {
    const db = getFirestoreInstance();
    const docRef = doc(db, MAHIRU_SECURITY_COLLECTION, docId);
    await setDoc(docRef, {
      userId,
      isEnabled: false,
      hasPin: false,
      hasCodeword: false,
      failedAttempts: 0,
      lockedUntil: 0,
      lastAttemptAt: 0,
      updatedAt: Date.now(),
      history: cleanConfig.history,
      firestoreUpdatedAt: serverTimestamp(),
    });
    console.log(`[MemorySecurity] Successfully reset credentials for [${docId}] to first-time setup in Cloud Firestore`);
  } catch (err: any) {
    console.warn(`[MemorySecurity] Firestore reset warning:`, err?.message || err);
  }

  return getSanitizedSecurityStatus(cleanConfig);
}

/**
 * Helper to record activity into security audit log.
 */
function recordActivity(
  config: MemorySecurityConfig,
  action: string,
  success: boolean,
  details?: string
) {
  if (!config.history) config.history = [];
  config.history.push({
    timestamp: Date.now(),
    action,
    success,
    details,
  });
  if (config.history.length > 50) {
    config.history = config.history.slice(-50);
  }
}

/**
 * Check if the account is currently locked due to too many failed attempts.
 */
function assertNotLocked(config: MemorySecurityConfig): void {
  const now = Date.now();
  if (config.lockedUntil && config.lockedUntil > now) {
    const remaining = Math.ceil((config.lockedUntil - now) / 1000);
    throw new MemorySecurityError(
      'RATE_LIMITED',
      `Too many failed attempts. Security is temporarily locked for ${remaining} more seconds.`,
      429
    );
  }
}

/**
 * Handles a failed verification attempt.
 */
async function registerFailedAttempt(config: MemorySecurityConfig, actionName: string): Promise<void> {
  config.failedAttempts = (config.failedAttempts || 0) + 1;
  config.lastAttemptAt = Date.now();

  if (config.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    config.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    recordActivity(
      config,
      `${actionName}_LOCKED`,
      false,
      `Maximum failed attempts reached (${config.failedAttempts}). Locked for 60s.`
    );
  } else {
    recordActivity(
      config,
      `${actionName}_FAILED`,
      false,
      `Attempt ${config.failedAttempts} of ${MAX_FAILED_ATTEMPTS}`
    );
  }

  await saveSecurityConfig(config);
}

/**
 * Handles a successful verification attempt.
 */
async function registerSuccessfulAttempt(config: MemorySecurityConfig, actionName: string): Promise<void> {
  config.failedAttempts = 0;
  config.lockedUntil = 0;
  config.lastAttemptAt = Date.now();
  recordActivity(config, actionName, true, 'Verification successful');
  await saveSecurityConfig(config);
}

/**
 * 1. FIRST-TIME PIN SETUP
 * Fails if a PIN already exists (must use change PIN instead).
 */
export async function setupInitialPin(
  userId: string = DEFAULT_USER_ID,
  pin: string,
  confirmPin: string
): Promise<SanitizedSecurityStatus> {
  const config = await getSecurityConfig(userId);
  assertNotLocked(config);

  if (config.hasPin && config.pinHash) {
    throw new MemorySecurityError(
      'PIN_ALREADY_EXISTS',
      'PIN is already configured. Use Change PIN with current PIN to update.',
      400
    );
  }

  if (!pin || !/^\d{4,8}$/.test(pin.trim())) {
    throw new MemorySecurityError(
      'INVALID_PIN_FORMAT',
      'PIN must be between 4 and 8 digits (numeric only).',
      400
    );
  }

  if (pin !== confirmPin) {
    throw new MemorySecurityError(
      'PIN_MISMATCH',
      'PIN confirmation does not match the entered PIN.',
      400
    );
  }

  const salt = generateSalt();
  const hash = hashSecret(pin.trim(), salt);

  config.pinSalt = salt;
  config.pinHash = hash;
  config.hasPin = true;
  config.failedAttempts = 0;

  recordActivity(config, 'PIN_SETUP', true, 'Initial PIN created securely');
  await saveSecurityConfig(config);

  return getSanitizedSecurityStatus(config);
}

/**
 * 2. FIRST-TIME CODEWORD SETUP
 * Fails if a Codeword already exists (must use change Codeword instead).
 */
export async function setupInitialCodeword(
  userId: string = DEFAULT_USER_ID,
  codeword: string,
  confirmCodeword: string
): Promise<SanitizedSecurityStatus> {
  const config = await getSecurityConfig(userId);
  assertNotLocked(config);

  if (config.hasCodeword && config.codewordHash) {
    throw new MemorySecurityError(
      'CODEWORD_ALREADY_EXISTS',
      'Codeword is already configured. Use Change Codeword to update.',
      400
    );
  }

  const normalized = normalizeCodeword(codeword);
  const normalizedConfirm = normalizeCodeword(confirmCodeword);

  if (!normalized || normalized.length < 3) {
    throw new MemorySecurityError(
      'INVALID_CODEWORD_FORMAT',
      'Codeword must be at least 3 characters long.',
      400
    );
  }

  if (normalized !== normalizedConfirm) {
    throw new MemorySecurityError(
      'CODEWORD_MISMATCH',
      'Codeword confirmation does not match.',
      400
    );
  }

  const salt = generateSalt();
  const hash = hashSecret(normalized, salt);

  config.codewordSalt = salt;
  config.codewordHash = hash;
  config.hasCodeword = true;
  config.isEnabled = true;
  config.failedAttempts = 0;

  recordActivity(config, 'CODEWORD_SETUP', true, 'Initial voice codeword created securely');
  await saveSecurityConfig(config);

  return getSanitizedSecurityStatus(config);
}

/**
 * 3. CHANGE PIN
 * Requires verification of current PIN before changing to new PIN.
 */
export async function changePin(
  userId: string = DEFAULT_USER_ID,
  currentPin: string,
  newPin: string,
  confirmNewPin: string
): Promise<SanitizedSecurityStatus> {
  const config = await getSecurityConfig(userId);
  assertNotLocked(config);

  if (!config.hasPin || !config.pinHash || !config.pinSalt) {
    throw new MemorySecurityError(
      'NO_EXISTING_PIN',
      'No PIN is currently configured. Use Set Up PIN first.',
      400
    );
  }

  // Verify current PIN
  const isValid = timingSafeVerify(currentPin.trim(), config.pinSalt, config.pinHash);
  if (!isValid) {
    await registerFailedAttempt(config, 'CHANGE_PIN_AUTH');
    throw new MemorySecurityError(
      'INVALID_CURRENT_PIN',
      'Current PIN is incorrect.',
      401
    );
  }

  if (!newPin || !/^\d{4,8}$/.test(newPin.trim())) {
    throw new MemorySecurityError(
      'INVALID_PIN_FORMAT',
      'New PIN must be between 4 and 8 digits (numeric only).',
      400
    );
  }

  if (newPin !== confirmNewPin) {
    throw new MemorySecurityError(
      'PIN_MISMATCH',
      'New PIN confirmation does not match.',
      400
    );
  }

  const newSalt = generateSalt();
  const newHash = hashSecret(newPin.trim(), newSalt);

  config.pinSalt = newSalt;
  config.pinHash = newHash;
  config.hasPin = true;
  config.failedAttempts = 0;

  recordActivity(config, 'PIN_CHANGED', true, 'PIN successfully updated');
  await saveSecurityConfig(config);

  return getSanitizedSecurityStatus(config);
}

/**
 * 4. CHANGE CODEWORD
 * FOCUSED FIX 1: ALWAYS require the CURRENT PIN only.
 * The current Codeword must NOT be accepted as an alternative authorization method.
 */
export async function changeCodeword(
  userId: string = DEFAULT_USER_ID,
  params: {
    currentPin?: string;
    currentCodeword?: string;
    newCodeword: string;
    confirmNewCodeword: string;
  }
): Promise<SanitizedSecurityStatus> {
  const config = await getSecurityConfig(userId);
  assertNotLocked(config);

  if (!config.hasCodeword || !config.codewordHash || !config.codewordSalt) {
    throw new MemorySecurityError(
      'NO_EXISTING_CODEWORD',
      'No Codeword is currently configured. Use Set Up Codeword first.',
      400
    );
  }

  // A configured PIN is required to authorize changing the codeword
  if (!config.hasPin || !config.pinSalt || !config.pinHash) {
    throw new MemorySecurityError(
      'PIN_NOT_CONFIGURED',
      'A numeric PIN must be configured on your account to change your codeword.',
      400
    );
  }

  // FIX 1 ENFORCEMENT: Current PIN is strictly required. Current Codeword is NOT accepted.
  if (!params.currentPin || typeof params.currentPin !== 'string' || !params.currentPin.trim()) {
    throw new MemorySecurityError(
      'CURRENT_PIN_REQUIRED',
      'Current PIN is required to change codeword. Current Codeword is not accepted.',
      401
    );
  }

  const isPinValid = timingSafeVerify(params.currentPin.trim(), config.pinSalt, config.pinHash);

  if (!isPinValid) {
    await registerFailedAttempt(config, 'CHANGE_CODEWORD_AUTH');
    throw new MemorySecurityError(
      'INVALID_CURRENT_PIN',
      'Current PIN is incorrect.',
      401
    );
  }

  const normNew = normalizeCodeword(params.newCodeword);
  const normConfirm = normalizeCodeword(params.confirmNewCodeword);

  if (!normNew || normNew.length < 3) {
    throw new MemorySecurityError(
      'INVALID_CODEWORD_FORMAT',
      'New Codeword must be at least 3 characters long.',
      400
    );
  }

  if (normNew !== normConfirm) {
    throw new MemorySecurityError(
      'CODEWORD_MISMATCH',
      'New Codeword confirmation does not match.',
      400
    );
  }

  const newSalt = generateSalt();
  const newHash = hashSecret(normNew, newSalt);

  config.codewordSalt = newSalt;
  config.codewordHash = newHash;
  config.hasCodeword = true;
  config.failedAttempts = 0;

  recordActivity(config, 'CODEWORD_CHANGED', true, 'Voice codeword successfully updated using verified PIN');
  await saveSecurityConfig(config);

  return getSanitizedSecurityStatus(config);
}

/**
 * 5. TOGGLE SECURITY ON/OFF
 * FOCUSED FIX 2 & 3:
 * - Turning Security ON requires NO credential (directly turns on).
 * - Turning Security OFF strictly requires CODEWORD ONLY.
 *   PIN must NOT be accepted as an alternative for turning Security OFF.
 *   Missing Codeword must result in a Codeword request, not an authentication failure.
 * - Turning Security OFF affects ONLY the active application session.
 *   After app restart / refresh / reopen, Security automatically starts ON.
 */
export async function toggleSecurity(
  userId: string = DEFAULT_USER_ID,
  enable: boolean,
  credentials?: { pin?: string; codeword?: string },
  sessionId?: string
): Promise<SanitizedSecurityStatus> {
  const sessionKey = getSessionKey(userId, sessionId);
  const defaultKey = getSessionKey(userId, 'default');
  const config = await getSecurityConfig(userId, sessionId);
  assertNotLocked(config);

  // If enabling: Security ON requires no credential
  if (enable) {
    sessionSecurityStates.set(sessionKey, true);
    sessionSecurityStates.set(defaultKey, true);

    const baseConfig = securityCache.get(userId) || config;
    baseConfig.isEnabled = true;
    baseConfig.failedAttempts = 0;

    recordActivity(
      baseConfig,
      'SECURITY_ENABLED',
      true,
      'Memory security state set to ACTIVE'
    );
    await saveSecurityConfig(baseConfig);

    return getSanitizedSecurityStatus({ ...baseConfig, isEnabled: true });
  }

  // --- DISABLING SECURITY (TURN SECURITY OFF) ---
  // Codeword ONLY! PIN alone must NOT be accepted as a substitute.
  if (!config.isEnabled) {
    return getSanitizedSecurityStatus(config);
  }

  if (!config.hasCodeword || !config.codewordSalt || !config.codewordHash) {
    throw new MemorySecurityError(
      'CODEWORD_NOT_CONFIGURED',
      'No Codeword is configured. Codeword is strictly required to disable Security.',
      400
    );
  }

  // If PIN alone is provided without codeword:
  if (credentials?.pin && isBlankOrPlaceholderCodeword(credentials?.codeword)) {
    throw new MemorySecurityError(
      'CODEWORD_REQUIRED_TO_DISABLE',
      'Valid Codeword is required to turn Security OFF. PIN is not accepted.',
      403
    );
  }

  // Missing Codeword results in a Codeword request
  if (isBlankOrPlaceholderCodeword(credentials?.codeword)) {
    throw new MemorySecurityError(
      'CODEWORD_REQUIRED_TO_DISABLE',
      'Valid Codeword is required to turn Security OFF. Please provide your Codeword.',
      403
    );
  }

  const isCodewordValid = verifyCodeword(credentials!.codeword!, config.codewordSalt, config.codewordHash);

  if (!isCodewordValid) {
    await registerFailedAttempt(config, 'DISABLE_SECURITY_AUTH');
    throw new MemorySecurityError(
      'INVALID_CODEWORD',
      'Incorrect Codeword. Security remains ON.',
      401
    );
  }

  // Turn security OFF for this session only
  sessionSecurityStates.set(sessionKey, false);
  if (!sessionId || sessionId === 'default') {
    sessionSecurityStates.set(defaultKey, false);
  }

  const baseConfig = securityCache.get(userId) || config;
  // Keep persistent default isEnabled as true so cold starts and new sessions start ON
  baseConfig.isEnabled = true;
  baseConfig.failedAttempts = 0;

  recordActivity(
    baseConfig,
    'SECURITY_DISABLED',
    true,
    `Memory security turned OFF via verified Codeword for current session (${sessionId || 'current'})`
  );
  await saveSecurityConfig(baseConfig);

  return getSanitizedSecurityStatus({ ...baseConfig, isEnabled: false });
}

/**
 * Helper to clear session overrides in tests or reboots.
 */
export function clearSessionSecurityOverrides(userId?: string): void {
  if (userId) {
    for (const key of Array.from(sessionSecurityStates.keys())) {
      if (key.startsWith(`${userId}:`)) {
        sessionSecurityStates.delete(key);
      }
    }
  } else {
    sessionSecurityStates.clear();
  }
}

/**
 * 5b. INITIALIZE SECURITY FOR NEW APPLICATION SESSION
 * Enforces the project rule that every new application session (app restart, page refresh, app reopen)
 * MUST automatically initialize with Security ON.
 * Preserves all user credentials (PIN, Codeword, salts, hashes), history, and permanent memories untouched.
 */
export async function initializeSecurityForNewSession(
  userId: string = DEFAULT_USER_ID,
  sessionId?: string
): Promise<SanitizedSecurityStatus> {
  const sessionKey = getSessionKey(userId, sessionId);
  const defaultKey = getSessionKey(userId, 'default');

  sessionSecurityStates.set(sessionKey, true);
  sessionSecurityStates.set(defaultKey, true);

  // If no sessionId specified or default, reset all session overrides for this user
  if (!sessionId || sessionId === 'default') {
    for (const key of Array.from(sessionSecurityStates.keys())) {
      if (key.startsWith(`${userId}:`)) {
        sessionSecurityStates.set(key, true);
      }
    }
  }

  const baseConfig = await getSecurityConfig(userId, sessionId);
  baseConfig.isEnabled = true;

  const cached = securityCache.get(userId) || baseConfig;
  cached.isEnabled = true;

  await saveSecurityConfig(cached);

  console.log(`[MemorySecurity] Authoritative new session initialized: Security is ON for user [${userId}] (session: ${sessionId || 'default'})`);
  return getSanitizedSecurityStatus({ ...cached, isEnabled: true });
}

/**
 * 6. VERIFY CREDENTIAL (PIN or Codeword)
 */
export async function verifySecurityCredentials(
  userId: string = DEFAULT_USER_ID,
  credentials: { pin?: string; codeword?: string }
): Promise<{ success: boolean; error?: string; lockRemainingSeconds?: number }> {
  const config = await getSecurityConfig(userId);
  const now = Date.now();

  if (config.lockedUntil && config.lockedUntil > now) {
    const remaining = Math.ceil((config.lockedUntil - now) / 1000);
    return {
      success: false,
      error: `Security locked. Try again in ${remaining}s.`,
      lockRemainingSeconds: remaining,
    };
  }

  let verified = false;

  if (credentials.pin && config.hasPin && config.pinSalt && config.pinHash) {
    verified = timingSafeVerify(credentials.pin.trim(), config.pinSalt, config.pinHash);
  }

  if (!verified && credentials.codeword && config.hasCodeword && config.codewordSalt && config.codewordHash) {
    verified = verifyCodeword(credentials.codeword, config.codewordSalt, config.codewordHash);
  }

  if (verified) {
    await registerSuccessfulAttempt(config, 'CREDENTIAL_VERIFIED');
    return { success: true };
  } else {
    await registerFailedAttempt(config, 'CREDENTIAL_FAILED');
    const updated = await getSecurityConfig(userId);
    const isLocked = Boolean(updated.lockedUntil && updated.lockedUntil > Date.now());
    const lockRemaining = isLocked ? Math.ceil((updated.lockedUntil! - Date.now()) / 1000) : 0;
    return {
      success: false,
      error: isLocked
        ? `Too many failed attempts. Locked for ${lockRemaining}s.`
        : `Invalid PIN or Codeword. (${updated.failedAttempts}/${MAX_FAILED_ATTEMPTS} attempts)`,
      lockRemainingSeconds: lockRemaining,
    };
  }
}

/**
 * 7. AUTHORIZATION HOOK FOR FUTURE INTEGRATION
 * Clean hook for memory operations.
 * By default in Step 2: does NOT block the working voice memory delete.
 */
export async function checkMemoryOperationAuthorization(
  userId: string = DEFAULT_USER_ID,
  operation: 'delete_single' | 'delete_all' | 'change_owner',
  credentials?: { pin?: string; codeword?: string },
  options?: { isOwnerName?: boolean; targetMemory?: { key?: string; category?: string; value?: string } },
  sessionId?: string
): Promise<{ authorized: boolean; reason?: string; requiresVerification?: boolean }> {
  // CRITICAL: change_owner, delete_all, and owner-name delete NEVER bypass when Security is OFF.
  if (operation === 'change_owner') {
    const ownerAuth = await authorizeOwnerNameChange(userId, credentials, 'change', sessionId);
    return {
      authorized: ownerAuth.authorized,
      reason: ownerAuth.reason,
      requiresVerification: ownerAuth.requiresCodeword,
    };
  }

  if (operation === 'delete_all') {
    const allAuth = await authorizeDeleteAllMemories(userId, credentials, sessionId);
    return {
      authorized: allAuth.authorized,
      reason: allAuth.reason,
      requiresVerification: allAuth.requiresCodeword,
    };
  }

  if (operation === 'delete_single') {
    const singleAuth = await authorizeSingleMemoryDelete(userId, credentials, options, sessionId);
    return {
      authorized: singleAuth.authorized,
      reason: singleAuth.reason,
      requiresVerification: singleAuth.requiresCodeword,
    };
  }

  const config = await getSecurityConfig(userId, sessionId);
  if (!config.isEnabled) {
    return { authorized: true };
  }

  return { authorized: true };
}

/**
 * AUTHORIZATION FOR DELETE ALL PERMANENT MEMORIES
 * 
 * Strict Architectural Rule:
 * 1. Delete ALL Permanent Memories ALWAYS requires Secret Codeword verification.
 * 2. Security ON or Security OFF makes NO difference — Codeword is ALWAYS mandatory.
 * 3. Security OFF must NEVER create a bypass for Delete All.
 * 4. PIN alone is strictly NOT accepted.
 * 5. Delete All must also NOT delete security configuration or credentials.
 */
export async function authorizeDeleteAllMemories(
  userId: string = DEFAULT_USER_ID,
  credentials?: { codeword?: string; pin?: string },
  sessionId?: string
): Promise<{ authorized: boolean; reason?: string; requiresCodeword?: boolean; isLocked?: boolean }> {
  const config = await getSecurityConfig(userId, sessionId);

  // 1. Lockout check
  const now = Date.now();
  if (config.lockedUntil && config.lockedUntil > now) {
    const remaining = Math.ceil((config.lockedUntil - now) / 1000);
    return {
      authorized: false,
      isLocked: true,
      reason: `Security is temporarily locked due to too many failed attempts (${remaining}s remaining).`,
    };
  }

  // 2. PIN alone is strictly NOT accepted for Delete All
  if (credentials?.pin && isBlankOrPlaceholderCodeword(credentials?.codeword)) {
    return {
      authorized: false,
      reason: 'Codeword is strictly required to delete all permanent memories. PIN is not accepted.',
    };
  }

  // 3. Codeword is required regardless of Security ON or OFF
  if (isBlankOrPlaceholderCodeword(credentials?.codeword)) {
    return {
      authorized: false,
      requiresCodeword: true,
      reason: 'Deleting all permanent memories strictly requires Secret Codeword verification.',
    };
  }

  // 4. Ensure Codeword credentials exist in configuration
  if (!config.hasCodeword || !config.codewordSalt || !config.codewordHash) {
    return {
      authorized: false,
      reason: 'Codeword is not configured on this account. Please configure a Secret Codeword first.',
    };
  }

  // 5. Verification against stored cryptographic hash
  const isValid = verifyCodeword(credentials!.codeword!, config.codewordSalt, config.codewordHash);

  if (!isValid) {
    await registerFailedAttempt(config, 'DELETE_ALL_MEMORIES_AUTH');
    return {
      authorized: false,
      reason: 'Incorrect Codeword. Delete all memories rejected.',
    };
  }

  // Verification successful
  await registerSuccessfulAttempt(config, 'DELETE_ALL_MEMORIES_AUTH');
  return { authorized: true };
}

/**
 * Checks if a given memory record or candidate represents the primary OWNER / user identity.
 * Specifically targets keys such as 'name', 'user_name', 'owner_name', 'my_name', 'user_real_name', 'username'.
 * Does NOT treat third-person names (friend_name, father_name, sister_name, person_name, etc.) as the owner.
 */
export function isOwnerNameMemory(memory?: { key?: string; category?: string; value?: string } | null): boolean {
  if (!memory || !memory.key) return false;
  const key = String(memory.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  // Exact owner identity keys
  const ownerKeys = ['name', 'user_name', 'owner_name', 'my_name', 'user_real_name', 'username', 'user'];
  return ownerKeys.includes(key);
}

/**
 * AUTHORIZATION FOR OWNER NAME CHANGE (MANDATORY CODEWORD ALWAYS)
 * 
 * Strict Architectural Rule:
 * 1. Changing an existing stored owner/user name ALWAYS requires Secret Codeword verification.
 * 2. Security ON or Security OFF makes NO difference — Codeword is ALWAYS required.
 * 3. PIN must NEVER be accepted as a substitute for Codeword.
 * 4. Only successful Codeword verification authorizes the owner name change.
 */
export async function authorizeOwnerNameChange(
  userId: string = DEFAULT_USER_ID,
  credentials?: { codeword?: string; pin?: string },
  actionType: 'change' | 'delete' = 'change',
  sessionId?: string
): Promise<{ authorized: boolean; reason?: string; requiresCodeword?: boolean; isLocked?: boolean }> {
  const config = await getSecurityConfig(userId, sessionId);

  // 1. Lockout check
  const now = Date.now();
  if (config.lockedUntil && config.lockedUntil > now) {
    const remaining = Math.ceil((config.lockedUntil - now) / 1000);
    return {
      authorized: false,
      isLocked: true,
      reason: `Security is temporarily locked due to too many failed attempts (${remaining}s remaining).`,
    };
  }

  const actionLabel = actionType === 'delete' ? 'delete the owner name' : 'change the owner name';

  // 2. PIN alone is strictly NOT accepted for owner name change or delete
  if (credentials?.pin && !credentials?.codeword) {
    return {
      authorized: false,
      reason: `Codeword is strictly required to ${actionLabel}. PIN is not accepted.`,
    };
  }

  // 3. Codeword is required regardless of Security ON or OFF
  if (isBlankOrPlaceholderCodeword(credentials?.codeword)) {
    return {
      authorized: false,
      requiresCodeword: true,
      reason: `Owner name ${actionType === 'delete' ? 'deletion' : 'change'} strictly requires Secret Codeword verification.`,
    };
  }

  // 4. Ensure Codeword credentials exist in configuration
  if (!config.hasCodeword || !config.codewordSalt || !config.codewordHash) {
    return {
      authorized: false,
      reason: 'Codeword is not configured on this account. Please configure a Secret Codeword first.',
    };
  }

  // 5. Verification against stored cryptographic hash
  const isValid = verifyCodeword(credentials.codeword, config.codewordSalt, config.codewordHash);

  if (!isValid) {
    await registerFailedAttempt(config, actionType === 'delete' ? 'DELETE_OWNER_AUTH' : 'CHANGE_OWNER_AUTH');
    return {
      authorized: false,
      reason: `Incorrect Codeword. Owner name ${actionType === 'delete' ? 'deletion' : 'change'} rejected.`,
    };
  }

  // Verification successful
  await registerSuccessfulAttempt(config, actionType === 'delete' ? 'DELETE_OWNER_AUTH' : 'CHANGE_OWNER_AUTH');
  return { authorized: true };
}

/**
 * 8. AUTHORIZATION FOR EXISTING MEMORY UPDATE (STEP 3)
 * Enforces server-side authorization when updating an existing permanent memory.
 * - If target memory is the OWNER identity/name: ALWAYS requires Codeword (Security ON and OFF).
 * - For all other normal memories:
 *   - When Security is OFF: directly allowed without credentials.
 *   - When Security is ON: strictly requires Codeword. PIN is NOT accepted.
 * - Any user identity phrases ("I am the owner", etc.) cannot bypass verification.
 */
export async function authorizeMemoryUpdate(
  userId: string = DEFAULT_USER_ID,
  credentials?: { codeword?: string; pin?: string },
  options?: { isOwnerName?: boolean; targetMemory?: { key?: string; category?: string; value?: string } },
  sessionId?: string
): Promise<{ authorized: boolean; reason?: string; requiresCodeword?: boolean; isLocked?: boolean }> {
  // Check if this update specifically targets the owner's identity/name
  const isOwner = Boolean(
    options?.isOwnerName ||
    (options?.targetMemory ? isOwnerNameMemory(options.targetMemory) : false)
  );

  if (isOwner) {
    return authorizeOwnerNameChange(userId, credentials, 'change', sessionId);
  }

  const config = await getSecurityConfig(userId, sessionId);

  // Security OFF: directly authorized for non-owner memories, no PIN or Codeword required
  if (!config.isEnabled) {
    return { authorized: true };
  }

  // Security ON:
  const now = Date.now();
  if (config.lockedUntil && config.lockedUntil > now) {
    const remaining = Math.ceil((config.lockedUntil - now) / 1000);
    return {
      authorized: false,
      isLocked: true,
      reason: `Security is temporarily locked due to too many failed attempts (${remaining}s remaining).`,
    };
  }

  // PIN is strictly NOT accepted as an alternative for memory updates
  if (credentials?.pin && !credentials?.codeword) {
    return {
      authorized: false,
      reason: 'Codeword is strictly required for memory updates. PIN is not accepted.',
    };
  }

  // Codeword is strictly required
  if (isBlankOrPlaceholderCodeword(credentials?.codeword)) {
    return {
      authorized: false,
      requiresCodeword: true,
      reason: 'Security is ON. Secret Codeword is required to update an existing memory.',
    };
  }

  if (!config.hasCodeword || !config.codewordSalt || !config.codewordHash) {
    return {
      authorized: false,
      reason: 'Security is enabled but Codeword is not configured on this account.',
    };
  }

  const isValid = verifyCodeword(credentials.codeword, config.codewordSalt, config.codewordHash);

  if (!isValid) {
    await registerFailedAttempt(config, 'UPDATE_MEMORY_AUTH');
    return {
      authorized: false,
      reason: 'Incorrect Codeword. Memory update rejected.',
    };
  }

  // Verification successful
  await registerSuccessfulAttempt(config, 'UPDATE_MEMORY_AUTH');
  return { authorized: true };
}

/**
 * 9. AUTHORIZATION FOR SINGLE MEMORY DELETE (STEP 4)
 * Enforces server-side authorization when deleting a single permanent memory.
 * - When Security is OFF: directly allowed without credentials.
 * - When Security is ON: strictly requires Codeword. PIN is NOT accepted.
 * - Any user identity claims ("I am Rupesh", "I am the owner", etc.) cannot bypass verification.
 */
export async function authorizeSingleMemoryDelete(
  userId: string = DEFAULT_USER_ID,
  credentials?: { codeword?: string; pin?: string },
  options?: { isOwnerName?: boolean; targetMemory?: { key?: string; category?: string; value?: string } },
  sessionId?: string
): Promise<{ authorized: boolean; reason?: string; requiresCodeword?: boolean; isLocked?: boolean }> {
  // SUB-ISSUE 1: OWNER NAME DELETE ALWAYS REQUIRES CODEWORD (Security ON or OFF)
  const isOwner = Boolean(
    options?.isOwnerName ||
    (options?.targetMemory ? isOwnerNameMemory(options.targetMemory) : false)
  );

  if (isOwner) {
    return authorizeOwnerNameChange(userId, credentials, 'delete', sessionId);
  }

  const config = await getSecurityConfig(userId, sessionId);

  // Security OFF: directly authorized for non-owner memories, no PIN or Codeword required
  if (!config.isEnabled) {
    return { authorized: true };
  }

  // Security ON:
  const now = Date.now();
  if (config.lockedUntil && config.lockedUntil > now) {
    const remaining = Math.ceil((config.lockedUntil - now) / 1000);
    return {
      authorized: false,
      isLocked: true,
      reason: `Security is temporarily locked due to too many failed attempts (${remaining}s remaining).`,
    };
  }

  // PIN alone must NOT authorize single-memory deletion
  if (credentials?.pin && !credentials?.codeword) {
    return {
      authorized: false,
      reason: 'Codeword is strictly required for single memory deletion. PIN is not accepted.',
    };
  }

  // Codeword is strictly required
  if (isBlankOrPlaceholderCodeword(credentials?.codeword)) {
    return {
      authorized: false,
      requiresCodeword: true,
      reason: 'Security is ON. Secret Codeword is required to delete a permanent memory.',
    };
  }

  if (!config.hasCodeword || !config.codewordSalt || !config.codewordHash) {
    return {
      authorized: false,
      reason: 'Security is enabled but Codeword is not configured on this account.',
    };
  }

  const isValid = verifyCodeword(credentials.codeword, config.codewordSalt, config.codewordHash);

  if (!isValid) {
    await registerFailedAttempt(config, 'DELETE_MEMORY_AUTH');
    return {
      authorized: false,
      reason: 'Incorrect Codeword. Memory deletion rejected.',
    };
  }

  // Verification successful
  await registerSuccessfulAttempt(config, 'DELETE_MEMORY_AUTH');
  return { authorized: true };
}
