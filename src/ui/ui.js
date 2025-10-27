// ============================================================================
// UI MANAGER - DOM Manipulation and User Interface Logic
// ============================================================================
// FILE SUMMARY:
// Handles all UI-related operations including DOM manipulation, message rendering,
// input handling, tool selection, and accessibility features.
//
// FEATURES:
// - Message bubble rendering
// - History/bookmarks/downloads result rendering with favicons
// - Textarea auto-resizing and manual resizing
// - Tool selector dropdown menu
// - Keyboard navigation and accessibility
// - Event listener management with AbortController
// ============================================================================

import {
  SELECTORS,
  UI,
  STATUS_MESSAGES,
  ERROR_MESSAGES,
  TOOLS,
  STORAGE_KEYS,
  DEFAULTS,
} from '../core/constants.js';
import { UIError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import {
  getElementByIdSafe,
  isValidUrl,
  extractDomain,
  getGoogleFaviconUrl,
  getDefaultFavicon,
  formatTimestamp,
  clamp,
  debounce,
} from '../core/utils.js';

const log = logger.ui;

/**
 * DOM element cache for performance
 */
const elements = {};

/**
 * AbortController for event listener cleanup
 */
let abortController = new AbortController();

/**
 * Current selected tool
 */
let selectedTool = TOOLS.CHAT;

/**
 * Minimum input height (calculated from font metrics)
 */
let minInputHeight = 0;

/**
 * Onboarding help element reference
 */
let onboardingEl = null;

/**
 * Initializes and caches all DOM element references
 * @throws {UIError} If critical elements are missing
 */
export function initializeElements() {
  log.info('Initializing UI elements');

  elements.title = getElementByIdSafe(SELECTORS.TITLE);
  elements.input = getElementByIdSafe(SELECTORS.INPUT);
  elements.content = getElementByIdSafe(SELECTORS.CONTENT);
  elements.resizeHandle = getElementByIdSafe(SELECTORS.RESIZE_HANDLE);
  elements.status = getElementByIdSafe(SELECTORS.STATUS);
  elements.sendButton = getElementByIdSafe(SELECTORS.SEND_BUTTON);
  elements.toolsButton = getElementByIdSafe(SELECTORS.TOOLS_BUTTON);
  elements.toolsMenu = getElementByIdSafe(SELECTORS.TOOLS_MENU);

  // Verify critical elements exist
  if (!elements.input || !elements.content || !elements.sendButton) {
    throw new UIError('Critical UI elements are missing from DOM');
  }

  log.info('UI elements initialized successfully');
}

/**
 * Applies configuration to UI elements (titles, placeholders, etc.)
 */
export function applyConfiguration() {
  // Access CONFIG from window global since it's loaded via script tag
  const config = window.CONFIG || {};
  const labels = config.labels || {};
  const spacing = config.spacing || {};
  const onboarding = config.onboarding || {};

  if (elements.title && labels.title) {
    elements.title.textContent = labels.title;
  }

  if (elements.input && labels.searchPlaceholder) {
    elements.input.placeholder = labels.searchPlaceholder;
  }

  // Apply spacing from config
  if (Object.keys(spacing).length > 0) {
    const root = document.documentElement;
    root.style.setProperty('--tab-bar-header-padding', spacing.headerPadding || '12px 12px');
    root.style.setProperty('--tab-bar-content-padding', spacing.contentPadding || '10px 12px');
  }

  // Render onboarding help if enabled
  if (onboarding.enabled) {
    showOnboardingHelp(onboarding);
  }

  log.debug('Configuration applied to UI');
}

/**
 * Initializes textarea height management
 */
export function initializeTextareaHeight() {
  if (!elements.input) {
    return;
  }

  // Calculate baseline minimum height
  const computedStyle = window.getComputedStyle(elements.input);
  const lineHeight = parseFloat(computedStyle.lineHeight) || 18;
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const defaultMinHeight = lineHeight * UI.TEXTAREA_MIN_ROWS + paddingTop + paddingBottom;

  minInputHeight = defaultMinHeight;

  // Load saved height from localStorage
  const savedHeight = localStorage.getItem(STORAGE_KEYS.INPUT_HEIGHT);
  const savedHeightPx = savedHeight ? parseFloat(savedHeight) : 0;

  // Apply heights
  elements.input.style.minHeight = `${minInputHeight}px`;
  elements.input.style.height = `${savedHeightPx || minInputHeight}px`;

  // Save starting height if not already saved
  if (!savedHeightPx) {
    localStorage.setItem(STORAGE_KEYS.INPUT_HEIGHT, elements.input.style.height);
  }

  log.debug('Textarea height initialized:', { minInputHeight, savedHeightPx });
}

/**
 * Auto-grows textarea to fit content
 * Debounced for performance
 */
export const autoGrowTextarea = debounce(() => {
  if (!elements.input) {
    return;
  }

  // Reset to auto to measure content height
  elements.input.style.height = 'auto';

  const contentHeight = elements.input.scrollHeight;
  const maxHeight = window.innerHeight * UI.TEXTAREA_MAX_HEIGHT_RATIO;

  const newHeight = clamp(contentHeight, minInputHeight, maxHeight);

  elements.input.style.height = `${newHeight}px`;
  localStorage.setItem(STORAGE_KEYS.INPUT_HEIGHT, elements.input.style.height);
}, 50); // 50ms debounce

/**
 * Sets up manual textarea resizing with drag handle
 */
export function setupTextareaResizing() {
  if (!elements.resizeHandle || !elements.input) {
    return;
  }

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  const handleMouseDown = (event) => {
    event.preventDefault();
    isDragging = true;
    startY = event.clientY;
    startHeight = parseInt(window.getComputedStyle(elements.input).height, 10) || elements.input.clientHeight;
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (event) => {
    if (!isDragging) {
      return;
    }

    // Dragging up (negative delta) increases height
    const deltaY = startY - event.clientY;
    const maxHeight = window.innerHeight * UI.TEXTAREA_MAX_HEIGHT_RATIO;
    const newHeight = clamp(startHeight + deltaY, minInputHeight, maxHeight);

    elements.input.style.height = `${newHeight}px`;
  };

  const handleMouseUp = () => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    document.body.style.userSelect = '';

    localStorage.setItem(STORAGE_KEYS.INPUT_HEIGHT, elements.input.style.height);
    // Keep baseline minimum, don't raise it
    elements.input.style.minHeight = `${minInputHeight}px`;
  };

  elements.resizeHandle.addEventListener('mousedown', handleMouseDown, {
    signal: abortController.signal,
  });
  window.addEventListener('mousemove', handleMouseMove, {
    signal: abortController.signal,
  });
  window.addEventListener('mouseup', handleMouseUp, {
    signal: abortController.signal,
  });

  log.debug('Textarea resizing initialized');
}

/**
 * Gets the current selected tool
 * @returns {string} Current tool ID
 */
export function getSelectedTool() {
  return selectedTool;
}

/**
 * Sets the selected tool and updates UI
 * @param {string} tool - Tool ID to select
 */
export function setSelectedTool(tool) {
  selectedTool = tool;
  localStorage.setItem(STORAGE_KEYS.SELECTED_TOOL, tool);

  if (elements.status) {
    elements.status.textContent =
      tool === TOOLS.CHAT ? '' : `${STATUS_MESSAGES.TOOL_PREFIX}${tool}`;
  }

  log.debug('Tool selected:', tool);
}

/**
 * Computes tools menu width based on longest item
 * @private
 */
function computeToolsMenuWidth() {
  if (!elements.toolsMenu) {
    return;
  }

  try {
    const items = elements.toolsMenu.querySelectorAll(`.${SELECTORS.CLASS_TOOL_ITEM}`);
    
    if (!items || items.length === 0) {
      return;
    }

    // Find longest visible label
    let longestText = '';
    items.forEach((button) => {
      const text = String(button.textContent || '').trim();
      if (text.length > longestText.length) {
        longestText = text;
      }
    });

    // Measure text width with same font styles
    const probe = document.createElement('span');
    probe.style.visibility = 'hidden';
    probe.style.position = 'absolute';
    probe.style.whiteSpace = 'nowrap';

    const referenceItem = items[0];
    const computedStyle = window.getComputedStyle(referenceItem);

    if (computedStyle.font) {
      probe.style.font = computedStyle.font;
    } else {
      probe.style.fontSize = computedStyle.fontSize;
      probe.style.fontFamily = computedStyle.fontFamily;
      probe.style.fontWeight = computedStyle.fontWeight;
    }

    probe.textContent = longestText;
    document.body.appendChild(probe);
    const textWidth = probe.offsetWidth;
    document.body.removeChild(probe);

    // Account for padding and borders
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 12;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 12;
    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;

    const totalWidth = Math.ceil(textWidth + paddingLeft + paddingRight + borderLeft + borderRight);
    elements.toolsMenu.style.width = `${totalWidth}px`;

    log.debug('Tools menu width computed:', totalWidth);
  } catch (error) {
    log.warn('Error computing tools menu width:', error);
  }
}

/**
 * Sets up tools menu with dropdown behavior and keyboard navigation
 */
export function setupToolsMenu() {
  if (!elements.toolsButton || !elements.toolsMenu) {
    return;
  }

  const hideMenu = () => {
    elements.toolsMenu.style.display = 'none';
  };

  const showMenu = () => {
    computeToolsMenuWidth();
    elements.toolsMenu.style.display = 'block';
    // Focus first item for keyboard navigation
    const firstItem = elements.toolsMenu.querySelector(`.${SELECTORS.CLASS_TOOL_ITEM}`);
    if (firstItem) {
      firstItem.focus();
    }
  };

  const toggleMenu = () => {
    const isOpen = elements.toolsMenu.style.display === 'block';
    if (isOpen) {
      hideMenu();
    } else {
      showMenu();
    }
  };

  // Tools button click
  elements.toolsButton.addEventListener('click', (event) => {
    event.preventDefault();
    toggleMenu();
  }, { signal: abortController.signal });

  // Tool item selection
  elements.toolsMenu.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.dataset && target.dataset.tool) {
      setSelectedTool(target.dataset.tool);
      hideMenu();
    }
  }, { signal: abortController.signal });

  // Close menu when clicking outside
  document.addEventListener('click', (event) => {
    if (!elements.toolsMenu.contains(event.target) && event.target !== elements.toolsButton) {
      hideMenu();
    }
  }, { signal: abortController.signal });

  // Keyboard navigation
  elements.toolsMenu.addEventListener('keydown', (event) => {
    const items = Array.from(elements.toolsMenu.querySelectorAll(`.${SELECTORS.CLASS_TOOL_ITEM}`));
    const currentIndex = items.indexOf(document.activeElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < items.length - 1) {
          items[currentIndex + 1].focus();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          items[currentIndex - 1].focus();
        }
        break;
      case 'Escape':
        event.preventDefault();
        hideMenu();
        elements.toolsButton.focus();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (document.activeElement && document.activeElement.dataset.tool) {
          setSelectedTool(document.activeElement.dataset.tool);
          hideMenu();
        }
        break;
    }
  }, { signal: abortController.signal });

  log.debug('Tools menu initialized');
}

/**
 * Appends a message bubble to the chat
 * @param {string} text - Message text
 * @param {string} role - Either 'user' or 'ai'
 * @returns {HTMLElement} Created message element
 */
export function appendMessage(text, role) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `${SELECTORS.CLASS_MSG} ${role}`;
  messageDiv.textContent = text;
  messageDiv.setAttribute('role', role === 'user' ? 'status' : 'log');
  messageDiv.setAttribute('aria-live', 'polite');

  elements.content.appendChild(messageDiv);
  scrollToBottom();

  return messageDiv;
}

/**
 * Shows onboarding help message block at the top of the chat area
 * @param {{title?: string, lines?: string[], charDelayMs?: number}} config
 */
export function showOnboardingHelp(config = {}) {
  if (!elements.content) return;
  if (onboardingEl) return; // already shown

  const cfg = {
    title: config.title || 'Welcome',
    lines: Array.isArray(config.lines) ? config.lines : [],
    charDelayMs: typeof config.charDelayMs === 'number' ? config.charDelayMs : 12,
  };

  // Render as an AI message bubble to match chat
  onboardingEl = document.createElement('div');
  onboardingEl.className = `${SELECTORS.CLASS_MSG} ai`;
  onboardingEl.setAttribute('role', 'log');
  onboardingEl.setAttribute('aria-live', 'polite');
  onboardingEl.style.opacity = '0';
  onboardingEl.style.transform = 'translateY(4px)';
  onboardingEl.style.transition = `opacity ${window.CONFIG?.animation?.duration || '0.3s'} ${window.CONFIG?.animation?.easing || 'ease-out'}, transform ${window.CONFIG?.animation?.duration || '0.3s'} ${window.CONFIG?.animation?.easing || 'ease-out'}`;

  // Start with title, then type lines progressively
  const fragments = [cfg.title, '', ...cfg.lines];
  const fullText = fragments.join('\n');
  onboardingEl.textContent = '';
  elements.content.appendChild(onboardingEl);

  // Fade in container
  requestAnimationFrame(() => {
    onboardingEl.style.opacity = '1';
    onboardingEl.style.transform = 'translateY(0)';
  });

  // Typewriter effect
  let idx = 0;
  const delay = Math.max(0, cfg.charDelayMs);
  function typeNext() {
    if (!onboardingEl) return;
    if (idx >= fullText.length) return;
    onboardingEl.textContent += fullText[idx];
    idx += 1;
    setTimeout(typeNext, delay);
  }
  setTimeout(typeNext, delay);
}

/**
 * Hides the onboarding help with smooth fade-out and removes it.
 */
export function hideOnboardingHelp() {
  if (!onboardingEl) return;
  const duration = window.CONFIG?.animation?.duration || '0.3s';
  onboardingEl.style.opacity = '0';
  onboardingEl.style.transform = 'translateY(4px)';
  const ms = parseFloat(duration) * 1000 || 300;
  setTimeout(() => {
    if (onboardingEl && onboardingEl.parentElement) {
      onboardingEl.parentElement.removeChild(onboardingEl);
    }
    onboardingEl = null;
  }, ms);
}

/**
 * Scrolls content area to bottom
 */
export function scrollToBottom() {
  if (elements.content) {
    elements.content.scrollTop = elements.content.scrollHeight;
  }
}

/**
 * Renders history/bookmark/download results with favicons
 * @param {Array} items - Array of result items with {title, url, lastVisitTime}
 * @param {HTMLElement|null} existingElement - Element to update, or null to create new
 */
export function renderResults(items, existingElement = null) {
  const wrapper = document.createElement('div');
  wrapper.className = SELECTORS.CLASS_HISTORY_LIST;

  items.forEach((item) => {
    const row = createResultRow(item);
    wrapper.appendChild(row);
  });

  if (existingElement) {
    existingElement.innerHTML = '';
    existingElement.appendChild(wrapper);
  } else {
    const container = appendMessage('', 'ai');
    container.innerHTML = '';
    container.appendChild(wrapper);
  }

  scrollToBottom();
}

/**
 * Creates a single result row with favicon
 * @private
 * @param {Object} item - Result item
 * @returns {HTMLElement} Row element
 */
function createResultRow(item) {
  const row = document.createElement('div');
  row.className = SELECTORS.CLASS_HISTORY_ITEM;
  row.setAttribute('role', 'button');
  row.setAttribute('tabindex', '0');

  // Favicon
  const favicon = document.createElement('img');
  favicon.width = UI.FAVICON_SIZE;
  favicon.height = UI.FAVICON_SIZE;
  favicon.alt = '';
  
  const domain = extractDomain(item.url);
  if (domain) {
    favicon.src = getGoogleFaviconUrl(domain, UI.FAVICON_SIZE_2X);
  } else {
    favicon.src = getDefaultFavicon();
  }

  favicon.onerror = () => {
    favicon.src = getDefaultFavicon();
  };

  // Text column
  const textColumn = document.createElement('div');

  const titleElement = document.createElement('div');
  titleElement.className = SELECTORS.CLASS_TITLE;
  titleElement.textContent = item.title || item.url;

  const metaElement = document.createElement('div');
  metaElement.className = SELECTORS.CLASS_META;
  metaElement.textContent = formatTimestamp(item.lastVisitTime || 0);

  textColumn.appendChild(titleElement);
  textColumn.appendChild(metaElement);

  row.appendChild(favicon);
  row.appendChild(textColumn);

  // Click/Enter to open URL
  const openUrl = () => {
    if (isValidUrl(item.url)) {
      chrome.tabs.create({ url: item.url });
    }
  };

  row.addEventListener('click', openUrl, { signal: abortController.signal });
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openUrl();
    }
  }, { signal: abortController.signal });

  return row;
}

/**
 * Updates status text
 * @param {string} text - Status text to display
 */
export function updateStatus(text) {
  if (elements.status) {
    elements.status.textContent = text;
  }
}

/**
 * Gets current input text and clears input
 * @returns {string} Input text (trimmed)
 */
export function getAndClearInput() {
  if (!elements.input) {
    return '';
  }

  const text = (elements.input.value || '').trim();
  elements.input.value = '';
  autoGrowTextarea();

  return text;
}

/**
 * Adds accessibility attributes to UI elements
 */
export function enhanceAccessibility() {
  if (elements.input) {
    elements.input.setAttribute('aria-label', 'Message input');
    elements.input.setAttribute('aria-multiline', 'true');
  }

  if (elements.sendButton) {
    elements.sendButton.setAttribute('aria-label', 'Send message');
  }

  if (elements.toolsButton) {
    elements.toolsButton.setAttribute('aria-label', 'Select tool');
    elements.toolsButton.setAttribute('aria-haspopup', 'true');
    elements.toolsButton.setAttribute('aria-expanded', 'false');
  }

  if (elements.toolsMenu) {
    elements.toolsMenu.setAttribute('role', 'menu');
    
    const items = elements.toolsMenu.querySelectorAll(`.${SELECTORS.CLASS_TOOL_ITEM}`);
    items.forEach((item) => {
      item.setAttribute('role', 'menuitem');
    });
  }

  if (elements.content) {
    elements.content.setAttribute('role', 'log');
    elements.content.setAttribute('aria-live', 'polite');
    elements.content.setAttribute('aria-label', 'Conversation history');
  }

  log.debug('Accessibility enhancements applied');
}

/**
 * Cleans up all event listeners and resources
 */
export function cleanup() {
  log.info('Cleaning up UI resources');
  abortController.abort();
  abortController = new AbortController();
}

/**
 * Gets input element reference
 * @returns {HTMLElement|null} Input element
 */
export function getInputElement() {
  return elements.input;
}

/**
 * Gets send button element reference
 * @returns {HTMLElement|null} Send button element
 */
export function getSendButton() {
  return elements.sendButton;
}

/**
 * Toggles the send button between Send and Stop modes
 * - When showStop is true: shows a stop icon/state and label
 * - When false: restores the original send icon/state and label
 * @param {boolean} showStop
 */
export function toggleSendStopButton(showStop) {
  if (!elements.sendButton) return;

  if (showStop) {
    elements.sendButton.title = 'Stop generating';
    elements.sendButton.setAttribute('aria-label', 'Stop generating');
    elements.sendButton.classList.add('stop-mode');
    // Minimal inline SVG to avoid external dependencies
    elements.sendButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  } else {
    elements.sendButton.title = 'Send';
    elements.sendButton.setAttribute('aria-label', 'Send message');
    elements.sendButton.classList.remove('stop-mode');
    elements.sendButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 12L21 3L14 21L11 13L3 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeElements,
    applyConfiguration,
    initializeTextareaHeight,
    autoGrowTextarea,
    setupTextareaResizing,
    getSelectedTool,
    setSelectedTool,
    setupToolsMenu,
    appendMessage,
    scrollToBottom,
    renderResults,
    updateStatus,
    getAndClearInput,
    enhanceAccessibility,
    cleanup,
    getInputElement,
    getSendButton,
    showOnboardingHelp,
    hideOnboardingHelp,
  };
}

