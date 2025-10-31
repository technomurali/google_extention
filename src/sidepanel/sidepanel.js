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
  getSelectedContextsRaw,
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
import { renderMarkdown } from '../services/markdown.js';
import { PageAdapter } from '../services/retrieval/adapters/pageAdapter.js';
import { ContextPillsAdapter } from '../services/retrieval/adapters/contextPillsAdapter.js';
import { ChromePadAdapter } from '../services/retrieval/adapters/chromepadAdapter.js';
import { askWholeCorpus, retrieveRefs, answerWithRetrieval } from '../services/retrieval/engine.js';
import { HistoryAdapter } from '../services/retrieval/adapters/historyAdapter.js';
import { DownloadsAdapter } from '../services/retrieval/adapters/downloadsAdapter.js';

const log = logger.create('SidePanel');
// Renders answer text and clickable sources; clicking a source shows its section content
async function renderAnswerWithSources(container, out, adapter, context, titleMap) {
  try {
    container.innerHTML = '';
    const ans = document.createElement('div');
    ans.innerHTML = renderMarkdown(String(out.text || ''));
    container.appendChild(ans);

    const used = out && out.usedRefs ? out.usedRefs : [];
    if (used.length) {
      const hdr = document.createElement('div');
      hdr.style.marginTop = '8px';
      hdr.textContent = 'Sources:';
      container.appendChild(hdr);

      const list = document.createElement('ul');
      used.forEach((u) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'send-btn';
        const docTitle = titleMap && titleMap.get && titleMap.get(String(u.docId));
        const label = docTitle ? `${docTitle}${u.heading ? ' — ' + u.heading : ''}` : (u.heading || u.chunkId);
        btn.textContent = label;
        btn.addEventListener('click', async () => {
          try {
            const docs = await adapter.listDocuments(context);
            const docById = new Map(docs.map((d) => [String(d.id), d]));
            const targetDoc = docById.get(String(u.docId)) || docs[0];
            const chunks = await adapter.chunkDocument(targetDoc, {});
            const lookup = new Map(chunks.map((c) => [String(c.id), c]));
            const chunk = lookup.get(String(u.chunkId));
            if (!chunk) return;
            const view = appendMessage('', 'ai');
            const title = (docTitle || targetDoc.title || 'Document') + (chunk.heading ? ' — ' + chunk.heading : '');
            view.innerHTML = renderMarkdown(`**${title}**\n\n${chunk.content || ''}`);
          } catch {}
        });
        li.appendChild(btn);
        list.appendChild(li);
      });
      container.appendChild(list);
    }
  } catch {}
}

// Session-scoped context for History tool (persists within side panel session)
let lastHistoryContext = {
  exactDate: null,
  days: null,
};

// Lightweight in-flight guards for list fetch handlers
let isHistoryLoading = false;
let isBookmarksLoading = false;
let isDownloadsLoading = false;

// Generation state for chat streaming
let isGenerating = false;
let currentAbortController = null;
let manualStopFlag = false; // Fallback if AbortSignal isn't supported

// Page capture dedupe flags
let isPageCaptureInProgress = false;
let lastPageCaptureAt = 0;

/**
 * Handles history query requests
 * @param {string} queryText - Original query text
 * @param {Object} classification - Classification from AI
 */
async function handleHistoryRequest(queryText, classification) {
  if (isHistoryLoading) return;
  isHistoryLoading = true;
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
  } finally {
    isHistoryLoading = false;
  }
}

/**
 * Handles bookmarks query requests
 * @param {string} queryText - Search query
 */
async function handleBookmarksRequest(queryText) {
  if (isBookmarksLoading) return;
  isBookmarksLoading = true;
  const loadingMessage = appendMessage(STATUS_MESSAGES.LOADING_BOOKMARKS, 'ai');

  try {
    const raw = String(queryText || '');
    const sanitizedQuery = raw.replace(/^User:\s*/i, '').trim();
    log.info(`Handling bookmarks request with query: "${raw}" (sanitized: "${sanitizedQuery}")`);
    const bookmarks = await searchBookmarks(sanitizedQuery);

    log.info(`Received ${bookmarks.length} bookmarks from search`);

    if (bookmarks.length === 0) {
      const trimmedQuery = sanitizedQuery;
      if (trimmedQuery) {
        loadingMessage.textContent = `No bookmarks found matching "${trimmedQuery}".`;
      } else {
        loadingMessage.textContent = ERROR_MESSAGES.NO_BOOKMARKS_FOUND + ' Make sure you have granted bookmarks permission.';
      }
      return;
    }

    const results = convertBookmarksToResults(bookmarks);
    log.info(`Rendering ${results.length} bookmark results`);
    renderResults(results, loadingMessage);
  } catch (error) {
    log.error('Bookmarks request failed:', error);
    log.error('Error details:', {
      message: error.message,
      stack: error.stack,
      queryText: queryText
    });

    if (error instanceof PermissionError) {
      loadingMessage.textContent = error.message;
    } else {
      loadingMessage.textContent = formatErrorForUser(error, ERROR_MESSAGES.ERROR_READING_BOOKMARKS);
    }
  } finally {
    isBookmarksLoading = false;
  }
}

/**
 * Handles downloads query requests
 * @param {string} queryText - Search query
 */
async function handleDownloadsRequest(queryText) {
  if (isDownloadsLoading) return;
  isDownloadsLoading = true;
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
  } finally {
    isDownloadsLoading = false;
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
    let buffer = '';
    let lastRender = 0;
    for await (const chunk of stream) {
      buffer += chunk;
      const now = Date.now();
      if (now - lastRender > 120) {
        aiMessageElement.innerHTML = renderMarkdown(unwrapMarkdownFenceProgressive(buffer));
        lastRender = now;
        scrollToBottom();
      }
    }
    // Final render as markdown
    const unwrapped = unwrapFullCodeFence(buffer);
    aiMessageElement.innerHTML = renderMarkdown(unwrapped);
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
    case TOOLS.HISTORY: {
      const q = String(queryText || '').trim();
      const looksQuestion = /[?]$|\b(what|how|why|summar|explain|compare|difference)\b/i.test(q);
      if (!q || !looksQuestion) {
        await handleHistoryRequest(queryText, { intent: 'history' });
        return;
      }
      try {
        const body = appendMessage('', 'ai');
        body.textContent = 'Analyzing recent history…';
        let stopThink = null;
        try { const { startThinking } = await import('../ui/ui.js'); stopThink = startThinking(body, 'Thinking'); } catch {}

        isGenerating = true;
        manualStopFlag = false;
        currentAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        toggleSendStopButton(true);
        const inputElH = getInputElement();
        if (inputElH) inputElH.disabled = true;

        const out = await answerWithRetrieval({ adapter: HistoryAdapter, context: { days: 7, text: '' }, query: q, config: { signal: currentAbortController ? currentAbortController.signal : undefined, retrieval: { expandSynonyms: true, rerankK: 4 }, reading: { kMax: 3 } } });
        if (stopThink) { try { stopThink(); } catch {} stopThink = null; }
        const parts = [out.text || ''];
        const used = out.usedRefs || [];
        if (used.length) {
          parts.push('\n\nSources:');
          used.forEach((u) => parts.push(`- ${u.heading || u.chunkId}`));
        }
        body.innerHTML = renderMarkdown(parts.join('\n'));
      } catch (err) {
        if (String(err && err.message) !== 'aborted') {
          appendMessage('Could not analyze your history.', 'ai');
        }
      } finally {
        isGenerating = false;
        toggleSendStopButton(false);
        const inputElH2 = getInputElement();
        if (inputElH2) inputElH2.disabled = false;
        currentAbortController = null;
        manualStopFlag = false;
      }
      return;
    }

    case TOOLS.BOOKMARKS:
      await handleBookmarksRequest(queryText);
      return;

    case TOOLS.DOWNLOADS: {
      const q = String(queryText || '').trim();
      const looksQuestion = /[?]$|\b(what|how|why|summar|explain|compare|difference)\b/i.test(q);
      if (!q || !looksQuestion) {
        await handleDownloadsRequest(queryText);
        return;
      }
      try {
        const body = appendMessage('', 'ai');
        body.textContent = 'Analyzing downloads…';
        let stopThink = null;
        try { const { startThinking } = await import('../ui/ui.js'); stopThink = startThinking(body, 'Thinking'); } catch {}

        isGenerating = true;
        manualStopFlag = false;
        currentAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        toggleSendStopButton(true);
        const inputElD = getInputElement();
        if (inputElD) inputElD.disabled = true;

        const out = await answerWithRetrieval({ adapter: DownloadsAdapter, context: { text: '' }, query: q, config: { signal: currentAbortController ? currentAbortController.signal : undefined, retrieval: { expandSynonyms: true, rerankK: 4 }, reading: { kMax: 2, perChunkTokenCap: 800 } } });
        if (stopThink) { try { stopThink(); } catch {} stopThink = null; }
        const parts = [out.text || ''];
        const used = out.usedRefs || [];
        if (used.length) {
          parts.push('\n\nSources:');
          used.forEach((u) => parts.push(`- ${u.heading || u.chunkId}`));
        }
        body.innerHTML = renderMarkdown(parts.join('\n'));
      } catch (err) {
        if (String(err && err.message) !== 'aborted') {
          appendMessage('Could not analyze your downloads.', 'ai');
        }
      } finally {
        isGenerating = false;
        toggleSendStopButton(false);
        const inputElD2 = getInputElement();
        if (inputElD2) inputElD2.disabled = false;
        currentAbortController = null;
        manualStopFlag = false;
      }
      return;
    }

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

  // If user only typed a tool mention (no text), trigger default behavior for that tool
  try {
    const toolAfterMention = getSelectedTool();
    if (!String(userInput || '').trim()) {
      if (toolAfterMention === TOOLS.PAGE) {
        // Avoid duplicate capture if it just ran via tool-selected listener
        const hasContext = Array.isArray(pageState.chunks) && pageState.chunks.length > 0;
        if (!hasContext) {
          await handlePageRequest('');
        }
        return;
      }
      if (toolAfterMention === TOOLS.CHROMEPAD) {
        await handleChromePadSelected();
        return;
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

  // If not chat tool, route as usual
  const tool = getSelectedTool();
  if (tool !== TOOLS.CHAT) {
    // For ChromePad, don't show user message bubble (it just opens the interface)
    if (tool !== TOOLS.CHROMEPAD) {
      // Display user message only when there's actual text
      if (String(userInput || '').trim()) {
        appendMessage(userInput, 'user');
      }
    }
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
          // Phase 3: retrieve + progressive read + synthesize answer with sources (interactive) with cancel support
          let stopThink = null;
          try {
            const body = appendMessage('', 'ai');
            body.textContent = 'Analyzing and answering from page sections…';
            try { const { startThinking } = await import('../ui/ui.js'); stopThink = startThinking(body, 'Thinking'); } catch {}
            const ctx = { 
              url: pageState.url || '',
              cached: {
                title: pageState.title || '',
                url: pageState.url || '',
                chunks: Array.isArray(pageState.chunks) ? pageState.chunks.map((c) => ({ id: c.id, index: c.index, heading: c.heading, content: c.content, sizeBytes: c.sizeBytes })) : [],
                headings: Array.isArray(pageState.chunks) ? pageState.chunks.map((c) => c.heading).filter(Boolean) : []
              }
            };

            // Reuse global send/stop controls
            isGenerating = true;
            manualStopFlag = false;
            currentAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            toggleSendStopButton(true);
            const inputElement2 = getInputElement();
            if (inputElement2) inputElement2.disabled = true;

            const run = async (kMax) => {
              if (manualStopFlag || (currentAbortController && currentAbortController.signal.aborted)) {
                throw new Error('aborted');
              }
              const out = await answerWithRetrieval({ adapter: PageAdapter, context: ctx, query: userInput, config: { signal: currentAbortController ? currentAbortController.signal : undefined, retrieval: { topM: 12, rerankK: 4, useLLM: false, expandSynonyms: true }, reading: { kMax: kMax, perChunkTokenCap: 1400, reserveAnswerTokens: 800 } } });
              if (stopThink) { try { stopThink(); } catch {} stopThink = null; }
              if (manualStopFlag || (currentAbortController && currentAbortController.signal.aborted)) {
                throw new Error('aborted');
              }
              await renderAnswerWithSources(body, out, PageAdapter, ctx);
              return out;
            };
            let first;
            try {
              first = await run(3);
            } catch (e) {
              if (String(e && e.message) === 'aborted') {
                body.textContent = 'Stopped.';
                return;
              }
              throw e;
            }
            // Add thorough mode button when confidence low/medium
            try {
              if (first && first.confidence !== 'high') {
                const actions = document.createElement('div');
                actions.style.marginTop = '8px';
                const btn = document.createElement('button');
                btn.className = 'send-btn';
                btn.textContent = 'Thorough mode (+1 section)';
                btn.addEventListener('click', async () => { 
                  btn.disabled = true; 
                  try { await run(4); } catch (e) { /* ignore if aborted */ } 
                  btn.disabled = false; 
                });
                actions.appendChild(btn);
                body.appendChild(actions);
              }
            } catch {}
          } catch (err) {
            if (String(err && err.message) !== 'aborted') {
              appendMessage('Could not produce an answer from the page sections.', 'ai');
            }
          } finally {
            isGenerating = false;
            toggleSendStopButton(false);
            const inputElement3 = getInputElement();
            if (inputElement3) inputElement3.disabled = false;
            currentAbortController = null;
            manualStopFlag = false;
            if (stopThink) { try { stopThink(); } catch {} }
          }
        }
      } else if (tool === TOOLS.CHROMEPAD) {
        const qTrim = String(userInput || '').trim();
        if (!qTrim) {
          await handleChromePadSelected();
        } else {
          let stopThink = null;
          try {
            const body = appendMessage('', 'ai');
            body.textContent = 'Analyzing and answering from your notes…';
            try { const { startThinking } = await import('../ui/ui.js'); stopThink = startThinking(body, 'Thinking'); } catch {}

            // Reuse global send/stop controls
            isGenerating = true;
            manualStopFlag = false;
            currentAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            toggleSendStopButton(true);
            const inputElement4 = getInputElement();
            if (inputElement4) inputElement4.disabled = true;

            const run = async (kMax) => {
              if (manualStopFlag || (currentAbortController && currentAbortController.signal.aborted)) {
                throw new Error('aborted');
              }
              const out = await answerWithRetrieval({ adapter: ChromePadAdapter, context: {}, query: qTrim, config: { signal: currentAbortController ? currentAbortController.signal : undefined, retrieval: { topM: 12, rerankK: 4, useLLM: false, expandSynonyms: true }, reading: { kMax: kMax, perChunkTokenCap: 1200, reserveAnswerTokens: 800 } } });
              // Map docId → note title for clickable sources
              let titleMap = new Map();
              try {
                const docs = await ChromePadAdapter.listDocuments({});
                titleMap = new Map(docs.map(d => [String(d.id), d.title || 'Untitled']));
              } catch {}
              if (stopThink) { try { stopThink(); } catch {} stopThink = null; }
              if (manualStopFlag || (currentAbortController && currentAbortController.signal.aborted)) {
                throw new Error('aborted');
              }
              await renderAnswerWithSources(body, out, ChromePadAdapter, {}, titleMap);
              return out;
            };

            let firstN;
            try {
              firstN = await run(3);
            } catch (e) {
              if (String(e && e.message) === 'aborted') {
                body.textContent = 'Stopped.';
                return;
              }
              throw e;
            }
            if (firstN && firstN.confidence !== 'high') {
              const actions = document.createElement('div');
              actions.style.marginTop = '8px';
              const btn = document.createElement('button');
              btn.className = 'send-btn';
              btn.textContent = 'Thorough mode (+1 section)';
              btn.addEventListener('click', async () => { btn.disabled = true; try { await run(4); } catch (e) {} btn.disabled = false; });
              actions.appendChild(btn);
              body.appendChild(actions);
            }
          } catch (err) {
            if (String(err && err.message) !== 'aborted') {
              appendMessage('Could not produce an answer from your notes.', 'ai');
            }
          } finally {
            isGenerating = false;
            toggleSendStopButton(false);
            const inputElement5 = getInputElement();
            if (inputElement5) inputElement5.disabled = false;
            currentAbortController = null;
            manualStopFlag = false;
            if (stopThink) { try { stopThink(); } catch {} }
          }
        }
      } else {
        // For non-chat tools, pass raw user input (not the labeled finalPrompt)
        await routeMessage(userInput);
      }
    } catch (error) {
      log.error('Message routing error:', error);
      const errorMessage = formatErrorForUser(error, 'An error occurred processing your request');
      appendMessage(errorMessage, 'ai');
    } finally {
      try {
        const cfgCtx = window.CONFIG?.contextSelection || {};
        if (cfgCtx && cfgCtx.autoClearAfterSend) {
          clearSelectedContextsAfterSend();
        }
      } catch {}
    }
    return;
  }

  // Controlled chat flow with cancel support (CHAT tool only)
  // Display user message for chat
  appendMessage(userInput, 'user');
  
  const inputElement = getInputElement();
  const aiMessageElement = appendMessage('', 'ai');
  let stopThinking = null;

  isGenerating = true;
  manualStopFlag = false;
  currentAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  toggleSendStopButton(true);
  if (inputElement) inputElement.disabled = true;

  try {
    const options = currentAbortController ? { signal: currentAbortController.signal } : {};
    const cfgCtx = window.CONFIG?.contextSelection || {};
    const pills = getSelectedContexts();
    const useRetrieval = Array.isArray(pills) && pills.length > 0 && !!cfgCtx.useRetrievalWhenPills;
    if (useRetrieval) {
      // Retrieval path for pills with Thorough mode and labeled sources
      try { const { startThinking } = await import('../ui/ui.js'); stopThinking = startThinking(aiMessageElement, 'Thinking'); } catch {}
      const rawPills = getSelectedContextsRaw();
      // Safeguard: estimate corpus size and warn if large
      try {
        const limits = cfgCtx.limits || {};
        const warnAt = Number(limits.warnThresholdChars || 200000);
        let est = 0;
        for (const p of rawPills) {
          est += (p.text || '').length;
          const d = p && p.data;
          if (d && d.kind === 'list' && Array.isArray(d.items)) {
            for (const it of d.items) {
              est += String(it && it.title || '').length + String(it && it.url || '').length + 3;
              if (est > warnAt * 2) break; // stop early on very large
            }
          } else if (d && d.kind === 'notes' && Array.isArray(d.items)) {
            for (const n of d.items) {
              est += String(n && n.title || '').length + String(n && n.content || '').length + 3;
              if (est > warnAt * 2) break;
            }
          }
          if (est > warnAt * 2) break;
        }
        if (est > warnAt) {
          try {
            updateStatus('Large context detected — indexing may take longer');
            setTimeout(() => { try { updateStatus(''); } catch {} }, 1800);
          } catch {}
        }
      } catch {}

      const ctx = { pills: rawPills, limits: (cfgCtx && cfgCtx.limits) || {} };
      const retrievalCfg = {
        signal: currentAbortController ? currentAbortController.signal : undefined,
        retrieval: {
          topM: Number((cfgCtx.retrieval && cfgCtx.retrieval.topM) || 12),
          rerankK: Number((cfgCtx.retrieval && cfgCtx.retrieval.rerankK) || 4),
          expandSynonyms: !!(cfgCtx.retrieval && cfgCtx.retrieval.expandSynonyms !== false),
          useLLM: !!(cfgCtx.retrieval && cfgCtx.retrieval.useLLM !== false),
        },
        reading: {
          kMax: Number((cfgCtx.reading && cfgCtx.reading.kMax) || 3),
          perChunkTokenCap: Number((cfgCtx.reading && cfgCtx.reading.perChunkTokenCap) || 1200),
          reserveAnswerTokens: Number((cfgCtx.reading && cfgCtx.reading.reserveAnswerTokens) || 800),
        }
      };

      const run = async (kMax) => {
        if (manualStopFlag || (currentAbortController && currentAbortController.signal.aborted)) {
          throw new Error('aborted');
        }
        const cfg2 = { ...retrievalCfg, reading: { ...retrievalCfg.reading, kMax } };
        const out = await answerWithRetrieval({ adapter: ContextPillsAdapter, context: ctx, query: userInput, config: cfg2 });
        if (stopThinking) { try { stopThinking(); } catch {} stopThinking = null; }
        if (manualStopFlag || (currentAbortController && currentAbortController.signal.aborted)) {
          throw new Error('aborted');
        }
        // Build title map (pill label → docId) for Sources labels
        let titleMap = new Map();
        try {
          const docs = await ContextPillsAdapter.listDocuments(ctx);
          titleMap = new Map(docs.map(d => [String(d.id), d.title || 'Context']));
        } catch {}
        await renderAnswerWithSources(aiMessageElement, out, ContextPillsAdapter, ctx, titleMap);
        return out;
      };

      try {
        const first = await run(Number((cfgCtx.reading && cfgCtx.reading.kMax) || 3));
        // Add thorough mode button when confidence low/medium
        try {
          if (first && first.confidence !== 'high') {
            const actions = document.createElement('div');
            actions.style.marginTop = '8px';
            const btn = document.createElement('button');
            btn.className = 'send-btn';
            btn.textContent = 'Thorough mode (+1 section)';
            btn.addEventListener('click', async () => {
              btn.disabled = true;
              try { await run(Number((cfgCtx.reading && cfgCtx.reading.kMax) || 3) + 1); } catch (e) { /* ignore if aborted */ }
              btn.disabled = false;
            });
            actions.appendChild(btn);
            aiMessageElement.appendChild(actions);
          }
        } catch {}
      } catch (e) {
        if (String(e && e.message) !== 'aborted') {
          aiMessageElement.textContent = 'Could not produce an answer from the selected contexts.';
        }
      }
    } else {
      // Regular chat streaming path
      try { const { startThinking } = await import('../ui/ui.js'); stopThinking = startThinking(aiMessageElement, 'Thinking'); } catch {}
      const stream = await sendStreamingPrompt(finalPrompt, options);
      let buffer = '';
      let lastRender = 0;
      for await (const chunk of stream) {
        if (manualStopFlag) break;
        buffer += chunk;
        if (stopThinking) { try { stopThinking(); } catch {} stopThinking = null; }
        const now = Date.now();
        if (now - lastRender > 120) {
          aiMessageElement.innerHTML = renderMarkdown(unwrapMarkdownFenceProgressive(buffer));
          lastRender = now;
          scrollToBottom();
        }
      }
      const unwrapped = unwrapFullCodeFence(buffer);
      aiMessageElement.innerHTML = renderMarkdown(unwrapped);
      try { const { addAskThisResultButton } = await import('../ui/ui.js'); addAskThisResultButton(aiMessageElement); } catch {}
    }
  } catch (streamError) {
    const aborted = (currentAbortController && currentAbortController.signal && currentAbortController.signal.aborted) || manualStopFlag;
    if (!aborted) {
      log.warn('Streaming/retrieval failed, trying non-streaming:', streamError);
      try {
        const response = await sendPrompt(finalPrompt);
        if (stopThinking) { try { stopThinking(); } catch {} stopThinking = null; }
        const unwrapped2 = unwrapFullCodeFence(response);
        try { const { typewriterRenderMarkdown } = await import('../ui/ui.js'); await typewriterRenderMarkdown(aiMessageElement, unwrapped2, 3, 10); } catch { aiMessageElement.innerHTML = renderMarkdown(unwrapped2); }
        try { const { addAskThisResultButton } = await import('../ui/ui.js'); addAskThisResultButton(aiMessageElement); } catch {}
      } catch (promptError) {
        log.error('Chat request failed:', promptError);
        const errorMsg = formatErrorForUser(promptError, ERROR_MESSAGES.AI_UNAVAILABLE);
        aiMessageElement.innerHTML = renderMarkdown(errorMsg);
      }
    }
  } finally {
    isGenerating = false;
    toggleSendStopButton(false);
    if (inputElement) inputElement.disabled = false;
    currentAbortController = null;
    manualStopFlag = false;
    if (stopThinking) { try { stopThinking(); } catch {} }
    try {
      const cfgCtx2 = window.CONFIG?.contextSelection || {};
      if (cfgCtx2 && cfgCtx2.autoClearAfterSend) {
        clearSelectedContextsAfterSend();
      }
    } catch {}
  }
}

function unwrapFullCodeFence(text) {
  try {
    const m = String(text || '').match(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```\s*$/);
    if (m) return m[1];
    return String(text || '');
  } catch { return String(text || ''); }
}

function unwrapMarkdownFenceProgressive(text) {
  try {
    const s = String(text || '');
    // If it starts with ```markdown or ```md, remove the opening fence early for live rendering
    const startMatch = s.match(/^```(?:markdown|md)?\s*\n([\s\S]*)$/);
    if (startMatch) {
      const inner = startMatch[1];
      // If it already has a closing ```, strip it too
      const endFence = inner.match(/([\s\S]*?)\n```\s*$/);
      return endFence ? endFence[1] : inner;
    }
    return s;
  } catch { return String(text || ''); }
}

/**
 * Handles @Page tool flow: capture, chunk, render selection, and set selected chunk
 */
async function handlePageRequest(_queryText) {
  const cfg = window.CONFIG?.pageContent || {};

  // Dedupe: skip if a capture just finished or is in progress
  const nowTs = Date.now();
  if (isPageCaptureInProgress || (nowTs - lastPageCaptureAt) < 1000) {
    return;
  }
  isPageCaptureInProgress = true;

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

    // Phase 1: build compact index for the page in background and show progress
    try {
      const ctx = { 
        url: pageState.url,
        cached: {
          title: pageState.title || '',
          url: pageState.url || '',
          chunks: Array.isArray(pageState.chunks) ? pageState.chunks.map((c) => ({ id: c.id, index: c.index, heading: c.heading, content: c.content, sizeBytes: c.sizeBytes })) : [],
          headings: Array.isArray(pageState.chunks) ? pageState.chunks.map((c) => c.heading).filter(Boolean) : []
        }
      };
      // Show lightweight UI progress via retrieval-progress events
      // Do not await; run in background
      askWholeCorpus({ adapter: PageAdapter, context: ctx, config: { debug: false } }).catch(() => {});
    } catch {}

    // 4) No chunk selection UI for @Page. Keep UX: whole-page Q&A.
    try {
      aiMsg.textContent = 'Page captured. You can now ask about the whole page.';
    } catch {}

  } catch (err) {
    log.error('Page capture failed:', err);
    aiMsg.textContent = cfg.errorCapture || 'Failed to capture page content. Please try again.';
  } finally {
    isPageCaptureInProgress = false;
    lastPageCaptureAt = Date.now();
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

  // Retrieval engine progress → subtle status updates (@Page and pill contexts)
  try {
    let lastProgressTimer = null;
    document.addEventListener('retrieval-progress', (ev) => {
      try {
        const detail = ev && ev.detail || {};
        const key = String(detail.key || '');
        const pct = typeof detail.percent === 'number' ? Math.max(0, Math.min(100, Math.round(detail.percent))) : 0;
        // Support page and contexts keys
        if (key.startsWith('page:')) {
          if (detail.phase === 'done') {
            updateStatus('Index built');
            if (lastProgressTimer) clearTimeout(lastProgressTimer);
            lastProgressTimer = setTimeout(() => { try { updateStatus(''); } catch {} }, 1200);
          } else {
            updateStatus(`Indexing page… ${pct}%`);
          }
        } else if (key.startsWith('ctx:')) {
          if (detail.phase === 'done') {
            updateStatus('Contexts indexed');
            if (lastProgressTimer) clearTimeout(lastProgressTimer);
            lastProgressTimer = setTimeout(() => { try { updateStatus(''); } catch {} }, 1200);
          } else {
            updateStatus(`Indexing contexts… ${pct}%`);
          }
        } else {
          // Ignore other indexes
        }
      } catch {}
    });
  } catch {}

  // Pre-index pills corpus in background when the first pill is added
  try {
    const cfgCtx = window.CONFIG?.contextSelection || {};
    let preindexTimer = null;
    document.addEventListener('ctx-pill-added', () => {
      try {
        if (!cfgCtx.preindexOnPillAdd) return;
        if (preindexTimer) { clearTimeout(preindexTimer); preindexTimer = null; }
        preindexTimer = setTimeout(async () => {
          try {
            const pillsRaw = getSelectedContextsRaw();
            if (!Array.isArray(pillsRaw) || pillsRaw.length === 0) return;
            const ctx = { pills: pillsRaw };
            // Fire-and-forget; engine has caching + dedupe
            askWholeCorpus({ adapter: ContextPillsAdapter, context: ctx, config: { debug: false } }).catch(() => {});
          } catch {}
        }, 200);
      } catch {}
    });
  } catch {}

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
      let tabSwitchHintTimer = null;
      chrome.tabs.onActivated.addListener(() => {
        // Silently clear page context without posting an AI bubble
        clearPageState();
        try { clearPagePill(); } catch {}
        // Optional: show a brief status hint
        try {
          if (cfg.showTabSwitchHint) {
            const msg = String(cfg.clearedOnTabSwitchMessage || 'Page context cleared (tab switched).');
            updateStatus(msg);
            if (tabSwitchHintTimer) { try { clearTimeout(tabSwitchHintTimer); } catch {} }
            tabSwitchHintTimer = setTimeout(() => { try { updateStatus(''); } catch {} }, 1500);
          }
        } catch {}
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
    // Refresh placeholder to include current tool label
    try { setSelectedTool(getSelectedTool()); } catch {}
    
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

