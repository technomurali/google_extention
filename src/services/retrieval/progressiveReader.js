// ============================================================================
// Progressive Reader (Phase 3)
// ----------------------------------------------------------------------------
// Loads full chunk texts progressively under a strict token budget and
// synthesizes an answer with citations and a confidence hint.
// ============================================================================

import { logger } from '../../core/logger.js';
import { sendPrompt } from '../ai.js';
import {
  estimateTokensForText,
  hardCapTextToTokens,
} from './utils/tokenBudget.js';

const log = logger.create('ProgressiveReader');

const DEFAULT_CFG = {
  reading: {
    kMax: 3,
    reserveAnswerTokens: 800,
    perChunkTokenCap: 1400,
    confidenceThreshold: 0.7,
  }
};

/**
 * Maps refIds to chunkIds using the index.
 * Section ids map to their child chunk ids; chunk ids pass through.
 * @param {import('./types.js').Index} index
 * @param {string[]} refIds
 * @returns {string[]}
 */
export function mapRefsToChunkIds(index, refIds) {
  const secMap = new Map((index.sections || []).map(s => [s.id, s.chunkIds || []]));
  const out = [];
  for (const id of refIds || []) {
    if (secMap.has(id)) {
      for (const cid of secMap.get(id)) out.push(cid);
    } else {
      out.push(id);
    }
  }
  // Deduplicate preserving order
  return Array.from(new Set(out));
}

/**
 * @param {{ reading?: { kMax?: number, perChunkTokenCap?: number, reserveAnswerTokens?: number } }} cfg
 */
export function planAnswerBudget(cfg) {
  const r = (cfg && cfg.reading) || {};
  return {
    kMax: Math.max(1, Number(r.kMax || DEFAULT_CFG.reading.kMax)),
    perChunkTokenCap: Math.max(300, Number(r.perChunkTokenCap || DEFAULT_CFG.reading.perChunkTokenCap)),
    reserveAnswerTokens: Math.max(300, Number(r.reserveAnswerTokens || DEFAULT_CFG.reading.reserveAnswerTokens)),
  };
}

function buildPrompt(docTitle, docUrl, query, chunksPayload) {
  const header = `You are answering a question using ONLY the provided page sections. Quote exactly when appropriate. At the end include a Sources list with the section headings used. If the answer is not present, respond: "insufficient evidence in these sections".

PAGE: ${docTitle || ''}
URL: ${docUrl || ''}
`;
  const sections = chunksPayload.map((c, i) => `SECTION ${i + 1}: ${c.heading || ''}\n${c.text}`).join('\n\n');
  return `${header}\n${sections}\n\nQUESTION: ${query}`;
}

function parseConfidence(answerText) {
  // Heuristic: longer answers with multiple sentences → higher confidence
  const s = String(answerText || '').trim();
  if (!s) return 'low';
  const len = s.length;
  const sentences = s.split(/[.!?]\s+/).length;
  if (len > 600 && sentences >= 3) return 'high';
  if (len > 200) return 'medium';
  return 'low';
}

/**
 * Progressive reading loop: read up to kMax chunks and synthesize answer.
 * @param {{ adapter: any, context: any, query: string, index: import('./types.js').Index, refIds: string[], config?: any }} params
 * @returns {Promise<{ text: string, usedRefs: { docId: string, chunkId: string, heading?: string }[], confidence: 'low'|'medium'|'high' }>}
 */
export async function progressiveRead({ adapter, context, query, index, refIds, config }) {
  const signal = config && config.signal;
  if (signal && signal.aborted) {
    throw new Error('aborted');
  }
  const budget = planAnswerBudget(config);
  const chunkIds = mapRefsToChunkIds(index, refIds);
  const docs = await adapter.listDocuments(context);
  if (signal && signal.aborted) {
    throw new Error('aborted');
  }
  if (!docs || docs.length === 0) throw new Error('No document for reading');
  const docById = new Map(docs.map((d) => [String(d.id), d]));
  const chunkCacheByDoc = new Map(); // docId -> Map(chunkId -> chunk)
  
  const usedRefs = [];
  const selected = [];
  for (const cid of chunkIds) {
    if (signal && signal.aborted) {
      throw new Error('aborted');
    }
    // Detect namespaced id `${docId}::chunk-#` for corpus. Otherwise single-doc.
    let docId = null;
    let chunkKey = cid;
    const ns = String(cid).split('::');
    if (ns.length === 2) {
      docId = ns[0];
      chunkKey = cid; // already namespaced
    }
    const d = docId ? docById.get(docId) : docs[0];
    if (!d) continue;
    let cache = chunkCacheByDoc.get(d.id);
    if (!cache) {
      const docChunks = await adapter.chunkDocument(d, {});
      if (signal && signal.aborted) {
        throw new Error('aborted');
      }
      cache = new Map(docChunks.map((x) => [x.id, x]));
      chunkCacheByDoc.set(d.id, cache);
    }
    const c = cache.get(chunkKey);
    if (!c) continue;
    // Cap chunk text by tokens
    const textCapped = hardCapTextToTokens(c.content || '', budget.perChunkTokenCap);
    selected.push({ id: c.id, heading: c.heading || '', text: textCapped });
    usedRefs.push({ docId: d.id, chunkId: c.id, heading: c.heading || '' });
    if (selected.length >= budget.kMax) break;
  }

  if (selected.length === 0) {
    return { text: 'insufficient evidence (no readable sections)', usedRefs: [], confidence: 'low' };
  }

  // Build prompt and ask once for Phase 3 MVP
  if (signal && signal.aborted) {
    throw new Error('aborted');
  }
  const prompt = buildPrompt(index.meta.title || doc.title || '', index.meta.url || doc.url || '', query, selected);
  const answer = await sendPrompt(prompt);
  const confidence = parseConfidence(answer);
  return { text: answer, usedRefs, confidence };
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mapRefsToChunkIds, planAnswerBudget, progressiveRead };
}


