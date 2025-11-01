// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// IndexStore - chrome.storage backed index cache with simple LRU/TTL policies
// ----------------------------------------------------------------------------
// This store is intentionally simple for Phase 1. We keep a map of key → entry
// and an LRU list to approximate recency. TTL is enforced on load/save.
// ============================================================================

import { logger } from '../../../core/logger.js';

const log = logger.create('IndexStore');

const NAMESPACE = 'retrieval:indexes';
const LRU_KEY = 'retrieval:lru';

const DEFAULTS = {
  maxEntries: 20,
  ttlHours: 24 * 7, // 7 days
  maxTotalBytes: 4_000_000, // ~4MB safety cap for chrome.storage.local
  maxEntryBytes: 1_000_000, // ~1MB per index soft cap (advisory)
};

function measureBytes(obj) {
  try {
    // Approximate UTF-8 bytes from JSON string length
    const s = JSON.stringify(obj) || '';
    // Roughly estimate bytes: count non-ASCII as 2 bytes, ASCII as 1
    // For simplicity and speed, use length as a lower-bound approximation
    return s.length;
  } catch {
    return 0;
  }
}

/**
 * @returns {Promise<Record<string, any>>}
 */
async function readAll() {
  try {
    const data = await chrome.storage.local.get([NAMESPACE]);
    return data[NAMESPACE] && typeof data[NAMESPACE] === 'object' ? data[NAMESPACE] : {};
  } catch (err) {
    log.warn('readAll fallback to localStorage:', err);
    try {
      const raw = localStorage.getItem(NAMESPACE) || '{}';
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

/**
 * @param {Record<string, any>} map
 */
async function writeAll(map) {
  try {
    await chrome.storage.local.set({ [NAMESPACE]: map });
  } catch (err) {
    log.warn('writeAll fallback to localStorage:', err);
    try { localStorage.setItem(NAMESPACE, JSON.stringify(map)); } catch {}
  }
}

/**
 * @returns {Promise<string[]>}
 */
async function readLRU() {
  try {
    const data = await chrome.storage.local.get([LRU_KEY]);
    return Array.isArray(data[LRU_KEY]) ? data[LRU_KEY] : [];
  } catch (err) {
    log.warn('readLRU fallback to localStorage:', err);
    try {
      const raw = localStorage.getItem(LRU_KEY) || '[]';
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
}

/**
 * @param {string[]} list
 */
async function writeLRU(list) {
  try {
    await chrome.storage.local.set({ [LRU_KEY]: list });
  } catch (err) {
    log.warn('writeLRU fallback to localStorage:', err);
    try { localStorage.setItem(LRU_KEY, JSON.stringify(list)); } catch {}
  }
}

/**
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function loadIndex(key) {
  const now = Date.now();
  const map = await readAll();
  const entry = map[key];
  if (!entry) return null;

  // TTL enforcement
  const ttlMs = (DEFAULTS.ttlHours || 168) * 3600 * 1000;
  if (entry.meta && entry.meta.createdAt && now - entry.meta.createdAt > ttlMs) {
    // Expired
    delete map[key];
    await writeAll(map);
    await dropFromLRU(key);
    log.info('Index expired by TTL:', key);
    return null;
  }

  await touchLRU(key);
  return entry;
}

/**
 * @param {string} key
 * @param {any} index
 */
export async function saveIndex(key, index) {
  const map = await readAll();
  map[key] = index;
  await writeAll(map);
  await touchLRU(key);
  await evictIfNeeded(DEFAULTS);
}

/**
 * @param {string} key
 */
export async function deleteIndex(key) {
  const map = await readAll();
  if (map[key]) {
    delete map[key];
    await writeAll(map);
  }
  await dropFromLRU(key);
}

async function touchLRU(key) {
  const list = await readLRU();
  const next = [key, ...list.filter((k) => k !== key)];
  await writeLRU(next);
}

async function dropFromLRU(key) {
  const list = await readLRU();
  const next = list.filter((k) => k !== key);
  await writeLRU(next);
}

/**
 * Simple count-based eviction (Phase 1). Evict least recently used.
 * @param {{ maxEntries?: number }} cfg
 */
async function evictIfNeeded(cfg) {
  const limits = Object.assign({}, DEFAULTS, cfg || {});
  const maxEntries = Math.max(1, Number(limits.maxEntries));
  const ttlMs = Math.max(0, Number(limits.ttlHours)) * 3600 * 1000;
  const maxTotalBytes = Math.max(1, Number(limits.maxTotalBytes));

  let map = await readAll();
  let lru = await readLRU();

  // 1) TTL purge
  try {
    if (ttlMs > 0) {
      const now = Date.now();
      let purged = 0;
      for (const k of Object.keys(map)) {
        const e = map[k];
        const created = e && e.meta && e.meta.createdAt;
        if (created && now - created > ttlMs) {
          delete map[k];
          purged += 1;
        }
      }
      if (purged) {
        await writeAll(map);
        lru = lru.filter((k) => !!map[k]);
        await writeLRU(lru);
        log.info('IndexStore TTL purged entries:', purged);
      }
    }
  } catch {}

  // 2) Count-based eviction
  const keys = Object.keys(map);
  if (keys.length > maxEntries) {
    const toRemove = Math.max(0, keys.length - maxEntries);
    const victims = lru.slice().reverse().slice(0, toRemove);
    for (const k of victims) {
      if (map[k]) delete map[k];
    }
    await writeAll(map);
    lru = lru.filter((k) => !victims.includes(k));
    await writeLRU(lru);
    log.info('IndexStore evicted by count:', victims.length);
  }

  // 3) Size-based eviction (total bytes cap)
  try {
    let totalBytes = 0;
    for (const k of Object.keys(map)) totalBytes += measureBytes(map[k]);
    if (totalBytes > maxTotalBytes) {
      const victims = [];
      // Evict from least-recently-used tail until under cap
      for (let i = lru.length - 1; i >= 0 && totalBytes > maxTotalBytes; i--) {
        const k = lru[i];
        if (!map[k]) continue;
        totalBytes -= measureBytes(map[k]);
        delete map[k];
        victims.push(k);
      }
      await writeAll(map);
      lru = lru.filter((k) => !victims.includes(k));
      await writeLRU(lru);
      log.info('IndexStore evicted by size:', victims.length, { totalBytesAfter: totalBytes });
    }
  } catch (err) {
    log.warn('IndexStore size eviction failed (continuing):', err);
  }
}

/**
 * Manual cleanup: TTL purge, remove orphaned LRU items, count+size eviction.
 * Can be called on startup or periodically.
 */
export async function cleanupStore(cfg = {}) {
  try {
    await evictIfNeeded(Object.assign({}, DEFAULTS, cfg || {}));
  } catch (err) {
    log.warn('cleanupStore failed:', err);
  }
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadIndex, saveIndex, deleteIndex };
}


