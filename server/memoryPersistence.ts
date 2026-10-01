import {
  getMemories,
  createMemory,
  updateMemory,
  DEFAULT_USER_ID,
} from './memoryStore';
import { getSecurityConfig, isOwnerNameMemory, verifyCodeword, verifyPin } from './memorySecurity';
import { isCandidateSensitive, containsSensitiveCredentials } from './memoryExtractor';
import {
  normalizeToSemanticCategory,
  classifyMemorySemantic,
  isSemanticCategory,
  findExactDuplicateMemory,
  isExactDuplicateMemory,
  normalizeMemoryValueForDuplicate,
  evaluateMemoryDecision,
} from './memoryCategorySchema';
import type {
  MemoryCandidate,
  MemoryRecord,
  MemoryCategory,
  MemoryPriority,
  CandidatePersistenceResult,
  PersistenceBatchResult,
} from '../src/types';

/**
 * Memory Persistence Layer (Step 2 of MAHIRU Automatic Memory Core)
 * 
 * Takes validated MemoryCandidate items and safely persists them to Cloud Firestore.
 * 
 * STRICT ARCHITECTURAL INVARIANTS:
 * 1. Cloud Firestore is the ONLY persistence source of truth (no localStorage/in-memory fallback).
 * 2. Final safety gate: Rejects ALL sensitive secrets, credentials, API keys, tokens, and passwords.
 * 3. Deduplication: Does not create duplicate documents if the same user + key + value exists.
 * 4. Update semantics: Updates the existing document if the user provides an updated value for a key.
 * 5. Isolated from Gemini Live: No automatic invocation from live audio or WebSocket loops.
 */

/**
 * Validates candidate structural integrity.
 */
export function validateCandidateFields(candidate: any): { valid: boolean; error?: string } {
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, error: 'Candidate must be a valid object' };
  }
  if (!candidate.category || typeof candidate.category !== 'string' || !candidate.category.trim()) {
    return { valid: false, error: 'Category is required and must be non-empty' };
  }
  if (!candidate.key || typeof candidate.key !== 'string' || !candidate.key.trim()) {
    return { valid: false, error: 'Key is required and must be non-empty' };
  }
  if (!candidate.value || typeof candidate.value !== 'string' || !candidate.value.trim()) {
    return { valid: false, error: 'Value is required and must be non-empty' };
  }
  if (
    typeof candidate.confidence !== 'number' ||
    isNaN(candidate.confidence) ||
    candidate.confidence < 0 ||
    candidate.confidence > 1
  ) {
    return { valid: false, error: 'Confidence must be a valid number between 0.0 and 1.0' };
  }
  if (!candidate.source || typeof candidate.source !== 'string') {
    return { valid: false, error: 'Source is required' };
  }
  return { valid: true };
}

/**
 * Defense-in-depth safety gate: Checks for any credential-like or sensitive patterns.
 */
export function isSafeForPersistence(candidate: MemoryCandidate): boolean {
  // 1. Core extractor sensitivity check
  if (isCandidateSensitive(candidate)) return false;

  const key = String(candidate.key || '').toLowerCase();
  const val = String(candidate.value || '').toLowerCase();
  const cat = String(candidate.category || '').toUpperCase();
  const reason = String(candidate.reason || '').toLowerCase();

  const credentialPatterns: RegExp[] = [
    /\b(?:api[_\s-]?key|secret[_\s-]?key|private[_\s-]?key|access[_\s-]?token|auth[_\s-]?token|bearer[_\s-]?token|client[_\s-]?secret|service[_\s-]?account|jwt|refresh[_\s-]?token)\b/i,
    /\b(?:password|passcode|code[_\s-]?word|secret[_\s-]?word|security[_\s-]?word|favorite[_\s-]?word|favourite[_\s-]?word|secret[_\s-]?phrase|credit[_\s-]?card|cvv|pin|user[_\s-]?pin|security[_\s-]?pin|numeric[_\s-]?pin|credential|credentials)\b/i,
    /\b(?:authentication|authenticat(?:e|ing|ion))\b/i,
    /\b(?:security\s+codeword|codeword\s+starts\s+with|for\s+authentication|security\s+word\s+is|pin\s+is\s+(?:four|\d+)\s+digits|numeric\s+pin)\b/i,
  ];

  if (credentialPatterns.some((p) => p.test(key) || p.test(val) || p.test(reason))) {
    return false;
  }

  if (cat === 'SYSTEM' || cat.includes('SECRET') || cat.includes('CREDENTIAL')) {
    return false;
  }

  // High-entropy token pattern checks
  if (
    /^(?:sk-[a-zA-Z0-9]{15,}|AIza[0-9A-Za-z-_]{30,}|ghp_[a-zA-Z0-9]{15,}|eyJ[a-zA-Z0-9_-]{10,})$/.test(
      candidate.value
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Normalizes categories into canonical MemoryCategory strings.
 */
export function normalizePersistenceCategory(cat: string): MemoryCategory {
  return normalizeToSemanticCategory(cat);
}

/**
 * Persists an array of MemoryCandidate items to Cloud Firestore.
 * Performs validation, security gate check, deduplication, and safe updates.
 */
export async function persistMemoryCandidates(
  candidates: MemoryCandidate[],
  userId = DEFAULT_USER_ID
): Promise<PersistenceBatchResult> {
  const effectiveUserId = userId || DEFAULT_USER_ID;
  const results: CandidatePersistenceResult[] = [];
  let persistedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  let similarDecisionCount = 0;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      persistedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      results: [],
    };
  }

  // Fetch current user memories directly from Cloud Firestore
  const existingMemories = await getMemories(effectiveUserId);

  for (const rawCandidate of candidates) {
    // 1. Field validation
    const valCheck = validateCandidateFields(rawCandidate);
    if (!valCheck.valid) {
      rejectedCount++;
      results.push({
        candidate: rawCandidate,
        status: 'rejected',
        reason: valCheck.error,
      });
      continue;
    }

    // 2. Defense-in-depth safety gate (never store credentials, never expose secret in logs)
    if (!isSafeForPersistence(rawCandidate)) {
      rejectedCount++;
      results.push({
        candidate: {
          category: rawCandidate.category,
          key: '[REDACTED]',
          value: '[REDACTED]',
          confidence: rawCandidate.confidence,
          source: rawCandidate.source,
        },
        status: 'rejected',
        reason: 'Sensitive or credential-like information rejected by security safety gate',
      });
      continue;
    }

    // Defense against persisting secret codeword: compare against configured codeword hash
    const securityConfig = await getSecurityConfig(effectiveUserId);
    if (securityConfig.hasCodeword && securityConfig.codewordSalt && securityConfig.codewordHash) {
      if (verifyCodeword(rawCandidate.value, securityConfig.codewordSalt, securityConfig.codewordHash)) {
        rejectedCount++;
        results.push({
          candidate: {
            category: rawCandidate.category,
            key: '[REDACTED]',
            value: '[REDACTED]',
            confidence: rawCandidate.confidence,
            source: rawCandidate.source,
          },
          status: 'rejected',
          reason: 'Sensitive secret codeword rejected from memory persistence',
        });
        console.warn('[MemoryPersistence] Candidate value matched secret codeword hash - rejected.');
        continue;
      }
    }

    // Defense against persisting security PIN: compare against configured PIN hash
    if (securityConfig.hasPin && securityConfig.pinSalt && securityConfig.pinHash) {
      if (verifyPin(rawCandidate.value, securityConfig.pinSalt, securityConfig.pinHash)) {
        rejectedCount++;
        results.push({
          candidate: {
            category: rawCandidate.category,
            key: '[REDACTED]',
            value: '[REDACTED]',
            confidence: rawCandidate.confidence,
            source: rawCandidate.source,
          },
          status: 'rejected',
          reason: 'Sensitive security PIN rejected from memory persistence',
        });
        console.warn('[MemoryPersistence] Candidate value matched security PIN hash - rejected.');
        continue;
      }
    }

    const semantic = classifyMemorySemantic({
      content: rawCandidate.value,
      key: rawCandidate.key,
      category: rawCandidate.category,
    });

    let normalizedCategory = (rawCandidate.category && isSemanticCategory(rawCandidate.category)
      ? rawCandidate.category
      : semantic.category) as MemoryCategory;
    let semanticKey = rawCandidate.semanticKey || semantic.semanticKey;
    let normalizedKey = String(rawCandidate.key || semanticKey).trim().toLowerCase().replace(/\s+/g, '_');
    const normalizedValue = String(rawCandidate.value).trim();
    const priority = (rawCandidate.priority || 'HIGH') as MemoryPriority;

    // Check if an existing owner name is already stored in Firestore
    const existingOwnerMemory = existingMemories.find((m) => isOwnerNameMemory(m));

    // Handle Owner Name vs Third-Person Name (Requirement 1, 2 & Test F)
    if (isOwnerNameMemory({ key: normalizedKey, category: normalizedCategory })) {
      if (existingOwnerMemory) {
        // Owner name already exists!
        // A. If value is identical to existing owner name -> no-op / duplicate
        if (existingOwnerMemory.value.trim().toLowerCase() === normalizedValue.toLowerCase()) {
          duplicateCount++;
          results.push({
            candidate: rawCandidate,
            status: 'duplicate',
            reason: 'Owner name already exists with identical value (no-op)',
            memory: existingOwnerMemory,
          });
          continue;
        }

        // B. Check if this candidate is an explicit update to the owner's identity
        const isExplicitUpdate =
          Boolean(rawCandidate.reason && /update|change|is now|ab mera|mera naam badal/i.test(rawCandidate.reason)) ||
          Boolean(rawCandidate.source && /update/i.test(rawCandidate.source));

        if (isExplicitUpdate) {
          // Owner name change strictly requires Codeword authorization!
          rejectedCount++;
          results.push({
            candidate: rawCandidate,
            status: 'rejected',
            reason: 'Owner name change strictly requires secret Codeword authorization. Cannot be modified via automatic extraction.',
            memory: existingOwnerMemory,
          });
          console.log(`[MemoryPersistence] Blocked unauthorized background change of owner name [${existingOwnerMemory.id}] (${existingOwnerMemory.key}) from "${existingOwnerMemory.value}" to "${normalizedValue}".`);
          continue;
        }

        // C. Third person introducing themselves (e.g. "Mera naam Sumit hai")
        // Preserve existing owner memory (e.g. Rupesh) and store third-person name under person_name
        normalizedKey = 'person_name';
        normalizedCategory = 'personal_profile';
      }
    }

    // Keys that strictly represent singular attributes of the user and get updated rather than added as separate records
    const SINGULAR_USER_KEYS = ['name', 'user_name', 'owner_name', 'my_name', 'user_real_name', 'username', 'birthday', 'age', 'gender', 'location', 'occupation', 'girlfriend_nickname'];
    const isSingular = SINGULAR_USER_KEYS.includes(normalizedKey);

    const candidatePayload = {
      category: normalizedCategory,
      semanticCategory: normalizedCategory,
      key: normalizedKey,
      semanticKey,
      value: normalizedValue,
      content: normalizedValue,
    };

    // Evaluate memory creation decision:
    // EXACT_DUPLICATE | NEW_MEMORY | SIMILAR_REQUIRES_USER_DECISION
    const decisionEval = evaluateMemoryDecision(
      {
        ...candidatePayload,
        isExplicitNew: Boolean(
          (rawCandidate as any).isExplicitNew ||
          rawCandidate.source === 'explicit_new_memory'
        ),
        source: rawCandidate.source,
      },
      existingMemories
    );

    if (decisionEval.decision === 'EXACT_DUPLICATE') {
      duplicateCount++;
      results.push({
        candidate: rawCandidate,
        status: 'duplicate',
        decision: 'EXACT_DUPLICATE',
        reason: decisionEval.reason || 'Ye memory pehle se saved hai.',
        message: decisionEval.message || 'Ye memory pehle se saved hai.',
        memory: decisionEval.existingMemory,
      });
      continue;
    }

    if (decisionEval.decision === 'SIMILAR_REQUIRES_USER_DECISION') {
      similarDecisionCount++;
      results.push({
        candidate: rawCandidate,
        status: 'similar_requires_decision',
        decision: 'SIMILAR_REQUIRES_USER_DECISION',
        reason: decisionEval.reason,
        message: decisionEval.clarificationPrompt,
        clarificationPrompt: decisionEval.clarificationPrompt,
        existingMemory: decisionEval.existingMemory,
      });
      console.log(`[MemoryPersistence] Memory candidate requires user decision (similar/refinement): "${normalizedValue}" -> ${decisionEval.clarificationPrompt}`);
      continue;
    }

    // 3. Deduplication check: for singular keys, check if a memory for this user with the same key already exists to update
    const existingMatch = isSingular
      ? existingMemories.find(
          (m) =>
            m.userId === effectiveUserId &&
            String(m.key || '').trim().toLowerCase().replace(/\s+/g, '_') === normalizedKey
        )
      : undefined;

    if (existingMatch) {
      const existingVal = String(existingMatch.value || existingMatch.content || '').trim();

      // Case A: Identical value already stored -> duplicate / no-op
      if (
        existingVal.toLowerCase() === normalizedValue.toLowerCase() ||
        normalizeMemoryValueForDuplicate(existingVal) === normalizeMemoryValueForDuplicate(normalizedValue)
      ) {
        duplicateCount++;
        results.push({
          candidate: rawCandidate,
          status: 'duplicate',
          reason: 'Ye memory pehle se saved hai.',
          message: 'Ye memory pehle se saved hai.',
          memory: existingMatch,
        });
        continue;
      }

      // Case B: Value changed -> check security before updating existing memory!
      if (isOwnerNameMemory(existingMatch)) {
        // Owner name change strictly requires Codeword regardless of Security ON or OFF
        rejectedCount++;
        results.push({
          candidate: rawCandidate,
          status: 'rejected',
          reason: 'Owner name change strictly requires secret Codeword authorization.',
          memory: existingMatch,
        });
        console.log(`[MemoryPersistence] Blocked background update of owner name [${existingMatch.id}].`);
        continue;
      }

      if (securityConfig.isEnabled) {
        rejectedCount++;
        results.push({
          candidate: rawCandidate,
          status: 'rejected',
          reason: 'Security is ON: Updating an existing permanent memory requires secret Codeword authorization.',
          memory: existingMatch,
        });
        console.log(`[MemoryPersistence] Blocked unauthorized background update of existing memory [${existingMatch.id}] (${existingMatch.key}) because Security is ON.`);
        continue;
      }

      // Security is OFF: Allow updating existing memory
      try {
        const updated = await updateMemory(effectiveUserId, existingMatch.id, {
          category: normalizedCategory,
          semanticCategory: normalizedCategory,
          key: normalizedKey,
          semanticKey,
          value: normalizedValue,
          content: normalizedValue,
          priority,
          importance: priority,
          source: rawCandidate.source || 'CONVERSATION (UPDATED)',
          lastRecalled: 'Just now',
          updatedAt: Date.now(),
        });

        persistedCount++;
        results.push({
          candidate: rawCandidate,
          status: 'updated',
          reason: 'Existing memory updated with new value in Cloud Firestore',
          memory: updated || undefined,
        });

        // Update local snapshot
        if (updated) {
          const idx = existingMemories.findIndex((m) => m.id === existingMatch.id);
          if (idx !== -1) existingMemories[idx] = updated;
        }
      } catch (err: any) {
        rejectedCount++;
        results.push({
          candidate: rawCandidate,
          status: 'rejected',
          reason: `Firestore update failed: ${err?.message || err}`,
        });
      }
      continue;
    }

    // 4. New memory -> Create in Cloud Firestore
    try {
      const created = await createMemory(effectiveUserId, {
        category: normalizedCategory,
        semanticCategory: normalizedCategory,
        key: normalizedKey,
        semanticKey,
        value: normalizedValue,
        content: normalizedValue,
        priority,
        importance: priority,
        retention: rawCandidate.retention || 'PERMANENT',
        source: rawCandidate.source || 'CONVERSATION',
        lastRecalled: 'Just now',
        isPermanent: true,
      });

      persistedCount++;
      results.push({
        candidate: rawCandidate,
        status: 'created',
        decision: 'NEW_MEMORY',
        reason: 'New permanent memory persisted to Cloud Firestore',
        memory: created,
      });

      // Update local snapshot for subsequent candidates in batch
      existingMemories.push(created);
    } catch (err: any) {
      rejectedCount++;
      results.push({
        candidate: rawCandidate,
        status: 'rejected',
        reason: `Firestore creation failed: ${err?.message || err}`,
      });
    }
  }

  return {
    persistedCount,
    duplicateCount,
    rejectedCount,
    similarDecisionCount,
    results,
  };
}
