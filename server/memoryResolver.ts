import { getMemories, createMemory, updateMemory, deleteMemory, DEFAULT_USER_ID } from './memoryStore';
import {
  checkMemoryOperationAuthorization,
  authorizeMemoryUpdate,
  authorizeSingleMemoryDelete,
  authorizeOwnerNameChange,
  authorizeDeleteAllMemories,
  isOwnerNameMemory,
  getSecurityConfig,
  verifyCodeword,
  verifyPin,
  isBlankOrPlaceholderCodeword,
  toggleSecurity,
} from './memorySecurity';
import { containsSensitiveCredentials, extractWithRules } from './memoryExtractor';
import {
  classifyMemorySemantic,
  evaluateMemoryDecision,
  isSemanticCategory,
  cleanEntityValue,
} from './memoryCategorySchema';
import { isExplicitSaveCommand } from './automaticMemorySaving';
import type { MemoryRecord } from '../src/types';

/**
 * Robust extraction of candidate codeword from user spoken or typed natural language text.
 * Correctly handles English and Hindi/Hinglish patterns, connector words (is, hai, tha, :),
 * and avoids extracting placeholder words.
 */
export function extractCodewordFromText(rawText: string): string | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();

  // Pattern 1: codeword [is|hai|tha|:=] <codeword>
  const match1 = text.match(/(?:code\s*word|codeword|passcode|secret\s*word)[\s:=]+(?:is|hai|tha|=|:)?\s*([a-zA-Z0-9_\-.'"]+)/i);
  if (match1 && match1[1]) {
    const val = match1[1].replace(/^[='":\s]+|[='":\s.!]+$/g, '').trim();
    if (val && !isBlankOrPlaceholderCodeword(val)) {
      return val;
    }
  }

  // Pattern 2: <codeword> (is my|mera) codeword
  const match2 = text.match(/([a-zA-Z0-9_\-.'"]+)\s+(?:is\s+my|is\s+the|mera)\s+(?:code\s*word|codeword|secret\s*word)/i);
  if (match2 && match2[1]) {
    const val = match2[1].replace(/^[='":\s]+|[='":\s.!]+$/g, '').trim();
    if (val && !isBlankOrPlaceholderCodeword(val)) {
      return val;
    }
  }

  // Pattern 3: (mera|my) (secret) codeword <codeword> (hai|tha)?
  const match3 = text.match(/(?:mera|meri|my|the|apna)\s+(?:secret\s*)?(?:code\s*word|codeword|secret\s*word)\s+([a-zA-Z0-9_\-.'"]+)/i);
  if (match3 && match3[1]) {
    const val = match3[1].replace(/^[='":\s]+|[='":\s.!]+$/g, '').trim();
    if (val && !isBlankOrPlaceholderCodeword(val)) {
      return val;
    }
  }

  return null;
}

export interface MemoryMatchResult {
  memory: MemoryRecord;
  score: number;
  matchField: 'id' | 'key' | 'value' | 'content' | 'semantic';
}

export type ResolutionStatus = 'single_match' | 'ambiguous' | 'not_found';

export interface MemoryResolutionResult {
  status: ResolutionStatus;
  memory?: MemoryRecord;
  matches?: MemoryRecord[];
  clarificationPrompt?: string;
  query: string;
}

export interface MemoryUpdateParams {
  userId?: string;
  query?: string;
  memoryId?: string;
  newValue?: string;
  content?: string;
  codeword?: string;
  pin?: string;
  rawText?: string;
  sessionId?: string;
}

export interface MemoryUpdateResult {
  success: boolean;
  status: 'updated' | 'codeword_required' | 'auth_failed' | 'ambiguous' | 'not_found' | 'error';
  updatedMemory?: {
    id: string;
    key: string;
    value: string;
    category: string;
  };
  clarification?: string;
  matches?: Array<{
    id: string;
    key: string;
    value: string;
    category: string;
  }>;
  requiresCodeword?: boolean;
  message: string;
  error?: string;
}

export interface VoiceDeleteParams {
  userId?: string;
  query?: string;
  memoryId?: string;
  codeword?: string;
  pin?: string;
}

export interface VoiceDeleteResult {
  success: boolean;
  status: 'deleted' | 'codeword_required' | 'auth_failed' | 'ambiguous' | 'not_found' | 'error';
  deletedMemory?: {
    id: string;
    key: string;
    value: string;
    category: string;
  };
  clarification?: string;
  matches?: Array<{
    id: string;
    key: string;
    value: string;
    category: string;
  }>;
  requiresCodeword?: boolean;
  message: string;
  error?: string;
}

/**
 * Checks if a natural-language text turn expresses an intent to delete, forget, or remove a memory.
 */
export function isDeleteIntent(rawText: string): boolean {
  if (!rawText || typeof rawText !== 'string') return false;
  const text = rawText.toLowerCase().trim();

  // English delete keywords
  const englishDelete = /\b(?:delete|remove|erase|forget|clear|drop)\s+(?:the\s+|my\s+|our\s+)?(?:permanent\s+)?(?:memory|preference|fact|detail|info|information)?\b/i;
  const englishForget = /\b(?:forget|delete)\s+(?:that|about|my)\b/i;

  // Hindi / Hinglish delete keywords
  const hinglishDelete = /(?:memory\s*(?:se\s*)?(?:delete|hata|mita|bhool)|(?:delete|hata|mita|bhool)\s*(?:karo|kar do|kar|dena|kardo|dijiye|do)|wali\s+memory\s+delete|wala\s+memory\s+delete|memory\s+se\s+hatao)/i;
  const hindiSpecific = /(?:bhool jao|yaad mat rakhna|hata do|mita do|delete kardo)/i;

  return (
    englishDelete.test(text) ||
    englishForget.test(text) ||
    hinglishDelete.test(text) ||
    hindiSpecific.test(text)
  );
}

/**
 * Checks if a natural-language text turn expresses an intent to delete, clear, or wipe ALL memories.
 */
export function isDeleteAllIntent(rawText?: string): boolean {
  if (!rawText || typeof rawText !== 'string') return false;
  const text = rawText.toLowerCase().trim();
  const allPatterns = [
    /\b(?:delete|clear|erase|remove|wipe)\s+(?:all|everything|all\s+permanent)\s*(?:the\s+)?(?:memories|memory)?\b/i,
    /\b(?:saari|sari|sab|all)\s+(?:permanent\s+)?(?:memories|memory)\s*(?:ko\s*)?(?:delete|clear|hata|mita)\b/i,
    /\b(?:delete|clear|hata|mita)\s*(?:karo|kar\s*do|kardo|dijiye|do)?\s*(?:saari|sari|sab|all)\s+(?:permanent\s+)?(?:memories|memory)\b/i,
    /\b(?:sab\s+kuch|everything)\s+(?:delete|clear|hata|mita)\s*(?:karo|kar\s*do|kardo)?\b/i,
    /\b(?:delete|clear)\s+all\b/i,
    /\ball\s+(?:permanent\s+)?(?:memories|memory)\b/i,
  ];
  return allPatterns.some((p) => p.test(text));
}

export interface SecurityToggleIntentResult {
  isToggle: boolean;
  action?: 'enable' | 'disable';
  candidateCodeword?: string;
}

/**
 * Detects natural voice commands requesting to turn Memory Security ON or OFF.
 * Understands natural Hindi, Hinglish, and English variations.
 * 
 * OFF commands:
 * - "Memory security ko band karo"
 * - "Memory security off karo"
 * - "Security band kar do"
 * - "Security ko off karo"
 * - "Security off karo"
 * - "Turn memory security off"
 * - "Disable memory security"
 * - "Turn off security"
 * - "Turn off memory security"
 * 
 * ON commands:
 * - "Memory security ko on karo"
 * - "Memory security on karo"
 * - "Security ko on karo"
 * - "Security on kar do"
 * - "Security chalu karo"
 * - "Turn memory security on"
 * - "Enable memory security"
 * - "Turn on security"
 * - "Turn on memory security"
 */
export function isSecurityToggleIntent(rawText: string): SecurityToggleIntentResult {
  if (!rawText || typeof rawText !== 'string') return { isToggle: false };
  const text = rawText.toLowerCase().trim();

  // OFF / Disable patterns
  const offPatterns = [
    /\b(?:memory\s+)?security\s*(?:ko\s*)?(?:band|off|disable|deactivate|stop)\s*(?:karo|kar\s*do|kardo|dijiye|do|karna)?\b/i,
    /\b(?:band|off|disable|deactivate|stop)\s*(?:karo|kar\s*do|kardo|dijiye|do)?\s*(?:ko\s*)?(?:memory\s+)?security\b/i,
    /\b(?:turn\s+off|disable|deactivate|stop)\s+(?:the\s+)?(?:memory\s+)?security\b/i,
    /\bturn\s+(?:the\s+)?(?:memory\s+)?security\s+off\b/i,
  ];

  // ON / Enable patterns
  const onPatterns = [
    /\b(?:memory\s+)?security\s*(?:ko\s*)?(?:on|enable|activate|start|chalu)\s*(?:karo|kar\s*do|kardo|dijiye|do|karna)?\b/i,
    /\b(?:on|enable|activate|start|chalu)\s*(?:karo|kar\s*do|kardo|dijiye|do)?\s*(?:ko\s*)?(?:memory\s+)?security\b/i,
    /\b(?:turn\s+on|enable|activate|start)\s+(?:the\s+)?(?:memory\s+)?security\b/i,
    /\bturn\s+(?:the\s+)?(?:memory\s+)?security\s+on\b/i,
  ];

  const isOff = offPatterns.some((p) => p.test(text));
  const isOn = onPatterns.some((p) => p.test(text));

  if (!isOff && !isOn) {
    return { isToggle: false };
  }

  const action: 'enable' | 'disable' = isOff ? 'disable' : 'enable';
  const candidateCodeword = extractCodewordFromText(rawText) || undefined;

  return {
    isToggle: true,
    action,
    candidateCodeword,
  };
}

/**
 * Cleans and extracts the core memory topic/keyword from a natural language delete query.
 */
export function extractMemoryTargetTopic(rawQuery: string): string {
  let cleaned = String(rawQuery || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim();

  // Strip common command phrases and filler words (English + Hindi/Hinglish)
  const stopPhrases = [
    /\bmemory se ise delete karo\b/g,
    /\bmemory se delete karo\b/g,
    /\bmemory se hata do\b/g,
    /\bise delete karo\b/g,
    /\bdelete memory\b/g,
    /\bdelete karo\b/g,
    /\bdelete kar do\b/g,
    /\bdelete kardo\b/g,
    /\bhata do\b/g,
    /\bhatao\b/g,
    /\bmita do\b/g,
    /\bbhool jao\b/g,
    /\bwali memory\b/g,
    /\bwala memory\b/g,
    /\bki memory\b/g,
    /\bka memory\b/g,
    /\bmemory\b/g,
    /\bplease\b/g,
    /\bmera\b/g,
    /\bmeri\b/g,
    /\bmere\b/g,
    /\bko\b/g,
    /\bse\b/g,
    /\bki\b/g,
    /\bka\b/g,
    /\bhai\b/g,
    /\btha\b/g,
    /\bthi\b/g,
    /\babout\b/g,
    /\bthat\b/g,
    /\bmy\b/g,
    /\bthe\b/g,
    /\bdelete\b/g,
    /\bremove\b/g,
    /\bforget\b/g,
  ];

  for (const regex of stopPhrases) {
    cleaned = cleaned.replace(regex, ' ');
  }

  // Normalize spelling variations (e.g., favourite -> favorite)
  cleaned = cleaned
    .replace(/\bfavourite\b/g, 'favorite')
    .replace(/\brang\b/g, 'color')
    .replace(/\bkhana\b/g, 'food')
    .replace(/\bnaam\b/g, 'name')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Resolves a user's natural language delete query or memoryId to a specific target memory.
 * Employs ambiguity detection to prevent accidental deletions when multiple memories match.
 */
export async function resolveMemoryForDeletion(
  userId: string = DEFAULT_USER_ID,
  query?: string,
  memoryId?: string
): Promise<MemoryResolutionResult> {
  const memories = await getMemories(userId);

  if (!memories || memories.length === 0) {
    return {
      status: 'not_found',
      query: query || memoryId || '',
    };
  }

  // 1. Exact Memory ID match
  if (memoryId && typeof memoryId === 'string' && memoryId.trim()) {
    const trimmedId = memoryId.trim();
    const exactIdMatch = memories.find((m) => m.id === trimmedId || m.memoryId === trimmedId);
    if (exactIdMatch) {
      return {
        status: 'single_match',
        memory: exactIdMatch,
        query: trimmedId,
      };
    }
  }

  const rawQuery = String(query || memoryId || '').trim();
  if (!rawQuery) {
    return {
      status: 'not_found',
      query: '',
    };
  }

  // Check if query is directly an exact ID
  const directIdMatch = memories.find((m) => m.id === rawQuery || m.memoryId === rawQuery);
  if (directIdMatch) {
    return {
      status: 'single_match',
      memory: directIdMatch,
      query: rawQuery,
    };
  }

  // 2. Natural language / key / value matching
  const targetTopic = extractMemoryTargetTopic(rawQuery);
  const normalizedQuery = rawQuery.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const scoredMatches: MemoryMatchResult[] = [];

  for (const mem of memories) {
    const memKey = (mem.key || '').toLowerCase().replace(/_/g, ' ').replace(/\bfavourite\b/g, 'favorite');
    const memVal = (mem.value || mem.content || '').toLowerCase();
    const memCat = (mem.category || '').toLowerCase().replace(/_/g, ' ');

    let score = 0;
    let matchField: MemoryMatchResult['matchField'] = 'semantic';

    // Exact matches
    if (targetTopic && memKey === targetTopic) {
      score = 100;
      matchField = 'key';
    } else if (targetTopic && memVal === targetTopic) {
      score = 100;
      matchField = 'value';
    } else if (memKey === normalizedQuery) {
      score = 95;
      matchField = 'key';
    } else if (memVal === normalizedQuery) {
      score = 95;
      matchField = 'value';
    }

    // Substring containment
    if (score === 0 && targetTopic && targetTopic.length >= 3) {
      if (memKey.includes(targetTopic) || targetTopic.includes(memKey)) {
        score = 85;
        matchField = 'key';
      } else if (memVal.includes(targetTopic) || targetTopic.includes(memVal)) {
        score = 80;
        matchField = 'value';
      }
    }

    // Token-level overlap
    if (score === 0) {
      const topicTokens = (targetTopic || normalizedQuery).split(/\s+/).filter((t) => t.length > 2);
      const keyTokens = memKey.split(/\s+/);
      const valTokens = memVal.split(/\s+/);

      let keyHits = 0;
      let valHits = 0;

      for (const token of topicTokens) {
        if (keyTokens.some((kt) => kt.includes(token) || token.includes(kt))) keyHits++;
        if (valTokens.some((vt) => vt.includes(token) || token.includes(vt))) valHits++;
      }

      if (keyHits > 0 || valHits > 0) {
        score = 40 + keyHits * 20 + valHits * 20;
        matchField = keyHits >= valHits ? 'key' : 'value';
      }
    }

    if (score > 30) {
      scoredMatches.push({ memory: mem, score, matchField });
    }
  }

  // Sort descending by score
  scoredMatches.sort((a, b) => b.score - a.score);

  if (scoredMatches.length === 0) {
    return {
      status: 'not_found',
      query: rawQuery,
    };
  }

  const top = scoredMatches[0];

  // 3. Ambiguity Check:
  // If multiple memories match and the top 2 are within 15 score points and both score >= 50
  if (scoredMatches.length > 1) {
    const second = scoredMatches[1];
    const isAmbiguous =
      top.score >= 50 &&
      second.score >= 50 &&
      Math.abs(top.score - second.score) <= 15 &&
      top.memory.id !== second.memory.id;

    if (isAmbiguous) {
      const topTwo = [top.memory, second.memory];
      const desc1 = topTwo[0].key.replace(/_/g, ' ') || topTwo[0].value;
      const desc2 = topTwo[1].key.replace(/_/g, ' ') || topTwo[1].value;
      const clarification = `Kaunsi memory delete karun? ${desc1} wali ya ${desc2} wali?`;

      return {
        status: 'ambiguous',
        matches: topTwo,
        clarificationPrompt: clarification,
        query: rawQuery,
      };
    }
  }

  // Clear single match
  if (top.score >= 40) {
    return {
      status: 'single_match',
      memory: top.memory,
      query: rawQuery,
    };
  }

  return {
    status: 'not_found',
    query: rawQuery,
  };
}

/**
 * Executes a voice-requested memory deletion against Cloud Firestore.
 * 
 * STEP 4 SPECIFICATION:
 * 1. Identifies the intended memory via resolveMemoryForDeletion.
 * 2. If memory not found: returns not_found without requesting destructive authorization.
 * 3. If ambiguous: returns clarification prompt without deleting or asking for authorization.
 * 4. If exactly ONE memory resolved:
 *    - Enforces server-side authorization via authorizeSingleMemoryDelete:
 *      * Security OFF: directly allowed without credentials.
 *      * Security ON: strictly requires Codeword. PIN is NOT accepted.
 *    - Only after successful authorization: deletes document from Cloud Firestore.
 * 5. Broadcasts the memory-changed event so the open UI updates immediately.
 * 6. Returns verified result so Gemini confirms only when deletion actually succeeds.
 */
export async function executeVoiceDeleteMemory(
  userIdOrParams: string | VoiceDeleteParams = DEFAULT_USER_ID,
  queryOrBroadcaster?: string | ((event: any) => void),
  memoryId?: string,
  broadcaster?: (event: any) => void,
  credentials?: { codeword?: string; pin?: string }
): Promise<VoiceDeleteResult> {
  try {
    let effectiveUserId = DEFAULT_USER_ID;
    let effectiveQuery: string | undefined = undefined;
    let effectiveMemoryId: string | undefined = undefined;
    let effectiveBroadcaster: ((event: any) => void) | undefined = undefined;
    let effectiveCodeword: string | undefined = undefined;
    let effectivePin: string | undefined = undefined;
    let effectiveSessionId: string | undefined = undefined;

    if (typeof userIdOrParams === 'object' && userIdOrParams !== null) {
      effectiveUserId = userIdOrParams.userId || DEFAULT_USER_ID;
      effectiveQuery = userIdOrParams.query;
      effectiveMemoryId = userIdOrParams.memoryId;
      effectiveCodeword = userIdOrParams.codeword;
      effectivePin = userIdOrParams.pin;
      effectiveSessionId = (userIdOrParams as any).sessionId;
      if (typeof queryOrBroadcaster === 'function') {
        effectiveBroadcaster = queryOrBroadcaster;
      }
    } else {
      effectiveUserId = typeof userIdOrParams === 'string' && userIdOrParams ? userIdOrParams : DEFAULT_USER_ID;
      effectiveQuery = typeof queryOrBroadcaster === 'string' ? queryOrBroadcaster : undefined;
      effectiveMemoryId = memoryId;
      effectiveBroadcaster = broadcaster;
      effectiveCodeword = isBlankOrPlaceholderCodeword(credentials?.codeword) ? undefined : credentials?.codeword?.trim();
      effectivePin = credentials?.pin;
      effectiveSessionId = (credentials as any)?.sessionId;
    }

    // If codeword was spoken together with the delete query, extract it
    if (!effectiveCodeword && effectiveQuery) {
      const extracted = extractCodewordFromText(effectiveQuery);
      if (extracted) {
        effectiveCodeword = extracted;
      }
    }

    // Fallback: If codeword wasn't isolated by pattern, check if the spoken query directly verifies against codeword
    const secConfigForDelete = await getSecurityConfig(effectiveUserId, effectiveSessionId);
    if (!effectiveCodeword && effectiveQuery && secConfigForDelete.hasCodeword && secConfigForDelete.codewordSalt && secConfigForDelete.codewordHash) {
      if (verifyCodeword(effectiveQuery, secConfigForDelete.codewordSalt, secConfigForDelete.codewordHash)) {
        effectiveCodeword = effectiveQuery;
      }
    }

    // Check if user is requesting to delete ALL permanent memories
    if (effectiveMemoryId === 'all' || isDeleteAllIntent(effectiveQuery)) {
      const allAuth = await authorizeDeleteAllMemories(
        effectiveUserId,
        {
          codeword: effectiveCodeword,
          pin: effectivePin,
        },
        effectiveSessionId
      );

      if (!allAuth.authorized) {
        if (allAuth.requiresCodeword) {
          return {
            success: false,
            status: 'codeword_required',
            requiresCodeword: true,
            message: allAuth.reason || 'Delete ALL Permanent Memories strictly requires Codeword authorization.',
          };
        }
        return {
          success: false,
          status: 'auth_failed',
          error: allAuth.reason,
          message: allAuth.reason || 'Incorrect Codeword. Delete all memories rejected.',
        };
      }

      // Authorized: delete all permanent memories (never touching security settings)
      const allMemories = await getMemories(effectiveUserId);
      await Promise.all(allMemories.map((m) => deleteMemory(effectiveUserId, m.id)));

      if (effectiveBroadcaster) {
        effectiveBroadcaster({ type: 'memoryPersisted', action: 'clearAll' });
      }

      console.log(`[Voice Delete] Successfully cleared all permanent memories from Cloud Firestore for user [${effectiveUserId}]`);

      return {
        success: true,
        status: 'deleted',
        message: 'Saari permanent memories delete kar di gayi hain.',
      };
    }

    const resolved = await resolveMemoryForDeletion(effectiveUserId, effectiveQuery, effectiveMemoryId);

    // 1. If memory does not exist: do NOT ask for destructive authorization unnecessarily
    if (resolved.status === 'not_found') {
      return {
        success: false,
        status: 'not_found',
        message: `Koi aisi memory nahi mili jise delete kiya ja sake (query: "${resolved.query}").`,
      };
    }

    // 2. If ambiguous: do NOT authorize or delete; ask for clarification
    if (resolved.status === 'ambiguous' && resolved.matches) {
      return {
        success: false,
        status: 'ambiguous',
        clarification: resolved.clarificationPrompt,
        matches: resolved.matches.map((m) => ({
          id: m.id,
          key: m.key,
          value: m.value,
          category: m.category,
        })),
        message: resolved.clarificationPrompt || 'Multiple matching memories found. Clarification needed.',
      };
    }

    // 3. Exactly one memory resolved: apply server-side authorization gate
    if (resolved.status === 'single_match' && resolved.memory) {
      const target = resolved.memory;
      const isOwner = isOwnerNameMemory(target);

      const authCheck = await authorizeSingleMemoryDelete(
        effectiveUserId,
        {
          codeword: effectiveCodeword,
          pin: effectivePin,
        },
        { isOwnerName: isOwner, targetMemory: target },
        effectiveSessionId
      );

      if (!authCheck.authorized) {
        if (authCheck.requiresCodeword) {
          return {
            success: false,
            status: 'codeword_required',
            requiresCodeword: true,
            message: authCheck.reason || (isOwner
              ? 'Owner name delete karne ke liye Secret Codeword zaroori hai. Please apna secret Codeword bataiye.'
              : 'Security is ON. Secret Codeword is required to delete a permanent memory.'),
          };
        }
        return {
          success: false,
          status: 'auth_failed',
          error: authCheck.reason,
          message: authCheck.reason || 'Authentication failed. Memory deletion rejected.',
        };
      }

      // 4. Firestore DELETE occurs ONLY after successful authorization
      const deleted = await deleteMemory(effectiveUserId, target.id);

      if (!deleted) {
        return {
          success: false,
          status: 'error',
          message: `Memory "${target.key}" delete nahi ho paayi kyunki document Firestore me nahi mila.`,
        };
      }

      // 5. Notify connected frontend clients via existing event mechanism
      if (effectiveBroadcaster) {
        effectiveBroadcaster({
          type: 'memoryPersisted',
          action: 'delete',
          id: target.id,
          deletedMemory: {
            id: target.id,
            key: target.key,
            value: target.value,
          },
        });
      }

      console.log(`[Voice Delete] Successfully deleted memory from Cloud Firestore: [${target.id}] ${target.key}=${target.value}`);

      return {
        success: true,
        status: 'deleted',
        deletedMemory: {
          id: target.id,
          key: target.key,
          value: target.value,
          category: target.category,
        },
        message: `Okay, ${target.key.replace(/_/g, ' ')} wali memory delete kar di.`,
      };
    }

    return {
      success: false,
      status: 'error',
      message: 'Unexpected resolution state.',
    };
  } catch (err: any) {
    console.error('[Voice Delete] Error executing deletion:', err?.message || err);
    return {
      success: false,
      status: 'error',
      error: err?.message || 'Database error occurred',
      message: 'Memory delete karte waqt error aa gaya. Firestore me delete nahi ho saka.',
    };
  }
}

export interface VoiceToggleSecurityParams {
  userId?: string;
  action: 'enable' | 'disable';
  codeword?: string;
  pin?: string;
  rawText?: string;
  sessionId?: string;
}

export interface VoiceToggleSecurityResult {
  success: boolean;
  status: 'enabled' | 'disabled' | 'codeword_required' | 'auth_failed' | 'error';
  requiresCodeword?: boolean;
  message: string;
  error?: string;
  securityStatus?: any;
}

/**
 * Executes a voice or conversational request to turn Memory Security ON or OFF.
 * 
 * Rules:
 * 1. Security ON: directly turns ON. No Codeword or PIN required.
 * 2. Security OFF: strictly requires Codeword. PIN alone must NOT be accepted.
 *    - Missing Codeword results in a Codeword request ('codeword_required').
 *    - Wrong Codeword results in rejection ('auth_failed') and Security remains ON.
 *    - The Codeword itself is never stored as normal memory or logged in plaintext.
 *    - Turning Security OFF is scoped to the active application session.
 */
export async function executeVoiceToggleSecurity(
  params: VoiceToggleSecurityParams,
  broadcaster?: (event: any) => void
): Promise<VoiceToggleSecurityResult> {
  const userId = params.userId || DEFAULT_USER_ID;
  const action = params.action;
  const sessionId = params.sessionId;

  // 1. SECURITY ON BEHAVIOR
  if (action === 'enable') {
    try {
      const status = await toggleSecurity(userId, true, undefined, sessionId);
      if (broadcaster) {
        broadcaster({ type: 'securityChanged', enabled: true, status });
      }
      return {
        success: true,
        status: 'enabled',
        message: 'Memory security successfully on ho gayi hai.',
        securityStatus: status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'error',
        message: 'Memory security ON karne me error aaya.',
        error: err?.message || 'Failed to enable security',
      };
    }
  }

  // 2. SECURITY OFF BEHAVIOR
  const config = await getSecurityConfig(userId, sessionId);

  if (!config.isEnabled) {
    return {
      success: true,
      status: 'disabled',
      message: 'Memory security already band hai.',
      securityStatus: config,
    };
  }

  // Determine candidate codeword
  let effectiveCodeword = isBlankOrPlaceholderCodeword(params.codeword) ? undefined : params.codeword?.trim();

  // If rawText had codeword
  if (!effectiveCodeword && params.rawText) {
    const extracted = extractCodewordFromText(params.rawText);
    if (extracted) {
      effectiveCodeword = extracted;
    }
  }

  // Fallback: If utterance itself is the codeword
  if (!effectiveCodeword && params.rawText && config.hasCodeword && config.codewordSalt && config.codewordHash) {
    if (verifyCodeword(params.rawText, config.codewordSalt, config.codewordHash)) {
      effectiveCodeword = params.rawText.trim();
    }
  }

  // If PIN alone was provided without codeword:
  if (!effectiveCodeword && params.pin && params.pin.trim()) {
    return {
      success: false,
      status: 'codeword_required',
      requiresCodeword: true,
      message: 'Memory security band karne ke liye PIN nahi, Secret Codeword chahiye. Please apna Codeword bataiye.',
      error: 'PIN alone is not accepted. Codeword required to turn security OFF.',
    };
  }

  // If missing Codeword:
  if (!effectiveCodeword) {
    return {
      success: false,
      status: 'codeword_required',
      requiresCodeword: true,
      message: 'Memory security band karne ke liye please apna secret Codeword bataiye.',
    };
  }

  // Server verifies Codeword
  try {
    const status = await toggleSecurity(userId, false, { codeword: effectiveCodeword }, sessionId);
    if (broadcaster) {
      broadcaster({ type: 'securityChanged', enabled: false, status });
    }
    return {
      success: true,
      status: 'disabled',
      message: 'Memory security successfully band ho gayi hai.',
      securityStatus: status,
    };
  } catch (err: any) {
    if (err?.code === 'CODEWORD_REQUIRED_TO_DISABLE' || err?.message?.includes('required')) {
      return {
        success: false,
        status: 'codeword_required',
        requiresCodeword: true,
        message: 'Memory security band karne ke liye please apna secret Codeword bataiye.',
        error: err.message,
      };
    }
    return {
      success: false,
      status: 'auth_failed',
      message: 'Incorrect Codeword. Memory security band nahi hui, security ON hi rahegi.',
      error: err?.message || 'Incorrect Codeword. Security remains ON.',
    };
  }
}

/**
 * Checks if a natural-language text turn expresses an intent to update or change an existing memory.
 */
export function isUpdateIntent(rawText: string): boolean {
  if (!rawText || typeof rawText !== 'string') return false;
  const text = rawText.toLowerCase().trim();

  // Explicit update words
  const updateWords = /\b(?:change|update|modify|replace|badal|badlo|badalna)\b/i;

  // Natural state transition patterns: "ab ... hai", "se ... kar do", "is now", "= ..."
  const hinglishPatterns = /(?:mera|meri|mere|my)\s+.+?\s+ab\s+|ab\s+(?:se\s+)?(?:mera|meri|mere)|(?:se|\bto\b)\s+.+?\s*(?:kar\s*do|kardo|karo)|change\s*(?:karo|kar\s*do|kardo)/i;

  const englishPatterns = /\b(?:is\s+now|changed\s+to|updated?\s+to)\b/i;

  return updateWords.test(text) || hinglishPatterns.test(text) || englishPatterns.test(text);
}

function cleanTopicString(raw: string): string {
  let cleaned = String(raw || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim();

  // Strip stop words
  const stopWords = [
    /\bmera\b/g, /\bmeri\b/g, /\bmere\b/g, /\bmy\b/g, /\bthe\b/g,
    /\bka\b/g, /\bki\b/g, /\bko\b/g, /\bse\b/g, /\bhai\b/g,
    /\btha\b/g, /\bthi\b/g, /\bkar do\b/g, /\bkardo\b/g,
    /\bchange\b/g, /\bupdate\b/g, /\bto\b/g, /\bis\b/g, /\bnow\b/g,
  ];
  for (const sw of stopWords) {
    cleaned = cleaned.replace(sw, ' ');
  }

  return cleaned
    .replace(/\bfavourite\b/g, 'favorite')
    .replace(/\brang\b/g, 'color')
    .replace(/\bkhana\b/g, 'food')
    .replace(/\bnaam\b/g, 'name')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanValueString(raw: string): string {
  let val = String(raw || '')
    .trim()
    .replace(/^[='":\s]+|[='":\s.!]+$/g, '')
    .replace(/(?:,\s*)?(?:aur\s+|and\s+)?(?:mera\s+|my\s+)?(?:secret\s*)?(?:code\s*word|codeword|passcode|secret)[\s:=].*$/i, '')
    .replace(/\s+(?:hai|tha|thi|h|rakhna|rakho|kar\s*do|kardo)$/i, '')
    .trim();
  return val.replace(/^[='":\s]+|[='":\s.!]+$/g, '').trim();
}

/**
 * Extracts target memory topic and new value from natural language turn.
 */
export function extractUpdateTargetAndValue(rawText: string): { targetTopic?: string; newValue?: string } {
  if (!rawText || typeof rawText !== 'string') return {};
  const text = rawText.trim();

  // Pattern A0: "Ab (se) (mera|meri|mere|my) <topic> <value> hai/rakhna/hoga"
  // e.g. "Ab mera naam Rahul hai" -> topic: "name", value: "Rahul"
  const abStartMatch = text.match(/^ab(?:\s+se)?\s+(?:mera|meri|mere|my\s+)?(.+?)\s+([A-Za-z0-9_-]+)(?:\s+hai|\s+rakhna|\s+hoga|\s+kar\s*do|\s+kardo|[,.!]|\s+aur|\s+and|\s+codeword|$)/i);
  if (abStartMatch) {
    return {
      targetTopic: cleanTopicString(abStartMatch[1]),
      newValue: cleanValueString(abStartMatch[2]),
    };
  }

  // Pattern A: "(Mera) <topic> ab (se) <value> hai"
  // e.g. "Mera favourite color ab Blue hai" -> topic: "favourite color", value: "Blue"
  // e.g. "favourite color ab Purple hai, codeword is sunflower" -> topic: "favorite color", value: "Purple"
  const abMatch = text.match(/(?:mera|meri|mere|my\s+)?(.+?)\s+ab(?:\s+se)?\s+(.+?)(?:\s+hai|\s+rakhna|\s+kar\s*do|\s+kardo|[,.!]|\s+aur|\s+and|\s+codeword|$)/i);
  if (abMatch) {
    return {
      targetTopic: cleanTopicString(abMatch[1]),
      newValue: cleanValueString(abMatch[2]),
    };
  }

  // Pattern B: "<topic> <oldValue> se <newValue> kar do/kardo/change karo"
  // e.g. "Mera favourite color Black se Blue kar do"
  // e.g. "Favourite Color Black se Blue kar do"
  const seMatch = text.match(/(?:mera|meri|mere|my\s+)?(.+?)\s+(?:se|\bfrom\b.+?\bto\b)\s+(.+?)(?:\s+kar\s*do|\s+kardo|\s+banado|\s+badal\s*do|\s+change\s*karo|[,.!]|\s+aur|\s+and|\s+codeword|$)/i);
  if (seMatch) {
    return {
      targetTopic: cleanTopicString(seMatch[1]),
      newValue: cleanValueString(seMatch[2]),
    };
  }

  // Pattern C: "Change/Update (my) <topic> to <newValue>"
  // e.g. "Change Favourite Color to Blue"
  const changeToMatch = text.match(/(?:change|update|modify|set)\s+(?:my\s+|the\s+)?(.+?)\s+to\s+(.+?)(?:[,.!]|\s+aur|\s+and|\s+codeword|$)/i);
  if (changeToMatch) {
    return {
      targetTopic: cleanTopicString(changeToMatch[1]),
      newValue: cleanValueString(changeToMatch[2]),
    };
  }

  // Pattern D: "(my) <topic> is now <newValue>"
  const isNowMatch = text.match(/(?:my\s+|the\s+)?(.+?)\s+is\s+now\s+(.+?)(?:[,.!]|\s+aur|\s+and|\s+codeword|$)/i);
  if (isNowMatch) {
    return {
      targetTopic: cleanTopicString(isNowMatch[1]),
      newValue: cleanValueString(isNowMatch[2]),
    };
  }

  // Pattern E: "Mera <topic> change karke <newValue> kar do"
  const karkeMatch = text.match(/(?:mera|meri|mere|my\s+)?(.+?)\s+(?:change\s+karke|badal\s+ke)\s+(.+?)(?:\s+kar\s*do|\s+kardo|[,.!]|\s+aur|\s+and|\s+codeword|$)/i);
  if (karkeMatch) {
    return {
      targetTopic: cleanTopicString(karkeMatch[1]),
      newValue: cleanValueString(karkeMatch[2]),
    };
  }

  return {};
}

/**
 * Resolves an existing memory for an update operation.
 * Supports exact memoryId, direct ID in query, semantic topic matching, and ambiguity detection.
 */
export async function resolveMemoryForUpdate(
  userId: string = DEFAULT_USER_ID,
  query?: string,
  memoryId?: string,
  newValue?: string
): Promise<MemoryResolutionResult> {
  const memories = await getMemories(userId);

  if (!memories || memories.length === 0) {
    return {
      status: 'not_found',
      query: query || memoryId || '',
    };
  }

  // 1. Exact Memory ID match
  if (memoryId && typeof memoryId === 'string' && memoryId.trim()) {
    const trimmedId = memoryId.trim();
    const exactIdMatch = memories.find((m) => m.id === trimmedId || m.memoryId === trimmedId);
    if (exactIdMatch) {
      return {
        status: 'single_match',
        memory: exactIdMatch,
        query: trimmedId,
      };
    }
  }

  const rawQuery = String(query || memoryId || '').trim();
  if (!rawQuery) {
    return {
      status: 'not_found',
      query: '',
    };
  }

  // Check if query is directly an exact ID
  const directIdMatch = memories.find((m) => m.id === rawQuery || m.memoryId === rawQuery);
  if (directIdMatch) {
    return {
      status: 'single_match',
      memory: directIdMatch,
      query: rawQuery,
    };
  }

  // 2. Natural language / semantic matching
  const extracted = extractUpdateTargetAndValue(rawQuery);
  const targetTopic = extracted.targetTopic || cleanTopicString(rawQuery);
  const normalizedQuery = rawQuery.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const scoredMatches: MemoryMatchResult[] = [];

  for (const mem of memories) {
    const memKey = (mem.key || '').toLowerCase().replace(/_/g, ' ').replace(/\bfavourite\b/g, 'favorite');
    const memVal = (mem.value || mem.content || '').toLowerCase();
    const memCat = (mem.category || '').toLowerCase().replace(/_/g, ' ');

    let score = 0;
    let matchField: MemoryMatchResult['matchField'] = 'semantic';

    // Exact matches
    if (targetTopic && memKey === targetTopic) {
      score = 100;
      matchField = 'key';
    } else if (targetTopic && memVal === targetTopic) {
      score = 95;
      matchField = 'value';
    } else if (memKey === normalizedQuery) {
      score = 95;
      matchField = 'key';
    }

    // Substring containment
    if (score === 0 && targetTopic && targetTopic.length >= 3) {
      if (memKey.includes(targetTopic) || targetTopic.includes(memKey)) {
        score = 85;
        matchField = 'key';
      } else if (memVal.includes(targetTopic) || targetTopic.includes(memVal)) {
        score = 80;
        matchField = 'value';
      }
    }

    // Token-level overlap
    if (score === 0) {
      const topicTokens = (targetTopic || normalizedQuery).split(/\s+/).filter((t) => t.length > 2);
      const keyTokens = memKey.split(/\s+/);
      const valTokens = memVal.split(/\s+/);

      let keyHits = 0;
      let valHits = 0;

      for (const token of topicTokens) {
        if (keyTokens.some((kt) => kt.includes(token) || token.includes(kt))) keyHits++;
        if (valTokens.some((vt) => vt.includes(token) || token.includes(vt))) valHits++;
      }

      if (keyHits > 0 || valHits > 0) {
        score = 40 + keyHits * 25 + valHits * 15;
        matchField = keyHits >= valHits ? 'key' : 'value';
      }
    }

    if (score > 30) {
      scoredMatches.push({ memory: mem, score, matchField });
    }
  }

  scoredMatches.sort((a, b) => b.score - a.score);

  if (scoredMatches.length === 0) {
    return {
      status: 'not_found',
      query: rawQuery,
    };
  }

  const top = scoredMatches[0];

  // 3. Ambiguity check:
  // If multiple memories match and top 2 are within 15 score points and both score >= 50
  if (scoredMatches.length > 1) {
    const second = scoredMatches[1];
    const isAmbiguous =
      top.score >= 50 &&
      second.score >= 50 &&
      Math.abs(top.score - second.score) <= 15 &&
      top.memory.id !== second.memory.id;

    if (isAmbiguous) {
      const topTwo = [top.memory, second.memory];
      const desc1 = topTwo[0].key.replace(/_/g, ' ') || topTwo[0].value;
      const desc2 = topTwo[1].key.replace(/_/g, ' ') || topTwo[1].value;
      const clarification = `Kaunsi memory update karun? ${desc1} wali ya ${desc2} wali?`;

      return {
        status: 'ambiguous',
        matches: topTwo,
        clarificationPrompt: clarification,
        query: rawQuery,
      };
    }
  }

  // Clear single match
  if (top.score >= 40) {
    return {
      status: 'single_match',
      memory: top.memory,
      query: rawQuery,
    };
  }

  return {
    status: 'not_found',
    query: rawQuery,
  };
}

/**
 * Executes an update to an existing permanent memory with server-side authorization.
 * 
 * STEP 3 SPECIFICATION:
 * 1. Resolves target memory using existing semantic resolver logic.
 * 2. If ambiguous -> ask clarification, do NOT modify anything.
 * 3. If not found -> return not found.
 * 4. Check Security state:
 *    - Security OFF: directly allowed without Codeword or PIN.
 *    - Security ON: strictly requires Codeword. PIN is NOT accepted.
 * 5. Update the existing memory document in Cloud Firestore (preserves memoryId).
 * 6. Emit existing memory-changed event so open UI refreshes immediately.
 * 7. Return verified result.
 */
export async function executeMemoryUpdate(
  params: MemoryUpdateParams,
  broadcaster?: (event: any) => void
): Promise<MemoryUpdateResult> {
  try {
    const userId = params.userId || DEFAULT_USER_ID;
    const rawInput = String(params.query || params.rawText || '').trim();

    // Determine target topic and new value
    let targetQuery = params.query || '';
    let valueToSet = (params.newValue || params.content || '').trim();

    // If new value was not passed directly, try extracting from query / rawText
    if (!valueToSet && rawInput) {
      const extracted = extractUpdateTargetAndValue(rawInput);
      if (extracted.targetTopic) {
        targetQuery = extracted.targetTopic;
      }
      if (extracted.newValue) {
        valueToSet = extracted.newValue;
      }
    }

    // 1. Resolve target memory
    const resolved = await resolveMemoryForUpdate(userId, targetQuery || rawInput, params.memoryId, valueToSet);

    if (resolved.status === 'not_found') {
      return {
        success: false,
        status: 'not_found',
        message: `Koi aisi memory nahi mili jise update kiya ja sake (query: "${targetQuery || rawInput}").`,
      };
    }

    if (resolved.status === 'ambiguous' && resolved.matches) {
      return {
        success: false,
        status: 'ambiguous',
        clarification: resolved.clarificationPrompt,
        matches: resolved.matches.map((m) => ({
          id: m.id,
          key: m.key,
          value: m.value,
          category: m.category,
        })),
        message: resolved.clarificationPrompt || 'Multiple matching memories found. Clarification needed.',
      };
    }

    if (!resolved.memory) {
      return {
        success: false,
        status: 'error',
        message: 'Unexpected resolution state.',
      };
    }

    const target = resolved.memory;

    if (!valueToSet) {
      return {
        success: false,
        status: 'error',
        message: `Target memory "${target.key.replace(/_/g, ' ')}" mili, lekin new value provide nahi ki gayi.`,
      };
    }

    // Check if new value contains sensitive credentials or matches secret codeword / PIN
    if (containsSensitiveCredentials(valueToSet)) {
      return {
        success: false,
        status: 'error',
        error: 'Security credentials cannot be stored as a memory value.',
        message: 'Sensitive credentials or secrets cannot be stored as a memory value.',
      };
    }

    const secConfig = await getSecurityConfig(userId);
    if (secConfig.hasCodeword && secConfig.codewordSalt && secConfig.codewordHash) {
      if (verifyCodeword(valueToSet, secConfig.codewordSalt, secConfig.codewordHash)) {
        return {
          success: false,
          status: 'error',
          error: 'Security codeword cannot be stored as a memory value.',
          message: 'Sensitive credentials or secrets cannot be stored as a memory value.',
        };
      }
    }

    if (secConfig.hasPin && secConfig.pinSalt && secConfig.pinHash) {
      if (verifyPin(valueToSet, secConfig.pinSalt, secConfig.pinHash)) {
        return {
          success: false,
          status: 'error',
          error: 'Security PIN cannot be stored as a memory value.',
          message: 'Sensitive credentials or secrets cannot be stored as a memory value.',
        };
      }
    }

    // 2. Server-side Security Authorization Check
    let effectiveCodeword = isBlankOrPlaceholderCodeword(params.codeword) ? undefined : params.codeword?.trim();
    if (!effectiveCodeword && rawInput) {
      const extracted = extractCodewordFromText(rawInput);
      if (extracted) {
        effectiveCodeword = extracted;
      }
    }

    // Fallback: If codeword wasn't isolated by pattern, check if the full spoken input verifies against codeword
    if (!effectiveCodeword && rawInput && secConfig.hasCodeword && secConfig.codewordSalt && secConfig.codewordHash) {
      if (verifyCodeword(rawInput, secConfig.codewordSalt, secConfig.codewordHash)) {
        effectiveCodeword = rawInput;
      }
    }

    const isOwnerName = isOwnerNameMemory(target);
    const auth = await authorizeMemoryUpdate(
      userId,
      {
        codeword: effectiveCodeword,
        pin: params.pin,
      },
      { isOwnerName, targetMemory: target },
      params.sessionId
    );

    if (!auth.authorized) {
      if (auth.requiresCodeword) {
        return {
          success: false,
          status: 'codeword_required',
          requiresCodeword: true,
          message: isOwnerName
            ? (auth.reason || 'Owner name change strictly requires Secret Codeword verification.')
            : (auth.reason || 'Security is ON. Secret Codeword is required to update an existing memory.'),
        };
      }
      return {
        success: false,
        status: 'auth_failed',
        error: auth.reason,
        message: auth.reason || 'Authentication failed. Memory update rejected.',
      };
    }

    // 3. Authorization verified or Security OFF -> Persist to Cloud Firestore
    const updated = await updateMemory(userId, target.id, {
      value: valueToSet,
      content: valueToSet,
      updatedAt: Date.now(),
    });

    if (!updated) {
      return {
        success: false,
        status: 'error',
        error: 'Firestore document not found during update',
        message: 'Memory update Firestore me commit nahi ho saki.',
      };
    }

    // 4. Emit memory-changed event so open UI refreshes immediately
    if (broadcaster) {
      broadcaster({
        type: 'memoryPersisted',
        action: 'update',
        id: target.id,
        memory: updated,
      });
    }

    console.log(`[Memory Update] Successfully updated memory in Cloud Firestore: [${target.id}] ${target.key} -> "${valueToSet}"`);

    return {
      success: true,
      status: 'updated',
      updatedMemory: {
        id: target.id,
        key: target.key,
        value: valueToSet,
        category: target.category,
      },
      message: `Okay, ${target.key.replace(/_/g, ' ')} ko "${valueToSet}" update kar diya.`,
    };
  } catch (err: any) {
    console.error('[Memory Update] Error executing memory update:', err?.message || err);
    return {
      success: false,
      status: 'error',
      error: err?.message || 'Database error occurred',
      message: 'Memory update karte waqt error aa gaya. Firestore me update nahi ho saka.',
    };
  }
}

export interface VoiceSaveParams {
  userId?: string;
  fact: string;
  category?: string;
  key?: string;
  isExplicitNew?: boolean;
  sessionId?: string;
}

export interface VoiceSaveResult {
  success: boolean;
  status: 'saved' | 'duplicate' | 'similar_requires_decision' | 'error';
  memory?: MemoryRecord;
  message: string;
  clarificationPrompt?: string;
  error?: string;
}

/**
 * Executes confirmed persistent memory creation via live voice tool call.
 * 
 * STRICT INVARIANTS:
 * 1. Checks credentials/sensitive information (rejects immediately).
 * 2. Checks exact duplicates against current Firestore memories (returns 'duplicate', no write).
 * 3. Checks similar/refinement decisions (returns 'similar_requires_decision' with clarificationPrompt).
 * 4. Performs real write to Cloud Firestore via createMemory.
 * 5. ONLY reports success AFTER Firestore write confirms.
 * 6. Broadcasts confirmed memory-persisted event so Permanent Memory UI immediately syncs.
 */
export async function executeVoiceSaveMemory(
  params: VoiceSaveParams,
  broadcaster?: (event: any) => void
): Promise<VoiceSaveResult> {
  try {
    const effectiveUserId = params.userId || DEFAULT_USER_ID;
    const rawFact = String(params.fact || '').trim();

    if (!rawFact) {
      return {
        success: false,
        status: 'error',
        message: 'No fact provided to save.',
      };
    }

    // Security & credential check: zero tolerance
    if (containsSensitiveCredentials(rawFact)) {
      return {
        success: false,
        status: 'error',
        error: 'Sensitive credentials or secrets cannot be saved to memory',
        message: 'Sensitive credentials, passwords ya secrets memory me save nahi kiye ja sakte.',
      };
    }

    // 1. Extract candidates using rule-based extractor
    const ruleCandidates = extractWithRules(rawFact);
    let candidate: any = null;

    if (ruleCandidates && ruleCandidates.length > 0) {
      candidate = { ...ruleCandidates[0] };
    } else {
      // Build candidate directly
      const semantic = classifyMemorySemantic({
        content: rawFact,
        key: params.key,
        category: params.category,
      });

      const cat = (params.category && isSemanticCategory(params.category)
        ? params.category
        : semantic.category);
      const semKey = params.key || semantic.semanticKey;

      candidate = {
        category: cat,
        semanticCategory: cat,
        key: semKey,
        semanticKey: semKey,
        value: cleanEntityValue(rawFact) || rawFact,
        confidence: 0.95,
        source: params.isExplicitNew ? 'explicit_new_memory' : 'conversation',
        reason: 'User stated fact to remember',
        priority: 'HIGH',
        retention: 'PERMANENT',
        isExplicitNew: Boolean(params.isExplicitNew),
      };
    }

    const isExplicit = Boolean(
      params.isExplicitNew ||
      candidate.isExplicitNew ||
      isExplicitSaveCommand(rawFact)
    );
    candidate.isExplicitNew = isExplicit;

    // 2. Fetch current memories directly from Cloud Firestore
    const existingMemories = await getMemories(effectiveUserId);

    // 3. Evaluate memory decision
    const decision = evaluateMemoryDecision(candidate, existingMemories, {
      isExplicitNewMemory: isExplicit,
      rawText: rawFact,
    });

    if (decision.decision === 'EXACT_DUPLICATE') {
      return {
        success: false,
        status: 'duplicate',
        memory: decision.existingMemory,
        message: decision.message || 'Ye memory pehle se saved hai.',
      };
    }

    if (decision.decision === 'SIMILAR_REQUIRES_USER_DECISION') {
      return {
        success: false,
        status: 'similar_requires_decision',
        message: decision.clarificationPrompt || 'Similar preference exists.',
        clarificationPrompt: decision.clarificationPrompt,
      };
    }

    // 4. Persistence to Cloud Firestore (NEW_MEMORY)
    const created = await createMemory(effectiveUserId, {
      category: candidate.category,
      semanticCategory: candidate.semanticCategory || candidate.category,
      key: candidate.key,
      semanticKey: candidate.semanticKey || candidate.key,
      value: candidate.value,
      content: candidate.value,
      priority: candidate.priority || 'HIGH',
      retention: 'PERMANENT',
      source: isExplicit ? 'explicit_new_memory' : 'conversation',
      lastRecalled: 'Just now',
      isPermanent: true,
    });

    // Verify Firestore write
    if (!created || !created.id) {
      throw new Error('Firestore write returned invalid record');
    }

    console.log(`[Voice Save] Successfully persisted memory in Cloud Firestore: [${created.id}] ${created.category}/${created.key} = "${created.value}"`);

    // 5. Broadcast memory-persisted event so open UI refreshes immediately
    if (broadcaster) {
      broadcaster({
        type: 'memoryPersisted',
        action: 'create',
        memory: created,
        persistedCount: 1,
        duplicateCount: 0,
        results: [{ status: 'created', memory: created }],
      });
    }

    return {
      success: true,
      status: 'saved',
      memory: created,
      message: 'Memory successfully saved in Cloud Firestore database.',
    };
  } catch (err: any) {
    console.error('[Voice Save] Error executing voice save memory:', err?.message || err);
    return {
      success: false,
      status: 'error',
      error: err?.message || 'Database error occurred',
      message: 'Memory Firestore database me save nahi ho saki.',
    };
  }
}

