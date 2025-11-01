// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// PAGE CONTENT UTILITIES - Capture, Chunking, and State Management
// ============================================================================
// FILE SUMMARY:
// Provides functionality for capturing visible content from the active browser tab,
// splitting it into manageable chunks, and managing page state for retrieval-based AI.
//
// WHERE IT'S USED:
// - src/sidepanel/sidepanel.js: Main handler for @Page tool requests
// - src/services/retrieval/adapters/pageAdapter.js: Retrieval adapter for semantic search
// - UI components: Chunk selection and page pill display
//
// FEATURES:
// - Deep content extraction from DOM, shadow DOM, and same-origin iframes
// - Intelligent chunking with heading detection and size management
// - State management for current page capture
// - Filters out hidden, script, and non-text content
//
// ============================================================================

import { getSettings } from '../../services/settings.js';

/**
 * Captures all visible text content from the currently active browser tab.
 * 
 * This function uses Chrome's scripting API to inject code into the page context,
 * where it traverses the DOM tree to collect visible text from:
 * - The main document body
 * - Shadow DOMs (for web components)
 * - Same-origin iframes (cross-origin iframes are skipped)
 * 
 * The extraction process:
 * - Walks the DOM tree using TreeWalker API for performance
 * - Filters out script, style, SVG, canvas, video, audio, and other non-text elements
 * - Checks computed styles to exclude hidden content (display: none, visibility: hidden)
 * - Extracts headings (h1-h6) separately for chunking guidance
 * 
 * @returns {Promise<Object>} Returns a payload object containing:
 *   - title: Page title from document.title
 *   - url: Current URL (location.href)
 *   - text: All visible text concatenated with newlines
 *   - headings: Array of heading text strings (h1-h6)
 *   - timestamp: Unix timestamp in milliseconds
 *   - skippedIframes: Count of cross-origin iframes that couldn't be accessed
 * 
 * @throws {Error} If no active tab exists or execution fails
 * 
 * EXAMPLE USAGE:
 * const payload = await captureActivePage();
 * console.log(`Captured ${payload.text.length} characters from "${payload.title}"`);
 */
export async function captureActivePage() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id) throw new Error('No active tab');

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      try {
        function collectVisibleTextFromRoot(root) {
          const parts = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
              if (!n || !n.parentElement) return NodeFilter.FILTER_REJECT;
              const parent = n.parentElement;
              const tag = parent.tagName;
              if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO'].includes(tag)) return NodeFilter.FILTER_REJECT;
              const text = n.nodeValue || '';
              if (!text.trim()) return NodeFilter.FILTER_REJECT;
              const style = window.getComputedStyle(parent);
              if (style && (style.visibility === 'hidden' || style.display === 'none')) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          });
          while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
          return parts;
        }

        function getVisibleTextDeep(doc) {
          const chunks = [];
          // Main document
          chunks.push(...collectVisibleTextFromRoot(doc.body || doc));
          // Shadow roots
          try {
            const all = doc.querySelectorAll('*');
            all.forEach((el) => {
              try {
                if (el && el.shadowRoot) {
                  chunks.push(...collectVisibleTextFromRoot(el.shadowRoot));
                }
              } catch {}
            });
          } catch {}
          // Same-origin iframes
          let skippedIframes = 0;
          try {
            const iframes = doc.querySelectorAll('iframe');
            iframes.forEach((f) => {
              try {
                if (f && f.contentDocument) {
                  chunks.push(...collectVisibleTextFromRoot(f.contentDocument.body || f.contentDocument));
                }
              } catch { skippedIframes += 1; }
            });
          } catch {}
          return { text: chunks.join('\n'), skippedIframes };
        }
        function extractHeadings() {
          const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
          return hs.map(h => (h.textContent || '').trim()).filter(Boolean);
        }
        const deep = getVisibleTextDeep(document);
        return {
          title: document.title || '',
          url: location.href,
          text: deep.text,
          headings: extractHeadings(),
          timestamp: Date.now(),
          skippedIframes: deep.skippedIframes || 0,
        };
      } catch (err) {
        return { error: String(err && err.message || err) };
      }
    },
  });

  if (!result) throw new Error('No result from page');
  if (result.error) throw new Error(result.error);
  return result;
}

/**
 * Splits large page content into smaller, semantically meaningful chunks.
 * 
 * This function implements an intelligent chunking strategy that:
 * - Prefers splitting at heading boundaries when available
 * - Enforces maximum chunk size to stay within token limits
 * - Prevents overly small chunks by merging them with previous chunk
 * - Handles content without clear structure by splitting at paragraph boundaries
 * 
 * Chunking Strategy:
 * 1. Detects headings using markdown (#) or DOM heading patterns
 * 2. Starts new chunk at heading if current chunk exceeds minChunkChars
 * 3. Splits chunks that exceed maxChunkChars
 * 4. Merges chunks smaller than minChunkChars into the previous chunk
 * 
 * @param {Object} payload - The captured page data
 * @param {string} payload.text - Full page text content
 * @param {Array<string>} [payload.headings] - Array of heading strings for guidance
 * 
 * @param {Object} config - Chunking configuration options
 * @param {number} [config.maxChunkChars=12000] - Maximum characters per chunk
 * @param {number} [config.overlapChars=500] - Reserved for future overlap feature
 * @param {number} [config.minChunkChars=1000] - Minimum characters before splitting
 * 
 * @returns {Array<Object>} Array of chunk objects, each containing:
 *   - id: Unique identifier (chunk-1, chunk-2, ...)
 *   - index: 1-based position in sequence
 *   - heading: Section heading or "Section N"
 *   - content: The actual text content
 *   - sizeBytes: Character count
 *   - size: Human-readable size string (e.g., "12KB")
 * 
 * EXAMPLE USAGE:
 * const chunks = chunkContent({ text: longContent, headings: ["Introduction", "Conclusion"] });
 * console.log(`Created ${chunks.length} chunks`); // e.g., "Created 5 chunks"
 */
export async function chunkContent(payload, config) {
  // Get settings for page tool (async, but can be called without await for backward compatibility)
  let pageSettings = {};
  try {
    pageSettings = await getSettings('tools.page') || {};
  } catch (e) {
    // If settings not available (e.g., during initialization), use defaults
  }
  
  const defaultConfig = {
    maxChunkChars: pageSettings.maxChunk || 12000,
    overlapChars: pageSettings.overlap || 500,
    minChunkChars: 1000,
  };
  
  const cfg = Object.assign(defaultConfig, config || {});
  const text = String(payload.text || '').trim();
  if (!text) return [];

  // Prefer splitting on headings if available; otherwise paragraphs
  const headings = Array.isArray(payload.headings) ? payload.headings : [];
  const lines = text.split(/\n+/);

  const chunks = [];
  let current = { content: '', size: 0, heading: '' };
  let currentHeading = '';

  function pushCurrent() {
    if (current.size < cfg.minChunkChars && chunks.length > 0) {
      // Merge small tail into previous
      const prev = chunks[chunks.length - 1];
      prev.content += '\n' + current.content;
      prev.size += current.size;
    } else if (current.size > 0) {
      chunks.push({ content: current.content, size: current.size, heading: current.heading || currentHeading || '' });
    }
    current = { content: '', size: 0, heading: '' };
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const looksLikeHeading = /^#{0,6}\s*\S/.test(trimmed) || /^(?:[A-Z].{0,60})$/.test(trimmed) && headings.includes(trimmed);
    if (looksLikeHeading && current.size >= cfg.minChunkChars) {
      pushCurrent();
      currentHeading = trimmed;
      current.heading = trimmed;
    }

    const toAdd = line + '\n';
    current.content += toAdd;
    current.size += toAdd.length;

    if (current.size >= cfg.maxChunkChars) {
      pushCurrent();
    }
  }
  pushCurrent();

  return chunks.map((c, idx) => ({
    id: `chunk-${idx + 1}`,
    index: idx + 1,
    heading: c.heading || `Section ${idx + 1}`,
    content: c.content,
    sizeBytes: c.size,
    size: `${Math.round(c.size / 1024)}KB`,
  }));
}

// ============================================================================
// PAGE STATE MANAGEMENT
// ============================================================================

/**
 * Global state object that holds information about the currently captured page.
 * 
 * This state is managed throughout the page capture and retrieval workflow:
 * - Populated when user triggers @Page tool
 * - Used by retrieval adapters to access current page content
 * - Used by UI components to display page pill and chunk selection
 * - Cleared when starting a new capture session
 * 
 * Properties:
 * - title: Page title from capture
 * - url: Page URL for identification
 * - favicon: Favicon URL (currently not used)
 * - chunks: Array of chunk objects from chunkContent()
 * - selectedChunkId: Currently selected chunk ID for focused retrieval
 * - timestamp: Unix timestamp of when page was captured
 * 
 * NOTE: This is a singleton object - only one page state exists at a time.
 */
export const pageState = {
  title: '',
  url: '',
  favicon: '',
  chunks: [],
  selectedChunkId: null,
  timestamp: 0,
};

/**
 * Updates the global pageState object with new data from a page capture.
 * 
 * Called after successfully capturing and chunking page content to store
 * the results for later use by retrieval adapters and UI components.
 * 
 * @param {Object} data - The state data to set
 * @param {string} [data.title] - Page title
 * @param {string} [data.url] - Page URL
 * @param {string} [data.favicon] - Favicon URL
 * @param {Array<Object>} [data.chunks] - Array of chunk objects
 * @param {string|null} [data.selectedChunkId] - Currently selected chunk ID
 * @param {number} [data.timestamp] - Unix timestamp (defaults to now)
 * 
 * EXAMPLE USAGE:
 * setPageState({
 *   title: "My Page",
 *   url: "https://example.com",
 *   chunks: [...],
 *   selectedChunkId: null
 * });
 */
export function setPageState(data) {
  pageState.title = data.title || '';
  pageState.url = data.url || '';
  pageState.favicon = data.favicon || '';
  pageState.chunks = Array.isArray(data.chunks) ? data.chunks : [];
  pageState.selectedChunkId = data.selectedChunkId || null;
  pageState.timestamp = data.timestamp || Date.now();
}

/**
 * Clears all page state, resetting it to empty defaults.
 * 
 * Used when starting a new capture session or when the user wants to
 * discard the current page capture.
 * 
 * EXAMPLE USAGE:
 * clearPageState(); // Resets pageState to initial empty state
 */
export function clearPageState() {
  setPageState({ title: '', url: '', favicon: '', chunks: [], selectedChunkId: null, timestamp: 0 });
}

/**
 * Updates the selected chunk ID in pageState.
 * 
 * Used when a user clicks on a specific chunk in the UI to focus
 * retrieval on that section of the page.
 * 
 * @param {string|null} id - The chunk ID to select, or null to deselect
 * 
 * EXAMPLE USAGE:
 * selectChunkById('chunk-3'); // Focus on 3rd chunk
 * selectChunkById(null);      // Clear selection, use whole page
 */
export function selectChunkById(id) {
  pageState.selectedChunkId = id || null;
}


