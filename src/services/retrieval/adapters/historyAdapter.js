// ============================================================================
// HistoryAdapter - retrieval over recent browser history
// ----------------------------------------------------------------------------
// Builds a lightweight corpus from recent history items (title + URL).
// Progressive reading will be limited to those metadata strings (no page text).
// ============================================================================

import { logger } from '../../../core/logger.js';
import { ensurePermission } from '../../permissions.js';
import { PERMISSIONS } from '../../../core/constants.js';
import { chunkContent } from '../../../features/page-content/page-content.js';

const log = logger.create('HistoryAdapter');

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

/**
 * @param {{ days?: number, text?: string, maxResults?: number }} context
 */
function getIndexKey(context) {
  const days = Number(context && context.days || 7);
  const text = String(context && context.text || '');
  return `history:days=${days}:q=${text.toLowerCase().slice(0,32)}`;
}

/**
 * @param {{ days?: number, text?: string, maxResults?: number }} context
 * @returns {Promise<import('../types.js').Document[]>}
 */
async function listDocuments(context) {
  const perm = await ensurePermission(PERMISSIONS.HISTORY);
  if (!perm || !perm.granted) {
    log.warn('History permission not granted');
    return [];
  }
  const days = Number(context && context.days || 7);
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;
  const text = String(context && context.text || '');
  const maxResults = Number(context && context.maxResults || 300);
  const items = await chrome.history.search({ text, startTime, maxResults });
  // Map each visit as a small doc (title + URL as text)
  const docs = items.map((it) => {
    const content = `${it.title || it.url || ''}\n${it.url || ''}`;
    return {
      id: String(it.id || it.url || djb2(content)),
      title: String(it.title || it.url || 'Untitled'),
      url: String(it.url || ''),
      createdAt: Number(it.lastVisitTime || Date.now()),
      updatedAt: Number(it.lastVisitTime || Date.now()),
      language: undefined,
      headings: [],
      text: content,
      sizeBytes: content.length,
      sourceKind: 'history',
      extra: {},
    };
  });
  return docs;
}

/** @param {import('../types.js').Document} doc */
async function computeContentHash(doc) {
  const s = `${doc.title || ''}\n${doc.url || ''}`;
  return djb2(s);
}

/** @param {import('../types.js').Document} doc */
async function fetchFullText(doc) { return String(doc.text || ''); }

/**
 * @param {import('../types.js').Document} doc
 * @param {{ maxChunkChars?: number, overlapChars?: number, minChunkChars?: number }} options
 * @returns {Promise<import('../types.js').Chunk[]>}
 */
async function chunkDocument(doc, options = {}) {
  const payload = { title: doc.title || '', url: doc.url || '', text: String(doc.text || ''), headings: [] };
  const cfg = { maxChunkChars: 1000, overlapChars: 0, minChunkChars: 200, ...options };
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

function captureDisclaimers(_doc) { return []; }

export const HistoryAdapter = { getIndexKey, listDocuments, computeContentHash, fetchFullText, chunkDocument, captureDisclaimers };

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HistoryAdapter };
}


