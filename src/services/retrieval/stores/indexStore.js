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
};

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
  const maxEntries = Math.max(1, Number(cfg.maxEntries || DEFAULTS.maxEntries));
  const map = await readAll();
  const lru = await readLRU();
  const keys = Object.keys(map);
  if (keys.length <= maxEntries) return;

  // Evict from the tail of LRU
  const toRemove = Math.max(0, keys.length - maxEntries);
  const victims = lru.slice().reverse().slice(0, toRemove);
  for (const k of victims) {
    if (map[k]) delete map[k];
  }
  await writeAll(map);
  const filtered = lru.filter((k) => !victims.includes(k));
  await writeLRU(filtered);
  log.info('IndexStore evicted entries:', victims.length);
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadIndex, saveIndex, deleteIndex };
}


