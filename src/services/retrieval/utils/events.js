// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// Retrieval Events - lightweight event helpers for progress notifications
// ----------------------------------------------------------------------------
// We dispatch CustomEvent on document when available. Consumers can listen:
// document.addEventListener('retrieval-progress', (e) => console.log(e.detail))
// ============================================================================

/**
 * @param {string} type
 * @param {any} detail
 */
export function emitRetrievalEvent(type, detail) {
  try {
    if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
      const ev = new CustomEvent(type, { bubbles: true, composed: true, detail });
      document.dispatchEvent(ev);
    }
  } catch {}
}

/**
 * @param {string} type
 * @param {(ev: CustomEvent) => void} handler
 */
export function onRetrievalEvent(type, handler) {
  try {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener(type, handler);
    }
  } catch {}
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { emitRetrievalEvent, onRetrievalEvent };
}


