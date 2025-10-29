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
import { captureActivePage, chunkContent, pageState, setPageState, clearPageState, selectChunkById } from '../features/page-content/page-content.js';
import { initializeAI, sendStreamingPrompt, sendPrompt, destroyAISession } from '../services/ai.js';
import { searchHistory, extractQueryParameters } from '../features/history/history.js';
import { searchBookmarks, convertBookmarksToResults } from '../features/bookmarks/bookmarks.js';
import { searchDownloads, convertDownloadsToResults } from '../features/downloads/downloads.js';
import { initThemeSync } from '../services/theme.js';
import {
  initializeSpeech,
  isSpeechAvailable,
  getVoices,
  getSettings,
  updateSettings,
  isSpeaking,
  toggle as toggleSpeech,
  stop as stopSpeech,
  cleanup as cleanupSpeech,
} from '../services/speech.js';
import {
  initializeElements,
  applyConfiguration,
  initializeTextareaHeight,
  setupTextareaResizing,
  setupToolsMenu,
  setupToolMentions,
  autoGrowTextarea,
  appendMessage,
  renderResults,
  updateStatus,
  getAndClearInput,
  parseLeadingToolMention,
  getSelectedTool,
  setSelectedTool,
  enhanceAccessibility,
  cleanup as cleanupUI,
  getInputElement,
  getSendButton,
  scrollToBottom,
  hideOnboardingHelp,
  toggleSendStopButton,
  getSelectedContexts,
  clearSelectedContextsAfterSend,
  // New UI helpers for @Page
  renderChunkSelectionBubble,
  showPagePill,
  clearPagePill,
} from '../ui/ui.js';
import { AIError, PermissionError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { formatErrorForUser } from '../core/errors.js';
import { handleChromePadRequest, handleChromePadSelected } from '../features/chromepad/chromepad.js';

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

    case TOOLS.PAGE:
      await handlePageRequest(queryText);
      return;

    case TOOLS.CHROMEPAD:
      await handleChromePadRequest(queryText);
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
  let userInput = getAndClearInput();

  if (!userInput) {
    log.debug('Empty message, ignoring');
    return;
  }

  // Stop any active speech before sending new message
  const config = window.CONFIG?.speech;
  if (config && config.autoStopOnNewMessage) {
    stopSpeech();
  }

  // Parse leading @tool mention and set tool accordingly
  try {
    const cfgTM = window.CONFIG?.toolMentions || {};
    if (cfgTM.enabled !== false) {
      const parsed = parseLeadingToolMention(userInput);
      if (parsed && parsed.toolId) {
        setSelectedTool(parsed.toolId);
        userInput = parsed.stripped || '';
      }
    }
  } catch {}

  // Build final prompt with labeled contexts
  const cfg = window.CONFIG?.contextSelection || {};
  const labelPrefix = String(cfg.contextLabelPrefix || 'Context');
  const contexts = getSelectedContexts();
  const labeled = contexts.map((c, idx) => `${labelPrefix} ${idx + 1}: "${c.text}"`);
  const header = labeled.length ? labeled.join('\n---\n') + '\n\n' : '';
  const finalPrompt = `${header}User: ${userInput}`;

  // Hide onboarding help after first user message
  hideOnboardingHelp();

  // Display user message
  appendMessage(userInput, 'user');

  // If not chat tool, route as usual
  const tool = getSelectedTool();
  if (tool !== TOOLS.CHAT) {
    try {
      // For @Page, if a chunk is selected, wrap prompt and send as chat; otherwise trigger capture flow
      if (tool === TOOLS.PAGE) {
        if (pageState.selectedChunkId) {
          const cfg = window.CONFIG?.pageContent || {};
          const chunk = (pageState.chunks || []).find(c => c.id === pageState.selectedChunkId);
          if (chunk) {
            const templ = String(cfg.contextPromptTemplate || '').trim();
            const wrapped = templ
              .replace('{title}', String(pageState.title || ''))
              .replace('{url}', String(pageState.url || ''))
              .replace('{heading}', String(chunk.heading || ''))
              .replace('{index}', String(chunk.index || ''))
              .replace('{total}', String((pageState.chunks || []).length))
              .replace('{content}', String(chunk.content || ''))
              .replace('{question}', String(userInput || ''));
            await handleChatRequest(wrapped);
          } else {
            await handlePageRequest(finalPrompt);
          }
        } else {
          await handlePageRequest(finalPrompt);
        }
      } else {
        await routeMessage(finalPrompt);
      }
    } catch (error) {
      log.error('Message routing error:', error);
      const errorMessage = formatErrorForUser(error, 'An error occurred processing your request');
      appendMessage(errorMessage, 'ai');
    } finally {
      clearSelectedContextsAfterSend();
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
    const options = currentAbortController ? { signal: currentAbortController.signal } : {};
    const stream = await sendStreamingPrompt(finalPrompt, options);

    for await (const chunk of stream) {
      if (manualStopFlag) break;
      aiMessageElement.textContent += chunk;
      scrollToBottom();
    }
  } catch (streamError) {
    const aborted = (currentAbortController && currentAbortController.signal && currentAbortController.signal.aborted) || manualStopFlag;
    if (!aborted) {
      log.warn('Streaming failed, trying non-streaming:', streamError);
      try {
        const response = await sendPrompt(finalPrompt);
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
    clearSelectedContextsAfterSend();
  }
}

/**
 * Handles @Page tool flow: capture, chunk, render selection, and set selected chunk
 */
async function handlePageRequest(_queryText) {
  const cfg = window.CONFIG?.pageContent || {};

  // 1) Announce capturing
  const aiMsg = appendMessage(cfg.capturingMessage || 'Capturing page content...', 'ai');

  try {
    const payload = await captureActivePage();
    if (!payload || !payload.text || !payload.text.trim()) {
      aiMsg.textContent = cfg.errorNoContent || 'No text content found on this page.';
      return;
    }

    // 2) Chunk
    const chunks = chunkContent(payload, {
      maxChunkChars: Number(cfg.maxChunkChars) || 12000,
      overlapChars: Number(cfg.overlapChars) || 500,
      minChunkChars: Number(cfg.minChunkChars) || 1000,
    });

    if (!chunks || chunks.length === 0) {
      aiMsg.textContent = cfg.errorNoContent || 'No text content found on this page.';
      return;
    }

    // 3) Save state
    setPageState({
      title: payload.title || '',
      url: payload.url || '',
      favicon: '',
      chunks,
      selectedChunkId: null,
      timestamp: Date.now(),
    });

    // 4) Render selection list in a new AI bubble
    renderChunkSelectionBubble({ title: pageState.title, url: pageState.url }, chunks, async (chunkId) => {
      selectChunkById(chunkId);
      const chosen = pageState.chunks.find(c => c.id === chunkId);
      if (chosen) {
        // Confirm selection in AI bubble
        const confirmMsg = appendMessage('', 'ai');
        const txt = String(cfg.chunkSelectedTemplate || 'Chunk {index} selected: "{heading}"')
          .replace('{index}', String(chosen.index))
          .replace('{heading}', String(chosen.heading));
        confirmMsg.textContent = `${txt}\n${cfg.chunkInstructions || ''}`.trim();

        // Show pill with page icon and heading
        const label = `${cfg.icon || '📃'} ${chosen.heading} - ${pageState.title}`;
        showPagePill(label, () => {
          // Clear state when pill removed
          clearPageState();
          clearPagePill();
        });
      }
    });

  } catch (err) {
    log.error('Page capture failed:', err);
    aiMsg.textContent = cfg.errorCapture || 'Failed to capture page content. Please try again.';
  }
}

/**
 * Sets up speech settings modal
 */
function setupSpeechSettings() {
  const settingsBtn = document.getElementById('sp-settings-btn');
  const modal = document.getElementById('sp-speech-settings');
  const closeBtn = document.getElementById('sp-speech-close');
  const voiceMenu = document.getElementById('sp-voice-menu');
  const voiceToggle = document.getElementById('sp-voice-toggle');
  const speedSlider = document.getElementById('sp-speed-slider');
  const speedValue = document.getElementById('sp-speed-value');
  const pitchSlider = document.getElementById('sp-pitch-slider');
  const pitchValue = document.getElementById('sp-pitch-value');
  const volumeSlider = document.getElementById('sp-volume-slider');
  const volumeValue = document.getElementById('sp-volume-value');
  const testBtn = document.getElementById('sp-test-voice');

  if (!settingsBtn || !modal) return;

  // Load and populate voices
  async function loadVoices() {
    try {
      const voices = await getVoices();
      const settings = getSettings();
      const config = window.CONFIG?.speech || {};

      if (voiceMenu && voiceToggle) {
        if (!voices || voices.length === 0) {
          voiceToggle.textContent = (config.labels?.noVoices || 'No voices available');
          voiceMenu.innerHTML = '';
          return;
        }
        voiceMenu.innerHTML = '';
        const frag = document.createDocumentFragment();
        voices.forEach((voice) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'item';
          const langInfo = config.showVoiceLanguage ? ` (${voice.lang})` : '';
          btn.textContent = `${voice.name}${langInfo}`;
          btn.dataset.voiceName = voice.name;
          btn.addEventListener('click', async () => {
            await updateSettings({ voice });
            voiceToggle.textContent = `${voice.name}${langInfo}`;
            // Close and if currently speaking, restart with new voice
            const menuEl = document.getElementById('sp-voice-menu');
            if (menuEl) menuEl.style.display = 'none';
            if (isSpeaking && isSpeaking()) {
              stopSpeech();
              // Optionally: auto-restart last AI bubble if desired (skipped per spec)
            }
          }, { once: true });
          frag.appendChild(btn);
        });
        voiceMenu.appendChild(frag);
        // Set toggle label
        if (settings.voice) {
          const v = voices.find(v => v.name === settings.voice.name) || settings.voice;
          voiceToggle.textContent = `${v.name}${config.showVoiceLanguage ? ` (${v.lang})` : ''}`;
        } else {
          const v0 = voices[0];
          voiceToggle.textContent = `${v0.name}${config.showVoiceLanguage ? ` (${v0.lang})` : ''}`;
        }
      }
    } catch (error) {
      log.error('Failed to load voices:', error);
    }
  }

  // Load current settings
  function loadCurrentSettings() {
    const settings = getSettings();
    
    if (speedSlider) speedSlider.value = settings.rate;
    if (speedValue) speedValue.textContent = `${settings.rate.toFixed(1)}×`;
    
    if (pitchSlider) pitchSlider.value = settings.pitch;
    if (pitchValue) pitchValue.textContent = settings.pitch.toFixed(1);
    
    if (volumeSlider) volumeSlider.value = settings.volume;
    if (volumeValue) volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
  }

  // Open modal
  settingsBtn?.addEventListener('click', async () => {
    await loadVoices();
    loadCurrentSettings();
    if (modal) modal.style.display = 'flex';
  });

  // Close modal
  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Voice selection
  // Toggle voice menu open/close
  voiceToggle?.addEventListener('click', () => {
    if (!voiceMenu) return;
    const isOpen = voiceMenu.style.display === 'block';
    voiceMenu.style.display = isOpen ? 'none' : 'block';
  });

  // Close when clicking outside panel
  document.addEventListener('click', (ev) => {
    if (!voiceMenu || !voiceToggle) return;
    const target = ev.target;
    const holder = document.getElementById('sp-voice');
    if (holder && !holder.contains(target)) {
      voiceMenu.style.display = 'none';
    }
  });

  // Speed control
  speedSlider?.addEventListener('input', async () => {
    const rate = parseFloat(speedSlider.value);
    if (speedValue) speedValue.textContent = `${rate.toFixed(1)}×`;
    await updateSettings({ rate });
  });

  // Pitch control
  pitchSlider?.addEventListener('input', async () => {
    const pitch = parseFloat(pitchSlider.value);
    if (pitchValue) pitchValue.textContent = pitch.toFixed(1);
    await updateSettings({ pitch });
  });

  // Volume control
  volumeSlider?.addEventListener('input', async () => {
    const volume = parseFloat(volumeSlider.value);
    if (volumeValue) volumeValue.textContent = `${Math.round(volume * 100)}%`;
    await updateSettings({ volume });
  });

  // Test button
  testBtn?.addEventListener('click', () => {
    const config = window.CONFIG?.speech || {};
    const isNowSpeaking = isSpeaking && isSpeaking();
    if (isNowSpeaking) {
      stopSpeech();
      testBtn.textContent = config.labels?.testButton || 'Test Voice';
      return;
    }

    const testText = 'Hello! This is a test of the text to speech feature.';
    const tempDiv = document.createElement('div');
    tempDiv.textContent = testText;
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);

    const tempBtn = document.createElement('button');
    tempBtn.innerHTML = '🔊';
    document.body.appendChild(tempBtn);

    // Start speaking and toggle label to Stop
    testBtn.textContent = config.labels?.stop || 'Stop';
    toggleSpeech(tempDiv, tempBtn);

    // Poll speaking state to revert label when finished
    const poll = setInterval(() => {
      if (!isSpeaking || !isSpeaking()) {
        clearInterval(poll);
        testBtn.textContent = config.labels?.testButton || 'Test Voice';
        tempDiv.remove();
        tempBtn.remove();
      }
    }, 250);
  });

  log.info('Speech settings initialized');
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

  // Speech toggle event handler (from AI message bubbles)
  document.addEventListener('speech-toggle', (event) => {
    const { element, button } = event.detail;
    if (element && button) {
      toggleSpeech(element, button);
    }
  });

  // Speech stop event handler (from AI message bubbles)
  document.addEventListener('speech-stop', () => {
    stopSpeech();
  });

  // Stop speech when new message is sent (if configured)
  const originalSendMessage = sendMessage;
  window.addEventListener('beforeSendMessage', () => {
    const config = window.CONFIG?.speech;
    if (config && config.autoStopOnNewMessage) {
      stopSpeech();
    }
  });

  // Cleanup on window unload
  window.addEventListener('beforeunload', () => {
    destroyAISession();
    cleanupUI();
    cleanupSpeech();
    log.info('Side panel cleanup completed');
  });

  // Start @Page capture immediately when selected (Option A)
  document.addEventListener('tool-selected', (ev) => {
    try {
      const tool = ev && ev.detail && ev.detail.tool;
      if (tool === TOOLS.PAGE) {
        handlePageRequest('');
      } else if (tool === TOOLS.CHROMEPAD) {
        handleChromePadSelected();
      }
    } catch {}
  });

  // Clear page context when tab changes (per config)
  try {
    const cfg = window.CONFIG?.pageContent || {};
    if (cfg.clearOnTabSwitch && chrome && chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        clearPageState();
        try { clearPagePill(); } catch {}
        const msg = String(cfg.clearedOnTabSwitchMessage || 'Page context cleared (tab switched).');
        appendMessage(msg, 'ai');
      });
    }
  } catch {}

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
    
    // Initialize speech service
    const speechAvailable = await initializeSpeech();
    if (speechAvailable) {
      log.info('Speech synthesis available');
    } else {
      log.warn('Speech synthesis not available');
    }
    
    // Setup UI components
    initializeTextareaHeight();
    setupTextareaResizing();
    setupToolsMenu();
    setupToolMentions();
    setupSpeechSettings();
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

