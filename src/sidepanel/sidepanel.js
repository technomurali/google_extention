// ============================================================================
// SIDE PANEL MAIN - Application Entry Point and Orchestration
// ============================================================================
// FILE SUMMARY:
// Main entry point that coordinates all modules and handles user interactions.
// This refactored version follows all 20 coding standards for production quality.
//
// ARCHITECTURE:
// - Modular design with clear separation of concerns
// - Dependency injection for testability
// - Event-driven with proper cleanup
// - Error boundaries and graceful degradation
// - Accessibility compliant
// ============================================================================

import { TOOLS, ERROR_MESSAGES, STATUS_MESSAGES } from '../core/constants.js';
import { initializeAI, sendStreamingPrompt, sendPrompt, destroyAISession } from '../services/ai.js';
import { searchHistory, extractQueryParameters } from '../features/history/history.js';
import { searchBookmarks, convertBookmarksToResults } from '../features/bookmarks/bookmarks.js';
import { searchDownloads, convertDownloadsToResults } from '../features/downloads/downloads.js';
import { initThemeSync } from '../services/theme.js';
import {
  initializeElements,
  applyConfiguration,
  initializeTextareaHeight,
  setupTextareaResizing,
  setupToolsMenu,
  autoGrowTextarea,
  appendMessage,
  renderResults,
  updateStatus,
  getAndClearInput,
  getSelectedTool,
  enhanceAccessibility,
  cleanup as cleanupUI,
  getInputElement,
  getSendButton,
  scrollToBottom,
  hideOnboardingHelp,
  toggleSendStopButton,
} from '../ui/ui.js';
import { AIError, PermissionError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { formatErrorForUser } from '../core/errors.js';

const log = logger.create('SidePanel');

// Session-scoped context for History tool (persists within side panel session)
let lastHistoryContext = {
  exactDate: null,
  days: null,
};

// Generation state for chat streaming
let isGenerating = false;
let currentAbortController = null;
let manualStopFlag = false; // Fallback if AbortSignal isn't supported

/**
 * Handles history query requests
 * @param {string} queryText - Original query text
 * @param {Object} classification - Classification from AI
 */
async function handleHistoryRequest(queryText, classification) {
  const loadingMessage = appendMessage(STATUS_MESSAGES.SEARCHING_HISTORY, 'ai');

  try {
    // Merge regex-extracted parameters with classification
    const extractedParams = extractQueryParameters(queryText);
    const mergedClassification = {
      ...classification,
      limit: classification.limit || extractedParams.limit,
      // Use provided days/date; otherwise fall back to last context
      days: (classification.days ?? extractedParams.days ?? lastHistoryContext.days) || null,
      exactDate: (classification.exactDate ?? extractedParams.exactDate ?? lastHistoryContext.exactDate) || null,
    };

    // Update session context: exactDate takes precedence over days
    if (extractedParams.exactDate) {
      lastHistoryContext.exactDate = extractedParams.exactDate;
      lastHistoryContext.days = null;
    } else if (extractedParams.days) {
      lastHistoryContext.days = extractedParams.days;
      lastHistoryContext.exactDate = null;
    }

    const results = await searchHistory(mergedClassification);

    if (results.length === 0) {
      loadingMessage.textContent = ERROR_MESSAGES.NO_HISTORY_FOUND;
      return;
    }

    renderResults(results, loadingMessage);
  } catch (error) {
    log.error('History request failed:', error);

    if (error instanceof PermissionError) {
      loadingMessage.textContent = error.message;
      
      // Add button to retry permission request
      const retryButton = document.createElement('button');
      retryButton.className = 'send-btn';
      retryButton.textContent = STATUS_MESSAGES.GRANT_HISTORY_ACCESS;
      retryButton.onclick = async () => {
        loadingMessage.textContent = STATUS_MESSAGES.PERMISSION_GRANTED_SEARCHING;
        await handleHistoryRequest(queryText, classification);
      };
      
      loadingMessage.appendChild(document.createElement('br'));
      loadingMessage.appendChild(retryButton);
    } else {
      loadingMessage.textContent = formatErrorForUser(error, ERROR_MESSAGES.ERROR_ACCESSING_HISTORY);
    }
  }
}

/**
 * Handles bookmarks query requests
 * @param {string} queryText - Search query
 */
async function handleBookmarksRequest(queryText) {
  const loadingMessage = appendMessage(STATUS_MESSAGES.LOADING_BOOKMARKS, 'ai');

  try {
    const bookmarks = await searchBookmarks(queryText);

    if (bookmarks.length === 0) {
      loadingMessage.textContent = ERROR_MESSAGES.NO_BOOKMARKS_FOUND;
      return;
    }

    const results = convertBookmarksToResults(bookmarks);
    renderResults(results, loadingMessage);
  } catch (error) {
    log.error('Bookmarks request failed:', error);

    if (error instanceof PermissionError) {
      loadingMessage.textContent = error.message;
    } else {
      loadingMessage.textContent = formatErrorForUser(error, ERROR_MESSAGES.ERROR_READING_BOOKMARKS);
    }
  }
}

/**
 * Handles downloads query requests
 * @param {string} queryText - Search query
 */
async function handleDownloadsRequest(queryText) {
  const loadingMessage = appendMessage(STATUS_MESSAGES.LOADING_DOWNLOADS, 'ai');

  try {
    const downloads = await searchDownloads(queryText);

    if (downloads.length === 0) {
      loadingMessage.textContent = ERROR_MESSAGES.NO_DOWNLOADS_FOUND;
      return;
    }

    const results = convertDownloadsToResults(downloads);
    renderResults(results, loadingMessage);
  } catch (error) {
    log.error('Downloads request failed:', error);

    if (error instanceof PermissionError) {
      loadingMessage.textContent = error.message;
    } else {
      loadingMessage.textContent = formatErrorForUser(error, ERROR_MESSAGES.ERROR_READING_DOWNLOADS);
    }
  }
}

/**
 * Handles general AI chat requests
 * @param {string} queryText - User's message
 */
async function handleChatRequest(queryText) {
  // This function is kept for non-controlled routes; the controlled flow is in sendMessage
  try {
    const stream = await sendStreamingPrompt(queryText);
    const aiMessageElement = appendMessage('', 'ai');
    for await (const chunk of stream) {
      aiMessageElement.textContent += chunk;
      scrollToBottom();
    }
  } catch (err) {
    try {
      const response = await sendPrompt(queryText);
      appendMessage(response, 'ai');
    } catch (promptError) {
      const errorMsg = formatErrorForUser(promptError, ERROR_MESSAGES.AI_UNAVAILABLE);
      appendMessage(errorMsg, 'ai');
    }
  }
}

/**
 * Routes message to appropriate handler based on selected tool and classification
 * @param {string} queryText - User's message
 */
async function routeMessage(queryText) {
  const selectedTool = getSelectedTool();

  log.info('Routing message:', { tool: selectedTool, query: queryText });

  // Explicit tool selection takes precedence
  switch (selectedTool) {
    case TOOLS.HISTORY:
      await handleHistoryRequest(queryText, { intent: 'history' });
      return;

    case TOOLS.BOOKMARKS:
      await handleBookmarksRequest(queryText);
      return;

    case TOOLS.DOWNLOADS:
      await handleDownloadsRequest(queryText);
      return;

    case TOOLS.CHAT:
    default:
      // Always treat as general chat when Chat tool is selected
      await handleChatRequest(queryText);
      return;
  }
}

/**
 * Main message send handler
 * Coordinates input retrieval, routing, and error handling
 */
async function sendMessage() {
  const queryText = getAndClearInput();

  if (!queryText) {
    log.debug('Empty message, ignoring');
    return;
  }

  // Hide onboarding help after first user message
  hideOnboardingHelp();

  // Display user message
  appendMessage(queryText, 'user');

  // If not chat tool, route as usual
  const tool = getSelectedTool();
  if (tool !== TOOLS.CHAT) {
    try {
      await routeMessage(queryText);
    } catch (error) {
      log.error('Message routing error:', error);
      const errorMessage = formatErrorForUser(error, 'An error occurred processing your request');
      appendMessage(errorMessage, 'ai');
    }
    return;
  }

  // Controlled chat flow with cancel support
  const inputElement = getInputElement();
  const aiMessageElement = appendMessage('', 'ai');

  isGenerating = true;
  manualStopFlag = false;
  currentAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  toggleSendStopButton(true);
  if (inputElement) inputElement.disabled = true;

  try {
    // Try streaming with AbortSignal when available
    const options = currentAbortController ? { signal: currentAbortController.signal } : {};
    const stream = await sendStreamingPrompt(queryText, options);

    for await (const chunk of stream) {
      if (manualStopFlag) break;
      aiMessageElement.textContent += chunk;
      scrollToBottom();
    }
  } catch (streamError) {
    // If aborted, do not treat as error
    const aborted = (currentAbortController && currentAbortController.signal && currentAbortController.signal.aborted) || manualStopFlag;
    if (!aborted) {
      log.warn('Streaming failed, trying non-streaming:', streamError);
      try {
        const response = await sendPrompt(queryText);
        aiMessageElement.textContent = response;
      } catch (promptError) {
        log.error('Chat request failed:', promptError);
        const errorMsg = formatErrorForUser(promptError, ERROR_MESSAGES.AI_UNAVAILABLE);
        aiMessageElement.textContent = errorMsg;
      }
    }
  } finally {
    isGenerating = false;
    toggleSendStopButton(false);
    if (inputElement) inputElement.disabled = false;
    currentAbortController = null;
    manualStopFlag = false;
  }
}

/**
 * Binds event listeners for user interactions
 */
function bindEventListeners() {
  const inputElement = getInputElement();
  const sendButton = getSendButton();

  if (!inputElement || !sendButton) {
    throw new Error('Required UI elements not found');
  }

  // Auto-grow on input
  inputElement.addEventListener('input', autoGrowTextarea);

  // Send on Enter (Shift+Enter for new line). Block while generating
  inputElement.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isGenerating) {
        await sendMessage();
      }
    }
  });

  // Send/Stop button click
  sendButton.addEventListener('click', async () => {
    if (isGenerating) {
      // Stop generation
      try {
        if (currentAbortController) currentAbortController.abort();
        manualStopFlag = true;
      } catch {}
    } else {
      await sendMessage();
    }
  });


  // Cleanup on window unload
  window.addEventListener('beforeunload', () => {
    destroyAISession();
    cleanupUI();
    log.info('Side panel cleanup completed');
  });

  log.info('Event listeners bound');
}

/**
 * Initializes the entire side panel application
 * Entry point called when script loads
 */
async function initializeSidePanel() {
  try {
    log.info('Initializing side panel');

    // Initialize all subsystems
    initializeAI();
    initThemeSync();
    initializeElements();
    applyConfiguration();
    enhanceAccessibility();
    
    // Setup UI components
    initializeTextareaHeight();
    setupTextareaResizing();
    setupToolsMenu();
    autoGrowTextarea();

    // Bind event listeners
    bindEventListeners();

    log.info('Side panel initialization complete');
  } catch (error) {
    log.error('Fatal error during initialization:', error);
    
    // Try to display error to user
    try {
      updateStatus('Initialization failed');
    } catch {
      // If even that fails, log to console as last resort
      console.error('Side panel failed to initialize:', error);
    }
  }
}

// Auto-initialize when script loads (IIFE alternative)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSidePanel);
} else {
  initializeSidePanel();
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeSidePanel,
    sendMessage,
    routeMessage,
  };
}

