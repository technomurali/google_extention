// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// BOOKMARKS MANAGER - Chrome Bookmarks API Integration
// ============================================================================
// FILE SUMMARY:
// Handles bookmarks search, retrieval, and filtering operations.
//
// FEATURES:
// - Recursive bookmark tree traversal
// - Search/filter by text
// - Permission handling
// - Error management
// ============================================================================

import { PERMISSIONS, UI, ERROR_MESSAGES, STATUS_MESSAGES } from '../../core/constants.js';
import { PermissionError } from '../../core/errors.js';
import { ensurePermission, getPermissionDeniedMessage } from '../../services/permissions.js';
import { logger } from '../../core/logger.js';
import { getSettings } from '../../services/settings.js';

const log = logger.create('Bookmarks');

/**
 * Recursively traverses bookmark tree and collects all bookmarks with URLs
 * @param {Array} nodes - Bookmark tree nodes
 * @param {Array} collection - Array to collect bookmarks into
 */
function traverseBookmarkTree(nodes, collection) {
  if (!Array.isArray(nodes)) {
    return;
  }

  nodes.forEach((node) => {
    if (node.url) {
      collection.push({
        title: node.title || '',
        url: node.url,
        dateAdded: node.dateAdded || 0,
      });
    }

    if (node.children) {
      traverseBookmarkTree(node.children, collection);
    }
  });
}

/**
 * Retrieves all bookmarks from Chrome
 * @returns {Promise<Array>} Array of bookmark objects
 * @throws {PermissionError} If bookmarks permission is denied
 */
export async function getAllBookmarks() {
  log.info('Fetching all bookmarks');

  // Ensure permission
  const permissionResult = await ensurePermission(PERMISSIONS.BOOKMARKS);

  if (!permissionResult.granted) {
    log.warn('Bookmarks permission not granted');
    throw new PermissionError(
      getPermissionDeniedMessage(PERMISSIONS.BOOKMARKS),
      PERMISSIONS.BOOKMARKS
    );
  }

  try {
    // Check if Chrome bookmarks API is available
    if (!chrome.bookmarks || typeof chrome.bookmarks.getTree !== 'function') {
      log.error('Chrome bookmarks API not available');
      throw new Error('Chrome bookmarks API is not available. Please ensure you are using a compatible Chrome version.');
    }

    const tree = await chrome.bookmarks.getTree();
    
    if (!tree || !Array.isArray(tree)) {
      log.warn('Invalid bookmarks tree structure received');
      return [];
    }

    const bookmarks = [];
    traverseBookmarkTree(tree, bookmarks);

    log.info(`Retrieved ${bookmarks.length} bookmarks`);
    return bookmarks;
  } catch (error) {
    log.error('Error fetching bookmarks:', error);
    
    // Re-throw PermissionError as-is
    if (error instanceof PermissionError) {
      throw error;
    }
    
    // Wrap other errors appropriately
    if (error.message && error.message.includes('permission')) {
      throw new PermissionError(error.message, PERMISSIONS.BOOKMARKS);
    }
    
    throw new PermissionError(ERROR_MESSAGES.ERROR_READING_BOOKMARKS + ' ' + error.message, PERMISSIONS.BOOKMARKS);
  }
}

/**
 * Detects if query is requesting all bookmarks
 * @param {string} query - Query text
 * @returns {boolean} True if query indicates "show all"
 */
function isShowAllQuery(query) {
  if (!query || typeof query !== 'string') return true;
  
  // Normalize the query - handle typos like "meall" -> "me all"
  let normalized = query.toLowerCase().trim();
  normalized = normalized.replace(/meall/gi, 'me all');
  normalized = normalized.replace(/showall/gi, 'show all');
  normalized = normalized.replace(/listall/gi, 'list all');
  normalized = normalized.replace(/upto/gi, 'up to'); // Normalize "upto" to "up to"
  
  // Patterns that indicate "show all" intent
  const showAllPatterns = [
    /^(show|list|display|get)\s+(me\s+)?all/i,
    /^all\s+bookmarks?/i,
    /^(show|list|display)\s+(me\s+)?(all\s+)?bookmarks?/i,
    /^(show|list|display)\s+bookmarks?\s+all/i,
    // Handle "show meall X bookmarks" or "show me all X bookmarks"
    /^(show|list|display)\s+(me\s+)?all\s+(\d+)\s+bookmarks?/i,
    // Handle "show all bookmarks upto/up to X"
    /^(show|list|display)\s+(me\s+)?all\s+bookmarks?\s+(?:up\s*to|upto)\s+\d+/i,
    // Handle "show bookmarks upto/up to X"
    /^(show|list|display)\s+bookmarks?\s+(?:up\s*to|upto)\s+\d+/i,
    // Handle "show all upto/up to X"
    /^(show|list|display)\s+(me\s+)?all\s+(?:up\s*to|upto)\s+\d+/i,
  ];
  
  // Check if query matches any "show all" pattern
  for (const pattern of showAllPatterns) {
    if (pattern.test(normalized)) {
      log.debug(`Query "${normalized}" matched show-all pattern: ${pattern}`);
      return true;
    }
  }
  
  // Check if query is just numbers or "show X bookmarks" without actual search terms
  const numberOnlyPattern = /^(show|list|display)\s+(\d+)\s+bookmarks?$/i;
  if (numberOnlyPattern.test(normalized)) {
    log.debug(`Query "${normalized}" matched number-only pattern`);
    return true;
  }
  
  return false;
}

/**
 * Extracts numeric limit from query (e.g., "show 500 bookmarks")
 * @param {string} query - Query text
 * @returns {number|null} Extracted limit or null
 */
function extractLimitFromQuery(query) {
  if (!query || typeof query !== 'string') return null;
  
  // Normalize the query - handle typos like "meall" -> "me all"
  let normalized = query.toLowerCase().trim();
  normalized = normalized.replace(/meall/gi, 'me all');
  normalized = normalized.replace(/showall/gi, 'show all');
  normalized = normalized.replace(/listall/gi, 'list all');
  normalized = normalized.replace(/upto/gi, 'up to'); // Normalize "upto" to "up to"
  
  const patterns = [
    // "show all bookmarks upto 100" or "show all bookmarks up to 100"
    /(?:show|list|display)\s+(?:me\s+)?all\s+bookmarks?\s+(?:up\s*to|upto)\s+(\d{1,4})/i,
    // "show bookmarks upto 100" or "bookmarks up to 100"
    /bookmarks?\s+(?:up\s*to|upto)\s+(\d{1,4})/i,
    // "show all upto 100" or "show all up to 100"
    /(?:show|list|display)\s+(?:me\s+)?all\s+(?:up\s*to|upto)\s+(\d{1,4})/i,
    // "upto 100 bookmarks" or "up to 100 bookmarks"
    /(?:up\s*to|upto)\s+(\d{1,4})\s+bookmarks?/i,
    // "show all 500 bookmarks"
    /(?:show|list|display)\s+(?:me\s+)?all\s+(\d{1,4})\s+bookmarks?/i,
    // "show 500 bookmarks"
    /(?:show|list|display)\s+(\d{1,4})\s+bookmarks?/i,
    // "500 bookmarks"
    /(\d{1,4})\s+bookmarks?/i,
    // "bookmarks 500"
    /bookmarks?\s+(\d{1,4})/i,
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = normalized.match(pattern);
    if (match) {
      const limit = parseInt(match[1], 10);
      log.debug(`Pattern ${i} matched: "${pattern}" -> extracted limit: ${limit} from query: "${normalized}"`);
      if (limit > 0 && limit <= UI.MAX_BOOKMARKS_DISPLAY) {
        return limit;
      }
    }
  }
  
  log.debug(`No limit extracted from query: "${normalized}"`);
  return null;
}

/**
 * Searches bookmarks by query text
 * Filters bookmarks whose title or URL contains the query
 * @param {string} queryText - Search query
 * @returns {Promise<Array>} Filtered bookmarks
 */
export async function searchBookmarks(queryText) {
  // Get settings for bookmarks tool
  const bookmarkSettings = await getSettings('tools.bookmarks') || {};
  const defaultMaxResults = bookmarkSettings.maxResults || UI.MAX_BOOKMARKS_DISPLAY;
  
  const allBookmarks = await getAllBookmarks();

  // Handle empty, null, undefined, or whitespace-only queries - return all bookmarks
  if (!queryText || typeof queryText !== 'string') {
    log.info(`Returning all bookmarks (no query): ${allBookmarks.length} total`);
    return allBookmarks.slice(0, defaultMaxResults);
  }

  const trimmedQuery = queryText.trim();
  
  // If query becomes empty after trimming whitespace, return all bookmarks
  if (!trimmedQuery) {
    log.info(`Returning all bookmarks (empty after trim): ${allBookmarks.length} total`);
    return allBookmarks.slice(0, defaultMaxResults);
  }

  // Check if query is requesting "show all"
  if (isShowAllQuery(trimmedQuery)) {
    // Extract limit if specified (e.g., "show 500 bookmarks")
    const extractedLimit = extractLimitFromQuery(trimmedQuery);
    const maxResults = extractedLimit || defaultMaxResults;
    
    log.info(`Returning all bookmarks (show all request): ${allBookmarks.length} total, extractedLimit: ${extractedLimit}, maxResults: ${maxResults}, defaultMaxResults: ${defaultMaxResults}`);
    return allBookmarks.slice(0, maxResults);
  }

  // Normal search - filter by query text
  const lowerQuery = trimmedQuery.toLowerCase();

  const filtered = allBookmarks.filter((bookmark) => {
    const titleMatch = (bookmark.title || '').toLowerCase().includes(lowerQuery);
    const urlMatch = (bookmark.url || '').toLowerCase().includes(lowerQuery);
    return titleMatch || urlMatch;
  });

  log.info(`Filtered to ${filtered.length} bookmarks matching "${trimmedQuery}" out of ${allBookmarks.length} total`);
  
  // Also extract limit from search queries (e.g., "github 500" or "show 500 github")
  const searchLimit = extractLimitFromQuery(trimmedQuery);
  const maxResults = searchLimit || defaultMaxResults;
  
  return filtered.slice(0, maxResults);
}

/**
 * Converts bookmarks to standardized result format for rendering
 * @param {Array} bookmarks - Bookmark objects
 * @returns {Array} Standardized result objects
 */
export function convertBookmarksToResults(bookmarks) {
  return bookmarks.map((bookmark) => ({
    title: bookmark.title || bookmark.url,
    url: bookmark.url,
    lastVisitTime: bookmark.dateAdded || 0,
  }));
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllBookmarks,
    searchBookmarks,
    convertBookmarksToResults,
  };
}

