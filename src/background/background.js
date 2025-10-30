// ============================================================================
// BACKGROUND SERVICE WORKER - Extension Lifecycle Management
// ============================================================================
// FILE SUMMARY:
// Background service worker following coding standards for production quality.
// Handles extension lifecycle, side panel configuration, and tab management.
//
// FEATURES:
// - Structured logging
// - Proper error handling
// - Clear constants
// - Event listener organization
// ============================================================================

// Constants for event reasons
const INSTALL_REASONS = {
  INSTALL: 'install',
  UPDATE: 'update',
  CHROME_UPDATE: 'chrome_update',
};

const TAB_STATUS = {
  COMPLETE: 'complete',
  LOADING: 'loading',
};

// Simple logger for background context
const log = {
  info: (...args) => console.log('[Background:INFO]', ...args),
  warn: (...args) => console.warn('[Background:WARN]', ...args),
  error: (...args) => console.error('[Background:ERROR]', ...args),
  debug: (...args) => console.log('[Background:DEBUG]', ...args),
};

/**
 * Configures side panel to open on extension icon click
 */
function configureSidePanelBehavior() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) {
    log.warn('Side panel API not available');
    return;
  }

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .then(() => log.info('Side panel behavior configured'))
    .catch((error) => log.error('Failed to configure side panel:', error));
}

/**
 * Handles extension installation
 */
function handleInstall() {
  log.info('Extension installed successfully');
  log.info('✅ Browser AI is ready! Click the extension icon to get started.');
  configureSidePanelBehavior();
}

/**
 * Handles extension update
 * @param {string} previousVersion - Version before update
 */
function handleUpdate(previousVersion) {
  log.info(`Extension updated from version ${previousVersion || 'unknown'}`);
  configureSidePanelBehavior();
}

/**
 * Handles Chrome browser update
 */
function handleChromeUpdate() {
  log.debug('Chrome browser updated');
}

/**
 * Enables side panel for a specific tab
 * @param {number} tabId - Tab ID to enable panel for
 */
async function enableSidePanelForTab(tabId) {
  if (!chrome.sidePanel || !chrome.sidePanel.setOptions) {
    return;
  }

  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'src/sidepanel/sidepanel.html',
      enabled: true,
    });
    log.debug(`Side panel enabled for tab ${tabId}`);
  } catch (error) {
    // Silently ignore - likely a restricted page (chrome://, etc.)
    log.debug(`Could not enable side panel for tab ${tabId}`);
  }
}

/**
 * Handles tab update events
 * @param {number} tabId - Updated tab ID
 * @param {Object} changeInfo - Change information
 * @param {Object} tab - Full tab object
 */
function handleTabUpdate(tabId, changeInfo, tab) {
  // Only act when tab has finished loading
  if (changeInfo.status !== TAB_STATUS.COMPLETE) {
    return;
  }

  // Validate tab object
  if (!tab || !tab.url) {
    // Benign: updates can fire before URL is known or for internal pages
    log.debug(`Tab ${tabId} update without navigable URL`);
    return;
  }

  // Skip non-http(s) schemes (e.g., chrome://, chrome-extension://, about:blank)
  const url = String(tab.url || '');
  if (!/^https?:/i.test(url)) {
    log.debug(`Tab ${tabId} non-http(s) URL, skipping: ${url}`);
    return;
  }

  log.debug(`Tab ${tabId} loaded: ${tab.url}`);
  
  // Enable side panel for this tab
  enableSidePanelForTab(tabId);
}

// ============================================================================
// EVENT LISTENER REGISTRATION
// ============================================================================

/**
 * Handles extension installation and updates
 */
chrome.runtime.onInstalled.addListener((details) => {
  const { reason, previousVersion } = details;

  switch (reason) {
    case INSTALL_REASONS.INSTALL:
      handleInstall();
      break;
    case INSTALL_REASONS.UPDATE:
      handleUpdate(previousVersion);
      break;
    case INSTALL_REASONS.CHROME_UPDATE:
      handleChromeUpdate();
      break;
    default:
      log.warn(`Unknown install reason: ${reason}`);
  }
});

/**
 * Handles inter-component messaging
 * Currently no messages needed after tabbar removal
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log.debug('Message received:', request);
  // Future: Add message handlers here if needed
  return false; // Synchronous response
});

/**
 * Monitors tab updates to enable side panel
 */
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(handleTabUpdate);
  log.info('Tab update listener registered');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

log.info('Background service worker initialized');
log.debug('Chrome version:', navigator.userAgent);

