// ============================================================================
// Indexer - builds a compact (≤4k tokens) index for a single document
// ----------------------------------------------------------------------------
// Phase 1 implements a summarization fallback that does not require LLM:
//  - Chunk summaries: first sentences capped
//  - Section rollups: merge kid summaries capped
//  - Global synopsis: title + top keywords
//  - Prune to token budget by dropping lowest‑priority chunk summaries
// ============================================================================

import { STOP_WORDS } from '../../core/constants.js';
import { logger } from '../../core/logger.js';
import {
  estimateTokensForText,
  hardCapTextToTokens,
  pruneToTokenBudget,
} from './utils/tokenBudget.js';

const log = logger.create('Indexer');

const DEFAULT_BUDGET = {
  maxTokens: 4000,
  globalSynopsisTokens: 450,
  perSectionTokens: 160,
  perChunkSummaryTokens: 140,
  maxSections: 10,
  maxChunkSummaries: 12,
};

const SIMPLE_STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','as','by','is','are','was','were','be','been','it','this','that','from','at','which','will','can','would','should','could','about','into','over','than','then','so','if','we','you','they','i'
]);
// Extend with history stop words to reduce noise when reused
try {
  (STOP_WORDS && STOP_WORDS.HISTORY_KEYWORDS || []).forEach((w) => SIMPLE_STOP.add(String(w).toLowerCase()));
} catch {}

function splitSentences(text) {
  const s = String(text || '').trim();
  if (!s) return [];
  return s
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/);
}

function firstSentences(text, maxTokens) {
  const sentences = splitSentences(text);
  const out = [];
  let tokens = 0;
  for (const sent of sentences) {
    const t = estimateTokensForText(sent);
    if (tokens + t > maxTokens) break;
    out.push(sent);
    tokens += t;
  }
  const joined = out.join(' ').trim();
  return joined || hardCapTextToTokens(text || '', maxTokens);
}

function extractKeyTerms(text, limit = 12) {
  const freq = new Map();
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const w of words) {
    if (SIMPLE_STOP.has(w)) continue;
    if (w.length <= 2) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function groupSections(chunks) {
  const sections = [];
  let current = null;
  for (const c of chunks) {
    const heading = (c.heading && c.heading.trim()) || `Section ${c.index || sections.length + 1}`;
    if (!current || current.heading !== heading) {
      current = { id: `sec-${sections.length + 1}`, heading, chunkIds: [] };
      sections.push(current);
    }
    current.chunkIds.push(c.id);
  }
  return sections;
}

function buildToc(sections) {
  return sections.map((s) => ({ heading: s.heading, level: 2, chunkIds: s.chunkIds.slice() }));
}

/**
 * Builds a compact index for a single document.
 * @param {import('./types.js').Document} doc
 * @param {import('./types.js').Chunk[]} chunks
 * @param {{ budget?: Partial<typeof DEFAULT_BUDGET>, contentHash: string }} opts
 * @returns {import('./types.js').Index}
 */
export function buildIndexSingleDoc(doc, chunks, opts) {
  const budget = { ...DEFAULT_BUDGET, ...(opts && opts.budget || {}) };
  const sections = groupSections(chunks);
  const toc = buildToc(sections);

  // Chunk summaries (fallback): first sentences capped + key terms
  const chunkSummaries = chunks.map((c, i) => {
    const text = firstSentences(c.content, budget.perChunkSummaryTokens);
    return /** @type {import('./types.js').Summary} */({
      id: `sum-ch-${i + 1}`,
      refId: c.id,
      kind: 'chunk',
      text,
      keyTerms: extractKeyTerms(text, 10),
      entities: [],
    });
  });

  // Section rollups: merge summaries of child chunks and cap
  const sectionSummaries = sections.map((s, i) => {
    const merged = s.chunkIds
      .map((cid) => chunkSummaries.find((x) => x.refId === cid)?.text || '')
      .filter(Boolean)
      .join(' ');
    const text = firstSentences(merged, budget.perSectionTokens);
    return /** @type {import('./types.js').Summary} */({
      id: `sum-sec-${i + 1}`,
      refId: s.id,
      kind: 'section',
      text,
      keyTerms: extractKeyTerms(text, 12),
      entities: [],
    });
  });

  // Global synopsis: title + top terms from sections
  const allTerms = sectionSummaries.flatMap((s) => s.keyTerms);
  const uniqueTop = Array.from(new Set(allTerms)).slice(0, 20);
  const synopsisBase = `${doc.title || 'Document'} — Topics: ${uniqueTop.join(', ')}`;
  const globalSynopsis = /** @type {import('./types.js').Summary} */({
    id: 'sum-global-1',
    refId: doc.id,
    kind: 'global',
    text: hardCapTextToTokens(synopsisBase, budget.globalSynopsisTokens),
    keyTerms: uniqueTop,
    entities: [],
  });

  // Compose summaries with ordering: global, sections (cap), chunks (cap)
  let summaries = [globalSynopsis];
  const limitedSections = sectionSummaries.slice(0, Math.max(1, budget.maxSections));
  summaries.push(...limitedSections);
  const limitedChunks = chunkSummaries.slice(0, Math.max(1, budget.maxChunkSummaries));
  summaries.push(...limitedChunks);

  // Prune to token budget by dropping lowest-priority chunk summaries first
  const compareKeep = (a, b) => {
    // Keep global and sections first
    const rk = (x) => (x.kind === 'global' ? 0 : x.kind === 'section' ? 1 : 2);
    const ra = rk(a), rb = rk(b);
    if (ra !== rb) return ra - rb;
    // For same kind, shorter texts first (cheaper to keep)
    const ta = estimateTokensForText(a.text);
    const tb = estimateTokensForText(b.text);
    return ta - tb;
  };

  pruneToTokenBudget(
    summaries,
    (s) => s.text,
    compareKeep,
    budget.maxTokens
  );

  /** @type {import('./types.js').Index} */
  const index = {
    key: '', // filled by caller/store key
    meta: {
      url: doc.url || undefined,
      title: doc.title || undefined,
      language: doc.language || undefined,
      createdAt: Date.now(),
      contentHash: String(opts && opts.contentHash || ''),
    },
    toc,
    summaries,
    sections,
  };

  log.info('Index built:', {
    title: doc.title,
    chunks: chunks.length,
    sections: sections.length,
    summaries: summaries.length,
  });
  return index;
}

/**
 * Builds a compact index for a corpus of documents (e.g., ChromePad notes).
 * Namespacing of chunk ids should already be handled by the adapter.
 * @param {import('./types.js').Document[]} docs
 * @param {Record<string, import('./types.js').Chunk[]>} chunksByDocId
 * @param {{ budget?: Partial<typeof DEFAULT_BUDGET>, contentHash: string }} opts
 * @returns {import('./types.js').Index}
 */
export function buildIndexCorpus(docs, chunksByDocId, opts) {
  const budget = { ...DEFAULT_BUDGET, ...(opts && opts.budget || {}) };
  const sections = [];
  const allChunkSummaries = [];

  // Per-document sections and chunk summaries
  docs.forEach((doc) => {
    const chunks = chunksByDocId[doc.id] || [];
    // Group into synthetic sections by chunk heading or sequential blocks
    const docSections = groupSections(chunks).map((s, i) => ({ id: `${doc.id}::${s.id}`, heading: `${doc.title}: ${s.heading}`, chunkIds: s.chunkIds.slice() }));
    sections.push(...docSections);

    const chunkSummaries = chunks.map((c, i) => {
      const text = firstSentences(c.content, budget.perChunkSummaryTokens);
      return /** @type {import('./types.js').Summary} */({
        id: `${doc.id}::sum-ch-${i + 1}`,
        refId: c.id,
        kind: 'chunk',
        text,
        keyTerms: extractKeyTerms(text, 10),
        entities: [],
      });
    });
    allChunkSummaries.push(...chunkSummaries);
  });

  // Section rollups
  const sectionSummaries = sections.map((s, i) => {
    const merged = s.chunkIds
      .map((cid) => allChunkSummaries.find((x) => x.refId === cid)?.text || '')
      .filter(Boolean)
      .join(' ');
    const text = firstSentences(merged, budget.perSectionTokens);
    return /** @type {import('./types.js').Summary} */({
      id: `sum-sec-${i + 1}`,
      refId: s.id,
      kind: 'section',
      text,
      keyTerms: extractKeyTerms(text, 12),
      entities: [],
    });
  });

  // Global synopsis: concatenate doc titles + top terms across sections
  const titles = docs.map((d) => d.title || 'Untitled').slice(0, 12).join(' · ');
  const allTerms = sectionSummaries.flatMap((s) => s.keyTerms);
  const uniqueTop = Array.from(new Set(allTerms)).slice(0, 25);
  const synopsisBase = `Notes Corpus — ${titles} — Topics: ${uniqueTop.join(', ')}`;
  const globalSynopsis = /** @type {import('./types.js').Summary} */({
    id: 'sum-global-1',
    refId: 'corpus',
    kind: 'global',
    text: hardCapTextToTokens(synopsisBase, budget.globalSynopsisTokens),
    keyTerms: uniqueTop,
    entities: [],
  });

  // Compose and prune
  let summaries = [globalSynopsis];
  const limitedSections = sectionSummaries.slice(0, Math.max(1, budget.maxSections));
  summaries.push(...limitedSections);
  const limitedChunks = allChunkSummaries.slice(0, Math.max(1, budget.maxChunkSummaries));
  summaries.push(...limitedChunks);

  const compareKeep = (a, b) => {
    const rk = (x) => (x.kind === 'global' ? 0 : x.kind === 'section' ? 1 : 2);
    const ra = rk(a), rb = rk(b);
    if (ra !== rb) return ra - rb;
    const ta = estimateTokensForText(a.text);
    const tb = estimateTokensForText(b.text);
    return ta - tb;
  };
  pruneToTokenBudget(summaries, (s) => s.text, compareKeep, budget.maxTokens);

  /** @type {import('./types.js').Index} */
  const index = {
    key: '',
    meta: {
      url: undefined,
      title: 'Notes Corpus',
      language: undefined,
      createdAt: Date.now(),
      contentHash: String(opts && opts.contentHash || ''),
    },
    toc: sections.map((s) => ({ heading: s.heading, level: 2, chunkIds: s.chunkIds.slice() })),
    summaries,
    sections,
  };
  log.info('Corpus index built:', { docs: docs.length, sections: sections.length, summaries: summaries.length });
  return index;
}
// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildIndexSingleDoc };
}


