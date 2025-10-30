// ============================================================================
// Retrieval (Phase 2) - classification, lexical retrieve, optional rerank
// ----------------------------------------------------------------------------
// Works on the compact Index built in Phase 1 (summaries + sections + toc).
// ============================================================================

import { logger } from '../../core/logger.js';
import { sendPrompt } from '../ai.js';

const log = logger.create('Retrieval');

const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','as','by','is','are','was','were','be','been','it','this','that','from','at','which','will','can','would','should','could','about','into','over','than','then','so','if','we','you','they','i','what','how','why','when','where','show','give','tell'
]);

function normTokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP.has(w));
}

/**
 * Classify query intent and breadth (heuristic + optional LLM later).
 * @param {string} query
 */
export async function classifyQuery(query) {
  const q = String(query || '').toLowerCase();
  let intent = 'fact';
  if (/\bdefine|definition\b/.test(q)) intent = 'definition';
  else if (/\bhow\b/.test(q)) intent = 'howto';
  else if (/\bcompare|vs\.|versus|difference\b/.test(q)) intent = 'comparison';
  else if (/\bquote|exact words|citation|cite\b/.test(q)) intent = 'quote';
  const breadth = intent === 'comparison' ? 'wide' : 'narrow';
  return { intent, breadth };
}

/**
 * Lexical retrieval over index summaries (global, sections, chunks).
 * Returns top M refIds with scores; prefers sections over chunks.
 * @param {import('./types.js').Index} index
 * @param {string} query
 * @param {{ topM?: number }} cfg
 */
export function lexicalRetrieve(index, query, cfg = {}) {
  const topM = Math.max(1, Number(cfg.topM || 12));
  const qTokens = normTokens(query);
  const qSet = new Set(qTokens);

  const headingMap = new Map(); // sectionId -> heading
  for (const s of index.sections || []) headingMap.set(s.id, s.heading || '');

  const tocHeadings = new Set((index.toc || []).map((t) => (t.heading || '').toLowerCase()));

  const scores = new Map(); // refId -> { score, kind }

  for (const s of index.summaries || []) {
    const text = String(s.text || '').toLowerCase();
    // Base score: overlap count in text
    let sc = 0;
    for (const w of qSet) {
      if (w.length < 2) continue;
      if (text.includes(w)) sc += 2; // summary hit weight
    }
    // Boost section heading exacts
    if (s.kind === 'section') {
      const head = (headingMap.get(s.refId) || '').toLowerCase();
      for (const w of qSet) {
        if (head.includes(w)) sc += 3;
      }
      if (tocHeadings.has(head)) sc += 1;
    }
    // Slightly penalize chunk relative to section to prefer broader units first
    if (s.kind === 'chunk') sc *= 0.9;

    if (sc > 0) {
      const prev = scores.get(s.refId);
      const val = prev ? Math.max(prev.score, sc) : sc;
      scores.set(s.refId, { score: val, kind: s.kind });
    }
  }

  const arr = Array.from(scores.entries()).map(([refId, v]) => ({ refId, score: v.score }));
  arr.sort((a, b) => b.score - a.score);
  return arr.slice(0, topM);
}

/**
 * Optional: Re-rank with LLM by presenting top summaries and asking for JSON refId array.
 * @param {import('./types.js').Index} index
 * @param {string} query
 * @param {{ refId: string, score: number }[]} candidates
 * @param {{ rerankK?: number }} cfg
 */
export async function rerankWithLLM(index, query, candidates, cfg = {}) {
  try {
    const k = Math.max(1, Number(cfg.rerankK || 4));
    // Build prompt with minimal content: id + kind + snippet
    const lookup = new Map(index.summaries.map((s) => [s.refId, s]));
    const lines = candidates.map((c, i) => {
      const sum = lookup.get(c.refId);
      const kind = sum ? sum.kind : 'unknown';
      const snippet = sum ? String(sum.text || '').slice(0, 300) : '';
      return `${i + 1}. ${c.refId} [${kind}] :: ${snippet}`;
    }).join('\n');
    const prompt = `You are selecting the most relevant sections to answer the user's question. Return ONLY a JSON array of refIds (strings), length up to ${k}, ordered by priority.\n\nQuestion: ${query}\nCandidates:\n${lines}`;
    const json = await sendPrompt(prompt);
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) {
        const filtered = arr.filter((id) => typeof id === 'string');
        return { refIds: filtered.slice(0, k), rationale: '' };
      }
    } catch {}
  } catch (err) {
    log.warn('rerankWithLLM failed, using lexical order', err);
  }
  // Fallback: keep original order by score, limit K
  const k = Math.max(1, Number(cfg.rerankK || 4));
  return { refIds: candidates.slice(0, k).map((c) => c.refId), rationale: '' };
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classifyQuery, lexicalRetrieve, rerankWithLLM };
}


