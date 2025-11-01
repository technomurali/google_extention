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
import { getSettings } from '../../services/settings.js';

const log = logger.create('Downloads');

/**
 * Detects if query is requesting all downloads
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
    /^all\s+downloads?/i,
    /^(show|list|display)\s+(me\s+)?(all\s+)?downloads?/i,
    /^(show|list|display)\s+downloads?\s+all/i,
    // Handle "show meall X downloads" or "show me all X downloads"
    /^(show|list|display)\s+(me\s+)?all\s+(\d+)\s+downloads?/i,
    // Handle "show all downloads upto/up to X"
    /^(show|list|display)\s+(me\s+)?all\s+downloads?\s+(?:up\s*to|upto)\s+\d+/i,
    // Handle "show downloads upto/up to X"
    /^(show|list|display)\s+downloads?\s+(?:up\s*to|upto)\s+\d+/i,
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
  
  // Check if query is just numbers or "show X downloads" without actual search terms
  const numberOnlyPattern = /^(show|list|display)\s+(\d+)\s+downloads?$/i;
  if (numberOnlyPattern.test(normalized)) {
    log.debug(`Query "${normalized}" matched number-only pattern`);
    return true;
  }
  
  return false;
}

/**
 * Extracts numeric limit from query (e.g., "show 500 downloads")
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
    // "show all downloads upto 100" or "show all downloads up to 100"
    /(?:show|list|display)\s+(?:me\s+)?all\s+downloads?\s+(?:up\s*to|upto)\s+(\d{1,4})/i,
    // "show downloads upto 100" or "downloads up to 100"
    /downloads?\s+(?:up\s*to|upto)\s+(\d{1,4})/i,
    // "show all upto 100" or "show all up to 100"
    /(?:show|list|display)\s+(?:me\s+)?all\s+(?:up\s*to|upto)\s+(\d{1,4})/i,
    // "upto 100 downloads" or "up to 100 downloads"
    /(?:up\s*to|upto)\s+(\d{1,4})\s+downloads?/i,
    // "show all 500 downloads"
    /(?:show|list|display)\s+(?:me\s+)?all\s+(\d{1,4})\s+downloads?/i,
    // "show 500 downloads"
    /(?:show|list|display)\s+(\d{1,4})\s+downloads?/i,
    // "500 downloads"
    /(\d{1,4})\s+downloads?/i,
    // "downloads 500"
    /downloads?\s+(\d{1,4})/i,
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = normalized.match(pattern);
    if (match) {
      const limit = parseInt(match[1], 10);
      log.debug(`Pattern ${i} matched: "${pattern}" -> extracted limit: ${limit} from query: "${normalized}"`);
      if (limit > 0 && limit <= UI.MAX_DOWNLOADS_DISPLAY) {
        return limit;
      }
    }
  }
  
  log.debug(`No limit extracted from query: "${normalized}"`);
  return null;
}

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

  // Get settings for downloads tool
  const downloadSettings = await getSettings('tools.downloads') || {};
  const defaultMaxResults = downloadSettings.maxResults || UI.MAX_DOWNLOADS_DISPLAY;

  try {
    const trimmedQuery = queryText && typeof queryText === 'string'
      ? queryText.trim()
      : '';

    // Check if query is requesting "show all"
    const isShowAll = isShowAllQuery(trimmedQuery);
    const extractedLimit = extractLimitFromQuery(trimmedQuery);
    
    // Determine the limit to use
    let requestLimit = extractedLimit || defaultMaxResults;
    
    // For Chrome API, we might need to fetch more than the limit to filter properly
    // Fetch up to the limit or defaultMaxResults, whichever is greater
    const fetchLimit = Math.max(requestLimit, UI.MAX_DOWNLOADS_DISPLAY);

    const searchOptions = {
      limit: fetchLimit,
    };

    log.debug(`Search options: isShowAll=${isShowAll}, extractedLimit=${extractedLimit}, requestLimit=${requestLimit}, fetchLimit=${fetchLimit}`);

    // Note: Chrome downloads.search() doesn't have a 'query' parameter
    // We need to filter manually
    const allDownloads = await chrome.downloads.search(searchOptions);

    let results = allDownloads;

    // If it's a "show all" query, don't filter by search terms
    if (isShowAll) {
      log.info(`Returning all downloads (show all request): ${allDownloads.length} total, extractedLimit: ${extractedLimit}, requestLimit: ${requestLimit}, defaultMaxResults: ${defaultMaxResults}`);
      return results.slice(0, requestLimit);
    }

    // Normal search - filter by query text
    const lowerQuery = trimmedQuery.toLowerCase();
    if (lowerQuery) {
      results = allDownloads.filter((download) => {
        const filename = (download.filename || '').toLowerCase();
        const url = (download.url || '').toLowerCase();
        return filename.includes(lowerQuery) || url.includes(lowerQuery);
      });
    }

    log.info(`Filtered to ${results.length} downloads matching "${trimmedQuery}" out of ${allDownloads.length} total`);
    
    // Also extract limit from search queries (e.g., "pdf 500" or "show 500 pdf")
    const searchLimit = extractLimitFromQuery(trimmedQuery);
    const maxResults = searchLimit || defaultMaxResults;
    
    return results.slice(0, maxResults);
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

