// ============================================================================
// DOWNLOADS MANAGER - Chrome Downloads API Integration
// ============================================================================
// FILE SUMMARY:
// Handles downloads search and retrieval operations.
//
// FEATURES:
// - Downloads search with query filter
// - Permission handling
// - Error management
// - Result formatting
// ============================================================================

import { PERMISSIONS, UI, ERROR_MESSAGES } from '../../core/constants.js';
import { PermissionError } from '../../core/errors.js';
import { ensurePermission, getPermissionDeniedMessage } from '../../services/permissions.js';
import { logger } from '../../core/logger.js';

const log = logger.create('Downloads');

/**
 * Searches browser downloads
 * @param {string} queryText - Search query (empty for all downloads)
 * @returns {Promise<Array>} Array of download objects
 * @throws {PermissionError} If downloads permission is denied
 */
export async function searchDownloads(queryText) {
  log.info('Searching downloads with query:', queryText);

  // Ensure permission
  const permissionResult = await ensurePermission(PERMISSIONS.DOWNLOADS);

  if (!permissionResult.granted) {
    throw new PermissionError(
      getPermissionDeniedMessage(PERMISSIONS.DOWNLOADS),
      PERMISSIONS.DOWNLOADS
    );
  }

  try {
    const query = queryText && typeof queryText === 'string'
      ? queryText.toLowerCase().trim()
      : '';

    const searchOptions = {
      limit: UI.MAX_DOWNLOADS_DISPLAY,
    };

    // Note: Chrome downloads.search() doesn't have a 'query' parameter
    // We need to filter manually
    const allDownloads = await chrome.downloads.search(searchOptions);

    let results = allDownloads;

    // Manual filtering if query provided
    if (query) {
      results = allDownloads.filter((download) => {
        const filename = (download.filename || '').toLowerCase();
        const url = (download.url || '').toLowerCase();
        return filename.includes(query) || url.includes(query);
      });
    }

    log.info(`Found ${results.length} downloads`);
    return results;
  } catch (error) {
    log.error('Error searching downloads:', error);
    throw new PermissionError(ERROR_MESSAGES.ERROR_READING_DOWNLOADS, PERMISSIONS.DOWNLOADS);
  }
}

/**
 * Converts downloads to standardized result format for rendering
 * @param {Array} downloads - Download objects from Chrome API
 * @returns {Array} Standardized result objects
 */
export function convertDownloadsToResults(downloads) {
  return downloads.map((download) => ({
    title: download.filename || download.url || 'Unknown file',
    url: download.url || '',
    lastVisitTime: download.endTime ? new Date(download.endTime).getTime() : 0,
  }));
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    searchDownloads,
    convertDownloadsToResults,
  };
}

