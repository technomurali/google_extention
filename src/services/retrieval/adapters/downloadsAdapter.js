// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// DownloadsAdapter - retrieval over downloaded files metadata
// ----------------------------------------------------------------------------
// Builds a small corpus from downloads (filename + URL). Progressive reading is
// limited to those strings.
// ============================================================================

import { logger } from '../../../core/logger.js';
import { ensurePermission } from '../../permissions.js';
import { PERMISSIONS } from '../../../core/constants.js';
import { chunkContent } from '../../../features/page-content/page-content.js';

const log = logger.create('DownloadsAdapter');

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

/** @param {{ text?: string, maxResults?: number }} context */
function getIndexKey(context) {
  const text = String(context && context.text || '');
  return `downloads:q=${text.toLowerCase().slice(0,32)}`;
}

/**
 * @param {{ text?: string, maxResults?: number }} context
 * @returns {Promise<import('../types.js').Document[]>}
 */
async function listDocuments(context) {
  const perm = await ensurePermission(PERMISSIONS.DOWNLOADS);
  if (!perm || !perm.granted) {
    log.warn('Downloads permission not granted');
    return [];
  }
  const text = String(context && context.text || '').toLowerCase();
  const maxResults = Number(context && context.maxResults || 300);
  const items = await chrome.downloads.search({ limit: maxResults });
  const docs = items
    .filter((d) => {
      if (!text) return true;
      const f = String(d.filename || '').toLowerCase();
      const u = String(d.url || '').toLowerCase();
      return f.includes(text) || u.includes(text);
    })
    .map((d) => {
      const content = `${d.filename || 'Unknown file'}\n${d.url || ''}`;
      return {
        id: String(d.id || djb2(content)),
        title: String(d.filename || 'Downloaded file'),
        url: String(d.url || ''),
        createdAt: Number(new Date(d.startTime || Date.now()).getTime()),
        updatedAt: Number(new Date(d.endTime || d.startTime || Date.now()).getTime()),
        language: undefined,
        headings: [],
        text: content,
        sizeBytes: content.length,
        sourceKind: 'download',
        extra: {},
      };
    });
  return docs;
}

/** @param {import('../types.js').Document} doc */
async function computeContentHash(doc) { return djb2(`${doc.title}\n${doc.url}`); }

/** @param {import('../types.js').Document} doc */
async function fetchFullText(doc) { return String(doc.text || ''); }

/**
 * @param {import('../types.js').Document} doc
 * @param {{ maxChunkChars?: number, overlapChars?: number, minChunkChars?: number }} options
 * @returns {Promise<import('../types.js').Chunk[]>}
 */
async function chunkDocument(doc, options = {}) {
  const payload = { title: doc.title || '', url: doc.url || '', text: String(doc.text || ''), headings: [] };
  const cfg = { maxChunkChars: 600, overlapChars: 0, minChunkChars: 200, ...options };
  const chunks = await chunkContent(payload, cfg);
  return chunks.map((c) => ({ id: String(c.id), docId: String(doc.id), heading: c.heading || '', content: String(c.content || ''), sizeChars: Number(c.sizeBytes || c.content?.length || 0), index: Number(c.index || 0) }));
}

function captureDisclaimers(_doc) { return []; }

export const DownloadsAdapter = { getIndexKey, listDocuments, computeContentHash, fetchFullText, chunkDocument, captureDisclaimers };

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DownloadsAdapter };
}


