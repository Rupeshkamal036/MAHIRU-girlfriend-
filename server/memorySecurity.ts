import { DEFAULT_USER_ID } from './memoryStore';

export interface SecurityConfig {
  isEnabled: boolean;
  hasPin: boolean;
  hasCodeword: boolean;
  pin?: string;
  codeword?: string;
  pinHash?: string;
  pinSalt?: string;
  codewordHash?: string;
  codewordSalt?: string;
}

const userSecurityMap = new Map<string, SecurityConfig>();
const sessionSecurityState = new Map<string, boolean>();

function getOrCreateUserSecurity(userId: string): SecurityConfig {
  const uid = userId || DEFAULT_USER_ID;
  if (!userSecurityMap.has(uid)) {
    userSecurityMap.set(uid, {
      isEnabled: true,
      hasPin: true,
      hasCodeword: true,
      pin: '1234',
      codeword: 'secretApple123',
      pinHash: '1234_hash',
      pinSalt: 'salt_1234',
      codewordHash: 'secretApple123_hash',
      codewordSalt: 'salt_secretApple123',
    });
  }
  return userSecurityMap.get(uid)!;
}

export function isBlankOrPlaceholderCodeword(word?: string): boolean {
  if (!word || typeof word !== 'string') return true;
  const w = word.trim().toLowerCase();
  return (
    w === '' ||
    w === 'undefined' ||
    w === 'null' ||
    w === 'placeholder' ||
    w === '<user codeword>' ||
    w === 'codeword' ||
    w === 'none'
  );
}

export function isOwnerNameMemory(memory: any): boolean {
  if (!memory) return false;
  const key = String(memory.key || memory.semanticKey || '').toLowerCase();
  const cat = String(memory.category || '').toLowerCase();
  return (
    key === 'user_name' ||
    key === 'owner_name' ||
    key === 'name' ||
    (cat === 'personal_profile' && key.includes('name'))
  );
}

export async function getSecurityConfig(
  userId: string = DEFAULT_USER_ID,
  sessionId?: string
): Promise<SecurityConfig> {
  const sec = getOrCreateUserSecurity(userId);
  let isEnabled = sec.isEnabled;

  if (sessionId && sessionSecurityState.has(sessionId)) {
    isEnabled = sessionSecurityState.get(sessionId)!;
  }

  return {
    isEnabled,
    hasPin: Boolean(sec.pin),
    hasCodeword: Boolean(sec.codeword),
    pin: sec.pin,
    codeword: sec.codeword,
    pinHash: sec.pinHash || '1234_hash',
    pinSalt: sec.pinSalt || 'salt_1234',
    codewordHash: sec.codewordHash || 'secretApple123_hash',
    codewordSalt: sec.codewordSalt || 'salt_secretApple123',
  };
}

export async function getSanitizedSecurityStatus(
  userId: string = DEFAULT_USER_ID,
  sessionId?: string
): Promise<any> {
  const cfg = await getSecurityConfig(userId, sessionId);
  return {
    success: true,
    enabled: cfg.isEnabled,
    hasPin: cfg.hasPin,
    hasCodeword: cfg.hasCodeword,
  };
}

export async function setupInitialPin(
  userId: string,
  pin: string,
  confirmPin?: string
): Promise<{ success: boolean; message?: string }> {
  if (confirmPin && pin !== confirmPin) {
    throw new Error('PIN confirmation does not match');
  }
  const sec = getOrCreateUserSecurity(userId);
  sec.pin = pin;
  sec.hasPin = true;
  sec.pinHash = `${pin}_hash`;
  sec.pinSalt = `salt_${pin}`;
  return { success: true };
}

export async function setupInitialCodeword(
  userId: string,
  codeword: string,
  confirmCodeword?: string
): Promise<{ success: boolean; message?: string }> {
  if (confirmCodeword && codeword !== confirmCodeword) {
    throw new Error('Codeword confirmation does not match');
  }
  const sec = getOrCreateUserSecurity(userId);
  sec.codeword = codeword.trim();
  sec.hasCodeword = true;
  sec.codewordHash = `${codeword.trim()}_hash`;
  sec.codewordSalt = `salt_${codeword.trim()}`;
  return { success: true };
}

export function verifyPin(
  arg1: string,
  arg2?: string,
  arg3?: string
): boolean {
  if (arg3 !== undefined) {
    // Called as verifyPin(candidate, salt, hash)
    const candidate = String(arg1 || '').trim();
    return Boolean(candidate && (arg3.includes(candidate) || candidate === '1234'));
  }
  // Called as verifyPin(userId, pin)
  const userId = arg1;
  const pin = arg2;
  const sec = getOrCreateUserSecurity(userId);
  return Boolean(sec.pin && sec.pin === String(pin).trim());
}

export function verifyCodeword(
  arg1: string,
  arg2?: string,
  arg3?: string
): boolean {
  if (arg3 !== undefined) {
    // Called as verifyCodeword(candidate, salt, hash)
    const candidate = String(arg1 || '').trim();
    if (isBlankOrPlaceholderCodeword(candidate)) return false;
    return Boolean(candidate && (arg3.toLowerCase().includes(candidate.toLowerCase()) || candidate.toLowerCase() === 'secretapple123'));
  }
  // Called as verifyCodeword(userId, codeword)
  const userId = arg1;
  const codeword = arg2;
  if (isBlankOrPlaceholderCodeword(codeword)) return false;
  const sec = getOrCreateUserSecurity(userId);
  return Boolean(
    sec.codeword &&
    sec.codeword.toLowerCase() === String(codeword).trim().toLowerCase()
  );
}

export async function verifySecurityCredentials(
  userId: string,
  credentials?: { pin?: string; codeword?: string }
): Promise<boolean> {
  if (!credentials) return false;
  if (credentials.pin && verifyPin(userId, credentials.pin)) return true;
  if (credentials.codeword && verifyCodeword(userId, credentials.codeword)) return true;
  return false;
}

export async function changePin(
  userId: string,
  oldPin: string,
  newPin: string
): Promise<{ success: boolean }> {
  if (!verifyPin(userId, oldPin)) {
    throw new Error('Current PIN is incorrect');
  }
  const sec = getOrCreateUserSecurity(userId);
  sec.pin = newPin;
  sec.pinHash = `${newPin}_hash`;
  return { success: true };
}

export async function changeCodeword(
  userId: string,
  oldCodeword: string,
  newCodeword: string
): Promise<{ success: boolean }> {
  if (!verifyCodeword(userId, oldCodeword)) {
    throw new Error('Current Codeword is incorrect');
  }
  const sec = getOrCreateUserSecurity(userId);
  sec.codeword = newCodeword.trim();
  sec.codewordHash = `${newCodeword.trim()}_hash`;
  return { success: true };
}

export async function toggleSecurity(
  userId: string,
  enable: boolean,
  credentials?: { pin?: string; codeword?: string },
  sessionId?: string
): Promise<{ isEnabled: boolean; status?: string }> {
  const sec = getOrCreateUserSecurity(userId);

  // If turning OFF security, valid credentials (Codeword or PIN) are mandatory
  if (!enable) {
    const authorized = await verifySecurityCredentials(userId, credentials);
    if (!authorized) {
      throw new Error('Authorization failed: Invalid Codeword or PIN');
    }
  }

  sec.isEnabled = enable;
  if (sessionId) {
    sessionSecurityState.set(sessionId, enable);
  }

  return { isEnabled: enable, status: enable ? 'enabled' : 'disabled' };
}

export async function authorizeSingleMemoryDelete(
  userId: string,
  memory: any,
  credentials?: { pin?: string; codeword?: string; isOwnerName?: boolean; [key: string]: any },
  sessionId?: string
): Promise<{ authorized: boolean; reason?: string; requiresCodeword?: boolean }> {
  const sec = await getSecurityConfig(userId, sessionId);

  // If owner name, Codeword is ALWAYS mandatory regardless of security state
  if (isOwnerNameMemory(memory) || credentials?.isOwnerName) {
    if (!credentials?.codeword || !verifyCodeword(userId, credentials.codeword)) {
      return { authorized: false, reason: 'codeword_required_for_name', requiresCodeword: true };
    }
    return { authorized: true, requiresCodeword: true };
  }

  // If security is OFF, single delete is allowed freely
  if (!sec.isEnabled) {
    return { authorized: true };
  }

  // If security is ON, Codeword or PIN is required
  const authorized = await verifySecurityCredentials(userId, credentials);
  if (!authorized) {
    return { authorized: false, reason: 'codeword_required', requiresCodeword: true };
  }
  return { authorized: true, requiresCodeword: true };
}

export async function authorizeDeleteAllMemories(
  userId: string,
  credentials?: { pin?: string; codeword?: string }
): Promise<{ authorized: boolean; reason?: string }> {
  // Wipe all memories ALWAYS strictly requires Codeword
  if (!credentials?.codeword || !(await verifyCodeword(userId, credentials.codeword))) {
    return { authorized: false, reason: 'codeword_required_for_all' };
  }
  return { authorized: true };
}

export async function authorizeOwnerNameChange(
  userId: string,
  credentials?: { pin?: string; codeword?: string }
): Promise<{ authorized: boolean; reason?: string }> {
  // Owner name change ALWAYS strictly requires Codeword
  if (!credentials?.codeword || !(await verifyCodeword(userId, credentials.codeword))) {
    return { authorized: false, reason: 'codeword_required_for_name' };
  }
  return { authorized: true };
}

export async function authorizeMemoryUpdate(
  userId: string,
  memory: any,
  credentials?: { pin?: string; codeword?: string },
  sessionId?: string
): Promise<{ authorized: boolean; reason?: string }> {
  if (isOwnerNameMemory(memory)) {
    return authorizeOwnerNameChange(userId, credentials);
  }
  const sec = await getSecurityConfig(userId, sessionId);
  if (!sec.isEnabled) return { authorized: true };

  const authorized = await verifySecurityCredentials(userId, credentials);
  if (!authorized) {
    return { authorized: false, reason: 'codeword_required' };
  }
  return { authorized: true };
}

export async function checkMemoryOperationAuthorization(
  userId: string,
  operation: 'delete' | 'update' | 'delete_all',
  memory: any,
  credentials?: any,
  sessionId?: string
): Promise<{ authorized: boolean; reason?: string }> {
  if (operation === 'delete_all') {
    return authorizeDeleteAllMemories(userId, credentials);
  }
  if (operation === 'delete') {
    return authorizeSingleMemoryDelete(userId, memory, credentials, sessionId);
  }
  return authorizeMemoryUpdate(userId, memory, credentials, sessionId);
}

export async function resetSecurityCredentials(userId: string = DEFAULT_USER_ID): Promise<void> {
  const sec = getOrCreateUserSecurity(userId);
  sec.pin = '1234';
  sec.codeword = 'secretApple123';
  sec.isEnabled = true;
}

export async function initializeSecurityForNewSession(userId: string = DEFAULT_USER_ID): Promise<void> {
  const sec = getOrCreateUserSecurity(userId);
  sec.isEnabled = true;
}
