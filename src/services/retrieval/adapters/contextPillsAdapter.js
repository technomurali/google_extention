// ============================================================================
// ContextPillsAdapter - bridges @iChromeChat pills to the retrieval engine
// ----------------------------------------------------------------------------
// Treats each pill as a document in a small corpus and reuses page chunking.
// ============================================================================

import { chunkContent } from '../../../features/page-content/page-content.js';
import { logger } from '../../../core/logger.js';

const log = logger.create('ContextPillsAdapter');

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

/**
 * @param {{ pills: { id: string, text: string, label?: string }[] }} context
 */
function getIndexKey(context) {
  try {
    const pills = Array.isArray(context && context.pills) ? context.pills : [];
    const joined = pills.map(p => (p.label ? `[${p.label}] ` : '') + (p.text || '')).join('\n---\n');
    const h = djb2(joined);
    return `ctx:${h}`;
  } catch {
    return 'ctx:empty';
  }
}

/**
 * @param {{ pills: { id: string, text: string, label?: string }[] }} context
 * @returns {Promise<import('../types.js').Document[]>}
 */
async function listDocuments(context) {
  const pills = Array.isArray(context && context.pills) ? context.pills : [];
  if (!pills.length) return [];
  const limits = (context && context.limits) || {};
  const maxDocs = Math.max(1, Number(limits.maxDocs || 25));
  const maxTotal = Math.max(10000, Number(limits.maxTotalChars || 500000));
  let total = 0;
  const docs = [];
  for (let idx = 0; idx < pills.length; idx++) {
    if (docs.length >= maxDocs) break;
    const p = pills[idx];
    const baseId = String(p.id || `pill-${idx + 1}`);
    const title = String(p.label || `Context ${idx + 1}`);
    const data = p && p.data;
    if (data && data.kind === 'list' && Array.isArray(data.items)) {
      // Flatten list into one full-text document (untruncated)
      const lines = [];
      for (const it of data.items) {
        const t = String((it && it.title) || '').trim();
        const u = String((it && it.url) || '').trim();
        const line = `${t}${(t && u) ? ' — ' : ''}${u}`.trim();
        if (!line) continue;
        // Check size budget incrementally
        if (total + line.length + 1 > maxTotal) { break; }
        lines.push(line);
        total += line.length + 1;
      }
      const text = lines.join('\n');
      docs.push({
        id: baseId,
        title,
        url: '',
        createdAt: Date.now(),
        language: undefined,
        headings: [],
        text,
        sizeBytes: text.length,
        sourceKind: 'ctx',
        extra: { pillIndex: idx, kind: 'list', count: data.items.length, truncated: (text.length === 0 || lines.length < data.items.length) },
      });
    } else if (data && data.kind === 'notes' && Array.isArray(data.items)) {
      // Notes payload: concatenate titles + content into a single document
      const blocks = [];
      for (const n of data.items) {
        const t = String((n && n.title) || 'Untitled');
        const c = String((n && n.content) || '');
        const block = `# ${t}\n${c}`;
        if (total + block.length + 4 > maxTotal) { break; }
        blocks.push(block);
        total += block.length + 4;
      }
      const text = blocks.join('\n\n---\n\n');
      docs.push({
        id: baseId,
        title,
        url: '',
        createdAt: Date.now(),
        language: undefined,
        headings: [],
        text,
        sizeBytes: text.length,
        sourceKind: 'ctx',
        extra: { pillIndex: idx, kind: 'notes', count: data.items.length, truncated: (blocks.length < data.items.length) },
      });
    } else {
      // Plain text pill (fallback)
      let text = String(p.text || '');
      if (total + text.length > maxTotal) {
        text = text.slice(0, Math.max(0, maxTotal - total));
      }
      total += text.length;
      docs.push({
        id: baseId,
        title,
        url: '',
        createdAt: Date.now(),
        language: undefined,
        headings: [],
        text,
        sizeBytes: text.length,
        sourceKind: 'ctx',
        extra: { pillIndex: idx, truncated: (text.length < (p.text || '').length) },
      });
    }
    if (total >= maxTotal) break;
  }
  return docs;
}

/**
 * @param {import('../types.js').Document} doc
 */
async function computeContentHash(doc) {
  try {
    const head = (doc.text || '').slice(0, 8192);
    return djb2(`${doc.title || ''}\n${head}\n${(doc.text || '').length}`);
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
    maxChunkChars: Number(options.maxChunkChars || 8000),
    overlapChars: Number(options.overlapChars || 300),
    minChunkChars: Number(options.minChunkChars || 800),
  };
  const chunks = await chunkContent(payload, cfg);
  return chunks.map((c) => ({
    id: String(c.id),
    docId: String(doc.id),
    heading: c.heading || '',
    content: String(c.content || ''),
    sizeChars: Number(c.sizeBytes || c.content?.length || 0),
    index: Number(c.index || 0),
  }));
}

function captureDisclaimers(_doc) {
  return [];
}

export const ContextPillsAdapter = {
  getIndexKey,
  listDocuments,
  computeContentHash,
  fetchFullText,
  chunkDocument,
  captureDisclaimers,
};

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContextPillsAdapter };
}


