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
  // Prefer cached snapshot provided by caller (avoids re-capturing the page)
  try {
    const cached = context && context.cached;
    if (cached && (Array.isArray(cached.chunks) || typeof cached.text === 'string')) {
      const chunks = Array.isArray(cached.chunks) ? cached.chunks : [];
      const text = typeof cached.text === 'string' && cached.text.length ? cached.text : chunks.map((c) => String(c && c.content || '')).join('\n');
      const headings = Array.isArray(cached.headings) ? cached.headings : chunks.map((c) => String(c && c.heading || ''));
      const doc = {
        id: String(cached.url || context && context.url || 'active-page'),
        title: String(cached.title || 'Untitled Page'),
        url: String(cached.url || ''),
        createdAt: Date.now(),
        language: undefined,
        headings: headings.filter(Boolean),
        text: String(text || ''),
        sizeBytes: (text || '').length,
        sourceKind: 'page',
        extra: { timestamp: Date.now(), cachedChunks: chunks }
      };
      return [doc];
    }
  } catch (err) {
    log.warn('listDocuments cached path failed, falling back to live capture:', err);
  }

  // Fallback: live capture of active page
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
  // Fast-path: reuse cached chunks when available on the document
  let chunks;
  try {
    const cached = doc && doc.extra && Array.isArray(doc.extra.cachedChunks) ? doc.extra.cachedChunks : null;
    if (cached) {
      chunks = cached.map((c, idx) => ({
        id: String(c.id || `chunk-${idx + 1}`),
        index: Number(c.index || idx + 1),
        heading: String(c.heading || `Section ${idx + 1}`),
        content: String(c.content || ''),
        sizeBytes: Number(c.sizeBytes || (c.content ? c.content.length : 0)),
      }));
    } else {
      chunks = chunkContent(payload, cfg);
    }
  } catch {
    chunks = chunkContent(payload, cfg);
  }
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


