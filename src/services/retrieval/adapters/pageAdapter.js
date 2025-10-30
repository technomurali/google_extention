// ============================================================================
// PageAdapter - bridges @Page tool to the reusable retrieval engine
// ----------------------------------------------------------------------------
// Reuses existing capture and chunking utilities.
// ============================================================================

import { captureActivePage, chunkContent } from '../../../features/page-content/page-content.js';
import { logger } from '../../../core/logger.js';

const log = logger.create('PageAdapter');

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit hex
  return (h >>> 0).toString(16);
}

/**
 * @param {{ url?: string }} context
 */
function getIndexKey(context) {
  const url = String(context && context.url || '').trim();
  return url ? `page:${url}` : 'page:active';
}

/**
 * @param {{ url?: string }} context
 * @returns {Promise<import('../types.js').Document[]>}
 */
async function listDocuments(context) {
  const payload = await captureActivePage();
  const doc = {
    id: String(payload.url || 'active-page'),
    title: String(payload.title || 'Untitled Page'),
    url: String(payload.url || ''),
    createdAt: Date.now(),
    language: undefined,
    headings: Array.isArray(payload.headings) ? payload.headings : [],
    text: String(payload.text || ''),
    sizeBytes: (payload.text || '').length,
    sourceKind: 'page',
    extra: { timestamp: payload.timestamp }
  };
  return [doc];
}

/**
 * @param {import('../types.js').Document} doc
 */
async function computeContentHash(doc) {
  try {
    const head = (doc.text || '').slice(0, 16384); // 16KB + length
    const fingerprint = `${doc.title || ''}\n${head}\n${(doc.text || '').length}`;
    return djb2(fingerprint);
  } catch (err) {
    log.warn('computeContentHash error:', err);
    return djb2(String(doc.text || ''));
  }
}

/**
 * @param {import('../types.js').Document} doc
 */
async function fetchFullText(doc) {
  return String(doc.text || '');
}

/**
 * @param {import('../types.js').Document} doc
 * @param {{ maxChunkChars?: number, overlapChars?: number, minChunkChars?: number }} options
 * @returns {Promise<import('../types.js').Chunk[]>}
 */
async function chunkDocument(doc, options = {}) {
  const payload = {
    title: doc.title || '',
    url: doc.url || '',
    text: String(doc.text || ''),
    headings: Array.isArray(doc.headings) ? doc.headings : [],
  };
  const cfg = {
    maxChunkChars: Number(options.maxChunkChars || 12000),
    overlapChars: Number(options.overlapChars || 500),
    minChunkChars: Number(options.minChunkChars || 1000),
  };
  const chunks = chunkContent(payload, cfg);
  return chunks.map((c) => ({
    id: String(c.id),
    docId: String(doc.id),
    heading: c.heading || '',
    content: String(c.content || ''),
    sizeChars: Number(c.sizeBytes || c.content?.length || 0),
    index: Number(c.index || 0),
  }));
}

/**
 * @param {import('../types.js').Document} _doc
 * @returns {string[]}
 */
function captureDisclaimers(_doc) {
  // Phase 1: no special detection; future: iframes/shadow DOM notices
  return [];
}

export const PageAdapter = {
  getIndexKey,
  listDocuments,
  computeContentHash,
  fetchFullText,
  chunkDocument,
  captureDisclaimers,
};

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PageAdapter };
}


