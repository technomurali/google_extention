// ============================================================================
// MemoryStore - per-session ephemeral memory for retrieval biasing
// ----------------------------------------------------------------------------
// Simple in-memory store to keep last used references and query synopsis.
// In the extension, this resets on reload. This is sufficient for Phase 1.
// ============================================================================

const sessionMap = new Map();

/**
 * @param {string} sessionId
 * @param {{ refIds?: string[], synopsis?: string }} payload
 */
export function rememberSession(sessionId, payload) {
  const prev = sessionMap.get(sessionId) || {};
  sessionMap.set(sessionId, { ...prev, ...payload });
}

/**
 * @param {string} sessionId
 * @returns {{ refIds?: string[], synopsis?: string }}
 */
export function getSession(sessionId) {
  return sessionId && sessionMap.get(sessionId) || {};
}

/**
 * @param {string} sessionId
 */
export function clearSession(sessionId) {
  if (sessionId) sessionMap.delete(sessionId);
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { rememberSession, getSession, clearSession };
}


