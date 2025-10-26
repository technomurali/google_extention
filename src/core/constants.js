// ============================================================================
// CONSTANTS - Application-wide Constants and Configuration Values
// ============================================================================
// FILE SUMMARY:
// Central location for all magic numbers, error messages, limits, and
// configuration values used throughout the application. This improves
// maintainability and makes it easy to adjust values in one place.
//
// ORGANIZATION:
// - UI Constants (dimensions, limits, ratios)
// - Time Windows (milliseconds, days)
// - API Limits (max results, retry counts)
// - Error Messages (user-facing text)
// - Search Configuration (domains, parameters)
// - Language Settings
// ============================================================================

/**
 * UI-related constants for layout and styling
 */
export const UI = {
  // Textarea sizing
  TEXTAREA_MIN_ROWS: 3,
  TEXTAREA_MAX_HEIGHT_RATIO: 0.4, // 40% of viewport height
  
  // Results display
  DEFAULT_HISTORY_LIMIT: 20,
  MAX_HISTORY_LIMIT: 100,
  MAX_BOOKMARKS_DISPLAY: 100,
  MAX_DOWNLOADS_DISPLAY: 100,
  
  // Icon sizes
  FAVICON_SIZE: 16,
  FAVICON_SIZE_2X: 32,
  
  // Drag handle
  DRAG_HANDLE_HEIGHT: 10,
  DRAG_HANDLE_OFFSET: -6,
};

/**
 * Time-related constants (all in milliseconds unless specified)
 */
export const TIME = {
  // Milliseconds per day
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  
  // Time window presets (in days)
  DAYS_TODAY: 0,
  DAYS_YESTERDAY: 1,
  DAYS_LAST_WEEK: 7,
  DAYS_LAST_MONTH: 30,
  
  // Debounce delays
  DEBOUNCE_INPUT: 100, // milliseconds
  DEBOUNCE_RESIZE: 50,
};

/**
 * AI/Language Model configuration
 */
export const AI = {
  // Supported output languages for Gemini Nano
  ALLOWED_LANGUAGES: ['en', 'es', 'ja'],
  
  // Default language
  DEFAULT_LANGUAGE: 'en',
  
  // Session states
  AVAILABILITY_READILY: 'readily',
  AVAILABILITY_AFTER_DOWNLOAD: 'after-download',
  AVAILABILITY_NO: 'no',
  AVAILABILITY_UNAVAILABLE: 'unavailable',
};

/**
 * History query classification intents and time ranges
 */
export const HISTORY = {
  // Intent types
  INTENT_HISTORY: 'history',
  INTENT_OTHER: 'other',
  
  // Time range presets
  TIME_RANGE_TODAY: 'today',
  TIME_RANGE_YESTERDAY: 'yesterday',
  TIME_RANGE_LAST_7: 'last7',
  TIME_RANGE_LAST_30: 'last30',
  TIME_RANGE_ALL: 'all',
  
  // Default values
  DEFAULT_TIME_RANGE: 'last7',
  DEFAULT_LIMIT: 20,
  
  // Search engine detection
  SEARCH_ENGINES: ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com'],
  SEARCH_QUERY_PARAMS: ['q', 'query', 'p', 'text'],
};

/**
 * Domain normalization mappings
 */
export const DOMAIN_SHORTCUTS = {
  'youtube': 'youtube.com',
  'github': 'github.com',
  'google': 'google.com',
  'stack overflow': 'stackoverflow.com',
  'stackoverflow': 'stackoverflow.com',
};

/**
 * Stop words for filtering (words that add noise to searches)
 */
export const STOP_WORDS = {
  // Keywords to exclude from history searches
  HISTORY_KEYWORDS: [
    'visited', 'visit', 'today', 'yesterday', 'last', 'week', 'weeks',
    'month', 'months', 'days', 'day', 'recent', 'show', 'history',
    'what', 'did', 'my', 'the', 'of', 'and', 'to', 'in', 'from',
    'about', 'on'
  ],
  
  // Domains to exclude from filter application
  DOMAIN_BLACKLIST: ['chrome', 'permission', 'prompt', 'history'],
};

/**
 * Tool types for the tool selector
 */
export const TOOLS = {
  CHAT: 'chat',
  HISTORY: 'history',
  BOOKMARKS: 'bookmarks',
  DOWNLOADS: 'downloads',
};

/**
 * Chrome Permissions
 */
export const PERMISSIONS = {
  HISTORY: 'history',
  BOOKMARKS: 'bookmarks',
  DOWNLOADS: 'downloads',
};

/**
 * User-facing error messages
 */
export const ERROR_MESSAGES = {
  // AI errors
  AI_UNAVAILABLE: 'AI unavailable. See requirements.',
  AI_CHECK_ERROR: 'AI check error',
  AI_UPDATE_CHROME: 'AI unavailable (update Chrome)',
  AI_SESSION_ERROR: 'Error creating AI session',
  
  // Permission errors
  PERMISSION_DENIED_HISTORY: 'Permission to read history was denied.',
  PERMISSION_DENIED_BOOKMARKS: 'Permission denied for bookmarks.',
  PERMISSION_DENIED_DOWNLOADS: 'Permission denied for downloads.',
  PERMISSION_STILL_DENIED: 'Still denied. You can enable it in chrome://extensions → Details → Permissions.',
  
  // Data errors
  NO_HISTORY_FOUND: 'No history found for your query.',
  NO_BOOKMARKS_FOUND: 'No bookmarks found.',
  NO_DOWNLOADS_FOUND: 'No downloads found.',
  
  // Generic errors
  UNKNOWN_ERROR: 'Unknown error occurred',
  ERROR_PREFIX: 'Error: ',
  ERROR_ACCESSING_HISTORY: 'Error accessing history',
  ERROR_READING_BOOKMARKS: 'Error reading bookmarks.',
  ERROR_READING_DOWNLOADS: 'Error reading downloads.',
};

/**
 * User-facing status messages
 */
export const STATUS_MESSAGES = {
  // Loading states
  SEARCHING_HISTORY: 'Searching your history…',
  LOADING_BOOKMARKS: 'Loading bookmarks…',
  LOADING_DOWNLOADS: 'Loading downloads…',
  PERMISSION_GRANTED_SEARCHING: 'Permission granted. Searching…',
  
  // Button labels
  GRANT_HISTORY_ACCESS: 'Grant history access',
  
  // Tool status display
  TOOL_PREFIX: 'Tool: ',
};

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  INPUT_HEIGHT: 'sp-input-height',
  SELECTED_TOOL: 'sp-selected-tool',
};

/**
 * CSS selectors and IDs
 */
export const SELECTORS = {
  // Main elements
  TITLE: 'sp-title',
  INPUT: 'sp-input',
  CONTENT: 'sp-content',
  RESIZE_HANDLE: 'sp-resize',
  STATUS: 'sp-status',
  SEND_BUTTON: 'sp-send',
  TOOLS_BUTTON: 'sp-tools',
  TOOLS_MENU: 'sp-tools-menu',
  
  // CSS classes
  CLASS_MSG: 'msg',
  CLASS_USER: 'user',
  CLASS_AI: 'ai',
  CLASS_HISTORY_LIST: 'history-list',
  CLASS_HISTORY_ITEM: 'history-item',
  CLASS_TITLE: 'title',
  CLASS_META: 'meta',
  CLASS_TOOL_ITEM: 'tool-item',
  CLASS_SEND_BTN: 'send-btn',
};

/**
 * Regular expression patterns
 */
export const REGEX_PATTERNS = {
  // Extract result limits: "show 50 items", "last 20 results"
  LIMIT_PATTERN: /\b(last|show)\s+(\d{1,3})\s+(?:\w+\s+)?(results|items|sites|visits|pages|entries)\b/i,
  
  // Extract day ranges: "last 10 days"
  DAYS_PATTERN: /\blast\s+(\d{1,3})\s+days?\b/i,
  
  // Quick history keyword detection
  HISTORY_KEYWORDS_PATTERN: /(history|visited|browsing|recent)/,
};

/**
 * Fallback/default values for various contexts
 */
export const DEFAULTS = {
  FAVICON_SVG: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%23999"/></svg>',
  GOOGLE_FAVICON_URL: 'https://www.google.com/s2/favicons?domain=',
  MIN_DOMAIN_LENGTH: 3,
};

/**
 * Browser-specific constants
 */
export const BROWSER = {
  // Media query for dark mode detection
  DARK_MODE_QUERY: '(prefers-color-scheme: dark)',
  
  // Theme values
  THEME_DARK: 'dark',
  THEME_LIGHT: 'light',
};

/**
 * Validation limits
 */
export const VALIDATION = {
  MAX_LIMIT_DIGITS: 3, // Maximum digits for result limits (999)
  MAX_DAYS_DIGITS: 3,  // Maximum digits for day ranges (999)
  MIN_KEYWORD_LENGTH: 1,
  MIN_DOMAIN_LENGTH: 3,
};

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UI,
    TIME,
    AI,
    HISTORY,
    DOMAIN_SHORTCUTS,
    STOP_WORDS,
    TOOLS,
    PERMISSIONS,
    ERROR_MESSAGES,
    STATUS_MESSAGES,
    STORAGE_KEYS,
    SELECTORS,
    REGEX_PATTERNS,
    DEFAULTS,
    BROWSER,
    VALIDATION,
  };
}

