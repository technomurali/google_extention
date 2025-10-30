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
    throw new PermissionError(
      getPermissionDeniedMessage(PERMISSIONS.BOOKMARKS),
      PERMISSIONS.BOOKMARKS
    );
  }

  try {
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = [];
    traverseBookmarkTree(tree, bookmarks);

    log.info(`Retrieved ${bookmarks.length} bookmarks`);
    return bookmarks;
  } catch (error) {
    log.error('Error fetching bookmarks:', error);
    throw new PermissionError(ERROR_MESSAGES.ERROR_READING_BOOKMARKS, PERMISSIONS.BOOKMARKS);
  }
}

/**
 * Searches bookmarks by query text
 * Filters bookmarks whose title or URL contains the query
 * @param {string} queryText - Search query
 * @returns {Promise<Array>} Filtered bookmarks
 */
export async function searchBookmarks(queryText) {
  const allBookmarks = await getAllBookmarks();

  // Handle empty, null, undefined, or whitespace-only queries - return all bookmarks
  if (!queryText || typeof queryText !== 'string') {
    log.info(`Returning all bookmarks (no query): ${allBookmarks.length} total`);
    return allBookmarks.slice(0, UI.MAX_BOOKMARKS_DISPLAY);
  }

  const trimmedQuery = queryText.trim();
  
  // If query becomes empty after trimming whitespace, return all bookmarks
  if (!trimmedQuery) {
    log.info(`Returning all bookmarks (empty after trim): ${allBookmarks.length} total`);
    return allBookmarks.slice(0, UI.MAX_BOOKMARKS_DISPLAY);
  }

  const lowerQuery = trimmedQuery.toLowerCase();

  const filtered = allBookmarks.filter((bookmark) => {
    const titleMatch = (bookmark.title || '').toLowerCase().includes(lowerQuery);
    const urlMatch = (bookmark.url || '').toLowerCase().includes(lowerQuery);
    return titleMatch || urlMatch;
  });

  log.info(`Filtered to ${filtered.length} bookmarks matching "${trimmedQuery}" out of ${allBookmarks.length} total`);
  return filtered.slice(0, UI.MAX_BOOKMARKS_DISPLAY);
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

