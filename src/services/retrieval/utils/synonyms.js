// ============================================================================
// Synonym Expansion (optional) - LLM-assisted with static fallback
// ----------------------------------------------------------------------------
// Expands user query terms to improve lexical retrieval recall.
// ============================================================================

import { logger } from '../../../core/logger.js';
import { sendPrompt } from '../../ai.js';

const log = logger.create('Synonyms');

// Minimal static fallback list (extend as needed)
const STATIC_SYNONYMS = {
  results: ['findings', 'outcomes', 'observations'],
  methods: ['methodology', 'approach', 'procedure', 'technique'],
  discussion: ['analysis', 'interpretation', 'insights'],
  conclusion: ['summary', 'wrap-up', 'closing'],
  limitation: ['constraints', 'drawbacks', 'weaknesses'],
  performance: ['accuracy', 'efficiency'],
  compare: ['versus', 'difference'],
};

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * @param {string} query
 * @param {import('../types.js').Index} index
 * @param {{ useLLM?: boolean, limit?: number }} cfg
 * @returns {Promise<string[]>}
 */
export async function expandQueryTerms(query, index, cfg = {}) {
  const limit = Math.max(1, Number(cfg.limit || 8));
  const qTokens = tokenize(query);
  const base = new Set();
  for (const t of qTokens) base.add(t);

  // Add static synonyms
  const staticOut = [];
  for (const t of qTokens) {
    const arr = STATIC_SYNONYMS[t];
    if (arr) arr.forEach((s) => staticOut.push(s));
  }

  // Optionally ask LLM to propose synonyms constrained to index topics
  if (cfg.useLLM) {
    try {
      const topics = Array.from(new Set((index.summaries || []).flatMap((s) => s.keyTerms || []))).slice(0, 40);
      const prompt = `Given the user's question tokens and the document topic terms, propose up to ${limit} short synonyms or closely related terms from the topic set only. Return JSON array of strings.\n\nQuestion tokens: ${Array.from(base).join(', ')}\nTopic terms: ${topics.join(', ')}`;
      const json = await sendPrompt(prompt);
      try {
        const arr = JSON.parse(json);
        if (Array.isArray(arr)) {
          arr.forEach((s) => {
            if (typeof s === 'string') staticOut.push(s.toLowerCase());
          });
        }
      } catch {}
    } catch (err) {
      log.warn('LLM synonym expansion failed; using static only', err);
    }
  }

  // Deduplicate and limit
  const out = Array.from(new Set(staticOut.filter((t) => !base.has(t))));
  return out.slice(0, limit);
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { expandQueryTerms };
}


