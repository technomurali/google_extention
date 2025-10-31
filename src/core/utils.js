// ============================================================================
// UTILITY FUNCTIONS - Reusable Helper Functions
// ============================================================================
// FILE SUMMARY:
// Collection of pure, reusable utility functions that don't depend on
// application state. These functions improve code reuse and testability.
//
// CATEGORIES:
// - Validation functions
// - Formatting functions
// - DOM utilities
// - Async utilities
// - URL/Domain utilities
// ============================================================================

/**
 * Validates if a value is a non-empty string
 * @param {*} value - Value to validate
 * @returns {boolean} True if value is a non-empty string
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates if a value is a valid URL
 * @param {string} urlString - URL string to validate
 * @returns {boolean} True if valid URL
 */
export function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Safely extracts domain from URL string
 * @param {string} urlString - URL to extract domain from
 * @returns {string|null} Domain name or null if invalid
 */
export function extractDomain(urlString) {
  try {
    return new URL(urlString).hostname;
  } catch {
    return null;
  }
}

/**
 * Normalizes domain name (handles shortcuts and common variations)
 * @param {string} domain - Domain to normalize
 * @param {Object} shortcuts - Domain shortcut mappings
 * @returns {string} Normalized domain name
 */
export function normalizeDomain(domain, shortcuts = {}) {
  if (!domain) return '';
  
  const normalized = domain.toLowerCase().trim();
  return shortcuts[normalized] || normalized;
}

/**
 * Clamps a number between min and max values
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Creates a safe error message from an error object
 * @param {Error|unknown} error - Error to extract message from
 * @param {string} fallback - Fallback message if extraction fails
 * @returns {string} Error message
 */
export function getErrorMessage(error, fallback = 'Unknown error') {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return fallback;
}

/**
 * Checks if an element exists in the DOM
 * @param {string} selector - CSS selector or element ID
 * @returns {boolean} True if element exists
 */
export function elementExists(selector) {
  return document.getElementById(selector) !== null ||
         document.querySelector(selector) !== null;
}

/**
 * Safely gets element by ID with null check
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null
 */
export function getElementByIdSafe(id) {
  return document.getElementById(id);
}

/**
 * Formats a timestamp to localized string
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Formatted date/time string
 */
export function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'Invalid date';
  }
}

/**
 * Truncates text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Removes duplicate items from array
 * @param {Array} array - Array to deduplicate
 * @returns {Array} Array with unique items
 */
export function unique(array) {
  return [...new Set(array)];
}

/**
 * Checks if user's system prefers dark mode
 * @returns {boolean} True if dark mode is preferred
 */
export function prefersDarkMode() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Creates a default/fallback favicon data URL
 * @returns {string} Data URL for default favicon
 */
export function getDefaultFavicon() {
  return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%23999"/></svg>';
}

/**
 * Gets Google's favicon URL for a domain
 * @param {string} domain - Domain name
 * @param {number} size - Icon size (default: 32)
 * @returns {string} Favicon URL
 */
export function getGoogleFaviconUrl(domain, size = 32) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Validates that a classification object has required properties
 * @param {Object} classification - Classification object to validate
 * @returns {boolean} True if valid
 */
export function isValidClassification(classification) {
  return (
    classification &&
    typeof classification === 'object' &&
    'intent' in classification
  );
}

/**
 * Safely parses JSON with fallback
 * @param {string} jsonString - JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed object or fallback
 */
export function safeJsonParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

/**
 * Waits for a specified number of milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>} Promise that resolves after delay
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 * @returns {Promise<*>} Result of function
 * @throws {Error} If all retries fail
 */
export async function retry(fn, maxRetries = 3, baseDelay = 100) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelay * Math.pow(2, attempt));
      }
    }
  }
  
  throw lastError;
}

/**
 * Splits large text into chunks with optional overlap, attempting to break at
 * paragraph, sentence, or word boundaries for better readability.
 *
 * @param {string} text - Text to split into chunks
 * @param {Object} options - Chunking options
 * @param {number} options.maxChunkChars - Target maximum characters per chunk
 * @param {number} options.overlapChars - Overlap characters between chunks
 * @param {number} options.minChunkChars - Minimum size before considering a boundary
 * @returns {Array<{ id: string, index: number, content: string, size: number }>} chunks
 */
export function chunkText(text, options = {}) {
  const src = String(text || '');
  const maxChunkChars = Number(options.maxChunkChars) || 4000;
  const overlapChars = Math.max(0, Number(options.overlapChars) || 0);
  const minChunkChars = Math.max(0, Number(options.minChunkChars) || Math.min(500, Math.floor(maxChunkChars / 8)));

  if (src.length <= maxChunkChars) {
    return [{ id: 'chunk-0', index: 1, content: src, size: src.length }];
  }

  const chunks = [];
  let currentIndex = 0;
  let chunkNumber = 1;

  while (currentIndex < src.length) {
    const hardEnd = Math.min(currentIndex + maxChunkChars, src.length);
    let end = hardEnd;

    if (hardEnd < src.length) {
      const windowText = src.substring(currentIndex, hardEnd);

      // Prefer paragraph breaks
      let candidate = windowText.lastIndexOf('\n\n');
      if (candidate > minChunkChars) {
        end = currentIndex + candidate + 2; // include the break
      } else {
        // Sentence boundaries
        const lastPeriod = windowText.lastIndexOf('. ');
        const lastExclam = windowText.lastIndexOf('! ');
        const lastQuest = windowText.lastIndexOf('? ');
        candidate = Math.max(lastPeriod, lastExclam, lastQuest);
        if (candidate > minChunkChars) {
          end = currentIndex + candidate + 2;
        } else {
          // Word boundary
          const lastSpace = windowText.lastIndexOf(' ');
          if (lastSpace > minChunkChars) {
            end = currentIndex + lastSpace + 1;
          }
        }
      }
    }

    const content = src.substring(currentIndex, end).trim();
    chunks.push({ id: `chunk-${chunkNumber - 1}`, index: chunkNumber, content, size: content.length });

    if (end >= src.length) {
      break;
    }
    currentIndex = Math.max(0, end - overlapChars);
    chunkNumber += 1;
  }

  return chunks;
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isNonEmptyString,
    isValidUrl,
    extractDomain,
    normalizeDomain,
    clamp,
    debounce,
    getErrorMessage,
    elementExists,
    getElementByIdSafe,
    formatTimestamp,
    truncate,
    unique,
    prefersDarkMode,
    getDefaultFavicon,
    getGoogleFaviconUrl,
    isValidClassification,
    safeJsonParse,
    sleep,
    retry,
    chunkText,
  };
}

