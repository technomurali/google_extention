// ============================================================================
// ChromePadAdapter - query across notes corpus
// ----------------------------------------------------------------------------
// Reads notes from chrome.storage.local (key: 'chromepadNotes') and exposes
// them as Documents for the retrieval engine. Chunking reuses page chunker.
// ============================================================================

import { chunkContent } from '../../../features/page-content/page-content.js';
import { logger } from '../../../core/logger.js';

const log = logger.create('ChromePadAdapter');
const STORAGE_KEY = 'chromepadNotes';

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

async function readNotesMap() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    const map = data && data[STORAGE_KEY] && typeof data[STORAGE_KEY] === 'object' ? data[STORAGE_KEY] : {};
    return map;
  } catch (err) {
    log.warn('Failed to read notes map:', err);
    return {};
  }
}

/**
 * @param {{ folderId?: string }} _context
 */
function getIndexKey(_context) {
  return 'chromepad:all';
}

/**
 * @param {{ folderId?: string }} _context
 * @returns {Promise<import('../types.js').Document[]>}
 */
async function listDocuments(_context) {
  const map = await readNotesMap();
  const docs = Object.values(map).map((note) => {
    return {
      id: String(note.id || ''),
      title: String(note.name || 'Untitled'),
      url: undefined,
      createdAt: Number(note.createdAt || Date.now()),
      updatedAt: Number(note.updatedAt || note.createdAt || Date.now()),
      language: undefined,
      headings: [],
      text: String(note.content || ''),
      sizeBytes: (note.content || '').length,
      sourceKind: 'note',
      extra: {},
    };
  });
  return docs;
}

/**
 * @param {import('../types.js').Document} doc
 */
async function computeContentHash(doc) {
  try {
    const head = (doc.text || '').slice(0, 4096);
    const fingerprint = `${doc.title || ''}\n${head}\n${(doc.text || '').length}`;
    return djb2(fingerprint);
  } catch (err) {
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
 * Namespaces chunk id with doc id for corpus uniqueness: `${doc.id}::${chunk.id}`
 * @param {import('../types.js').Document} doc
 * @param {{ maxChunkChars?: number, overlapChars?: number, minChunkChars?: number }} options
 * @returns {Promise<import('../types.js').Chunk[]>}
 */
async function chunkDocument(doc, options = {}) {
  const payload = { title: doc.title || '', url: '', text: String(doc.text || ''), headings: [] };
  const cfg = {
    maxChunkChars: Number(options.maxChunkChars || 8000),
    overlapChars: Number(options.overlapChars || 300),
    minChunkChars: Number(options.minChunkChars || 600),
  };
  const chunks = chunkContent(payload, cfg);
  return chunks.map((c) => ({
    id: `${doc.id}::${String(c.id)}`,
    docId: String(doc.id),
    heading: c.heading || '',
    content: String(c.content || ''),
    sizeChars: Number(c.sizeBytes || c.content?.length || 0),
    index: Number(c.index || 0),
  }));
}

function captureDisclaimers(_doc) { return []; }

export const ChromePadAdapter = {
  getIndexKey,
  listDocuments,
  computeContentHash,
  fetchFullText,
  chunkDocument,
  captureDisclaimers,
};

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChromePadAdapter };
}


