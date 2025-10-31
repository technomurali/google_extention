// ============================================================================
// Retrieval Engine - Phase 1 entrypoint (build & cache index for @Page)
// ----------------------------------------------------------------------------
// Exposes askWholeCorpus() which for Phase 1 builds an index for a single
// document (e.g., active page) and caches it. Retrieval/reading will be wired
// in later phases.
// ============================================================================

import { logger } from '../../core/logger.js';
import { saveIndex, loadIndex, cleanupStore } from './stores/indexStore.js';
import { buildIndexSingleDoc, buildIndexCorpus } from './indexer.js';
import { emitRetrievalEvent } from './utils/events.js';
import { classifyQuery, lexicalRetrieve, rerankWithLLM } from './retrieval.js';
import { expandQueryTerms } from './utils/synonyms.js';
import { progressiveRead } from './progressiveReader.js';

const log = logger.create('RetrievalEngine');

// Simple in-flight build map to avoid duplicate builds per key
const inflight = new Map(); // key -> Promise<{ index, built }>

/**
 * Phase 1: Build and cache an index for a corpus (single doc for @Page).
 * Future phases will also return retrieval results & answers.
 * @param {{
 *   adapter: any,
 *   context: any,
 *   config?: { index?: any, chunking?: any, debug?: boolean },
 *   sessionId?: string,
 *   onProgress?: (p: { key: string, phase: string, percent: number }) => void,
 * }} params
 * @returns {Promise<{ index: import('./types.js').Index, built: boolean }>}
 */
export async function askWholeCorpus({ adapter, context, config, sessionId, onProgress }) {
  const t0 = Date.now();
  const debug = !!(config && config.debug);
  // Opportunistic cleanup before any heavy work
  try { await cleanupStore(); } catch {}
  const docs = await adapter.listDocuments(context);
  if (!docs || docs.length === 0) {
    throw new Error('No documents available for indexing');
  }
  const baseKey = adapter.getIndexKey(context);
  // Compute content hash: single doc or corpus
  let contentHash = '';
  if (docs.length === 1) {
    contentHash = await adapter.computeContentHash(docs[0]);
  } else {
    // Combine hashes for corpus
    const parts = [];
    for (const d of docs) parts.push(await adapter.computeContentHash(d));
    contentHash = (function combine(hs){
      let acc = 5381;
      for (const h of hs) {
        for (let i = 0; i < h.length; i++) acc = ((acc << 5) + acc) ^ h.charCodeAt(i);
      }
      return (acc >>> 0).toString(16);
    })(parts);
  }
  const storeKey = `${baseKey}:${contentHash}`;

  // Try cache
  const cached = await loadIndex(storeKey);
  if (cached) {
    if (debug) log.info('Index cache hit', { key: storeKey, ms: Date.now() - t0 });
    cached.key = storeKey;
    return { index: cached, built: false };
  }

  // Concurrency lock: if a build is already running for this key, reuse it
  if (inflight.has(storeKey)) {
    if (debug) log.info('Reusing inflight index build', { key: storeKey });
    return inflight.get(storeKey);
  }

  const report = (phase, percent) => {
    const payload = { key: storeKey, phase, percent };
    try { onProgress && onProgress(payload); } catch {}
    emitRetrievalEvent('retrieval-progress', payload);
  };

  const buildPromise = (async () => {
    report('start', 0);
    // Build fresh
    report('chunking', 25);
    let index;
    if (docs.length === 1) {
      const doc = docs[0];
      const chunks = await adapter.chunkDocument(doc, config && config.chunking || {});
      report('buildingIndex', 60);
      index = buildIndexSingleDoc(doc, chunks, { budget: config && config.index || {}, contentHash });
    } else {
      // Corpus: chunk per doc, then build corpus index
      const chunksByDocId = {};
      for (const d of docs) {
        chunksByDocId[d.id] = await adapter.chunkDocument(d, config && config.chunking || {});
      }
      report('buildingIndex', 60);
      index = buildIndexCorpus(docs, chunksByDocId, { budget: config && config.index || {}, contentHash });
    }
    index.key = storeKey;
    report('saving', 85);
    await saveIndex(storeKey, index);
    const ms = Date.now() - t0;
    if (debug) log.info('Index built & saved', { key: storeKey, ms });
    report('done', 100);
    return { index, built: true };
  })()
    .finally(() => {
      inflight.delete(storeKey);
    });

  inflight.set(storeKey, buildPromise);
  return buildPromise;
}

/**
 * Phase 3: Retrieve then progressively read and synthesize an answer with sources.
 * @param {{
 *   adapter: any,
 *   context: any,
 *   query: string,
 *   config?: { index?: any, retrieval?: any, reading?: any, debug?: boolean },
 * }} params
 * @returns {Promise<{ text: string, usedRefs: { docId: string, chunkId: string, heading?: string }[], confidence: 'low'|'medium'|'high' }>}
 */
export async function answerWithRetrieval({ adapter, context, query, config }) {
  const { refIds, index } = await retrieveRefs({ adapter, context, query, config });
  return progressiveRead({ adapter, context, query, index, refIds, config });
}

/**
 * Phase 2: Ensure index exists, then retrieve top references for a query.
 * @param {{
 *   adapter: any,
 *   context: any,
 *   query: string,
 *   config?: { index?: any, retrieval?: { topM?: number, rerankK?: number, useLLM?: boolean }, debug?: boolean },
 * }} params
 * @returns {Promise<{ refIds: string[], rationale?: string, candidates: { refId: string, score: number }[], index: import('./types.js').Index }>}
 */
export async function retrieveRefs({ adapter, context, query, config }) {
  const t0 = performance.now();
  // Ensure index exists
  const { index } = await askWholeCorpus({ adapter, context, config });
  const debug = !!(config && config.debug);
  const retrievalCfg = (config && config.retrieval) || {};

  // Classify query (heuristic for now)
  const tCls0 = performance.now();
  const cls = await classifyQuery(query);
  const tCls1 = performance.now();
  if (debug) log.info('Query classified', cls);

  // Optional synonym expansion
  const tSyn0 = performance.now();
  let expanded = [];
  if (retrievalCfg.expandSynonyms) {
    expanded = await expandQueryTerms(query, index, { useLLM: !!retrievalCfg.useLLM, limit: 8 });
  }
  const tSyn1 = performance.now();
  const expandedQuery = expanded.length ? `${query} ${expanded.join(' ')}` : query;

  // Lexical retrieve
  const tLex0 = performance.now();
  const candidates = lexicalRetrieve(index, expandedQuery, { topM: retrievalCfg.topM || 12 });
  const tLex1 = performance.now();
  if (debug) log.info('Lexical candidates', candidates);

  // Optional LLM rerank over summaries only
  const tRr0 = performance.now();
  let refIds;
  let rationale = '';
  if (retrievalCfg.useLLM && candidates.length > Math.max(1, (retrievalCfg.rerankK || 4))) {
    try {
      // Use expanded query (with synonyms) to help LLM understand intent semantically
      const rr = await rerankWithLLM(index, expandedQuery, candidates, { rerankK: retrievalCfg.rerankK || 4 });
      refIds = rr.refIds;
      rationale = rr.rationale || '';
    } catch (err) {
      if (debug) log.warn('LLM rerank failed, using lexical order', err);
      refIds = candidates.slice(0, (retrievalCfg.rerankK || 4)).map((c) => c.refId);
    }
  } else {
    refIds = candidates.slice(0, (retrievalCfg.rerankK || 4)).map((c) => c.refId);
  }
  const tRr1 = performance.now();

  // Telemetry event
  if (debug) {
    emitRetrievalEvent('retrieval-telemetry', {
      clsMs: Math.round(tCls1 - tCls0),
      synMs: Math.round(tSyn1 - tSyn0),
      lexMs: Math.round(tLex1 - tLex0),
      rrMs: Math.round(tRr1 - tRr0),
      totalMs: Math.round(tRr1 - t0),
      expanded,
      candidateCount: candidates.length,
    });
  }

  return { refIds, rationale, candidates, index };
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { askWholeCorpus };
}


