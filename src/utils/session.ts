/**
 * Session ID helper for persistent WebSocket and client context
 */
export function getAppSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  let sid = sessionStorage.getItem('mahiru_session_id');
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    sessionStorage.setItem('mahiru_session_id', sid);
  }
  return sid;
}
