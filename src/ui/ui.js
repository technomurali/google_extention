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
import { translateText } from '../services/translation.js';
import { renderMarkdown } from '../services/markdown.js';

// Page pill state (UI only)
let pagePill = null;

export function renderChunkSelectionBubble(pageInfo, chunks, onSelect) {
  const cfg = (window.CONFIG && window.CONFIG.pageContent) || {};
  const body = appendMessage('', 'ai');
  const frag = document.createDocumentFragment();

  const title = document.createElement('div');
  title.textContent = String(cfg.captureCompleteTemplate || 'Page captured: "{title}"').replace('{title}', pageInfo.title || 'Untitled');
  frag.appendChild(title);

  const header = document.createElement('div');
  const headerText = String(cfg.chunksHeaderTemplate || 'Content divided into {count} chunks. Select one to analyze:')
    .replace('{count}', String(chunks.length))
    .replace('{chunks}', chunks.length === 1 ? 'chunk' : 'chunks');
  header.textContent = headerText;
  frag.appendChild(header);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '6px';

  chunks.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'send-btn';
    btn.style.alignSelf = 'flex-start';
    btn.textContent = String(cfg.chunkButtonTemplate || 'Chunk {index}: {heading} ({size})')
      .replace('{index}', String(c.index))
      .replace('{heading}', c.heading)
      .replace('{size}', c.size);
    btn.addEventListener('click', () => {
      if (typeof onSelect === 'function') onSelect(c.id);
    });
    list.appendChild(btn);
  });
  frag.appendChild(list);

  const foot = document.createElement('div');
  foot.style.marginTop = '6px';
  foot.textContent = String(cfg.chunkInstructions || 'Click a chunk to start asking questions about that section.');
  frag.appendChild(foot);

  body.innerHTML = '';
  body.appendChild(frag);
  return body;
}

export function showPagePill(label, onClear) {
  const pillsRow = document.getElementById(SELECTORS.CONTEXT_PILLS);
  if (!pillsRow) return null;
  // Clear existing page pill
  if (pagePill && pagePill.parentElement) pagePill.parentElement.removeChild(pagePill);

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.title = label;
  pill.textContent = label;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove';
  removeBtn.setAttribute('aria-label', 'Remove page context');
  removeBtn.innerHTML = '×';
  removeBtn.onclick = () => { if (typeof onClear === 'function') onClear(); };
  pill.appendChild(document.createTextNode(' '));
  pill.appendChild(removeBtn);

  // Insert before actions
  const actions = pillsRow.querySelector('.actions');
  if (actions) pillsRow.insertBefore(pill, actions);
  else pillsRow.appendChild(pill);

  pillsRow.style.display = 'flex';
  pagePill = pill;
  return pill;
}

export function clearPagePill() {
  if (pagePill && pagePill.parentElement) {
    pagePill.parentElement.removeChild(pagePill);
  }
  pagePill = null;
}

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
// Per-bubble minimize is used; no global content minimize state

/**
 * Context selection state
 */
let selectedContexts = [];
let ctxAddBtnEl = null;
// Track tool switching around context pills
let previousToolBeforeContext = null; // tool to restore after manual clear
let isProgrammaticContextClear = false; // prevent restore on auto-clear (after send)

// Translation recent memory (session-scoped)
let recentLanguages = [];

function getConfigTranslation() {
  const cfg = window.CONFIG?.translation || {};
  return {
    enabled: cfg.enabled !== false,
    defaultSourceLanguage: String(cfg.defaultSourceLanguage || 'auto'),
    defaultLanguage: String(cfg.defaultLanguage || 'en'),
    maxDisplayLanguages: Number(cfg.maxDisplayLanguages) || 5,
    showLanguageCodes: cfg.showLanguageCodes !== false,
    recentLimit: Number(cfg.recentLimit) || 3,
    animationDelayMs: Number(cfg.animationDelayMs) >= 0 ? Number(cfg.animationDelayMs) : 8,
    languages: Array.isArray(cfg.languages) ? cfg.languages : [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'ja', name: 'Japanese' },
      { code: 'pt', name: 'Portuguese' },
    ],
    labels: Object.assign({
      searchPlaceholder: 'Search languages...',
      showOriginal: 'Show Original',
      translating: 'Translating...',
      translationError: 'Translation failed',
    }, cfg.labels || {}),
  };
}

function rememberRecentLanguage(code) {
  if (!code) return;
  const cfg = getConfigTranslation();
  recentLanguages = [code.toLowerCase(), ...recentLanguages.filter(c => c.toLowerCase() !== code.toLowerCase())];
  if (recentLanguages.length > cfg.recentLimit) recentLanguages.length = cfg.recentLimit;
}

function hideAllTranslateMenus() {
  const openMenus = elements.content ? elements.content.querySelectorAll(`.${SELECTORS.CLASS_TRANSLATE_MENU}`) : [];
  openMenus.forEach((menu) => { menu.style.display = 'none'; });
}

/**
 * Animates text appearance character by character (typewriter effect)
 * @param {HTMLElement} element - Target element to update
 * @param {string} text - Text to animate
 * @param {number} delayMs - Delay between characters in milliseconds
 * @returns {Promise<void>}
 */
async function animateTextAppearance(element, text, delayMs = 8) {
  return new Promise((resolve) => {
    element.textContent = '';
    let idx = 0;
    const chars = String(text || '');
    
    function typeNext() {
      if (idx >= chars.length) {
        scrollToBottom();
        resolve();
        return;
      }
      element.textContent += chars[idx];
      idx += 1;
      scrollToBottom();
      setTimeout(typeNext, delayMs);
    }
    
    typeNext();
  });
}

function getConfigContext() {
  const cfg = window.CONFIG?.contextSelection || {};
  return {
    maxItems: Number(cfg.maxItems) || 5,
    buttonLabel: String(cfg.buttonLabel || 'Ask iChrome'),
    pillClearAllLabel: String(cfg.pillClearAllLabel || 'Clear all'),
    pillCounterTemplate: String(cfg.pillCounterTemplate || '{count}/{max}'),
    contextLabelPrefix: String(cfg.contextLabelPrefix || 'Context'),
    selectionHighlight: Boolean(cfg.selectionHighlight !== false),
    maxSnippetChars: Number(cfg.maxSnippetChars) || 800,
    pillTruncateChars: Number(cfg.pillTruncateChars) || 30,
  };
}

function ensureCtxAddButton() {
  if (ctxAddBtnEl) return ctxAddBtnEl;
  const btn = document.createElement('button');
  btn.className = SELECTORS.CLASS_CONTEXT_ADD_BTN;
  btn.id = 'sp-ctx-add-btn';
  btn.style.display = 'none';
  btn.textContent = getConfigContext().buttonLabel;
  elements.content.appendChild(btn);
  ctxAddBtnEl = btn;
  return btn;
}

function showCtxAddButtonNearSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { hideCtxAddButton(); return; }
  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  // Only for AI bubble bodies
  const body = (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement)?.closest(`.${SELECTORS.CLASS_MSG}.${SELECTORS.CLASS_AI} .msg-body`);
  if (!body) { hideCtxAddButton(); return; }

  const maxReached = selectedContexts.length >= getConfigContext().maxItems;
  const rect = range.getBoundingClientRect();
  const hostRect = elements.content.getBoundingClientRect();
  const btn = ensureCtxAddButton();
  btn.textContent = getConfigContext().buttonLabel;
  btn.disabled = maxReached;
  btn.title = maxReached ? `${getConfigContext().pillCounterTemplate.replace('{count}', String(selectedContexts.length)).replace('{max}', String(getConfigContext().maxItems))}` : getConfigContext().buttonLabel;

  // Position button slightly above selection
  const top = rect.top - hostRect.top - 30 + elements.content.scrollTop;
  const left = rect.left - hostRect.left + elements.content.scrollLeft;
  btn.style.top = `${Math.max(0, top)}px`;
  btn.style.left = `${Math.max(0, left)}px`;
  btn.style.display = 'inline-flex';

  // Click handler
  const handleClick = (e) => {
    e.preventDefault();
    tryAddCurrentSelectionToContext();
  };
  btn.onclick = handleClick;
}

function hideCtxAddButton() {
  if (ctxAddBtnEl) ctxAddBtnEl.style.display = 'none';
}

function tryAddCurrentSelectionToContext() {
  const cfg = getConfigContext();
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;

  // Validate container
  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const body = (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement)?.closest(`.${SELECTORS.CLASS_MSG}.${SELECTORS.CLASS_AI} .msg-body`);
  if (!body) return;

  // Extract text
  const text = String(sel.toString() || '').trim();
  if (!text) return;

  if (selectedContexts.length >= cfg.maxItems) return;

  // Avoid duplicates by exact text match within same bubble
  const bubbleEl = body.closest(`.${SELECTORS.CLASS_MSG}.${SELECTORS.CLASS_AI}`);
  const bubbleId = bubbleEl ? (bubbleEl.dataset.msgId || (() => { const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; bubbleEl.dataset.msgId = id; return id; })()) : 'unknown';

  if (selectedContexts.some(c => c.text === text && c.bubbleId === bubbleId)) {
    hideCtxAddButton();
    return;
  }

  // Highlight selection (wrap range)
  let highlightSpan = null;
  if (cfg.selectionHighlight) {
    highlightSpan = document.createElement('span');
    highlightSpan.className = SELECTORS.CLASS_CONTEXT_HIGHLIGHT;
    try {
      range.surroundContents(highlightSpan);
    } catch {
      // If range is non-contiguous or crosses nodes, fallback to simple add without wrap
      highlightSpan = null;
    }
  }

  const ctx = {
    id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    bubbleId,
    highlightEl: highlightSpan,
  };
  selectedContexts.push(ctx);
  updateContextPillsUI();
  try {
    const ev = new CustomEvent('ctx-pill-added', { bubbles: true, composed: true, detail: { count: selectedContexts.length } });
    document.dispatchEvent(ev);
  } catch {}
  hideCtxAddButton();
  sel.removeAllRanges();

  // Always switch to @GeneralChat when a pill is added
  if (previousToolBeforeContext === null && selectedContexts.length === 1) {
    // Remember the tool to restore later (manual clear only)
    previousToolBeforeContext = getSelectedTool();
  }
  try { setSelectedTool(TOOLS.CHAT); } catch {}
}

/**
 * Adds an external context pill (e.g., from ChromePad) with an optional label
 * @param {string} text - Context text snippet/content
 * @param {string} [label] - Optional label to display on pill
 */
export function addExternalContext(text, label, data) {
  const cfg = getConfigContext();
  if (!text) return;
  if (selectedContexts.length >= cfg.maxItems) return;

  const ctx = {
    id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: String(text),
    bubbleId: 'external',
    highlightEl: null,
    label: label ? String(label) : undefined,
    data: data !== undefined ? data : undefined,
  };
  selectedContexts.push(ctx);
  updateContextPillsUI();
  try {
    const ev = new CustomEvent('ctx-pill-added', { bubbles: true, composed: true, detail: { count: selectedContexts.length } });
    document.dispatchEvent(ev);
  } catch {}

  // Always switch to @GeneralChat when a pill is added
  if (previousToolBeforeContext === null && selectedContexts.length === 1) {
    previousToolBeforeContext = getSelectedTool();
  }
  try { setSelectedTool(TOOLS.CHAT); } catch {}
}

function truncateForPill(text, maxChars) {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function updateContextPillsUI() {
  const pillsRow = document.getElementById(SELECTORS.CONTEXT_PILLS);
  const counterEl = document.getElementById(SELECTORS.CONTEXT_COUNTER);
  const clearBtn = document.getElementById(SELECTORS.CONTEXT_CLEAR);
  if (!pillsRow || !counterEl || !clearBtn) return;

  // Reset inner pills (preserve actions container)
  const actions = pillsRow.querySelector('.actions');
  pillsRow.innerHTML = '';

  const cfg = getConfigContext();
  selectedContexts.forEach((ctx, idx) => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.title = ctx.label ? `${ctx.label}\n\n${ctx.text}` : ctx.text;
    pill.dataset.ctxId = ctx.id;
    const display = ctx.label ? ctx.label : ctx.text;
    pill.textContent = truncateForPill(display, cfg.pillTruncateChars);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.setAttribute('aria-label', `Remove context ${idx + 1}`);
    removeBtn.innerHTML = '×';
    removeBtn.onclick = () => removeContextById(ctx.id);

    pill.appendChild(document.createTextNode(' '));
    pill.appendChild(removeBtn);

    // Hover to flash highlight
    pill.onmouseenter = () => {
      if (ctx.highlightEl) {
        ctx.highlightEl.style.transition = 'background-color .2s ease';
        ctx.highlightEl.style.backgroundColor = 'rgba(255,255,255,0.35)';
        setTimeout(() => { if (ctx.highlightEl) ctx.highlightEl.style.backgroundColor = ''; }, 200);
      }
    };

    pillsRow.appendChild(pill);
  });

  // Re-append actions
  const actionsNew = document.createElement('div');
  actionsNew.className = 'actions';
  const countText = cfg.pillCounterTemplate
    .replace('{count}', String(selectedContexts.length))
    .replace('{max}', String(cfg.maxItems));

  const counterSpan = document.createElement('span');
  counterSpan.className = 'counter';
  counterSpan.id = SELECTORS.CONTEXT_COUNTER;
  counterSpan.textContent = countText;

  const clearButton = document.createElement('button');
  clearButton.className = 'clear';
  clearButton.id = SELECTORS.CONTEXT_CLEAR;
  clearButton.textContent = cfg.pillClearAllLabel;
  clearButton.disabled = selectedContexts.length === 0;
  clearButton.onclick = clearAllContexts;

  actionsNew.appendChild(counterSpan);
  actionsNew.appendChild(clearButton);
  pillsRow.appendChild(actionsNew);

  // Show/hide row and adjust input padding
  pillsRow.style.display = selectedContexts.length > 0 ? 'flex' : 'none';
  // Update input placeholder? optional
}

function removeContextById(id) {
  const idx = selectedContexts.findIndex(c => c.id === id);
  if (idx === -1) return;
  const [removed] = selectedContexts.splice(idx, 1);
  if (removed && removed.highlightEl) {
    try {
      const parent = removed.highlightEl.parentNode;
      while (removed.highlightEl.firstChild) {
        parent.insertBefore(removed.highlightEl.firstChild, removed.highlightEl);
      }
      parent.removeChild(removed.highlightEl);
    } catch {}
  }
  updateContextPillsUI();
}

function clearAllContexts() {
  selectedContexts.forEach(c => {
    if (c.highlightEl && c.highlightEl.parentNode) {
      try {
        const parent = c.highlightEl.parentNode;
        while (c.highlightEl.firstChild) {
          parent.insertBefore(c.highlightEl.firstChild, c.highlightEl);
        }
        parent.removeChild(c.highlightEl);
      } catch {}
    }
  });
  selectedContexts = [];
  updateContextPillsUI();

  // Restore previous tool only on manual clear
  if (!isProgrammaticContextClear && previousToolBeforeContext !== null) {
    try { setSelectedTool(previousToolBeforeContext); } catch {}
    previousToolBeforeContext = null;
  }
}

export function getSelectedContexts() {
  const cfg = getConfigContext();
  const trimmed = selectedContexts.map(c => ({
    id: c.id,
    bubbleId: c.bubbleId,
    text: c.text.length > cfg.maxSnippetChars ? c.text.slice(0, cfg.maxSnippetChars) : c.text,
    label: c.label || undefined,
  }));
  return trimmed;
}

/**
 * Returns raw (untruncated) selected contexts for retrieval pipelines.
 * Warning: may contain large strings; do not render directly to UI.
 */
export function getSelectedContextsRaw() {
  return selectedContexts.map(c => ({
    id: c.id,
    bubbleId: c.bubbleId,
    text: c.text,
    label: c.label || undefined,
    data: c.data,
  }));
}

export function clearSelectedContextsAfterSend() {
  // Programmatic clear (after send) should NOT restore previous tool
  isProgrammaticContextClear = true;
  try {
    clearAllContexts();
  } finally {
    isProgrammaticContextClear = false;
  }
}

function handleSelectionChange() {
  try {
    showCtxAddButtonNearSelection();
  } catch {
    hideCtxAddButton();
  }
}

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

  // Context selection listeners
  try {
    document.addEventListener('selectionchange', handleSelectionChange, { signal: abortController.signal });
    elements.content.addEventListener('scroll', () => { hideCtxAddButton(); }, { signal: abortController.signal });
    window.addEventListener('resize', () => { hideCtxAddButton(); }, { signal: abortController.signal });
    updateContextPillsUI();
  } catch {}

  // Clear context pills when switching away from @iChromeChat
  try {
    document.addEventListener('tool-selected', (ev) => {
      const tool = ev && ev.detail && ev.detail.tool;
      if (tool && tool !== TOOLS.CHAT && selectedContexts.length > 0) {
        // Programmatic clear (do not restore previous tool)
        clearSelectedContextsAfterSend();
      }
    }, { signal: abortController.signal });
  } catch {}

  // Keyboard shortcut: Ctrl+T toggles last AI bubble's translate menu
  try {
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 't' || event.key === 'T')) {
        event.preventDefault();
        const bubbles = elements.content.querySelectorAll(`.${SELECTORS.CLASS_MSG}.${SELECTORS.CLASS_AI}`);
        const last = bubbles[bubbles.length - 1];
        if (!last) return;
        // Ensure translate button exists
        const btn = last.querySelector(`.${SELECTORS.CLASS_TRANSLATE_BTN}`);
        if (btn) {
          btn.click();
        }
      }
    }, { signal: abortController.signal });
  } catch {}

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

  // Update input placeholder to reflect current tool (e.g., "Type your message — @iChromeChat")
  try {
    if (elements.input) {
      const cfg = window.CONFIG || {};
      const base = (cfg.labels && cfg.labels.searchPlaceholder) || 'Type your message...';
      // Find label from tool mentions catalog (e.g., @iChromeChat)
      const catalog = getToolCatalog();
      const found = catalog.find((t) => t.id === tool);
      const display = found && found.label ? found.label : `@${tool}`;
      elements.input.placeholder = `${base} — ${display}`;
    }
  } catch {}

  log.debug('Tool selected:', tool);
  try {
    const ev = new CustomEvent('tool-selected', { bubbles: true, composed: true, detail: { tool } });
    document.dispatchEvent(ev);
  } catch {}
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

  // Build the tools dropdown dynamically from configuration so labels/icons stay in sync
  function populateToolsMenu() {
    const menu = elements.toolsMenu;
    if (!menu) return;
    // Clear existing static items (from HTML) and rebuild
    menu.innerHTML = '';
    const tools = getToolCatalog();
    tools.forEach((tool) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = SELECTORS.CLASS_TOOL_ITEM;
      btn.dataset.tool = tool.id;
      // Include icon when available
      const label = tool && tool.label ? tool.label : '';
      const icon = tool && tool.icon ? `${tool.icon} ` : '';
      btn.textContent = `${icon}${label}`.trim();
      menu.appendChild(btn);
    });
  }

  const hideMenu = () => {
    elements.toolsMenu.style.display = 'none';
  };

  const showMenu = () => {
    // Ensure items reflect current configuration before showing
    populateToolsMenu();
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
      try {
        // Insert @mention into input instead of immediately switching tool
        const inputEl = elements.input;
        const mention = getToolMentionLabel(target.dataset.tool);
        if (inputEl && mention) {
          insertOrReplaceLeadingMention(inputEl, mention + ' ');
          inputEl.focus();
        }
      } catch {}
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
  const bubble = document.createElement('div');
  bubble.className = `${SELECTORS.CLASS_MSG} ${role}`;
  bubble.setAttribute('role', role === 'user' ? 'status' : 'log');
  bubble.setAttribute('aria-live', 'polite');

  const body = document.createElement('div');
  body.className = 'msg-body';
  if (typeof text === 'string') {
    try {
      let processedText = text;
      
      // For AI responses, check if entire response is wrapped in code block
      if (role === 'ai') {
        // Pattern: entire message is ```markdown\n...\n``` or ```\n...\n```
        const codeBlockMatch = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```\s*$/);
        if (codeBlockMatch) {
          // Unwrap the code block to render as markdown
          processedText = codeBlockMatch[1];
          console.log('[UI] Unwrapped AI code block for markdown rendering');
        }
      }
      
      body.innerHTML = renderMarkdown(processedText);
      
      // Append body first, then safely store the original markdown on the bubble
      bubble.appendChild(body);
      try {
        bubble.dataset.rawMarkdown = String(processedText || '');
      } catch {}
    } catch {
      body.textContent = text; // safe fallback
      bubble.appendChild(body);
    }
  } else {
    bubble.appendChild(body);
  }

  // Add per-bubble controls for AI messages (translate + minimize)
  if (role === 'ai') {
    bubble.style.position = 'relative';
    // Translate button
    try {
      const tcfg = getConfigTranslation();
      if (tcfg.enabled) {
        const tbtn = document.createElement('button');
        tbtn.className = SELECTORS.CLASS_TRANSLATE_BTN;
        tbtn.title = 'Translate';
        tbtn.setAttribute('aria-label', 'Translate');
        // Globe icon default
        tbtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.85 0 3.53.63 4.87 1.69H7.13A7.96 7.96 0 0112 4zm-6.32 3h12.64c.43.6.78 1.26 1.03 1.97H4.65c.25-.71.6-1.37 1.03-1.97zM4.1 10h15.8c.07.33.1.66.1 1s-.03.67-.1 1H4.1A7.96 7.96 0 014 11c0-.34.03-.67.1-1zm.55 4h14.7a7.97 7.97 0 01-1.03 1.97H5.68A7.97 7.97 0 014.65 14zM7.13 18h9.74A7.96 7.96 0 0112 20a7.96 7.96 0 01-4.87-2z"/></svg>';

        const menu = document.createElement('div');
        menu.className = SELECTORS.CLASS_TRANSLATE_MENU;
        // Build menu content lazily on open

        function buildAndShowMenu() {
          // Rebuild each time to reflect recents/search
          menu.innerHTML = '';
          const cfg = getConfigTranslation();
          const header = document.createElement('div');
          header.className = SELECTORS.CLASS_TRANSLATE_HEADER;
          const search = document.createElement('input');
          search.className = SELECTORS.CLASS_TRANSLATE_SEARCH;
          search.type = 'text';
          search.placeholder = cfg.labels.searchPlaceholder;
          header.appendChild(search);
          menu.appendChild(header);

          const list = document.createElement('div');
          list.className = 'translate-list';

          function makeItem(label, code, isActive = false) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = SELECTORS.CLASS_TRANSLATE_ITEM;
            btn.dataset.lang = code;
            btn.textContent = label + (isActive ? ' ✓' : '');
            return btn;
          }

          function renderList(filter = '') {
            list.innerHTML = '';
            const f = String(filter || '').toLowerCase();

            // Recent section
            if (!f && recentLanguages.length > 0) {
              const recentHeader = document.createElement('div');
              recentHeader.className = SELECTORS.CLASS_TRANSLATE_HEADER;
              recentHeader.textContent = 'Recent';
              list.appendChild(recentHeader);
              const uniqueRecents = recentLanguages.filter(code => cfg.languages.some(l => l.code.toLowerCase() === code.toLowerCase()));
              uniqueRecents.slice(0, cfg.recentLimit).forEach(code => {
                const lang = cfg.languages.find(l => l.code.toLowerCase() === code.toLowerCase());
                if (!lang) return;
                const label = cfg.showLanguageCodes ? `${lang.name} (${lang.code})` : lang.name;
                const isActive = (bubble.dataset.currentLang || '') === lang.code;
                list.appendChild(makeItem(label, lang.code, isActive));
              });
              const div = document.createElement('div');
              div.className = SELECTORS.CLASS_TRANSLATE_DIVIDER;
              list.appendChild(div);
            }

            // Main list: filter or default slice
            let langs = cfg.languages;
            if (f) {
              langs = cfg.languages.filter(l => l.name.toLowerCase().includes(f) || l.code.toLowerCase().includes(f));
            } else {
              langs = cfg.languages.slice(0, Math.max(1, cfg.maxDisplayLanguages));
            }
            langs.forEach((l) => {
              const label = cfg.showLanguageCodes ? `${l.name} (${l.code})` : l.name;
              const isActive = (bubble.dataset.currentLang || '') === l.code;
              list.appendChild(makeItem(label, l.code, isActive));
            });

            // Show Original if currently translated
            const hasOriginal = typeof bubble.dataset.originalText === 'string' && (bubble.dataset.currentLang || '') !== '';
            if (hasOriginal) {
              const div2 = document.createElement('div');
              div2.className = SELECTORS.CLASS_TRANSLATE_DIVIDER;
              list.appendChild(div2);
              const originalBtn = document.createElement('button');
              originalBtn.type = 'button';
              originalBtn.className = SELECTORS.CLASS_TRANSLATE_ITEM;
              originalBtn.dataset.action = 'show-original';
              originalBtn.textContent = cfg.labels.showOriginal;
              list.appendChild(originalBtn);
            }
          }

          renderList('');
          menu.appendChild(list);

          // Event: filter on input
          search.addEventListener('input', () => {
            renderList(search.value);
          }, { signal: abortController.signal });

          // Event: click on list items
          list.addEventListener('click', async (ev) => {
            const target = ev.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.dataset.action === 'show-original') {
              if (typeof bubble.dataset.originalText === 'string') {
                const cfg2 = getConfigTranslation();
                // Animate the original text restoration
                await animateTextAppearance(body, bubble.dataset.originalText, cfg2.animationDelayMs);
                bubble.dataset.currentLang = '';
                // Reset button icon
                tbtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.85 0 3.53.63 4.87 1.69H7.13A7.96 7.96 0 0112 4zm-6.32 3h12.64c.43.6.78 1.26 1.03 1.97H4.65c.25-.71.6-1.37 1.03-1.97zM4.1 10h15.8c.07.33.1.66.1 1s-.03.67-.1 1H4.1A7.96 7.96 0 014 11c0-.34.03-.67.1-1zm.55 4h14.7a7.97 7.97 0 01-1.03 1.97H5.68A7.97 7.97 0 014.65 14zM7.13 18h9.74A7.96 7.96 0 0112 20a7.96 7.96 0 01-4.87-2z"/></svg>';
                // Stop active speech so next play uses new language
                const stopEvt = new CustomEvent('speech-stop', { bubbles: true, composed: true });
                bubble.dispatchEvent(stopEvt);
              }
              menu.style.display = 'none';
              return;
            }
            const code = target.dataset.lang;
            if (!code) return;

            // Prevent reentrancy: ignore if a translation is already in-flight for this bubble
            if (bubble.dataset.translateInFlight === '1') return;
            bubble.dataset.translateInFlight = '1';
            // Disable all items while translating
            try {
              const items = list.querySelectorAll(`.${SELECTORS.CLASS_TRANSLATE_ITEM}`);
              items.forEach((btn) => { btn.disabled = true; });
            } catch {}

            // Start translation
            log.info(`Translation requested: ${code}`);
            const cfg2 = getConfigTranslation();
            // Cache original once
            if (typeof bubble.dataset.originalText !== 'string') {
              bubble.dataset.originalText = String(body.textContent || '');
            }
            const orig = String(bubble.dataset.originalText || body.textContent || '');
            log.debug(`Original text length: ${orig.length}`);
            // Show translating animated state
            const prev = String(body.textContent || '');
            let stopTranslating = null;
            try { stopTranslating = startThinking(body, String(cfg2.labels.translating || 'Translating').replace(/\.*$/, '')); } catch {}
            tbtn.disabled = true;
            try {
              log.debug(`Calling translateText for ${code}`);
              const res = await translateText(orig, { sourceLanguage: cfg2.defaultSourceLanguage, targetLanguage: code });
              log.info(`Translation result:`, res);
              if (res && res.ok) {
                // Animate the translated text appearance
                if (stopTranslating) { try { stopTranslating(); } catch {} stopTranslating = null; }
                await animateTextAppearance(body, res.text, cfg2.animationDelayMs);
                bubble.dataset.currentLang = code;
                // Update button to show language code
                tbtn.textContent = String(code || '').toUpperCase();
                rememberRecentLanguage(code);
                // Stop active speech so next play uses new language
                const stopEvt = new CustomEvent('speech-stop', { bubbles: true, composed: true });
                bubble.dispatchEvent(stopEvt);
                log.info(`Translation successful to ${code}`);
              } else {
                log.warn(`Translation failed:`, res?.error);
                if (stopTranslating) { try { stopTranslating(); } catch {} stopTranslating = null; }
                body.textContent = prev; // restore
                tbtn.title = cfg2.labels.translationError;
              }
            } catch (err) {
              log.error(`Translation exception:`, err);
              if (stopTranslating) { try { stopTranslating(); } catch {} stopTranslating = null; }
              body.textContent = prev;
              tbtn.title = cfg2.labels.translationError;
            } finally {
              tbtn.disabled = false;
              delete bubble.dataset.translateInFlight;
              try {
                const items = list.querySelectorAll(`.${SELECTORS.CLASS_TRANSLATE_ITEM}`);
                items.forEach((btn) => { btn.disabled = false; });
              } catch {}
              if (stopTranslating) { try { stopTranslating(); } catch {} }
              menu.style.display = 'none';
            }
          }, { signal: abortController.signal });

          hideAllTranslateMenus();
          menu.style.display = 'block';
        }

        tbtn.addEventListener('click', (e) => {
          e.preventDefault();
          // Ignore clicks while a translation is in-flight
          if (bubble.dataset.translateInFlight === '1') return;
          // Toggle
          const isOpen = menu.style.display === 'block';
          if (isOpen) {
            menu.style.display = 'none';
          } else {
            buildAndShowMenu();
          }
        }, { signal: abortController.signal });

        // Close when clicking outside this bubble
        document.addEventListener('click', (ev) => {
          const target = ev.target;
          if (!bubble.contains(target)) {
            menu.style.display = 'none';
          }
        }, { signal: abortController.signal });

        bubble.appendChild(tbtn);
        bubble.appendChild(menu);
      }
    } catch {}

    // Speech button (Text-to-Speech)
    try {
      const scfg = window.CONFIG?.speech;
      if (scfg && scfg.enabled) {
        // Play/Pause button
        const playBtn = document.createElement('button');
        playBtn.className = 'msg-speech-btn';
        playBtn.title = scfg.labels?.speak || 'Read aloud';
        playBtn.setAttribute('aria-label', scfg.labels?.speak || 'Read aloud');
        playBtn.innerHTML = '🔊';
        playBtn.dataset.speechState = 'idle'; // idle, playing, paused

        // Stop button (hidden by default)
        const stopBtn = document.createElement('button');
        stopBtn.className = 'msg-speech-stop-btn';
        stopBtn.title = scfg.labels?.stop || 'Stop';
        stopBtn.setAttribute('aria-label', scfg.labels?.stop || 'Stop');
        stopBtn.innerHTML = '⏹';
        stopBtn.style.display = 'none';

        // Helper to show/hide buttons based on state
        function setButtonsState(state) {
          if (state === 'idle') {
            playBtn.style.display = '';
            stopBtn.style.display = 'none';
          } else {
            // playing or paused: show both
            playBtn.style.display = '';
            stopBtn.style.display = '';
          }
          playBtn.dataset.speechState = state;
        }

        // Play/Pause handler
        playBtn.addEventListener('click', () => {
          const event = new CustomEvent('speech-toggle', {
            bubbles: true,
            composed: true,
            detail: { element: body, button: playBtn }
          });
          bubble.dispatchEvent(event);
        }, { signal: abortController.signal });

        // Stop handler
        stopBtn.addEventListener('click', () => {
          const event = new CustomEvent('speech-stop', {
            bubbles: true,
            composed: true,
            detail: { element: body, button: playBtn }
          });
          bubble.dispatchEvent(event);
        }, { signal: abortController.signal });

        // Listen for state events from speech service to update UI
        playBtn.addEventListener('speech-started', () => setButtonsState('playing'), { signal: abortController.signal });
        playBtn.addEventListener('speech-paused', () => setButtonsState('paused'), { signal: abortController.signal });
        playBtn.addEventListener('speech-resumed', () => setButtonsState('playing'), { signal: abortController.signal });
        playBtn.addEventListener('speech-ended', () => setButtonsState('idle'), { signal: abortController.signal });

        bubble.appendChild(stopBtn);
        bubble.appendChild(playBtn);
      }
    } catch {}

    // Export button (Download)
    try {
      const exportBtn = document.createElement('button');
      exportBtn.className = 'msg-export-btn';
      exportBtn.title = 'Export';
      exportBtn.setAttribute('aria-label', 'Export');
      // Use ChromePad-style outlined download icon for visual consistency
      exportBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
      exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          const nameCandidate = (String(body.textContent || '').trim().split('\n')[0] || 'AI_Response').slice(0, 60);
          const raw = String(bubble.dataset.rawMarkdown || body.textContent || '');
          if (window.ChromePad && typeof window.ChromePad.exportContent === 'function') {
            window.ChromePad.exportContent(nameCandidate, raw);
          } else {
            alert('Export feature is currently unavailable. Please reload and try again.');
            console.error('ChromePad exportContent() not found on window');
          }
        } catch {}
      }, { signal: abortController.signal });
      bubble.appendChild(exportBtn);
    } catch {}

    // Ask iChrome button is added after generation completes via helper below

    const btn = document.createElement('button');
    btn.className = 'msg-minimize-btn';
    btn.title = 'Minimize';
    btn.setAttribute('aria-label', 'Minimize');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5"/></svg>';
    btn.addEventListener('click', () => {
      const minimized = bubble.classList.toggle('minimized');
      if (minimized) {
        btn.title = 'Maximize';
        btn.setAttribute('aria-label', 'Maximize');
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M17 14l-5-5-5 5"/></svg>';
      } else {
        btn.title = 'Minimize';
        btn.setAttribute('aria-label', 'Minimize');
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5"/></svg>';
      }
    }, { signal: abortController.signal });
    bubble.appendChild(btn);
  }

  elements.content.appendChild(bubble);
  scrollToBottom();
  return body; // return body for streaming updates
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

  // List-level Ask iChrome action: adds the whole results set as one context pill
  try {
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.marginTop = '8px';
    const askAll = document.createElement('button');
    askAll.type = 'button';
    askAll.className = 'send-btn';
    askAll.textContent = 'Ask iChrome (these results)';
    askAll.addEventListener('click', () => {
      try {
        const label = '📚 Results';
        // Build full, untruncated payload
        const structured = {
          kind: 'list',
          format: 'history',
          items: items.map((it) => ({ title: it.title || '', url: it.url || '', meta: { lastVisitTime: it.lastVisitTime || 0 } })),
        };
        // Small preview text for the pill label body
        const preview = items.slice(0, 20).map((it) => `${it.title || ''} — ${it.url || ''}`.trim()).join('\n');
        if (preview) addExternalContext(preview, label, structured);
      } catch {}
    });
    actions.appendChild(askAll);
    wrapper.appendChild(actions);
  } catch {}

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
  // Ensure predictable horizontal layout so action buttons don't collapse
  try {
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
  } catch {}

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

  // (Removed per-row Ask iChrome button; action moved to list-level in renderResults)

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

// Content-level minimize/deprecated: Implemented per-bubble in appendMessage
// (toggleContentMinimize, initializeContentState) — removed

// ---------------------------------------------
// Tool mentions (@tool) - autocomplete and helpers
// ---------------------------------------------

function getToolCatalog() {
  // Read from config, fallback to defaults if not defined
  const cfg = window.CONFIG?.toolMentions?.tools;
  if (cfg && Array.isArray(cfg) && cfg.length > 0) {
    // Use configured tools
    return cfg.map(tool => ({
      id: tool.id,
      label: tool.label,
      icon: tool.icon || '',
      aliases: tool.aliases || []
    }));
  }
  // Fallback to hardcoded defaults
  return [
    { id: TOOLS.CHAT, label: '@GeneralChat', icon: '💬', aliases: ['@chat', '@general'] },
    { id: TOOLS.PAGE, label: '@Page', icon: '📃', aliases: ['@webpage', '@content'] },
    { id: TOOLS.HISTORY, label: '@History', icon: '📚', aliases: ['@browsing', '@recent'] },
    { id: TOOLS.BOOKMARKS, label: '@Bookmarks', icon: '🔖', aliases: ['@saved', '@favorites'] },
    { id: TOOLS.DOWNLOADS, label: '@Downloads', icon: '📥', aliases: ['@files'] },
    { id: TOOLS.CHROMEPAD, label: '@ChromePad', icon: '📝', aliases: ['@notes', '@notepad'] },
  ];
}

function getToolMentionLabel(toolId) {
  const item = getToolCatalog().find(t => t.id === toolId);
  return item ? item.label : null;
}

function findToolByMention(mentionText) {
  const norm = String(mentionText || '').trim().toLowerCase();
  const list = getToolCatalog();
  
  // Try exact label match first
  const direct = list.find(t => t.label.toLowerCase() === norm);
  if (direct) return direct;
  
  // Try alias match (configured or default)
  const aliasMatch = list.find(t => {
    if (!t.aliases || !Array.isArray(t.aliases)) return false;
    return t.aliases.some(alias => alias.toLowerCase() === norm);
  });
  if (aliasMatch) return aliasMatch;
  
  return null;
}

function insertOrReplaceLeadingMention(inputEl, mentionWithSpace) {
  const value = inputEl.value || '';
  // Match @ with optional word characters (handles both "@" and "@word")
  const leading = value.match(/^@\w*\s*/);
  if (leading) {
    // Replace the partial/complete mention
    inputEl.value = mentionWithSpace + value.slice(leading[0].length);
  } else {
    // No leading @, prepend the mention
    inputEl.value = mentionWithSpace + value;
  }
  // Move caret to after the inserted mention
  const newPos = mentionWithSpace.length;
  try { 
    inputEl.selectionStart = inputEl.selectionEnd = newPos;
  } catch {}
}

export function parseLeadingToolMention(text) {
  const cfg = window.CONFIG?.toolMentions || {};
  if (cfg.enabled === false) return { toolId: null, stripped: text };
  const m = String(text || '').match(/^(@[A-Za-z][A-Za-z0-9]*)\b\s*/);
  if (!m) return { toolId: null, stripped: text };
  const tool = findToolByMention(m[1]);
  if (!tool) return { toolId: null, stripped: text };
  const stripped = String(text || '').slice(m[0].length);
  return { toolId: tool.id, stripped };
}

export function setupToolMentions() {
  const cfg = window.CONFIG?.toolMentions || {};
  if (cfg.enabled === false) return;

  const inputEl = elements.input;
  const content = elements.content;
  if (!inputEl || !content) return;

  let menuEl = null;
  let activeIndex = -1;
  let filtered = [];

  function ensureMenu() {
    if (menuEl) return menuEl;
    const el = document.createElement('div');
    el.id = 'sp-mention-menu';
    // Use absolute positioning within the input wrapper
    el.style.position = 'absolute';
    el.style.zIndex = '9999999'; // Very high z-index to ensure it's on top
    el.style.display = 'none';
    el.style.border = '1px solid rgba(255,255,255,0.2)';
    el.style.background = 'rgba(30,30,30,0.98)'; // Darker, more opaque background
    el.style.color = '#fff';
    el.style.borderRadius = '8px';
    el.style.padding = '4px';
    el.style.fontSize = '13px';
    el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'; // Add shadow for visibility
    // Find the input wrapper or bottom section to append to
    const inputWrap = document.querySelector('.input-wrap') || document.querySelector('.bottom');
    if (inputWrap) {
      inputWrap.appendChild(el);
    } else {
      // Fallback to body if structure is different
      document.body.appendChild(el);
    }
    // Prevent scroll bleed when scrolling over the menu
    el.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });
    menuEl = el;
    return el;
  }

  function positionMenu() {
    const el = ensureMenu();
    // Position above the input field (like tools menu)
    el.style.bottom = '54px'; // Above input, matching tools menu position
    el.style.left = '12px';
    el.style.right = 'auto';
    el.style.top = 'auto';
    el.style.minWidth = '200px';
    el.style.maxWidth = 'calc(100% - 24px)';
  }

  function renderMenu() {
    const el = ensureMenu();
    el.innerHTML = '';
    filtered.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = SELECTORS.CLASS_TOOL_ITEM;
      btn.style.display = 'flex';
      btn.style.width = '100%';
      btn.style.textAlign = 'left';
      btn.style.gap = '6px';
      btn.style.padding = '6px 8px';
      btn.style.background = idx === activeIndex ? 'rgba(255,255,255,0.12)' : 'transparent';
      btn.style.border = '0';
      btn.style.cursor = 'pointer';
      btn.dataset.tool = item.id;
      btn.textContent = `${item.icon} ${item.label}`;
      // Lightweight hover highlight without re-render
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.12)'; });
      btn.addEventListener('mouseleave', () => { if (idx !== activeIndex) btn.style.background = 'transparent'; });
      btn.addEventListener('click', () => {
        insertOrReplaceLeadingMention(inputEl, item.label + ' ');
        hideMenu();
        inputEl.focus();
      }, { once: true });
      el.appendChild(btn);
    });
    positionMenu();
    el.style.display = filtered.length ? 'block' : 'none';
  }

  function hideMenu() {
    if (menuEl) menuEl.style.display = 'none';
    activeIndex = -1;
  }

  function updateFiltered(query) {
    const all = getToolCatalog();
    const q = String(query || '').toLowerCase();
    filtered = all.filter(t => t.label.toLowerCase().includes(q));
    if (cfg.autocomplete && cfg.autocomplete.maxVisible) {
      filtered = filtered.slice(0, cfg.autocomplete.maxVisible);
    }
    activeIndex = filtered.length ? 0 : -1;
    renderMenu();
  }

  function getMentionQueryAtCaret() {
    try {
      const caret = inputEl.selectionStart || 0;
      const left = (inputEl.value || '').slice(0, caret);
      const m = left.match(/@([A-Za-z0-9]*)$/);
      if (!m) return null;
      return '@' + (m[1] || '');
    } catch {
      return null;
    }
  }

  inputEl.addEventListener('keydown', (ev) => {
    const cfgEnabled = (window.CONFIG?.toolMentions?.enabled !== false);
    if (!cfgEnabled) return;
    const isMenuOpen = menuEl && menuEl.style.display === 'block';
    if (isMenuOpen) {
      if (ev.key === 'ArrowDown') { 
        ev.preventDefault(); 
        ev.stopPropagation();
        activeIndex = Math.min(filtered.length - 1, activeIndex + 1); 
        renderMenu(); 
        return; 
      }
      if (ev.key === 'ArrowUp') { 
        ev.preventDefault(); 
        ev.stopPropagation();
        activeIndex = Math.max(0, activeIndex - 1); 
        renderMenu(); 
        return; 
      }
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        // ALWAYS prevent default when menu is open, regardless of selection
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        if (activeIndex >= 0 && filtered[activeIndex]) {
          insertOrReplaceLeadingMention(inputEl, filtered[activeIndex].label + ' ');
          hideMenu();
          // Refocus input so user can continue typing
          inputEl.focus();
        }
        return;
      }
      if (ev.key === 'Escape') { 
        ev.preventDefault(); 
        ev.stopPropagation();
        hideMenu(); 
        return; 
      }
    }
    if (ev.key === '@') {
      // Open menu fresh
      setTimeout(() => { updateFiltered(''); }, 0);
    }
  }, { signal: abortController.signal, capture: true });

  inputEl.addEventListener('input', () => {
    const q = getMentionQueryAtCaret();
    if (q) {
      updateFiltered(q);
    } else {
      hideMenu();
    }
  }, { signal: abortController.signal });

  document.addEventListener('click', (e) => {
    const target = e.target;
    const holder = menuEl;
    if (!holder) return;
    if (holder.style.display === 'block' && !holder.contains(target) && target !== inputEl) {
      hideMenu();
    }
  }, { signal: abortController.signal });

  // Reposition on container scroll and window resize to keep alignment
  content.addEventListener('scroll', () => {
    if (menuEl && menuEl.style.display === 'block') positionMenu();
  }, { signal: abortController.signal, passive: true });
  window.addEventListener('resize', () => {
    if (menuEl && menuEl.style.display === 'block') positionMenu();
  }, { signal: abortController.signal });
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

/**
 * Adds an "Ask iChrome (this result)" button to a finished AI bubble body.
 * Safe to call multiple times; only adds once per bubble.
 * @param {HTMLElement} body
 */
export function addAskThisResultButton(body) {
  try {
    if (!body) return;
    const bubble = body.parentElement;
    if (!bubble) return;
    if (bubble.dataset && bubble.dataset.askBtnAttached === '1') return;
    const btn = document.createElement('button');
    btn.className = 'send-btn';
    btn.textContent = 'Ask iChrome (this result)';
    btn.style.marginTop = '6px';
    btn.style.alignSelf = 'flex-start';
    btn.addEventListener('click', () => {
      try {
        const label = '🧠 This result';
        const raw = String(bubble.dataset.rawMarkdown || body.textContent || '').trim();
        if (!raw) return;
        addExternalContext(raw.slice(0, 2000), label);
        try { setSelectedTool(TOOLS.CHAT); } catch {}
      } catch {}
    });
    bubble.appendChild(btn);
    if (bubble.dataset) bubble.dataset.askBtnAttached = '1';
  } catch {}
}

/**
 * Shows a lightweight "Thinking…" indicator inside a bubble body.
 * Returns a stop function to remove it.
 * @param {HTMLElement} body
 * @param {string} [label]
 * @returns {() => void}
 */
export function startThinking(body, label = 'Thinking…') {
  let timer = null;
  let alive = true;
  const holder = document.createElement('div');
  holder.style.opacity = '0.7';
  holder.style.fontSize = '12px';
  const span = document.createElement('span');
  span.textContent = label;
  holder.appendChild(span);
  body.appendChild(holder);
  let dots = 0;
  timer = setInterval(() => {
    if (!alive) return;
    dots = (dots + 1) % 4;
    span.textContent = label + (dots ? '.'.repeat(dots) : '');
  }, 400);
  return () => {
    alive = false;
    try { if (timer) clearInterval(timer); } catch {}
    try { if (holder && holder.parentElement) holder.parentElement.removeChild(holder); } catch {}
  };
}

/**
 * Progressive typewriter effect for plain text, then final markdown render.
 * @param {HTMLElement} body
 * @param {string} fullText
 * @param {number} [step]
 * @param {number} [interval]
 * @returns {Promise<void>}
 */
export async function typewriterRenderMarkdown(body, fullText, step = 3, interval = 12) {
  const s = String(fullText || '');
  if (!s) { body.innerHTML = ''; return; }
  return new Promise((resolve) => {
    let i = 0;
    function tick() {
      i = Math.min(s.length, i + step);
      body.textContent = s.slice(0, i);
      scrollToBottom();
      if (i >= s.length) {
        try { body.innerHTML = renderMarkdown(s); } catch { body.textContent = s; }
        resolve();
        return;
      }
      setTimeout(tick, interval);
    }
    tick();
  });
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
    getSelectedContextsRaw,
  };
}


