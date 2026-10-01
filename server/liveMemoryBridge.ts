import { extractMemoryCandidates, containsSensitiveCredentials } from './memoryExtractor';
import { persistMemoryCandidates } from './memoryPersistence';
import { DEFAULT_USER_ID, getMemories } from './memoryStore';
import { isDeleteIntent, isSecurityToggleIntent } from './memoryResolver';
import { getSecurityConfig, verifyCodeword, verifyPin } from './memorySecurity';
import {
  isAutomaticMemorySavingEnabled,
  setAutomaticMemorySaving,
  isMemorySavingToggleCommand,
  isExplicitSaveCommand,
} from './automaticMemorySaving';
import type { WebSocket } from 'ws';
import type { PersistenceBatchResult, MemoryExtractionResult } from '../src/types';

export interface ProcessedTurnResult {
  skipped?: boolean;
  skipReason?: string;
  userTurn: string;
  extraction?: MemoryExtractionResult;
  persistence?: PersistenceBatchResult;
}

/**
 * LiveMemoryBridge (Step 3 of MAHIRU Automatic Memory Core)
 * 
 * Bridges completed user conversation turns in Gemini Live to:
 * 1. Step 1.1 extraction engine (safety filtering & categorization)
 * 2. Step 2 persistence layer (Firestore write, deduplication, update)
 * 
 * STRICT ARCHITECTURAL INVARIANTS:
 * - Only operates on COMPLETED user turns/text.
 * - Never processes raw audio chunks or mic packets.
 * - Never processes Mahiru's own model turns.
 * - Defense-in-depth rejection of sensitive credentials (API keys, passwords, tokens).
 * - Debounces and deduplicates rapid repeated user utterances.
 * - Cloud Firestore is the ONLY source of truth.
 */
export class LiveMemoryBridge {
  private recentTurns = new Map<string, number>(); // normalizedText -> timestamp
  private readonly DEDUPE_WINDOW_MS = 8000; // 8 seconds window
  private readonly MIN_TURN_LENGTH = 4;
  private broadcaster?: (data: any) => void;

  public setBroadcaster(fn: (data: any) => void): void {
    this.broadcaster = fn;
  }

  /**
   * Process a finalized user conversational turn through the extraction and persistence pipeline.
   */
  public async handleCompletedUserTurn(
    rawText: string,
    userId: string = DEFAULT_USER_ID,
    clientWs?: WebSocket,
    sessionId?: string
  ): Promise<ProcessedTurnResult> {
    const text = String(rawText || '').trim();

    if (!text || text.length < this.MIN_TURN_LENGTH) {
      return {
        skipped: true,
        skipReason: 'Turn too short or empty',
        userTurn: text,
      };
    }

    // Ignore obvious conversational filler greetings that have no personal memory facts
    const lower = text.toLowerCase();
    const isPureFiller = /^(?:hi|hello|hey|namaste|salaam|ok|okay|bye|goodbye|haan|theek hai|yes|no|yep|nope|thanks|thank you)[\s.?!]*$/i.test(lower);
    if (isPureFiller) {
      return {
        skipped: true,
        skipReason: 'Conversational greeting/filler without memory content',
        userTurn: text,
      };
    }

    // Check for sensitive credential leaks early (Defense-in-depth gate)
    if (containsSensitiveCredentials(text) || /\b(?:code[_\s-]?word|secret[_\s-]?word)\b/i.test(text)) {
      console.warn('[Live Memory Bridge] User turn contains sensitive credential pattern - rejected immediately.');
      return {
        skipped: true,
        skipReason: 'Sensitive credential pattern detected and rejected',
        userTurn: '[REDACTED]',
      };
    }

    // Check if utterance is a spoken codeword or PIN verification attempt
    try {
      const securityConfig = await getSecurityConfig(userId);
      if (securityConfig.hasCodeword && securityConfig.codewordSalt && securityConfig.codewordHash) {
        if (verifyCodeword(text, securityConfig.codewordSalt, securityConfig.codewordHash)) {
          console.warn('[Live Memory Bridge] User turn is security codeword verification - skipping memory extraction.');
          return {
            skipped: true,
            skipReason: 'Codeword verification utterance skipped from memory extraction',
            userTurn: '[REDACTED]',
          };
        }
      }

      if (securityConfig.hasPin && securityConfig.pinSalt && securityConfig.pinHash) {
        if (verifyPin(text, securityConfig.pinSalt, securityConfig.pinHash)) {
          console.warn('[Live Memory Bridge] User turn is security PIN verification - skipping memory extraction.');
          return {
            skipped: true,
            skipReason: 'PIN verification utterance skipped from memory extraction',
            userTurn: '[REDACTED]',
          };
        }
      }
    } catch {}

    // Check automatic memory saving toggle command (ON/OFF)
    const toggle = isMemorySavingToggleCommand(text);
    if (toggle.isToggle && toggle.enable !== undefined) {
      setAutomaticMemorySaving(toggle.enable, sessionId);
      console.log(`[Live Memory Bridge] Memory saving turned ${toggle.enable ? 'ON' : 'OFF'} by user turn: "${text}"`);

      const eventPayload = {
        type: 'automaticMemorySavingChanged',
        enabled: toggle.enable,
        message: toggle.confirmation,
        sessionId,
      };

      if (clientWs && clientWs.readyState === 1 /* WebSocket.OPEN */) {
        try {
          clientWs.send(JSON.stringify(eventPayload));
        } catch {}
      }

      if (this.broadcaster) {
        try {
          this.broadcaster(eventPayload);
        } catch {}
      }

      return {
        skipped: true,
        skipReason: `Memory saving turned ${toggle.enable ? 'ON' : 'OFF'}`,
        userTurn: text,
      };
    }

    // Gate on automaticMemorySaving state:
    // When OFF, normal conversation must NOT automatically create memories.
    // However, explicit save commands MUST STILL work!
    const isAutoSaving = isAutomaticMemorySavingEnabled(sessionId);
    const isExplicit = isExplicitSaveCommand(text);

    if (!isAutoSaving && !isExplicit) {
      console.log(`[Live Memory Bridge] Automatic memory saving is OFF - skipping normal conversation turn: "${text}"`);
      return {
        skipped: true,
        skipReason: 'Automatic memory saving is OFF for this session',
        userTurn: text,
      };
    }

    // Ignore memory deletion commands (should never be extracted as new memories to persist)
    if (isDeleteIntent(text)) {
      console.log(`[Live Memory Bridge] User turn is a memory deletion request - skipping memory extraction: "${text}"`);
      return {
        skipped: true,
        skipReason: 'Turn is a memory deletion command',
        userTurn: text,
      };
    }

    // Ignore memory security toggle commands (should never be extracted as new memories to persist)
    if (isSecurityToggleIntent(text).isToggle) {
      console.log(`[Live Memory Bridge] User turn is a memory security toggle request - skipping memory extraction: "${text}"`);
      return {
        skipped: true,
        skipReason: 'Turn is a memory security toggle command',
        userTurn: text,
      };
    }

    // Deduplication of identical recent turns within the sliding time window
    const now = Date.now();
    this.cleanOldTurns(now);

    const normalizedKey = lower.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const lastSeen = this.recentTurns.get(normalizedKey);
    if (lastSeen && now - lastSeen < this.DEDUPE_WINDOW_MS) {
      console.log(`[Live Memory Bridge] Skipping recently processed turn within debounce window: "${text}"`);
      return {
        skipped: true,
        skipReason: 'Duplicate turn within debounce window',
        userTurn: text,
      };
    }
    this.recentTurns.set(normalizedKey, now);

    console.log(`[Live Memory Bridge] Processing completed user turn for memory extraction: "${text}" (user: ${userId})`);

    try {
      // 1. Step 1.1 Memory Extraction with strict safety & classification
      const extraction = await extractMemoryCandidates({ text });

      if (!extraction.candidates || extraction.candidates.length === 0) {
        console.log(`[Live Memory Bridge] No memory candidates found in turn: "${text}"`);
        return {
          skipped: false,
          userTurn: text,
          extraction,
          persistence: {
            persistedCount: 0,
            duplicateCount: 0,
            rejectedCount: 0,
            results: [],
          },
        };
      }

      console.log(
        `[Live Memory Bridge] Extracted ${extraction.candidates.length} candidate(s) from turn:`,
        extraction.candidates.map((c) => `${c.category}/${c.key}`)
      );

      // 2. Step 2 Memory Persistence into Cloud Firestore
      const persistence = await persistMemoryCandidates(extraction.candidates, userId);

      console.log(
        `[Live Memory Bridge] Persistence completed: ${persistence.persistedCount} created/updated, ${persistence.duplicateCount} duplicate(s), ${persistence.rejectedCount} rejected.`
      );

      // 3. Notify client via WebSocket if open - ONLY when persistence actually succeeded!
      const eventPayload = {
        type: 'memoryPersisted',
        userTurn: text,
        persistedCount: persistence.persistedCount,
        duplicateCount: persistence.duplicateCount,
        results: persistence.results,
      };

      if (persistence.persistedCount > 0) {
        if (clientWs && clientWs.readyState === 1 /* WebSocket.OPEN */) {
          try {
            clientWs.send(JSON.stringify(eventPayload));
          } catch (wsErr) {
            console.warn('[Live Memory Bridge] Could not send persistence notification to client:', wsErr);
          }
        }

        if (this.broadcaster) {
          try {
            this.broadcaster(eventPayload);
          } catch (bErr) {
            console.warn('[Live Memory Bridge] Error in broadcaster callback:', bErr);
          }
        }
      }

      return {
        skipped: false,
        userTurn: text,
        extraction,
        persistence,
      };
    } catch (err: any) {
      console.error('[Live Memory Bridge] Error processing turn:', err?.message || err);
      throw err;
    }
  }

  public markTurnHandled(text: string): void {
    if (!text) return;
    const lower = text.toLowerCase().trim();
    const normalizedKey = lower.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    this.recentTurns.set(normalizedKey, Date.now());
  }

  private cleanOldTurns(now: number): void {
    for (const [key, timestamp] of this.recentTurns.entries()) {
      if (now - timestamp > this.DEDUPE_WINDOW_MS * 2) {
        this.recentTurns.delete(key);
      }
    }
  }
}

export const liveMemoryBridge = new LiveMemoryBridge();
