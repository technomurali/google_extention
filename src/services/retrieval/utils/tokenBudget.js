// ============================================================================
// Token Budget Utilities
// ----------------------------------------------------------------------------
// Lightweight helpers to estimate token usage and enforce hard caps.
// We assume ~4 chars ≈ 1 token as a practical approximation for mixed text.
// ============================================================================

/**
 * Estimates token count from a character length.
 * @param {number} charCount
 * @returns {number}
 */
export function estimateTokensFromChars(charCount) {
  const n = Number(charCount) || 0;
  // 4 chars ≈ 1 token (rough average across Latin scripts)
  return Math.max(0, Math.ceil(n / 4));
}

/**
 * Estimates tokens for a text string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokensForText(text) {
  return estimateTokensFromChars((text || '').length);
}

/**
 * Truncates text to approximately fit within a token budget (best-effort).
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string}
 */
export function hardCapTextToTokens(text, maxTokens) {
  const maxChars = Math.max(0, Math.floor((Number(maxTokens) || 0) * 4));
  const s = String(text || '');
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

/**
 * Totals token usage for an array of strings.
 * @param {string[]} texts
 * @returns {number}
 */
export function totalTokens(texts) {
  return (texts || []).reduce((sum, t) => sum + estimateTokensForText(t), 0);
}

/**
 * Prunes an array in-place using score ordering until tokens fit the budget.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} getText
 * @param {(a: T, b: T) => number} compareByKeepPriority // lower means keep first
 * @param {number} maxTokens
 */
export function pruneToTokenBudget(items, getText, compareByKeepPriority, maxTokens) {
  if (!Array.isArray(items) || items.length === 0) return;
  const arr = items.slice();
  arr.sort(compareByKeepPriority);
  // Keep from the front, drop from the end until budget fits
  let kept = [];
  let tokens = 0;
  for (const it of arr) {
    const t = estimateTokensForText(getText(it));
    if (tokens + t <= maxTokens) {
      kept.push(it);
      tokens += t;
    } else {
      break;
    }
  }
  items.length = 0;
  kept.forEach((k) => items.push(k));
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    estimateTokensFromChars,
    estimateTokensForText,
    hardCapTextToTokens,
    totalTokens,
    pruneToTokenBudget,
  };
}


