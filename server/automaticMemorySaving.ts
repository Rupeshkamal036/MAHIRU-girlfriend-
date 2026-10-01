/**
 * Automatic Memory Saving Master Switch (Session-scoped)
 * 
 * Invariants:
 * 1. Default state: ON (true).
 * 2. Session-only: resets silently to ON on app refresh, restart, or new session.
 * 3. Never persisted across app restarts (no disk/Firestore/localStorage persistence).
 * 4. Controls ONLY automatic extraction and persistence from normal conversation.
 * 5. When OFF, explicit save commands STILL work ("Isko memory mein save karo", etc.).
 * 6. Completely separate from Memory Security (no PIN, no Codeword).
 */

const sessionAutomaticSaving = new Map<string, boolean>();
let globalAutomaticSaving = true;

/**
 * Checks if automatic memory saving is currently ON for the given session.
 * Always defaults to true (ON).
 */
export function isAutomaticMemorySavingEnabled(sessionId?: string): boolean {
  if (sessionId) {
    if (sessionAutomaticSaving.has(sessionId)) {
      return sessionAutomaticSaving.get(sessionId)!;
    }
    // Any new or fresh session defaults to ON silently
    return true;
  }
  return globalAutomaticSaving;
}

/**
 * Sets automatic memory saving ON or OFF for the session.
 */
export function setAutomaticMemorySaving(enabled: boolean, sessionId?: string): boolean {
  if (sessionId) {
    sessionAutomaticSaving.set(sessionId, enabled);
  } else {
    globalAutomaticSaving = enabled;
  }
  console.log(`[AutomaticMemorySaving] State set to ${enabled ? 'ON' : 'OFF'} (session: ${sessionId || 'global'})`);
  return enabled;
}

/**
 * Resets automatic memory saving to ON (e.g., on fresh session start or app restart).
 * Silent reset without user notification.
 */
export function resetAutomaticMemorySavingSession(sessionId?: string): void {
  if (sessionId) {
    sessionAutomaticSaving.delete(sessionId);
  }
  globalAutomaticSaving = true;
}

/**
 * Detects natural language intent to turn automatic memory saving ON or OFF.
 * Supports Hindi, Hinglish, and English phrasing.
 */
export function isMemorySavingToggleCommand(text: string): {
  isToggle: boolean;
  enable?: boolean;
  confirmation?: string;
} {
  if (!text || typeof text !== 'string') return { isToggle: false };

  // If the user explicitly requested to save a specific memory (e.g. "Waise memory saving off hai, lekin ise memory mein save karo"),
  // this is an explicit save command, NOT a toggle command.
  if (isExplicitSaveCommand(text)) {
    return { isToggle: false };
  }

  const lower = text.trim().toLowerCase();

  // OFF commands
  const offPatterns = [
    /\b(?:automatic\s+)?memory\s+saving\s+(?:ko\s+)?(?:band\s*(?:karo|kar\s*do|kardo|kijiye)|off\s*(?:karo|kar\s*do|kardo|kijiye)|disable\s*(?:karo|kar\s*do|kardo)|rok\s*do|stop|pause)\b/i,
    /\b(?:band|off|disable|stop|pause)\s+(?:automatic\s+)?memory\s+saving\b/i,
    /\b(?:stop|pause|disable|turn\s*off)\s+(?:automatic\s+)?memory\s+saving\b/i,
    /\b(?:don'?t|do\s*not)\s+save\s+(?:our\s+)?conversation\s+to\s+memory\b/i,
    /\bab\s+jo\s+bhi\s+baat\s+karenge\s+(?:use\s+)?memory\s+mein\s+save\s+mat\s+karna\b/i,
    /\bmemory\s+mein\s+save\s+mat\s+karna\b/i,
    /\bbaat(?:cheet)?\s+(?:ko\s+)?memory\s+mein\s+save\s+mat\s+karna\b/i,
    /\bdo\s*not\s+save\s+memories\b/i,
  ];

  // ON commands
  const onPatterns = [
    /\b(?:automatic\s+)?memory\s+saving\s+(?:ko\s+)?(?:on\s*(?:karo|kar\s*do|kardo|kijiye)|chalu\s*(?:karo|kar\s*do|kardo|kijiye)|enable\s*(?:karo|kar\s*do|kardo)|shuru\s*(?:karo|kar\s*do|kardo)|start|resume)\b/i,
    /\b(?:on|chalu|enable|start|resume)\s+(?:automatic\s+)?memory\s+saving\b/i,
    /\b(?:start|resume|enable|turn\s*on)\s+(?:automatic\s+)?memory\s+saving\b/i,
    /\bstart\s+saving\s+memories\s+again\b/i,
    /\b(?:automatic\s+)?memory\s+saving\s+start\s+karo\b/i,
    /\bphir\s+se\s+memory\s+save\s+karna\s+shuru\s+karo\b/i,
    /\bmemories\s+save\s+karna\s+shuru\s+karo\b/i,
  ];

  for (const p of offPatterns) {
    if (p.test(lower)) {
      return {
        isToggle: true,
        enable: false,
        confirmation: 'Memory saving band kar di hai.',
      };
    }
  }

  for (const p of onPatterns) {
    if (p.test(lower)) {
      return {
        isToggle: true,
        enable: true,
        confirmation: 'Memory saving on kar di hai.',
      };
    }
  }

  return { isToggle: false };
}

/**
 * Checks if utterance contains an explicit user directive to save a memory.
 * Explicit saves must STILL work even when automatic memory saving is OFF.
 */
export function isExplicitSaveCommand(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lower = text.trim().toLowerCase();

  const explicitPatterns = [
    /\b(?:new|naya|nayi|ek)\s+(?:permanent\s+)?memory\s*(?:mein|me|pe|par|mai)?\s*(?:save|daal|rakh|likh|banao)\b/i,
    /\b(?:save|add)\s*(?:this\s+)?(?:to|in|as)\s*(?:a\s+)?(?:new\s+)?(?:permanent\s+)?memory\b/i,
    /\b(?:ise|isko|is\s+information\s+ko|ye|yeh)\s+(?:bhi\s+)?(?:permanent\s+)?memory\s*(?:mein|me|pe|par|mai)?\s*(?:save|daal|rakh)\b/i,
    /\bye\s+memory\s+save\s+kar\s*(?:do|dijiye|karo)\b/i,
    /\b(?:permanent\s+)?memory\s*(?:mein|me|pe|par|mai)?\s*save\s*(?:karo|kardo|kar\s*do|karna)\b/i,
    /\bise\s+memory\s+mein\s+save\s+karo\b/i,
    /\bis\s+information\s+ko\s+permanent\s+memory\s+mein\s+save\s+karo\b/i,
    /\bsave\s+this\s+as\s+a\s+new\s+memory\b/i,
    /\bsave\s+this\s+to\s+memory\b/i,
  ];

  return explicitPatterns.some((p) => p.test(lower));
}
