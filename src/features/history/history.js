// ============================================================================
// HISTORY MANAGER - Browser History Search and Classification
// ============================================================================
// FILE SUMMARY:
// Handles all browser history related operations including AI-powered query
// classification, history searching, filtering, and result rendering.
//
// FEATURES:
// - AI-powered query classification with structured output
// - Flexible time window calculations
// - Domain filtering and normalization
// - Search engine query detection
// - History result rendering with favicons
// ============================================================================

import {
  HISTORY,
  DOMAIN_SHORTCUTS,
  STOP_WORDS,
  REGEX_PATTERNS,
  UI,
  TIME,
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  DEFAULTS,
  PERMISSIONS,
} from '../../core/constants.js';
import { PermissionError, ValidationError } from '../../core/errors.js';
import { ensurePermission, getPermissionDeniedMessage } from '../../services/permissions.js';
import { cloneAISession } from '../../services/ai.js';
import { logger } from '../../core/logger.js';
import {
  normalizeDomain,
  extractDomain,
  isValidUrl,
  getGoogleFaviconUrl,
  getDefaultFavicon,
  clamp,
} from '../../core/utils.js';

const log = logger.history;

/**
 * Schema for history classification structured output
 */
const HISTORY_CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [HISTORY.INTENT_HISTORY, HISTORY.INTENT_OTHER] },
    keywords: { type: 'array', items: { type: 'string' } },
    domains: { type: 'array', items: { type: 'string' } },
    timeRange: {
      type: 'string',
      enum: [
        HISTORY.TIME_RANGE_TODAY,
        HISTORY.TIME_RANGE_YESTERDAY,
        HISTORY.TIME_RANGE_LAST_7,
        HISTORY.TIME_RANGE_LAST_30,
        HISTORY.TIME_RANGE_ALL,
      ],
    },
    limit: { type: 'number' },
    days: { type: 'number' },
    searchOnly: { type: 'boolean' },
  },
  required: ['intent'],
  additionalProperties: false,
};

/**
 * Classification result object
 * @typedef {Object} HistoryClassification
 * @property {string} intent - 'history' or 'other'
 * @property {string[]} keywords - Search keywords
 * @property {string[]} domains - Domain filters
 * @property {string} timeRange - Time range preset
 * @property {number} limit - Maximum results
 * @property {number} days - Custom day range
 * @property {boolean} searchOnly - Filter to search engine queries only
 */

/**
 * Classifies user query to determine if it's asking about browser history
 * Uses AI with structured output to extract intent and filters
 * @param {string} queryText - User's query text
 * @returns {Promise<HistoryClassification>} Classification result
 */
export async function classifyHistoryQuery(queryText) {
  if (!queryText || typeof queryText !== 'string') {
    throw new ValidationError('Query text must be a non-empty string');
  }

  const lowerQuery = queryText.toLowerCase();

  // Quick heuristic check - only proceed if history-related keywords found
  if (!REGEX_PATTERNS.HISTORY_KEYWORDS_PATTERN.test(lowerQuery)) {
    log.debug('No history keywords detected, returning "other" intent');
    return { intent: HISTORY.INTENT_OTHER };
  }

  // Use AI to extract structured information
  try {
    log.debug('Classifying history query with AI');
    
    const classifierSession = await cloneAISession();
    
    if (!classifierSession) {
      log.warn('AI not available, using fallback classification');
      return createFallbackClassification();
    }

    const prompt = createClassificationPrompt(queryText);
    const result = await classifierSession.prompt(prompt, {
      responseConstraint: HISTORY_CLASSIFICATION_SCHEMA,
    });

    // Clean up classifier session
    try {
      if (classifierSession.destroy) {
        classifierSession.destroy();
      }
    } catch (error) {
      log.warn('Error destroying classifier session:', error);
    }

    const classification = JSON.parse(result);
    log.info('Query classified:', classification);
    return classification;
  } catch (error) {
    log.error('Classification error, using fallback:', error);
    return createFallbackClassification();
  }
}

/**
 * Creates the AI prompt for query classification
 * @private
 * @param {string} queryText - User's query
 * @returns {string} Formatted prompt
 */
function createClassificationPrompt(queryText) {
  return `You are to classify a user's query about browser history.
Return ONLY JSON with fields:
- intent: 'history' | 'other'
- keywords: string[]
- domains: string[] (e.g., ['youtube.com'])
- timeRange: 'today' | 'yesterday' | 'last7' | 'last30' | 'all'
- days: number (custom last N days when provided like 'last 10 days')
- limit: number (max results requested like 'show last 10')
- searchOnly: boolean (true if the user asked for searches only)

Examples:
"show my history" => {"intent":"history","keywords":[],"domains":[],"timeRange":"last7"}
"what did I visit today?" => {"intent":"history","keywords":[],"domains":[],"timeRange":"today"}
"show history about youtube" => {"intent":"history","keywords":["youtube"],"domains":[],"timeRange":"last7"}
"show last 10 history items" => {"intent":"history","keywords":[],"domains":[],"timeRange":"last7","limit":10}
"show history from google.com" => {"intent":"history","keywords":[],"domains":["google.com"],"timeRange":"last7"}
"what did I browse last 7 days?" => {"intent":"history","keywords":[],"domains":[],"timeRange":"last7","days":7}
"show 15 google searches from today" => {"intent":"history","keywords":["google"],"domains":["google.com"],"timeRange":"today","limit":15,"searchOnly":true}

Query: ${queryText}`;
}

/**
 * Creates fallback classification when AI is unavailable
 * @private
 * @returns {HistoryClassification} Default history classification
 */
function createFallbackClassification() {
  return {
    intent: HISTORY.INTENT_HISTORY,
    keywords: [],
    domains: [],
    timeRange: HISTORY.DEFAULT_TIME_RANGE,
    limit: HISTORY.DEFAULT_LIMIT,
  };
}

/**
 * Computes start and end timestamps for a time range
 * @param {string} timeRange - Time range preset
 * @param {number|null} daysOverride - Custom number of days (overrides preset)
 * @returns {{startTime: number, endTime: number}} Time window in milliseconds
 */
export function computeTimeWindow(timeRange, daysOverride = null, exactDateTs = null) {
  // If exact calendar date provided → use that 24-hour window
  if (typeof exactDateTs === 'number' && exactDateTs > 0) {
    const startOfDay = new Date(exactDateTs);
    startOfDay.setHours(0, 0, 0, 0);
    const startTime = startOfDay.getTime();
    const endTime = startTime + 24 * TIME.MS_PER_DAY;
    return { startTime, endTime };
  }
  const now = Date.now();
  let startTime = 0;
  const endTime = now;

  // Custom days override takes precedence
  if (typeof daysOverride === 'number' && daysOverride > 0) {
    startTime = now - daysOverride * TIME.MS_PER_DAY;
    return { startTime, endTime };
  }

  // Use preset time range
  switch (timeRange) {
    case HISTORY.TIME_RANGE_TODAY: {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      startTime = todayStart.getTime();
      break;
    }
    case HISTORY.TIME_RANGE_YESTERDAY: {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart.getTime() - TIME.MS_PER_DAY);
      startTime = yesterdayStart.getTime();
      break;
    }
    case HISTORY.TIME_RANGE_LAST_7:
      startTime = now - TIME.DAYS_LAST_WEEK * TIME.MS_PER_DAY;
      break;
    case HISTORY.TIME_RANGE_LAST_30:
      startTime = now - TIME.DAYS_LAST_MONTH * TIME.MS_PER_DAY;
      break;
    case HISTORY.TIME_RANGE_ALL:
    default:
      startTime = 0;
      break;
  }

  return { startTime, endTime };
}

/**
 * Sanitizes keywords by removing stop words
 * @param {string[]} keywords - Raw keywords from classification
 * @returns {string[]} Cleaned keywords
 */
function sanitizeKeywords(keywords) {
  const stopWords = new Set(STOP_WORDS.HISTORY_KEYWORDS);
  
  return keywords
    .map((kw) => (kw || '').toLowerCase().trim())
    .filter((kw) => kw && !stopWords.has(kw));
}

/**
 * Filters history results to only search engine queries
 * @param {Array} results - History results
 * @returns {Array} Filtered results
 */
function filterToSearchEngineQueries(results) {
  return results.filter((item) => {
    try {
      const url = new URL(item.url);
      const hostname = url.hostname.toLowerCase();
      
      // Check if it's a search engine domain
      const isSearchEngine = HISTORY.SEARCH_ENGINES.some((engine) =>
        hostname.endsWith(engine)
      );
      
      if (!isSearchEngine) {
        return false;
      }
      
      // Check if URL has query parameters
      return HISTORY.SEARCH_QUERY_PARAMS.some((param) =>
        url.searchParams.has(param)
      );
    } catch {
      return false;
    }
  });
}

/**
 * Filters history results by domain names
 * @param {Array} results - History results
 * @param {string[]} domains - Domain filters
 * @returns {Array} Filtered results
 */
function filterByDomains(results, domains) {
  if (!domains || domains.length === 0) {
    return results;
  }

  const normalizedDomains = domains
    .map((d) => normalizeDomain(d, DOMAIN_SHORTCUTS))
    .filter((d) => d && d.length >= DEFAULTS.MIN_DOMAIN_LENGTH)
    .filter((d) => !STOP_WORDS.DOMAIN_BLACKLIST.includes(d));

  if (normalizedDomains.length === 0) {
    return results;
  }

  return results.filter((item) => {
    try {
      const hostname = new URL(item.url).hostname.toLowerCase();
      return normalizedDomains.some((domain) => hostname.includes(domain));
    } catch {
      return false;
    }
  });
}

/**
 * Searches browser history with classification filters
 * @param {HistoryClassification} classification - Classification from classifyHistoryQuery
 * @returns {Promise<Array>} History items
 * @throws {PermissionError} If history permission is denied
 */
export async function searchHistory(classification) {
  log.info('Searching history with classification:', classification);

  // Ensure history permission
  const permissionResult = await ensurePermission(PERMISSIONS.HISTORY);
  
  if (!permissionResult.granted) {
    throw new PermissionError(
      getPermissionDeniedMessage(PERMISSIONS.HISTORY),
      PERMISSIONS.HISTORY
    );
  }

  // Compute time window
  const { startTime } = computeTimeWindow(
    classification.timeRange || HISTORY.DEFAULT_TIME_RANGE,
    classification.days,
    classification.exactDate
  );

  // Sanitize keywords
  const cleanKeywords = sanitizeKeywords(classification.keywords || []);
  const searchText = cleanKeywords.join(' ').trim();

  // Determine result limit
  const maxResults = clamp(
    classification.limit || HISTORY.DEFAULT_LIMIT,
    1,
    UI.MAX_HISTORY_LIMIT
  );

  log.debug('Search parameters:', { searchText, startTime, maxResults });

  // Search history with retry logic
  let results = await queryHistory(searchText, startTime, maxResults);

  // Fallback strategies if no results
  if (results.length === 0 && searchText) {
    log.debug('No results with keywords, retrying without keywords');
    results = await queryHistory('', startTime, maxResults);
  }

  if (results.length === 0 && startTime !== 0) {
    log.debug('No results in time window, trying all-time');
    results = await queryHistory(searchText, 0, maxResults);
    
    if (results.length === 0 && searchText) {
      results = await queryHistory('', 0, maxResults);
    }
  }

  // Apply filters
  if (classification.searchOnly) {
    const filtered = filterToSearchEngineQueries(results);
    if (filtered.length > 0) {
      results = filtered;
    }
  }

  if (classification.domains && classification.domains.length > 0) {
    const filtered = filterByDomains(results, classification.domains);
    if (filtered.length > 0) {
      results = filtered;
    }
  }

  log.info(`Found ${results.length} history items`);
  return results;
}

/**
 * Queries Chrome history API
 * @private
 * @param {string} text - Search text
 * @param {number} startTime - Start timestamp
 * @param {number} maxResults - Maximum results
 * @returns {Promise<Array>} History items
 */
async function queryHistory(text, startTime, maxResults) {
  try {
    return await chrome.history.search({
      text,
      startTime,
      maxResults,
    });
  } catch (error) {
    log.error('History search error:', error);
    throw new PermissionError(ERROR_MESSAGES.ERROR_ACCESSING_HISTORY, PERMISSIONS.HISTORY);
  }
}

/**
 * Extracts additional parameters from query text using regex
 * Supplements AI classification with regex-based extraction
 * @param {string} queryText - User's query
 * @returns {{limit: number|null, days: number|null}} Extracted parameters
 */
export function extractQueryParameters(queryText) {
  const params = { limit: null, days: null, exactDate: null };
  const q = String(queryText || '');

  // Parse days first to avoid conflicts like "last 5 days"
  const daysMatch = q.match(REGEX_PATTERNS.DAYS_PATTERN);
  if (daysMatch) params.days = parseInt(daysMatch[1], 10);

  // Try strict pattern (e.g., "show 20 results")
  const strictLimit = q.match(REGEX_PATTERNS.LIMIT_PATTERN);
  if (strictLimit) {
    params.limit = parseInt(strictLimit[2], 10);
  }

  // Flexible limit patterns for common phrasings in history context
  if (!params.limit) {
    const limitPatterns = [
      // show 5 [items]
      /\b(?:show|list|display)\s+(\d{1,3})(?:\s+(?:results?|items?|sites?|visits?|pages?|entries?|history))?\b/i,
      // show history 50
      /\b(?:show|list|display)\s+history\s+(\d{1,3})\b/i,
      // history 50
      /\bhistory\s+(\d{1,3})\b/i,
      // 50 history
      /\b(\d{1,3})\s+history\b/i,
      // last/top 5 (but not last 5 days/weeks/months)
      /\b(?:last|top)\s+(\d{1,3})(?!\s+(?:day|days|week|weeks|month|months))\b/i,
    ];

    for (const pattern of limitPatterns) {
      const m = q.match(pattern);
      if (m) {
        params.limit = parseInt(m[1], 10);
        break;
      }
    }
  }

  // Detect explicit date formats (YYYY-MM-DD, DD-MM-YYYY, or "24 September 2025")
  let year, month, day;
  const iso = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);      // 2025-09-24
  const dmy = q.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);      // 24-09-2025
  const long = q.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i); // 24 September 2025

  if (iso) {
    year = parseInt(iso[1], 10);
    month = parseInt(iso[2], 10);
    day = parseInt(iso[3], 10);
  } else if (dmy) {
    year = parseInt(dmy[3], 10);
    month = parseInt(dmy[2], 10);
    day = parseInt(dmy[1], 10);
  } else if (long) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    year = parseInt(long[3], 10);
    month = months.indexOf(long[2].toLowerCase()) + 1;
    day = parseInt(long[1], 10);
  }

  if (year && month && day) {
    const dt = new Date(year, month - 1, day);
    if (!isNaN(dt)) {
      params.exactDate = dt.getTime();
    }
  }
   
  return params;
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyHistoryQuery,
    computeTimeWindow,
    searchHistory,
    extractQueryParameters,
  };
}

