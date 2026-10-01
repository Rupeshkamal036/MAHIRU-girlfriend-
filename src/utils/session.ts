/**
 * Manages the in-memory application session identifier.
 * 
 * Rules:
 * - Stored in JavaScript runtime memory ONLY (never in localStorage).
 * - Fresh page loads, refreshes, or app reopens naturally generate a new session ID.
 * - This ensures each browser session has its own isolated session lifetime,
 *   allowing Security to be turned OFF during the active session, but automatically
 *   starting as ON whenever the page is refreshed or reopened.
 */

let activeSessionId: string | null = null;

export function getAppSessionId(): string {
  if (!activeSessionId) {
    activeSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  return activeSessionId;
}

export function resetAppSessionId(): string {
  activeSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return activeSessionId;
}
