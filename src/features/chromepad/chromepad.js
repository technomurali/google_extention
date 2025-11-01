// =============================================================================
// CHROMEPAD - Simple Notepad Feature (Phase 1 MVP)
// =============================================================================
// Responsibilities:
// - Local storage CRUD for notes
// - Render list bubble and inline editor bubble
// - Debounced auto-save, rename, delete
// - Integrates with sidepanel via exported handlers
//
// CONFIGURATION:
// - HOVER_PREVIEW_LINES: Number of lines to show in tooltip (default: 3)
//   Change line 120 to adjust (e.g., 2, 4, 5, etc.)
// =============================================================================

import { appendMessage, scrollToBottom, addExternalContext } from '../../ui/ui.js';
import { SELECTORS } from '../../core/constants.js';
import { debounce } from '../../core/utils.js';
import { logger } from '../../core/logger.js';
import { proofreadText, rewriteText, generateTextFromPrompt } from '../../services/ai_editing.js';
import { translateText } from '../../services/translation.js';
import { renderMarkdown } from '../../services/markdown.js';
import { getSettings } from '../../services/settings.js';

const log = logger.create('ChromePad');

// User guide note identifier (protected note that cannot be edited/deleted)
const USER_GUIDE_NOTE_NAME = 'iChrome_User_Guide.md';
const USER_GUIDE_FILE_PATH = 'docs/USER_GUIDE.md';

// Track if ChromePad list is already shown to prevent duplicates
let chromePadListVisible = false;

// Single-bubble lifecycle management
let currentChromePadBubble = null;
let isChromePadTransitioning = false;

function cleanupCurrentBubble() {
  // Also cleanup any active tooltips before removing bubble
  try { cleanupAllTooltips && cleanupAllTooltips(); } catch {}
  try {
    if (currentChromePadBubble && currentChromePadBubble.parentElement) {
      currentChromePadBubble.parentElement.removeChild(currentChromePadBubble);
    }
  } catch (err) {
    try { log.warn('ChromePad bubble cleanup error:', err); } catch {}
  } finally {
    currentChromePadBubble = null;
  }
}

try {
  window.addEventListener('beforeunload', () => {
    cleanupCurrentBubble();
    chromePadListVisible = false;
  });
} catch {}

// -------------------------------------------------------------
// Tooltip management (prevent orphaned preview tooltips)
// -------------------------------------------------------------
let activeTooltips = new Set();

function removeTooltip(tooltip) {
  if (!tooltip) return;
  try {
    if (tooltip.parentElement) {
      // fade out, then remove
      try { tooltip.style.opacity = '0'; } catch {}
      setTimeout(() => {
        try { if (tooltip.parentElement) tooltip.parentElement.removeChild(tooltip); } catch {}
        try { activeTooltips.delete(tooltip); } catch {}
      }, 200);
    } else {
      try { activeTooltips.delete(tooltip); } catch {}
    }
  } catch (err) {
    try { activeTooltips.delete(tooltip); } catch {}
  }
}

function cleanupAllTooltips() {
  try {
    activeTooltips.forEach((tooltip) => {
      try { if (tooltip && tooltip.parentElement) tooltip.parentElement.removeChild(tooltip); } catch {}
    });
  } catch {}
  try { activeTooltips.clear(); } catch {}
}

// -------------------------------------------------------------
// Processing animation (Option 2: Pulsing Glow)
// -------------------------------------------------------------
let pulsingStylesInstalled = false;
function installPulsingStyles() {
  if (pulsingStylesInstalled) return;
  pulsingStylesInstalled = true;
  const style = document.createElement('style');
  style.setAttribute('data-chromepad-pulsing', '');
  style.textContent = `
    @keyframes chromepad-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.20); }
      50%       { box-shadow: 0 0 0 4px rgba(255,255,255,0.32); }
    }
    .chromepad-pulsing {
      animation: chromepad-pulse 1.8s ease-in-out infinite;
      position: relative;
      border-radius: 12px;
    }
  `;
  document.head.appendChild(style);
}

function startPulsing(bubbleEl) {
  try {
    installPulsingStyles();
    if (!bubbleEl) return;
    bubbleEl.classList.add('chromepad-pulsing');
  } catch {}
}

function stopPulsing(bubbleEl) {
  try {
    if (!bubbleEl) return;
    bubbleEl.classList.remove('chromepad-pulsing');
  } catch {}
}

// -------------------------------------------------------------
// Export helpers (strip markdown + download)
// -------------------------------------------------------------
/**
 * Strips all markdown formatting from text, returning plain text
 * Handles: headers, bold/italic, links/images, code, lists, blockquotes,
 * tables, strikethrough, task lists, horizontal rules, HTML tags, escapes.
 * @param {string} text
 * @returns {string}
 */
function stripMarkdown(text) {
  let result = String(text || '').trim();
  if (!result) return '';

  // Fenced code blocks (``` or ~~~) - keep inner content
  result = result.replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').replace(/```/g, ''));
  result = result.replace(/~~~[\s\S]*?~~~/g, (m) => m.replace(/~~~\w*\n?/g, '').replace(/~~~/g, ''));

  // Inline code
  result = result.replace(/`([^`]+)`/g, '$1');

  // Images ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // Reference-style links [text][ref] and their definitions
  result = result.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  result = result.replace(/^\s*\[[^\]]+\]:\s+.+$/gm, '');

  // Headers
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '$1');

  // Bold, italic, strikethrough
  result = result.replace(/\*\*([^\*]+)\*\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  result = result.replace(/\*([^\*]+)\*/g, '$1');
  result = result.replace(/_([^_]+)_/g, '$1');
  result = result.replace(/~~([^~]+)~~/g, '$1');

  // Blockquotes
  result = result.replace(/^>\s+(.+)$/gm, '$1');

  // Lists (unordered, ordered, task)
  result = result.replace(/^\s*[-*+]\s+(.+)$/gm, '$1');
  result = result.replace(/^\s*\d+\.\s+(.+)$/gm, '$1');
  result = result.replace(/^\s*-\s+\[[x\s]\]\s+(.+)$/gim, '$1');

  // Horizontal rules
  result = result.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');

  // Tables (basic cleanup)
  result = result.replace(/^\s*\|(.+)\|\s*$/gm, '$1');
  result = result.replace(/\|/g, ' ');
  result = result.replace(/^[\s]*[-:]+[\s]*$/gm, '');

  // HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Escapes and whitespace
  result = result.replace(/\\([\\`*_{}\[\]()#+\-.!|])/g, '$1');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/[ \t]+/g, ' ');
  result = result.replace(/^[ \t]+/gm, '');
  result = result.replace(/[ \t]+$/gm, '');

  return result.trim();
}

/**
 * Triggers browser download of text content as a file
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
function downloadFile(content, filename, mimeType = 'text/plain') {
  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    if (link.parentElement) link.parentElement.removeChild(link);
    URL.revokeObjectURL(url);
    try { log.info('Downloaded file:', filename); } catch {}
  } catch (err) {
    try { log.error('Download failed:', err); } catch {}
    alert(`Failed to download file: ${err && err.message ? err.message : String(err)}`);
  }
}

/**
 * Exports a note as .md (markdown) or .txt (plain text)
 * OK = Plain Text (.txt), Cancel = Markdown (.md)
 * @param {{name: string, content: string}} note
 */
async function exportNote(note) {
  if (!note) return;

  // Prefer the note's explicit format or infer from name/content
  const preferred = detectNoteType(note.content, note.format, note.name);
  let isPlainText = false;
  if (preferred && preferred.type === 'md') {
    const userChoseMd = confirm(
      `Export "${note.name || 'Untitled'}":\n\n` +
      `OK = Markdown (.md) - keeps markdown syntax\n` +
      `Cancel = Plain Text (.txt) - removes markdown formatting`
    );
    isPlainText = !userChoseMd;
  } else {
    const userChoseTxt = confirm(
      `Export "${note.name || 'Untitled'}":\n\n` +
      `OK = Plain Text (.txt) - removes markdown formatting\n` +
      `Cancel = Markdown (.md) - keeps markdown syntax`
    );
    isPlainText = !!userChoseTxt;
  }
  const extension = isPlainText ? 'txt' : 'md';

  // Safe filename
  const safeName = String(note.name || 'note')
    .replace(/[<>:\"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim() || 'note';
  const filename = `${safeName}.${extension}`;

  let content = String(note.content || '');
  if (isPlainText) content = stripMarkdown(content);

  const mimeType = isPlainText ? 'text/plain' : 'text/markdown';
  downloadFile(content, filename, mimeType);
}

// Public wrapper to reuse export pipeline from outside ChromePad
export function exportContent(name, rawMarkdown) {
  const note = { name: String(name || 'Untitled'), content: String(rawMarkdown || '') };
  return exportNote(note);
}

/**
 * Saves content as a new ChromePad note (creates and populates in one step)
 * Handles name collisions by auto-appending (2), (3), etc.
 * @param {string} name - Desired note name
 * @param {string} content - Markdown content to save
 * @returns {Promise<{id: string, name: string, content: string}>} Created note
 */
export async function saveNote(name, content) {
  try {
    const notesMap = await readNotesMap();
    
    // Generate unique name if collision exists
    let uniqueName = String(name || 'Untitled').trim() || 'Untitled';
    const existingNames = Object.values(notesMap).map(n => String(n.name || '').toLowerCase());
    let counter = 2;
    let candidateName = uniqueName;
    
    while (existingNames.includes(candidateName.toLowerCase())) {
      candidateName = `${uniqueName} (${counter})`;
      counter++;
    }
    
    // Create note with content
    const id = createId();
    const now = Date.now();
    const note = {
      id,
      name: candidateName,
      content: String(content || ''),
      createdAt: now,
      updatedAt: now
    };
    
    notesMap[id] = note;
    await writeNotesMap(notesMap);
    
    try { log.info('Saved note to ChromePad:', candidateName); } catch {}
    return note;
  } catch (err) {
    try { log.error('Failed to save note to ChromePad:', err); } catch {}
    throw err;
  }
}

// Expose on window to avoid circular imports from ui.js
try {
  window.ChromePad = window.ChromePad || {};
  window.ChromePad.exportContent = exportContent;
  window.ChromePad.saveNote = saveNote;
  window.ChromePad.renderNotesListBubble = renderNotesListBubble;
} catch {}

// -----------------------------
// Storage helpers
// -----------------------------
const STORAGE_KEY = 'chromepadNotes'; // map id -> note model

async function readNotesMap() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    const map = data && data[STORAGE_KEY] && typeof data[STORAGE_KEY] === 'object' ? data[STORAGE_KEY] : {};
    return map;
  } catch (err) {
    log.error('Failed to read notes from storage:', err);
    return {};
  }
}

async function writeNotesMap(map) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: map });
  } catch (err) {
    log.error('Failed to write notes to storage:', err);
  }
}

function createId() {
  return `np_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sortNotesArray(arr) {
  return arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Checks if a note is the protected user guide note
 * @param {Object} note - Note object with name property
 * @returns {boolean}
 */
function isUserGuideNote(note) {
  if (!note || !note.name) return false;
  return String(note.name).trim() === USER_GUIDE_NOTE_NAME;
}

/**
 * Initializes the user guide note in ChromePad if it doesn't exist
 * Reads the guide content from the docs file and creates a note
 */
async function initializeUserGuideNote() {
  try {
    const notesMap = await readNotesMap();
    
    // Check if user guide note already exists
    const existingGuide = Object.values(notesMap).find(n => isUserGuideNote(n));
    if (existingGuide) {
      return; // Already exists
    }
    
    // Fetch the user guide content
    const url = chrome.runtime.getURL(USER_GUIDE_FILE_PATH);
    const response = await fetch(url);
    
    if (!response.ok) {
      log.warn('Could not load user guide file:', response.status);
      return;
    }
    
    const guideContent = await response.text();
    
    // Create the user guide note
    const guideId = createId();
    const now = Date.now();
    const guideNote = {
      id: guideId,
      name: USER_GUIDE_NOTE_NAME,
      content: guideContent,
      createdAt: now,
      updatedAt: now
    };
    
    notesMap[guideId] = guideNote;
    await writeNotesMap(notesMap);
    
    log.info('User guide note initialized in ChromePad');
  } catch (error) {
    log.error('Failed to initialize user guide note:', error);
  }
}

/**
 * Finds the user guide note ID (used to open it from settings)
 * @returns {Promise<string|null>} User guide note ID or null if not found
 */
export async function findUserGuideNoteId() {
  try {
    const notesMap = await readNotesMap();
    const guideNote = Object.values(notesMap).find(n => isUserGuideNote(n));
    return guideNote ? guideNote.id : null;
  } catch (error) {
    log.error('Failed to find user guide note:', error);
    return null;
  }
}

// -----------------------------
// File Import Helpers
// -----------------------------

/**
 * Validates imported file against size and type restrictions
 * @param {File} file - File object to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateImportFile(file) {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_EXTENSIONS = ['.txt', '.md'];

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`
    };
  }

  // Check file extension
  const fileName = String(file.name || '').toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExtension) {
    return {
      valid: false,
      error: `File "${file.name}" is not a supported format. Only .txt and .md files are allowed.`
    };
  }

  return { valid: true };
}

/**
 * Generates a unique note name by checking existing notes and appending timestamp if needed
 * @param {string} baseName - Base name from filename
 * @param {Object} notesMap - Current notes map
 * @returns {string} Unique note name
 */
function getUniqueNoteName(baseName, notesMap) {
  const existingNames = Object.values(notesMap).map(n => String(n.name || '').toLowerCase());
  let candidateName = baseName;
  let counter = 2;

  // Check if name exists (case-insensitive)
  while (existingNames.includes(candidateName.toLowerCase())) {
    candidateName = `${baseName} (${counter})`;
    counter++;
  }

  return candidateName;
}

/**
 * Reads file content as text with UTF-8 encoding
 * @param {File} file - File to read
 * @returns {Promise<string>} File content
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const content = String(event.target.result || '');
        resolve(content);
      } catch (err) {
        reject(new Error(`Failed to read file content: ${err.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file "${file.name}"`));
    };

    // Read as UTF-8 text (industry standard)
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Handles importing multiple files and creating notes
 * @param {File[]} files - Array of files to import
 * @param {HTMLElement} listElement - List DOM element for status updates
 * @param {Function} refreshListCallback - Callback to refresh the list view
 */
async function handleFileImport(files, listElement, refreshListCallback) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  // Show importing indicator
  const statusMsg = document.createElement('div');
  statusMsg.style.textAlign = 'center';
  statusMsg.style.padding = '12px';
  statusMsg.style.fontSize = '12px';
  statusMsg.style.opacity = '0.7';
  statusMsg.textContent = `Importing ${files.length} file${files.length > 1 ? 's' : ''}...`;
  listElement.appendChild(statusMsg);

  // Get current notes map once
  const notesMap = await readNotesMap();

  for (const file of files) {
    try {
      // Validate file
      const validation = validateImportFile(file);
      if (!validation.valid) {
        results.failed++;
        results.errors.push(validation.error);
        log.warn('File validation failed:', validation.error);
        continue;
      }

      // Read file content
      const content = await readFileAsText(file);

      // Extract name from filename (remove extension) and capture format
      const originalName = String(file.name || 'Imported');
      const baseName = originalName
        .replace(/\.(txt|md)$/i, '')
        .trim() || 'Imported';
      const extMatch = /\.(txt|md)$/i.exec(originalName);
      const detectedFormat = extMatch ? extMatch[1].toLowerCase() : undefined;

      // Get unique name
      const uniqueName = getUniqueNoteName(baseName, notesMap);

      // Create note
      const id = createId();
      const now = Date.now();
      const note = {
        id,
        name: uniqueName,
        content: content,
        // Preserve original import format when available ("md" or "txt")
        format: detectedFormat,
        createdAt: now,
        updatedAt: now
      };

      // Add to map
      notesMap[id] = note;
      
      results.success++;
      log.info('Imported file:', file.name, '→', uniqueName);

    } catch (err) {
      results.failed++;
      const errorMsg = `Failed to import "${file.name}": ${err.message}`;
      results.errors.push(errorMsg);
      log.error('File import error:', err);
    }
  }

  // Save all imported notes at once
  if (results.success > 0) {
    await writeNotesMap(notesMap);
  }

  // Remove status message
  if (statusMsg.parentElement) {
    statusMsg.remove();
  }

  // Refresh list to show imported notes
  await refreshListCallback();

  // Show results if there were errors
  if (results.failed > 0) {
    const errorSummary = results.errors.slice(0, 3).join('\n');
    const extraErrors = results.errors.length > 3 ? `\n...and ${results.errors.length - 3} more errors.` : '';
    alert(`Import completed:\n✓ ${results.success} succeeded\n✗ ${results.failed} failed\n\n${errorSummary}${extraErrors}`);
  }

  // Scroll to top to show newly imported notes
  scrollToBottom();
}

// -----------------------------
// Public API: data
// -----------------------------
export async function getAllNotes() {
  const map = await readNotesMap();
  return sortNotesArray(Object.values(map));
}

export async function createNote(initialName = 'Untitled') {
  const id = createId();
  const now = Date.now();
  const note = { id, name: String(initialName || 'Untitled'), content: '', createdAt: now, updatedAt: now };
  const map = await readNotesMap();
  map[id] = note;
  await writeNotesMap(map);
  return note;
}

export async function updateNote(noteId, fields) {
  if (!noteId) return null;
  const map = await readNotesMap();
  const existing = map[noteId];
  if (!existing) return null;
  
  // Prevent updates to user guide note (name and content)
  if (isUserGuideNote(existing)) {
    log.warn('Attempted to update protected user guide note');
    return existing; // Return unchanged note
  }
  
  const updated = { ...existing, ...fields, updatedAt: Date.now() };
  map[noteId] = updated;
  await writeNotesMap(map);
  return updated;
}

export async function deleteNote(noteId) {
  if (!noteId) return false;
  const map = await readNotesMap();
  const note = map[noteId];
  if (!note) return false;
  
  // Prevent deletion of user guide note
  if (isUserGuideNote(note)) {
    log.warn('Attempted to delete protected user guide note');
    return false;
  }
  
  delete map[noteId];
  await writeNotesMap(map);
  return true;
}

export async function getNoteById(noteId) {
  const map = await readNotesMap();
  return map[noteId] || null;
}

// -----------------------------
// UI rendering
// -----------------------------
function formatDate(ts) {
  try {
    const d = new Date(ts || Date.now());
    return d.toLocaleString();
  } catch {
    return String(ts || '');
  }
}

function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - (timestamp || now);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return formatDate(timestamp);
}

/**
 * Detects if note content is markdown or plain text
 * @param {string} content - Note content to analyze
 * @returns {{isMarkdown: boolean, type: string, typeLabel: string, icon: string}}
 */
function detectNoteType(content, preferredFormat, noteName) {
  try {
    const text = String(content || '').trim();
    const pref = String(preferredFormat || '').toLowerCase();
    const name = String(noteName || '');
    // Prefer explicit format when provided
    if (pref === 'md') {
      return { isMarkdown: true, type: 'md', typeLabel: 'Markdown File', icon: '📝' };
    }
    if (pref === 'txt') {
      return { isMarkdown: false, type: 'txt', typeLabel: 'Text File', icon: '📄' };
    }

    // Next, infer from filename extension if available
    const lowerName = name.toLowerCase();
    if (lowerName.endsWith('.md')) {
      return { isMarkdown: true, type: 'md', typeLabel: 'Markdown File', icon: '📝' };
    }
    if (lowerName.endsWith('.txt')) {
      return { isMarkdown: false, type: 'txt', typeLabel: 'Text File', icon: '📄' };
    }
    
    // If empty, default to text file
    if (!text) {
      return {
        isMarkdown: false,
        type: 'txt',
        typeLabel: 'Text File',
        icon: '📄'
      };
    }

    // Common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s+.+$/m,           // Headers (# ## ###)
      /^\s*[-*+]\s+.+$/m,          // Unordered lists (- * +)
      /^\s*\d+\.\s+.+$/m,          // Ordered lists (1. 2. 3.)
      /^\s*>/m,                    // Blockquotes (>)
      /\[.+\]\(.+\)/,              // Links [text](url)
      /!\[.+\]\(.+\)/,             // Images ![alt](url)
      /(\*\*|__).+\1/,             // Bold **text** or __text__
      /(\*|_).+\1/,                // Italic *text* or _text_
      /```[\s\S]*?```/,            // Code blocks ```
      /`[^`]+`/,                   // Inline code `code`
      /^---+$/m,                   // Horizontal rules (---)
      /^\*\*\*+$/m,                // Horizontal rules (***)
      /^\|\s*.+\s*\|/,             // Tables (| col |)
    ];

    // Check if content matches markdown patterns (filter out any undefined patterns for safety)
    const hasMarkdown = markdownPatterns
      .filter(pattern => pattern && typeof pattern.test === 'function')
      .some(pattern => {
        try {
          return pattern.test(text);
        } catch {
          return false;
        }
      });

    if (hasMarkdown) {
      return {
        isMarkdown: true,
        type: 'md',
        typeLabel: 'Markdown File',
        icon: '📝'
      };
    }

    return {
      isMarkdown: false,
      type: 'txt',
      typeLabel: 'Text File',
      icon: '📄'
    };
  } catch (error) {
    // Fallback to text file if any error occurs
    try { log.warn('Error detecting note type:', error); } catch {}
    return {
      isMarkdown: false,
      type: 'txt',
      typeLabel: 'Text File',
      icon: '📄'
    };
  }
}

// Configuration: Number of lines to show in hover preview
const HOVER_PREVIEW_LINES = 3; // Configurable: change to 2, 4, 5, etc.

function getPreviewLines(text, maxLines = HOVER_PREVIEW_LINES) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  
  // Split by newlines, take first N lines
  const lines = clean.split('\n').slice(0, maxLines);
  
  // Join and limit total length to ~200 chars for tooltip
  let preview = lines.join('\n');
  if (preview.length > 200) {
    preview = preview.slice(0, 197) + '...';
  }
  
  return preview;
}

export async function renderNotesListBubble() {
  // Initialize user guide note if it doesn't exist
  await initializeUserGuideNote();
  // Prevent duplicate lists in the same session
  if (chromePadListVisible) {
    log.debug('ChromePad list already visible, skipping duplicate render');
    return;
  }
  chromePadListVisible = true;

  // Ensure only one ChromePad bubble exists at any time
  cleanupCurrentBubble();

  // Load tooltip settings
  let tooltipsEnabled = true;
  try {
    const helpSettings = await getSettings('help');
    tooltipsEnabled = helpSettings && helpSettings.showTooltips !== false;
  } catch (err) {
    log.warn('Failed to load tooltip settings, defaulting to enabled:', err);
  }

  const body = appendMessage('', 'ai');
  body.innerHTML = '';
  body.style.padding = '8px';

  // Hide speech and translate buttons, add + New button in their place
  const bubble = body.parentElement;
  if (bubble) {
    // Track current bubble for lifecycle management
    currentChromePadBubble = bubble;
    // Reduce top padding to reclaim space since we hide native header controls
    bubble.style.paddingTop = '8px';
    // Hide unwanted buttons
    const speechBtn = bubble.querySelector('.msg-speech-btn');
    const speechStopBtn = bubble.querySelector('.msg-speech-stop-btn');
    const translateBtn = bubble.querySelector('.msg-translate-btn');
    const exportBtn = bubble.querySelector('.msg-export-btn');
    const saveBtn = bubble.querySelector('.msg-save-chromepad-btn');
    if (speechBtn) speechBtn.style.display = 'none';
    if (speechStopBtn) speechStopBtn.style.display = 'none';
    if (translateBtn) translateBtn.style.display = 'none';
    if (exportBtn) exportBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';

    // Add + New button in top-right (where translate button was)
    const newBtn = document.createElement('button');
    newBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>`;
    newBtn.style.position = 'absolute';
    newBtn.style.top = '6px';
    newBtn.style.right = '78px'; // Shifted left to make room for import button
    newBtn.style.width = '30px';
    newBtn.style.height = '30px';
    newBtn.style.padding = '0';
    newBtn.style.display = 'inline-flex';
    newBtn.style.alignItems = 'center';
    newBtn.style.justifyContent = 'center';
    newBtn.style.background = 'rgba(255,255,255,0.15)';
    newBtn.style.border = '1px solid rgba(255,255,255,0.25)';
    newBtn.style.borderRadius = '6px';
    newBtn.style.cursor = 'pointer';
    newBtn.style.transition = 'all 0.15s ease';
    newBtn.title = 'Create new note';

    newBtn.addEventListener('click', async () => {
      try { cleanupAllTooltips(); } catch {}
      const note = await createNote('Untitled');
      await renderEditorBubble(note.id);
    });

    // Hover effect
    newBtn.addEventListener('mouseenter', () => {
      newBtn.style.background = 'rgba(255,255,255,0.25)';
      newBtn.style.borderColor = 'rgba(255,255,255,0.35)';
    });
    newBtn.addEventListener('mouseleave', () => {
      newBtn.style.background = 'rgba(255,255,255,0.15)';
      newBtn.style.borderColor = 'rgba(255,255,255,0.25)';
    });

    // Add Import button next to + New
    const importBtn = document.createElement('button');
    importBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>`;
    importBtn.style.position = 'absolute';
    importBtn.style.top = '6px';
    importBtn.style.right = '42px'; // Where translate button was originally
    importBtn.style.width = '30px';
    importBtn.style.height = '30px';
    importBtn.style.padding = '0';
    importBtn.style.display = 'inline-flex';
    importBtn.style.alignItems = 'center';
    importBtn.style.justifyContent = 'center';
    importBtn.style.background = 'rgba(255,255,255,0.15)';
    importBtn.style.border = '1px solid rgba(255,255,255,0.25)';
    importBtn.style.borderRadius = '6px';
    importBtn.style.cursor = 'pointer';
    importBtn.style.transition = 'all 0.15s ease';
    importBtn.title = 'Import text or markdown files';

    // Hidden file input for import
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.md';
    fileInput.multiple = true;
    fileInput.style.display = 'none';

    importBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // Hover effect
    importBtn.addEventListener('mouseenter', () => {
      importBtn.style.background = 'rgba(255,255,255,0.25)';
      importBtn.style.borderColor = 'rgba(255,255,255,0.35)';
    });
    importBtn.addEventListener('mouseleave', () => {
      importBtn.style.background = 'rgba(255,255,255,0.15)';
      importBtn.style.borderColor = 'rgba(255,255,255,0.25)';
    });

    // Handle file import
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      await handleFileImport(files, list, refreshList);

      // Reset file input for next import
      fileInput.value = '';
    });

    bubble.appendChild(newBtn);
    bubble.appendChild(importBtn);
    bubble.appendChild(fileInput);
  }

  // Simple header with just title
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.alignItems = 'center';
  headerRow.style.marginBottom = '8px';

  const title = document.createElement('div');
  title.textContent = 'ChromePad';
  title.style.fontWeight = '600';
  title.style.fontSize = '14px';

  headerRow.appendChild(title);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '6px';

  async function refreshList() {
    // Ensure any stray tooltips are removed before re-rendering
    try { cleanupAllTooltips(); } catch {}
    list.innerHTML = '';
    const notes = await getAllNotes();
    
    if (!notes.length) {
      const empty = document.createElement('div');
      empty.style.textAlign = 'center';
      empty.style.padding = '20px 12px';
      empty.style.opacity = '0.6';
      empty.style.fontSize = '13px';
      empty.textContent = 'No notes yet. Click "+ New" to start.';
      list.appendChild(empty);
      return;
    }

    notes.forEach((n) => {
      // Compact row design - single line only
      const row = document.createElement('div');
      row.style.border = '1px solid rgba(255,255,255,0.15)';
      row.style.borderRadius = '8px';
      row.style.padding = '8px';
      row.style.background = 'rgba(255,255,255,0.05)';
      row.style.transition = 'background 0.15s ease';
      row.style.cursor = 'pointer';

      // Create custom styled tooltip (for filename and type)
      let tooltip = null;
      const typeInfo = detectNoteType(n.content, n.format, n.name);
      if (n.content && tooltipsEnabled) {
        const previewText = getPreviewLines(n.content);
        if (previewText) {
          tooltip = document.createElement('div');
          // Add type label at the top of tooltip
          const typeLabel = document.createElement('div');
          typeLabel.textContent = typeInfo.typeLabel;
          typeLabel.style.fontWeight = '600';
          typeLabel.style.marginBottom = '4px';
          typeLabel.style.opacity = '0.9';
          typeLabel.style.borderBottom = '1px solid rgba(255,255,255,0.2)';
          typeLabel.style.paddingBottom = '4px';
          
          const contentPreview = document.createElement('div');
          contentPreview.textContent = previewText;
          contentPreview.style.marginTop = '4px';
          
          tooltip.appendChild(typeLabel);
          tooltip.appendChild(contentPreview);
          try { activeTooltips.add(tooltip); } catch {}
          tooltip.style.position = 'fixed'; // Fixed to follow cursor
          tooltip.style.padding = '8px';
          tooltip.style.borderRadius = '8px';
          tooltip.style.border = '1px solid rgba(255,255,255,0.25)';
          tooltip.style.background = '#000'; // Solid black
          tooltip.style.color = '#fff';
          tooltip.style.fontSize = '12px';
          tooltip.style.lineHeight = '1.4';
          tooltip.style.whiteSpace = 'pre-wrap';
          tooltip.style.wordBreak = 'break-word';
          tooltip.style.zIndex = '1000';
          tooltip.style.opacity = '0';
          tooltip.style.pointerEvents = 'auto';
          tooltip.style.transition = 'opacity 0.2s ease';
          tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
          tooltip.style.maxWidth = '300px'; // Limit width for readability
          tooltip.style.paddingRight = '24px';

          // Add manual close button (×)
          const closeBtn = document.createElement('button');
          closeBtn.textContent = '×';
          closeBtn.setAttribute('aria-label', 'Close preview');
          closeBtn.style.position = 'absolute';
          closeBtn.style.top = '4px';
          closeBtn.style.right = '6px';
          closeBtn.style.width = '18px';
          closeBtn.style.height = '18px';
          closeBtn.style.lineHeight = '16px';
          closeBtn.style.border = 'none';
          closeBtn.style.borderRadius = '3px';
          closeBtn.style.background = 'rgba(255,255,255,0.12)';
          closeBtn.style.color = '#fff';
          closeBtn.style.cursor = 'pointer';
          closeBtn.style.fontSize = '14px';
          closeBtn.style.padding = '0';
          closeBtn.style.display = 'inline-flex';
          closeBtn.style.alignItems = 'center';
          closeBtn.style.justifyContent = 'center';
          closeBtn.title = 'Close preview';
          closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeTooltip(tooltip);
          });
          tooltip.appendChild(closeBtn);

          // Keep tooltip alive when hovered, close on leaving it
          let tooltipHovered = false;
          tooltip.addEventListener('mouseenter', () => { tooltipHovered = true; });
          tooltip.addEventListener('mouseleave', () => {
            tooltipHovered = false;
            removeTooltip(tooltip);
          });
        }
      }

      // Row hover effect (no tooltip)
      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(255,255,255,0.1)';
      });

      row.addEventListener('mouseleave', () => {
        row.style.background = 'rgba(255,255,255,0.05)';
      });

      // Single line: icon + title + type + timestamp + actions
      const mainRow = document.createElement('div');
      mainRow.style.display = 'flex';
      mainRow.style.alignItems = 'center';
      mainRow.style.gap = '8px';

      // Use typeInfo already detected above
      
      // Icon element
      const iconElement = document.createElement('span');
      iconElement.textContent = typeInfo.icon;
      iconElement.style.fontSize = '16px';
      iconElement.style.lineHeight = '1';
      iconElement.style.flexShrink = '0';
      // Removed title attribute to avoid duplicate tooltips (balloon tooltip only)
      
      // Title container with icon
      const titleContainer = document.createElement('div');
      titleContainer.style.display = 'flex';
      titleContainer.style.alignItems = 'center';
      titleContainer.style.gap = '6px';
      titleContainer.style.flex = '1';
      titleContainer.style.minWidth = '0'; // Allow flex child to shrink
      // Removed title attribute to avoid duplicate tooltips (balloon tooltip only)

      const noteTitle = document.createElement('div');
      noteTitle.textContent = n.name || 'Untitled';
      noteTitle.style.fontWeight = '600';
      noteTitle.style.fontSize = '13px';
      noteTitle.style.overflow = 'hidden';
      noteTitle.style.textOverflow = 'ellipsis';
      noteTitle.style.whiteSpace = 'nowrap';
      noteTitle.style.flex = '1';
      noteTitle.style.minWidth = '0'; // Allow text to truncate

      // Type badge
      const typeBadge = document.createElement('span');
      typeBadge.textContent = `.${typeInfo.type}`;
      typeBadge.style.fontSize = '10px';
      typeBadge.style.opacity = '0.6';
      typeBadge.style.fontWeight = '500';
      typeBadge.style.flexShrink = '0';
      // Removed title attribute to avoid duplicate tooltips (balloon tooltip only)

      titleContainer.appendChild(iconElement);
      titleContainer.appendChild(noteTitle);
      titleContainer.appendChild(typeBadge);

      // Tooltip on title container hover (includes icon and type info in tooltip)
      if (tooltip) {
        titleContainer.addEventListener('mouseenter', () => {
          try { cleanupAllTooltips(); } catch {}
          document.body.appendChild(tooltip);
          setTimeout(() => {
            try { tooltip.style.opacity = '1'; } catch {}
          }, 10);
        });

        titleContainer.addEventListener('mousemove', (e) => {
          if (tooltip && tooltip.parentElement) {
            // Position above cursor
            const offsetX = 10;
            const offsetY = -10;
            tooltip.style.left = `${e.clientX + offsetX}px`;
            tooltip.style.top = `${e.clientY + offsetY - tooltip.offsetHeight}px`;
          }
        });

        titleContainer.addEventListener('mouseleave', () => {
          try { if (typeof tooltipHovered !== 'undefined' && tooltipHovered) return; } catch {}
          removeTooltip(tooltip);
        });
      }

      const timestamp = document.createElement('div');
      timestamp.textContent = getRelativeTime(n.updatedAt);
      timestamp.style.fontSize = '11px';
      timestamp.style.opacity = '0.5';
      timestamp.style.whiteSpace = 'nowrap';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '4px';

      // Preview button (Eye icon SVG)
      const previewBtn = document.createElement('button');
      previewBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>`;
      previewBtn.style.background = 'none';
      previewBtn.style.border = 'none';
      previewBtn.style.cursor = 'pointer';
      previewBtn.style.padding = '2px 4px';
      previewBtn.style.opacity = '0.6';
      previewBtn.style.transition = 'opacity 0.15s ease';
      previewBtn.style.display = 'inline-flex';
      previewBtn.style.alignItems = 'center';
      previewBtn.style.justifyContent = 'center';
      previewBtn.title = 'Preview';
      
      // Hide content tooltip when hovering button
      previewBtn.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
        previewBtn.style.opacity = '1';
        if (tooltip && tooltip.parentElement) {
          tooltip.style.opacity = '0';
          setTimeout(() => {
            if (tooltip && tooltip.parentElement) {
              document.body.removeChild(tooltip);
            }
          }, 200);
        }
      });
      previewBtn.addEventListener('mouseleave', () => previewBtn.style.opacity = '0.6');
      previewBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { cleanupAllTooltips(); } catch {}
        // User guide always opens in preview mode
        await renderEditorBubble(n.id, true); // Always open in preview mode (or use isGuide to force guide to preview)
      });

      const editBtn = document.createElement('button');
      editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      </svg>`;
      editBtn.style.background = 'none';
      editBtn.style.border = 'none';
      editBtn.style.cursor = 'pointer';
      editBtn.style.padding = '2px 4px';
      editBtn.style.opacity = '0.6';
      editBtn.style.transition = 'opacity 0.15s ease';
      editBtn.style.display = 'inline-flex';
      editBtn.style.alignItems = 'center';
      editBtn.style.justifyContent = 'center';
      editBtn.title = 'Edit';
      
      // Hide content tooltip when hovering button
      editBtn.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
        editBtn.style.opacity = '1';
        if (tooltip && tooltip.parentElement) {
          tooltip.style.opacity = '0';
          setTimeout(() => {
            if (tooltip && tooltip.parentElement) {
              document.body.removeChild(tooltip);
            }
          }, 200);
        }
      });
      editBtn.addEventListener('mouseleave', () => editBtn.style.opacity = '0.6');
      
      // Disable edit button for user guide note
      const isGuide = isUserGuideNote(n);
      if (isGuide) {
        editBtn.disabled = true;
        editBtn.style.opacity = '0.3';
        editBtn.style.cursor = 'not-allowed';
        editBtn.title = 'Edit (protected note)';
      } else {
        editBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try { cleanupAllTooltips(); } catch {}
          await renderEditorBubble(n.id);
        });
      }

      const delBtn = document.createElement('button');
      delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/>
        <path d="M14 11v6"/>
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
      </svg>`;
      delBtn.style.background = 'none';
      delBtn.style.border = 'none';
      delBtn.style.cursor = 'pointer';
      delBtn.style.padding = '2px 4px';
      delBtn.style.opacity = '0.6';
      delBtn.style.transition = 'opacity 0.15s ease';
      delBtn.style.display = 'inline-flex';
      delBtn.style.alignItems = 'center';
      delBtn.style.justifyContent = 'center';
      delBtn.title = 'Delete';
      
      // Hide content tooltip when hovering button
      delBtn.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
        delBtn.style.opacity = '1';
        if (tooltip && tooltip.parentElement) {
          tooltip.style.opacity = '0';
          setTimeout(() => {
            if (tooltip && tooltip.parentElement) {
              document.body.removeChild(tooltip);
            }
          }, 200);
        }
      });
      delBtn.addEventListener('mouseleave', () => delBtn.style.opacity = '0.6');
      
      // Disable delete button for user guide note
      if (isGuide) {
        delBtn.disabled = true;
        delBtn.style.opacity = '0.3';
        delBtn.style.cursor = 'not-allowed';
        delBtn.title = 'Delete (protected note)';
      } else {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ok = confirm(`Delete "${n.name}"?`);
          if (!ok) return;
          await deleteNote(n.id);
          await refreshList();
          scrollToBottom();
        });
      }

      // Ask iChrome (add note as context pill)
      const askBtn = document.createElement('button');
      askBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a4 4 0 0 1-4 4H9l-4 4v-4H5a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4z"/>
      </svg>`;
      askBtn.style.background = 'none';
      askBtn.style.border = 'none';
      askBtn.style.cursor = 'pointer';
      askBtn.style.padding = '2px 4px';
      askBtn.style.opacity = '0.6';
      askBtn.style.transition = 'opacity 0.15s ease';
      askBtn.style.display = 'inline-flex';
      askBtn.style.alignItems = 'center';
      askBtn.style.justifyContent = 'center';
      askBtn.title = 'Ask iChrome';
      askBtn.addEventListener('mouseenter', () => askBtn.style.opacity = '1');
      askBtn.addEventListener('mouseleave', () => askBtn.style.opacity = '0.6');
      askBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const label = `📄 ${n.name || 'Untitled'}`;
        const text = (n.content || '').trim();
        if (text) addExternalContext(text, label);
      });

      actions.appendChild(askBtn);
      actions.appendChild(previewBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      mainRow.appendChild(titleContainer);
      mainRow.appendChild(timestamp);
      mainRow.appendChild(actions);

      row.appendChild(mainRow);

      // Click to open
      row.addEventListener('click', async (e) => {
        if (e.target === editBtn || e.target === delBtn || e.target.closest('button')) return;
        try { cleanupAllTooltips(); } catch {}
        // User guide always opens in preview mode (read-only)
        await renderEditorBubble(n.id, isGuide); // isGuide=true forces preview mode
      });

      list.appendChild(row);
    });
  }

  body.appendChild(headerRow);
  body.appendChild(list);

  await refreshList();
  return body;
}

function countWords(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export async function renderEditorBubble(noteId, startInPreview = false) {
  // Single-bubble: remove any existing ChromePad bubble before opening editor
  cleanupCurrentBubble();
  // Hide list when opening editor
  chromePadListVisible = false;

  const note = await getNoteById(noteId);
  if (!note) {
    const err = appendMessage('Note not found.', 'ai');
    return err;
  }

  // Check if this is the protected user guide note
  const isGuide = isUserGuideNote(note);

  const body = appendMessage('', 'ai');
  body.innerHTML = '';
  body.style.padding = '8px';

  // Configure ChromePad editor bubble (hide native minimize; reuse native speech/translate UI)
  const bubble = body.parentElement;
  if (bubble) {
    // Track current bubble for lifecycle management
    currentChromePadBubble = bubble;
    // Reduce top padding to reclaim vertical space
    bubble.style.paddingTop = '8px';
    const minimizeBtn = bubble.querySelector('.msg-minimize-btn');
    if (minimizeBtn) minimizeBtn.style.display = 'none';
    // Hide native speech/stop/translate/export/save to avoid overlap; we reuse their logic via custom buttons
    const nativeSpeechBtn = bubble.querySelector('.msg-speech-btn');
    const nativeSpeechStopBtn = bubble.querySelector('.msg-speech-stop-btn');
    const nativeTranslateBtn = bubble.querySelector('.msg-translate-btn');
    const nativeExportBtn = bubble.querySelector('.msg-export-btn');
    const nativeSaveBtn = bubble.querySelector('.msg-save-chromepad-btn');
    if (nativeSpeechBtn) nativeSpeechBtn.style.display = 'none';
    if (nativeSpeechStopBtn) nativeSpeechStopBtn.style.display = 'none';
    if (nativeTranslateBtn) nativeTranslateBtn.style.display = 'none';
    if (nativeExportBtn) nativeExportBtn.style.display = 'none';
    if (nativeSaveBtn) nativeSaveBtn.style.display = 'none';
  }

  // Compact header: Back | Title + icons
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.alignItems = 'center';
  headerRow.style.justifyContent = 'flex-end';
  headerRow.style.marginBottom = '8px';

  const backBtn = document.createElement('button');
  backBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`;
  backBtn.style.background = 'none';
  backBtn.style.border = 'none';
  backBtn.style.color = 'inherit';
  backBtn.style.cursor = 'pointer';
  backBtn.style.fontSize = '12px';
  backBtn.style.opacity = '0.7';
  backBtn.style.padding = '4px';
  backBtn.title = 'Close';
  backBtn.addEventListener('mouseenter', () => backBtn.style.opacity = '1');
  backBtn.addEventListener('mouseleave', () => backBtn.style.opacity = '0.7');

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '6px';

  const saveBtn = document.createElement('button');
  saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
    <polyline points="17 21 17 13 7 13 7 21"></polyline>
    <polyline points="7 3 7 8 15 8"></polyline>
  </svg>`;
  saveBtn.style.background = 'none';
  saveBtn.style.border = 'none';
  saveBtn.style.cursor = 'pointer';
  saveBtn.style.opacity = '0.6';
  saveBtn.style.padding = '2px 4px';
  saveBtn.style.display = 'inline-flex';
  saveBtn.style.alignItems = 'center';
  saveBtn.style.justifyContent = 'center';
  saveBtn.title = 'Save';
  saveBtn.addEventListener('mouseenter', () => saveBtn.style.opacity = '1');
  saveBtn.addEventListener('mouseleave', () => saveBtn.style.opacity = '0.6');

  const delBtn = document.createElement('button');
  delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/>
    <path d="M14 11v6"/>
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
  </svg>`;
  delBtn.style.background = 'none';
  delBtn.style.border = 'none';
  delBtn.style.cursor = 'pointer';
  delBtn.style.opacity = '0.6';
  delBtn.style.padding = '2px 4px';
  delBtn.style.display = 'inline-flex';
  delBtn.style.alignItems = 'center';
  delBtn.style.justifyContent = 'center';
  delBtn.title = 'Delete';
  delBtn.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
  delBtn.addEventListener('mouseleave', () => delBtn.style.opacity = '0.6');

  // Proofread button
  const proofBtn = document.createElement('button');
  proofBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>`;
  proofBtn.style.background = 'none';
  proofBtn.style.border = 'none';
  proofBtn.style.cursor = 'pointer';
  proofBtn.style.opacity = '0.6';
  proofBtn.style.padding = '2px 4px';
  proofBtn.style.display = 'inline-flex';
  proofBtn.style.alignItems = 'center';
  proofBtn.style.justifyContent = 'center';
  proofBtn.title = 'Proofread';
  proofBtn.addEventListener('mouseenter', () => proofBtn.style.opacity = '1');
  proofBtn.addEventListener('mouseleave', () => proofBtn.style.opacity = '0.6');

  // Rewrite button with small inline menu
  const rewriteBtn = document.createElement('button');
  rewriteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9"/>
    <polyline points="3 3 3 9 9 9"/>
  </svg>`;
  rewriteBtn.style.background = 'none';
  rewriteBtn.style.border = 'none';
  rewriteBtn.style.cursor = 'pointer';
  rewriteBtn.style.opacity = '0.6';
  rewriteBtn.style.padding = '2px 4px';
  rewriteBtn.style.display = 'inline-flex';
  rewriteBtn.style.alignItems = 'center';
  rewriteBtn.style.justifyContent = 'center';
  rewriteBtn.title = 'Rewrite';
  rewriteBtn.addEventListener('mouseenter', () => rewriteBtn.style.opacity = '1');
  rewriteBtn.addEventListener('mouseleave', () => rewriteBtn.style.opacity = '0.6');

  const rewriteMenu = document.createElement('div');
  rewriteMenu.style.position = 'absolute';
  rewriteMenu.style.top = '32px';
  rewriteMenu.style.right = '8px';
  rewriteMenu.style.border = '1px solid rgba(255,255,255,0.25)';
  rewriteMenu.style.background = 'rgba(0,0,0,0.85)';
  rewriteMenu.style.color = '#fff';
  rewriteMenu.style.borderRadius = '8px';
  rewriteMenu.style.padding = '6px';
  rewriteMenu.style.display = 'none';
  rewriteMenu.style.zIndex = '50';

  function addRewriteOption(label, mode) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.display = 'block';
    btn.style.width = '100%';
    btn.style.textAlign = 'left';
    btn.style.background = 'transparent';
    btn.style.border = '0';
    btn.style.color = 'inherit';
    btn.style.cursor = 'pointer';
    btn.style.padding = '6px 8px';
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.1)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      rewriteMenu.style.display = 'none';
      startProcessing('Rewriting');
      try {
        const res = await rewriteText(contentArea.value || '', mode);
        if (res && res.ok) {
          contentArea.value = res.text || '';
          updateStats();
          await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
        }
      } finally {
        stopProcessing();
      }
    });
    rewriteMenu.appendChild(btn);
  }

  addRewriteOption('More formal', 'formal');
  addRewriteOption('More casual', 'casual');
  addRewriteOption('Shorter', 'shorter');
  addRewriteOption('Longer', 'longer');

  rewriteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const visible = rewriteMenu.style.display === 'block';
    rewriteMenu.style.display = visible ? 'none' : 'block';
  });

  document.addEventListener('click', (e) => {
    if (rewriteMenu.style.display === 'block') {
      rewriteMenu.style.display = 'none';
    }
  });

  // Read Loud button (icon-only) using speech service via custom event
  const readBtn = document.createElement('button');
  readBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
  readBtn.style.background = 'none';
  readBtn.style.border = 'none';
  readBtn.style.cursor = 'pointer';
  readBtn.style.opacity = '0.6';
  readBtn.style.padding = '2px 4px';
  readBtn.style.display = 'inline-flex';
  readBtn.style.alignItems = 'center';
  readBtn.style.justifyContent = 'center';
  readBtn.title = 'Read aloud';
  readBtn.addEventListener('mouseenter', () => readBtn.style.opacity = '1');
  readBtn.addEventListener('mouseleave', () => readBtn.style.opacity = '0.6');

  // Hidden div used as speech source (textContent)
  const speechSource = document.createElement('div');
  speechSource.style.display = 'none';
  body.appendChild(speechSource);
  readBtn.addEventListener('click', () => {
    speechSource.textContent = String(contentArea.value || '');
    // Reuse native speech service; drive state via this custom Read button
    const ev = new CustomEvent('speech-toggle', { bubbles: true, composed: true, detail: { element: speechSource, button: readBtn } });
    document.dispatchEvent(ev);
  });

  // Custom Stop button (Option B): appears beside Read when speaking; reuses native stop
  const stopBtn = document.createElement('button');
  stopBtn.innerHTML = '⏹';
  stopBtn.style.background = 'none';
  stopBtn.style.border = 'none';
  stopBtn.style.cursor = 'pointer';
  stopBtn.style.opacity = '0.6';
  stopBtn.style.padding = '2px 4px';
  stopBtn.style.display = 'none';
  stopBtn.style.alignItems = 'center';
  stopBtn.style.justifyContent = 'center';
  stopBtn.title = 'Stop';
  stopBtn.addEventListener('mouseenter', () => stopBtn.style.opacity = '1');
  stopBtn.addEventListener('mouseleave', () => stopBtn.style.opacity = '0.6');
  stopBtn.addEventListener('click', () => {
    const ev = new CustomEvent('speech-stop', { bubbles: true, composed: true });
    document.dispatchEvent(ev);
  });

  // React to native speech events dispatched on the button we pass (readBtn)
  readBtn.addEventListener('speech-started', () => { stopBtn.style.display = 'inline-flex'; });
  readBtn.addEventListener('speech-paused', () => { stopBtn.style.display = 'inline-flex'; });
  readBtn.addEventListener('speech-resumed', () => { stopBtn.style.display = 'inline-flex'; });
  readBtn.addEventListener('speech-ended', () => { stopBtn.style.display = 'none'; });

  // Translate button (icon-only) that triggers native translate menu/UI
  const translateHdrBtn = document.createElement('button');
  translateHdrBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
  translateHdrBtn.style.background = 'none';
  translateHdrBtn.style.border = 'none';
  translateHdrBtn.style.cursor = 'pointer';
  translateHdrBtn.style.opacity = '0.6';
  translateHdrBtn.style.padding = '2px 4px';
  translateHdrBtn.style.display = 'inline-flex';
  translateHdrBtn.style.alignItems = 'center';
  translateHdrBtn.style.justifyContent = 'center';
  translateHdrBtn.title = 'Translate';
  translateHdrBtn.addEventListener('mouseenter', () => translateHdrBtn.style.opacity = '1');
  translateHdrBtn.addEventListener('mouseleave', () => translateHdrBtn.style.opacity = '0.6');

  translateHdrBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Trigger the native translate button to show the standard menu/UI
    const nativeTranslateBtn = bubble ? bubble.querySelector(`.${SELECTORS.CLASS_TRANSLATE_BTN}`) : null;
    if (nativeTranslateBtn) {
      nativeTranslateBtn.click();
      // Reposition the translate menu to appear under the custom button
      setTimeout(() => {
        const menu = bubble ? bubble.querySelector(`.${SELECTORS.CLASS_TRANSLATE_MENU}`) : null;
        if (!menu) return;
        const btnRect = translateHdrBtn.getBoundingClientRect();
        const bubbleRect = bubble.getBoundingClientRect();
        const top = (btnRect.bottom - bubbleRect.top) + 6;
        const left = (btnRect.left - bubbleRect.left);
        menu.style.right = 'auto';
        menu.style.left = `${Math.max(6, left)}px`;
        menu.style.top = `${Math.max(36, top)}px`;
      }, 0);
    }
  });

  // Ask iChrome button (icon-only) to add current note as context
  const askBtn = document.createElement('button');
  askBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H9l-4 4v-4H5a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4z"/></svg>`;
  askBtn.style.background = 'none';
  askBtn.style.border = 'none';
  askBtn.style.cursor = 'pointer';
  askBtn.style.opacity = '0.6';
  askBtn.style.padding = '2px 4px';
  askBtn.style.display = 'inline-flex';
  askBtn.style.alignItems = 'center';
  askBtn.style.justifyContent = 'center';
  askBtn.title = 'Add this note as chat context';
  askBtn.addEventListener('mouseenter', () => askBtn.style.opacity = '1');
  askBtn.addEventListener('mouseleave', () => askBtn.style.opacity = '0.6');

  askBtn.addEventListener('click', async () => {
    const label = `📄 ${nameInput.value || 'Untitled'}`;
    const text = (contentArea.value || '').trim();
    if (text) {
      addExternalContext(text, label);
    }
  });

  // Generate button (icon-only)
  const genBtn = document.createElement('button');
  genBtn.innerHTML = `<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\"/></svg>`;
  genBtn.style.background = 'none';
  genBtn.style.border = 'none';
  genBtn.style.cursor = 'pointer';
  genBtn.style.opacity = '0.6';
  genBtn.style.padding = '2px 4px';
  genBtn.style.display = 'inline-flex';
  genBtn.style.alignItems = 'center';
  genBtn.style.justifyContent = 'center';
  genBtn.title = 'Generate content into this note';
  genBtn.addEventListener('mouseenter', () => genBtn.style.opacity = '1');
  genBtn.addEventListener('mouseleave', () => genBtn.style.opacity = '0.6');
  genBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openGeneratePrompt();
  });

  // Min/Max toggle button (bubble-level minimize/restore)
  const minMaxBtn = document.createElement('button');
  minMaxBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>`; // down chevron means can expand; toggles
  minMaxBtn.style.background = 'none';
  minMaxBtn.style.border = 'none';
  minMaxBtn.style.cursor = 'pointer';
  minMaxBtn.style.opacity = '0.6';
  minMaxBtn.style.padding = '2px 4px';
  minMaxBtn.style.display = 'inline-flex';
  minMaxBtn.style.alignItems = 'center';
  minMaxBtn.style.justifyContent = 'center';
  minMaxBtn.title = 'Minimize';
  minMaxBtn.addEventListener('mouseenter', () => minMaxBtn.style.opacity = '1');
  minMaxBtn.addEventListener('mouseleave', () => minMaxBtn.style.opacity = '0.6');

  function toggleBubbleMinimized() {
    // Close rewrite menu if open
    rewriteMenu.style.display = 'none';
    const nowMinimized = !bubble.classList.contains('minimized');
    bubble.classList.toggle('minimized', nowMinimized);
    // Update icon and title to reflect next action
    if (nowMinimized) {
      minMaxBtn.title = 'Maximize';
      minMaxBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
    } else {
      minMaxBtn.title = 'Minimize';
      minMaxBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    }
  }

  minMaxBtn.addEventListener('click', toggleBubbleMinimized);

  // Preview/Edit toggle buttons
  const previewModeBtn = document.createElement('button');
  previewModeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>`;
  previewModeBtn.style.background = 'none';
  previewModeBtn.style.border = 'none';
  previewModeBtn.style.cursor = 'pointer';
  previewModeBtn.style.opacity = '0.6';
  previewModeBtn.style.padding = '2px 4px';
  previewModeBtn.style.display = 'inline-flex';
  previewModeBtn.style.alignItems = 'center';
  previewModeBtn.style.justifyContent = 'center';
  previewModeBtn.title = 'Preview';
  previewModeBtn.addEventListener('mouseenter', () => previewModeBtn.style.opacity = '1');
  previewModeBtn.addEventListener('mouseleave', () => previewModeBtn.style.opacity = '0.6');

  const editModeBtn = document.createElement('button');
  editModeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
  </svg>`;
  editModeBtn.style.background = 'none';
  editModeBtn.style.border = 'none';
  editModeBtn.style.cursor = 'pointer';
  editModeBtn.style.opacity = '0.6';
  editModeBtn.style.padding = '2px 4px';
  editModeBtn.style.display = 'inline-flex';
  editModeBtn.style.alignItems = 'center';
  editModeBtn.style.justifyContent = 'center';
  editModeBtn.title = 'Edit';
  editModeBtn.addEventListener('mouseenter', () => editModeBtn.style.opacity = '1');
  editModeBtn.addEventListener('mouseleave', () => editModeBtn.style.opacity = '0.6');

  // Export button (placed before Preview)
  const exportBtn = document.createElement('button');
  exportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>`;
  exportBtn.style.background = 'none';
  exportBtn.style.border = 'none';
  exportBtn.style.cursor = 'pointer';
  exportBtn.style.opacity = '0.6';
  exportBtn.style.padding = '2px 4px';
  exportBtn.style.display = 'inline-flex';
  exportBtn.style.alignItems = 'center';
  exportBtn.style.justifyContent = 'center';
  exportBtn.title = 'Export';
  exportBtn.addEventListener('mouseenter', () => exportBtn.style.opacity = '1');
  exportBtn.addEventListener('mouseleave', () => exportBtn.style.opacity = '0.6');
  exportBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await exportNote({ name: nameInput.value || 'Untitled', content: contentArea.value || '' });
  });

  // ORDER: Generate, Ask iChrome, Read Loud, Translate, Proofread, Rewrite, Preview, Edit, Save, Delete, Close, Min/Max
  actions.appendChild(genBtn);
  actions.appendChild(askBtn);
  actions.appendChild(readBtn);
  actions.appendChild(stopBtn);
  actions.appendChild(translateHdrBtn);
  actions.appendChild(proofBtn);
  actions.appendChild(rewriteBtn);
  actions.appendChild(exportBtn);
  actions.appendChild(previewModeBtn);
  actions.appendChild(editModeBtn);
  actions.appendChild(saveBtn);
  actions.appendChild(delBtn);
  actions.appendChild(minMaxBtn);

  // Place Close (X) at the right, immediately before Min/Max
  actions.insertBefore(backBtn, minMaxBtn);
  headerRow.appendChild(actions);

  // Name input - compact
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = note.name || 'Untitled';
  nameInput.placeholder = 'Note title...';
  nameInput.style.width = '100%';
  nameInput.style.boxSizing = 'border-box';
  nameInput.style.padding = '8px 0';
  nameInput.style.fontSize = '14px';
  nameInput.style.fontWeight = '600';
  nameInput.style.border = 'none';
  nameInput.style.background = 'transparent';
  nameInput.style.color = 'inherit';
  nameInput.style.outline = 'none';
  nameInput.style.borderBottom = '1px solid rgba(255,255,255,0.15)';
  nameInput.style.marginBottom = '8px';

  // Content area - compact
  const contentArea = document.createElement('textarea');
  contentArea.value = note.content || '';
  contentArea.placeholder = 'Start writing...';
  contentArea.rows = 8;
  
  // Disable editing-related buttons and inputs for user guide note
  if (isGuide) {
    const disableButton = (btn, tooltip) => {
      btn.disabled = true;
      btn.style.opacity = '0.3';
      btn.style.cursor = 'not-allowed';
      if (tooltip) btn.title = tooltip;
    };
    
    disableButton(saveBtn, 'Save (protected note)');
    disableButton(delBtn, 'Delete (protected note)');
    disableButton(editModeBtn, 'Edit (protected note)');
    disableButton(exportBtn, 'Export (protected note)');
    disableButton(rewriteBtn, 'Rewrite (protected note)');
    disableButton(proofBtn, 'Proofread (protected note)');
    disableButton(genBtn, 'Generate (protected note)');
    
    // Disable name and content inputs
    nameInput.disabled = true;
    nameInput.style.opacity = '0.6';
    nameInput.style.cursor = 'not-allowed';
    contentArea.disabled = true;
    contentArea.style.opacity = '0.6';
    contentArea.style.cursor = 'not-allowed';
  }
  contentArea.style.width = '100%';
  contentArea.style.boxSizing = 'border-box';
  contentArea.style.padding = '8px';
  contentArea.style.fontSize = '13px';
  contentArea.style.lineHeight = '1.5';
  contentArea.style.border = '1px solid rgba(255,255,255,0.15)';
  contentArea.style.borderRadius = '6px';
  contentArea.style.background = 'rgba(255,255,255,0.05)';
  contentArea.style.color = 'inherit';
  contentArea.style.outline = 'none';
  contentArea.style.resize = 'vertical';
  contentArea.style.fontFamily = 'inherit';
  contentArea.style.minHeight = '150px';

  // Markdown preview container (hidden by default)
  const mdPreview = document.createElement('div');
  mdPreview.style.display = 'none';
  mdPreview.style.padding = '8px';
  mdPreview.style.border = '1px solid rgba(255,255,255,0.15)';
  mdPreview.style.borderRadius = '6px';
  mdPreview.style.background = 'rgba(255,255,255,0.04)';
  mdPreview.style.color = 'inherit';
  mdPreview.style.marginTop = '8px';
  mdPreview.style.fontSize = '13px';
  mdPreview.style.lineHeight = '1.5';
  let lastMdRenderTs = 0;

  // Helper to render markdown preview
  function updateMarkdownPreview() {
    try { mdPreview.innerHTML = renderMarkdown(contentArea.value || ''); }
    catch { mdPreview.textContent = contentArea.value || ''; }
  }

  // Focus effects
  nameInput.addEventListener('focus', () => {
    nameInput.style.borderBottomColor = 'rgba(255,255,255,0.3)';
  });
  nameInput.addEventListener('blur', () => {
    nameInput.style.borderBottomColor = 'rgba(255,255,255,0.15)';
  });

  contentArea.addEventListener('focus', () => {
    contentArea.style.borderColor = 'rgba(255,255,255,0.25)';
  });
  contentArea.addEventListener('blur', () => {
    contentArea.style.borderColor = 'rgba(255,255,255,0.15)';
  });

  contentArea.addEventListener('input', () => {
    if (mdPreview.style.display !== 'none') updateMarkdownPreview();
  });

  // Inline generate prompt panel (hidden by default)
  const genPromptWrapper = document.createElement('div');
  genPromptWrapper.style.display = 'none';
  genPromptWrapper.style.flexDirection = 'column';
  genPromptWrapper.style.gap = '6px';
  genPromptWrapper.style.background = 'rgba(255,255,255,0.05)';
  genPromptWrapper.style.border = '1px solid rgba(255,255,255,0.12)';
  genPromptWrapper.style.borderRadius = '6px';
  genPromptWrapper.style.padding = '10px';
  genPromptWrapper.style.marginTop = '8px';
  genPromptWrapper.style.transition = 'opacity 0.18s ease, max-height 0.18s ease';
  genPromptWrapper.style.overflow = 'hidden';
  genPromptWrapper.style.opacity = '0';
  genPromptWrapper.style.maxHeight = '0px';

  let genPromptVisible = false;
  let genPromptHideTimer = null;
  let genPromptBusy = false;
  let currentAnimationAbort = null;

  // Typewriter animation for generated text
  async function animateGeneratedText(textarea, newText, append = true) {
    // Get settings for ChromePad tool
    const chromePadSettings = await getSettings('tools.chromepad') || {};
    const configSettings = (window.CONFIG && window.CONFIG.chromePad && window.CONFIG.chromePad.typewriterEffect) || {};
    
    // Prefer settings over config (settings take precedence)
    const enabled = chromePadSettings.typewriter !== false && configSettings.enabled !== false;
    const minLength = Number(configSettings.minLength) || 50;
    const maxChars = Number(configSettings.maxAnimateChars) || 5000;
    const delayMs = Number(configSettings.delayMs) || 8;

    const textToAdd = String(newText || '');

    // Skip animation if disabled, text too short, or too long
    if (!enabled || textToAdd.length < minLength || textToAdd.length > maxChars) {
      if (append) {
        const existing = textarea.value || '';
        const prefix = existing ? '\n\n' : '';
        textarea.value = `${existing}${prefix}${textToAdd}`;
      } else {
        textarea.value = textToAdd;
      }
      updateStats();
      if (mdPreview.style.display !== 'none') {
        try { mdPreview.innerHTML = renderMarkdown(textarea.value || ''); } catch { mdPreview.textContent = textarea.value || ''; }
      }
      return;
    }

    // Setup abort controller
    if (currentAnimationAbort) {
      currentAnimationAbort.abort();
    }
    currentAnimationAbort = new AbortController();
    const signal = currentAnimationAbort.signal;

    const existingText = textarea.value || '';
    const prefix = (append && existingText) ? '\n\n' : '';
    const startPos = (existingText + prefix).length;

    // Add prefix first
    if (prefix) {
      textarea.value = existingText + prefix;
    }

    try {
      await typeCharByChar(textarea, textToAdd, startPos, delayMs, signal);
    } catch (err) {
      if (err.name === 'AbortError') {
        // Show full text immediately on abort
        textarea.value = existingText + prefix + textToAdd;
        updateStats();
        if (mdPreview.style.display !== 'none') {
          try { mdPreview.innerHTML = renderMarkdown(textarea.value || ''); } catch { mdPreview.textContent = textarea.value || ''; }
        }
      }
    } finally {
      currentAnimationAbort = null;
    }
  }

  async function typeCharByChar(textarea, text, startPos, delayMs, signal) {
    return new Promise((resolve, reject) => {
      const chars = String(text || '');
      let idx = 0;

      function typeNext() {
        if (signal.aborted) {
          reject(new DOMException('Animation aborted', 'AbortError'));
          return;
        }
        if (idx >= chars.length) {
          resolve();
          return;
        }

        // Insert character
        const before = textarea.value.substring(0, startPos + idx);
        const after = textarea.value.substring(startPos + idx);
        textarea.value = before + chars[idx] + after;
        idx += 1;

        // Update stats and scroll
        updateStats();
        textarea.scrollTop = textarea.scrollHeight;

        // Progressive markdown preview update (throttled)
        if (mdPreview.style.display !== 'none') {
          const nowTs = Date.now();
          if (nowTs - lastMdRenderTs > 120) {
            try { mdPreview.innerHTML = renderMarkdown(textarea.value || ''); }
            catch { mdPreview.textContent = textarea.value || ''; }
            lastMdRenderTs = nowTs;
          }
        }

        setTimeout(typeNext, delayMs);
      }

      typeNext();
    });
  }

  const genPromptLabel = document.createElement('div');
  genPromptLabel.textContent = 'What should iChrome write?';
  genPromptLabel.style.fontSize = '12px';
  genPromptLabel.style.opacity = '0.75';

  const genPromptInput = document.createElement('textarea');
  genPromptInput.rows = 3;
  genPromptInput.placeholder = 'Describe the content to add...';
  genPromptInput.style.width = '100%';
  genPromptInput.style.boxSizing = 'border-box';
  genPromptInput.style.padding = '8px';
  genPromptInput.style.fontSize = '13px';
  genPromptInput.style.lineHeight = '1.4';
  genPromptInput.style.border = '1px solid rgba(255,255,255,0.15)';
  genPromptInput.style.borderRadius = '6px';
  genPromptInput.style.background = 'rgba(0,0,0,0.35)';
  genPromptInput.style.color = 'inherit';
  genPromptInput.style.resize = 'vertical';
  genPromptInput.style.outline = 'none';

  genPromptInput.addEventListener('focus', () => {
    genPromptInput.style.borderColor = 'rgba(255,255,255,0.25)';
  });
  genPromptInput.addEventListener('blur', () => {
    genPromptInput.style.borderColor = 'rgba(255,255,255,0.15)';
  });

  // Row with input and arrow/stop button (chat-like)
  const genPromptRow = document.createElement('div');
  genPromptRow.style.display = 'flex';
  genPromptRow.style.alignItems = 'center';
  genPromptRow.style.gap = '8px';

  genPromptInput.style.flex = '1 1 auto';

  const genActionBtn = document.createElement('button');
  genActionBtn.type = 'button';
  genActionBtn.title = 'Generate';
  genActionBtn.setAttribute('aria-label', 'Generate');
  genActionBtn.style.background = 'rgba(123, 97, 255, 0.85)';
  genActionBtn.style.color = '#fff';
  genActionBtn.style.border = 'none';
  genActionBtn.style.borderRadius = '6px';
  genActionBtn.style.width = '32px';
  genActionBtn.style.height = '32px';
  genActionBtn.style.display = 'inline-flex';
  genActionBtn.style.alignItems = 'center';
  genActionBtn.style.justifyContent = 'center';
  genActionBtn.style.cursor = 'pointer';
  genActionBtn.style.transition = 'opacity 0.18s ease, transform 0.18s ease';

  function setGenActionToSend() {
    genActionBtn.title = 'Generate';
    genActionBtn.setAttribute('aria-label', 'Generate');
    genActionBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 12L21 3L14 21L11 13L3 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function setGenActionToStop() {
    genActionBtn.title = 'Stop generating';
    genActionBtn.setAttribute('aria-label', 'Stop generating');
    genActionBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  }
  setGenActionToSend();

  genPromptRow.appendChild(genPromptInput);
  genPromptRow.appendChild(genActionBtn);

  genPromptWrapper.appendChild(genPromptLabel);
  genPromptWrapper.appendChild(genPromptRow);

  let genRunSeq = 0;
  let genStopRequested = false;

  function setGeneratePromptBusy(busy) {
    genPromptBusy = busy;
    genPromptInput.readOnly = busy;
    if (busy) {
      setGenActionToStop();
      genActionBtn.style.opacity = '0.85';
      genActionBtn.style.transform = 'translateY(0)';
    } else {
      setGenActionToSend();
      genActionBtn.style.opacity = '1';
      genActionBtn.style.transform = 'translateY(0)';
    }
  }

  function openGeneratePrompt() {
    if (genPromptHideTimer) {
      clearTimeout(genPromptHideTimer);
      genPromptHideTimer = null;
    }
    if (genPromptVisible) {
      setTimeout(() => genPromptInput.focus(), 0);
      return;
    }
    genPromptVisible = true;
    genPromptWrapper.style.display = 'flex';
    genPromptWrapper.style.opacity = '0';
    genPromptWrapper.style.maxHeight = '0px';
    requestAnimationFrame(() => {
      genPromptWrapper.style.opacity = '1';
      genPromptWrapper.style.maxHeight = '320px';
    });
    setTimeout(() => {
      if (genPromptVisible) genPromptInput.focus();
    }, 180);
  }

  function closeGeneratePrompt({ clear = true, focusEditor = false } = {}) {
    if (!genPromptVisible) {
      if (clear) genPromptInput.value = '';
      if (focusEditor) setTimeout(() => contentArea.focus(), 0);
      return;
    }
    genPromptVisible = false;
    genPromptWrapper.style.opacity = '0';
    genPromptWrapper.style.maxHeight = '0px';
    genPromptHideTimer = setTimeout(() => {
      if (!genPromptVisible) {
        genPromptWrapper.style.display = 'none';
        if (clear) genPromptInput.value = '';
        if (focusEditor) contentArea.focus();
      }
      genPromptHideTimer = null;
    }, 200);
  }

  async function submitGeneratePrompt() {
    if (genPromptBusy) return;
    const prompt = (genPromptInput.value || '').trim();
    if (!prompt) {
      genPromptInput.focus();
      return;
    }
    const runId = (++genRunSeq);
    genStopRequested = false;
    setGeneratePromptBusy(true);
    startProcessing('Generating');
    let success = false;
    try {
      const res = await generateTextFromPrompt(prompt);
      if (genStopRequested || runId !== genRunSeq) {
        // Ignore late result
        return;
      }
      if (res && res.ok) {
        // Animate text appearance (or instant if config disabled/text too short)
        await animateGeneratedText(contentArea, res.text || '', true);
        await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
        stopProcessing('Generated');
        success = true;
      } else {
        stopProcessing('Generate failed');
      }
    } catch (err) {
      log.error('Generate prompt failed:', err);
      if (!genStopRequested) stopProcessing('Generate failed');
    } finally {
      setGeneratePromptBusy(false);
      if (success) {
        closeGeneratePrompt({ clear: true, focusEditor: true });
      } else if (!genStopRequested) {
        openGeneratePrompt();
        genPromptInput.focus();
      }
    }
  }

  function stopGeneratePrompt() {
    if (!genPromptBusy) return;
    genStopRequested = true;
    // Abort any ongoing animation
    if (currentAnimationAbort) {
      currentAnimationAbort.abort();
      currentAnimationAbort = null;
    }
    // Stop UI immediately; ignore late AI results
    setGeneratePromptBusy(false);
    stopProcessing('Stopped');
    // Do not clear the prompt; user can edit and re-send
    openGeneratePrompt();
    genPromptInput.focus();
  }

  genActionBtn.addEventListener('click', () => {
    if (genPromptBusy) {
      stopGeneratePrompt();
    } else {
      submitGeneratePrompt();
    }
  });

  genPromptInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!genPromptBusy) submitGeneratePrompt();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (genPromptBusy || currentAnimationAbort) {
        stopGeneratePrompt();
      } else {
        closeGeneratePrompt({ clear: false, focusEditor: true });
      }
    }
  });

  // Compact status bar
  const statusBar = document.createElement('div');
  statusBar.style.display = 'flex';
  statusBar.style.alignItems = 'center';
  statusBar.style.justifyContent = 'space-between';
  statusBar.style.marginTop = '6px';
  statusBar.style.fontSize = '11px';
  statusBar.style.opacity = '0.5';

  const stats = document.createElement('div');
  stats.style.display = 'flex';
  stats.style.gap = '8px';

  // Unified preview mode state
  let previewOn = startInPreview || false;

  // Unified toggle function
  function togglePreviewMode(showPreview) {
    previewOn = showPreview;
    
    if (previewOn) {
      updateMarkdownPreview();
      contentArea.style.display = 'none';
      mdPreview.style.display = 'block';
      
      // Update header buttons
      previewModeBtn.style.opacity = '1';
      editModeBtn.style.opacity = '0.6';
    } else {
      mdPreview.style.display = 'none';
      contentArea.style.display = 'block';
      contentArea.focus();
      
      // Update header buttons
      previewModeBtn.style.opacity = '0.6';
      editModeBtn.style.opacity = '1';
    }
  }

  // Wire up header Preview button
  previewModeBtn.addEventListener('click', () => togglePreviewMode(true));
  
  // Wire up header Edit button
  editModeBtn.addEventListener('click', () => togglePreviewMode(false));

  // Initialize mode on load
  if (startInPreview) {
    togglePreviewMode(true);
  } else {
    // Set initial button states for edit mode
    previewModeBtn.style.opacity = '0.6';
    editModeBtn.style.opacity = '1';
  }

  const wordCount = document.createElement('span');
  const charCount = document.createElement('span');

  function updateStats() {
    const words = countWords(contentArea.value);
    const chars = (contentArea.value || '').length;
    wordCount.textContent = `${words}w`;
    charCount.textContent = `${chars}c`;
  }

  stats.appendChild(wordCount);
  stats.appendChild(charCount);

  const saveIndicator = document.createElement('span');
  saveIndicator.textContent = '✓ Saved';
  saveIndicator.style.opacity = '0';
  saveIndicator.style.transition = 'opacity 0.2s ease';

  statusBar.appendChild(stats);
  statusBar.appendChild(saveIndicator);

  updateStats();

  // Processing animation helpers (combined pulsing + status dots)
  let processingInterval = null;
  function startProcessing(label) {
    const bubbleEl = body.parentElement;
    startPulsing(bubbleEl);
    try { if (processingInterval) { clearInterval(processingInterval); processingInterval = null; } } catch {}
    let dots = 0;
    saveIndicator.style.opacity = '1';
    saveIndicator.textContent = `${label}`;
    processingInterval = setInterval(() => {
      try {
        dots = (dots + 1) % 4;
        const trail = dots === 0 ? '' : '.'.repeat(dots);
        saveIndicator.textContent = `${label}${trail}`;
      } catch {}
    }, 400);
  }

  function stopProcessing(finalText) {
    const bubbleEl = body.parentElement;
    stopPulsing(bubbleEl);
    try { if (processingInterval) { clearInterval(processingInterval); processingInterval = null; } } catch {}
    saveIndicator.textContent = finalText || '✓ Done';
    saveIndicator.style.opacity = '1';
    setTimeout(() => { try { saveIndicator.style.opacity = '0'; } catch {} }, 1200);
  }

  // Position rewrite menu relative to headerRow and insert header above body
  headerRow.style.position = 'relative';
  headerRow.appendChild(rewriteMenu);
  if (bubble) {
    bubble.insertBefore(headerRow, body);
  } else {
    body.parentElement?.insertBefore(headerRow, body);
  }
  body.appendChild(nameInput);
  body.appendChild(contentArea);
  body.appendChild(mdPreview);
  body.appendChild(genPromptWrapper);
  body.appendChild(statusBar);

  // Selection-based Ask iChrome for ChromePad textarea
  try {
    contentArea.setAttribute('data-chromepad-editor', 'true');
    const contentHost = document.getElementById(SELECTORS.CONTENT);
    let cpCtxBtn = null;
    let lastMouse = null;
    let cpCtxProcessing = false;
    let cpLastSelectionText = '';

    function ensureCpCtxBtn() {
      if (cpCtxBtn && cpCtxBtn.parentElement) return cpCtxBtn;
      const btn = document.createElement('button');
      btn.className = SELECTORS.CLASS_CONTEXT_ADD_BTN; // reuse existing style
      btn.id = 'cp-ctx-add-btn';
      btn.style.display = 'none';
      btn.textContent = (window.CONFIG?.contextSelection?.buttonLabel) || 'Ask iChrome';
      (contentHost || document.body).appendChild(btn);
      cpCtxBtn = btn;
      return btn;
    }

    function getSelectedTextareaText() {
      try {
        const start = Math.max(0, contentArea.selectionStart || 0);
        const end = Math.max(0, contentArea.selectionEnd || 0);
        if (end > start) {
          return String(contentArea.value || '').slice(start, end);
        }
      } catch {}
      return '';
    }

    function hideCpCtxBtn(resetProcessing = true) {
      if (cpCtxBtn) cpCtxBtn.style.display = 'none';
      if (resetProcessing) cpCtxProcessing = false;
      cpLastSelectionText = '';
    }

    function showCpCtxBtn(e) {
      if (cpCtxProcessing) return;
      const selected = String(getSelectedTextareaText() || '').trim();
      if (!selected) { hideCpCtxBtn(); return; }
      cpLastSelectionText = selected;
      const btn = ensureCpCtxBtn();
      const host = contentHost || document.body;
      const hostRect = host.getBoundingClientRect();
      const taRect = contentArea.getBoundingClientRect();
      const scrollTop = host.scrollTop || 0;
      const scrollLeft = host.scrollLeft || 0;

      // Prefer position near last mouseup, fallback to textarea top-right
      let top = (taRect.top - hostRect.top) + scrollTop + 6;
      let left = (taRect.right - hostRect.left) + scrollLeft - 80; // approx from right edge
      if (lastMouse) {
        top = (lastMouse.clientY - hostRect.top) + scrollTop - 24;
        left = (lastMouse.clientX - hostRect.left) + scrollLeft + 8;
      }

      btn.style.top = `${Math.max(0, top)}px`;
      btn.style.left = `${Math.max(0, left)}px`;
      btn.style.display = 'inline-flex';

      // Early guard: when the user presses the button, set processing before textarea loses focus
      btn.onmousedown = () => { cpCtxProcessing = true; };

      btn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (cpCtxProcessing === false) cpCtxProcessing = true; // ensure flag
        const text = String(cpLastSelectionText || '').trim();
        if (!text) { hideCpCtxBtn(); return; }
        const label = `📝 ${nameInput.value || 'Untitled'}`;
        addExternalContext(text, label);
        // Collapse textarea selection BEFORE focusing to avoid re-triggering select listener
        try {
          const endPos = (contentArea.value || '').length;
          if (typeof contentArea.setSelectionRange === 'function') {
            contentArea.setSelectionRange(endPos, endPos);
          }
        } catch {}
        // Also clear any window selection
        try {
          const sel = window.getSelection && window.getSelection();
          if (sel && typeof sel.removeAllRanges === 'function') sel.removeAllRanges();
        } catch {}
        hideCpCtxBtn(false);
        try { contentArea.focus(); } catch {}
        setTimeout(() => { cpCtxProcessing = false; }, 120);
      };
    }

    contentArea.addEventListener('mouseup', (e) => { lastMouse = { clientX: e.clientX, clientY: e.clientY }; showCpCtxBtn(e); });
    contentArea.addEventListener('keyup', (e) => { if (e.key && e.key.startsWith('Arrow')) { /* caret move */ } showCpCtxBtn(e); });
    contentArea.addEventListener('select', showCpCtxBtn);
    contentArea.addEventListener('blur', hideCpCtxBtn);
    (contentHost || document).addEventListener('scroll', hideCpCtxBtn, { passive: true });
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t === cpCtxBtn || t === contentArea) return; // allow internal interactions
      hideCpCtxBtn();
    });
  } catch {}

  // -------------------------------------------------------------
  // Intercept native translate menu clicks for ChromePad editor
  // - Prevent native handler from replacing .msg-body
  // - Apply translation to textarea only
  // - Maintain bubble dataset for language
  // - Close menu after handling
  // -------------------------------------------------------------
  function handleTranslateMenuClickCapture(ev) {
    try {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      const menu = bubble ? bubble.querySelector(`.${SELECTORS.CLASS_TRANSLATE_MENU}`) : null;
      if (!menu || !menu.contains(target)) return;

      // Find the clicked translate item button
      const itemBtn = target.closest(`.${SELECTORS.CLASS_TRANSLATE_ITEM}`);
      if (!itemBtn) return;

      ev.preventDefault();
      ev.stopPropagation();

      const action = itemBtn.dataset.action || '';
      if (action === 'show-original') {
        // Close menu immediately for better UX
        menu.style.display = 'none';
        if (typeof bubble.dataset.originalText === 'string') {
          contentArea.value = String(bubble.dataset.originalText || '');
          updateStats();
          bubble.dataset.currentLang = '';
          // Stop active speech so next play uses new language
          const stopEvt = new CustomEvent('speech-stop', { bubbles: true, composed: true });
          document.dispatchEvent(stopEvt);
        }
        return;
      }

      const code = itemBtn.dataset.lang || '';
      if (!code) { menu.style.display = 'none'; return; }

      // Close menu immediately on selection for better UX
      menu.style.display = 'none';

      (async () => {
        // Cache original once
        if (typeof bubble.dataset.originalText !== 'string') {
          bubble.dataset.originalText = String(contentArea.value || '');
        }
        const orig = String(bubble.dataset.originalText || contentArea.value || '');
        const cfg2 = window.CONFIG?.translation || {};
        const lowerCode = String(code || '').toLowerCase();
        const langLabel = (Array.isArray(cfg2.languages) ? (cfg2.languages.find(l => String(l.code || '').toLowerCase() === lowerCode)?.name) : null) || String(code || '').toUpperCase();
        startProcessing(`Translating to ${langLabel}`);
        try {
          const res = await translateText(orig, { sourceLanguage: String(cfg2.defaultSourceLanguage || 'auto'), targetLanguage: code });
          if (res && res.ok) {
            contentArea.value = res.text || '';
            updateStats();
            bubble.dataset.currentLang = code;
            await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
            // Stop active speech so next play uses new language
            const stopEvt = new CustomEvent('speech-stop', { bubbles: true, composed: true });
            document.dispatchEvent(stopEvt);
            stopProcessing('✓ Translated');
          } else {
            const errLabel = (window.CONFIG?.translation?.labels?.translationError) || 'Translation failed';
            stopProcessing(`⚠ ${errLabel}`);
          }
        } catch (err) {
          // Translation errors are handled via stopProcessing above
          log.error('Translation failed:', err);
        }
      })();
    } catch (err) {
      // Safely handle any unexpected errors in menu click handling
      log.warn('Translate menu click handler error:', err);
    }
  }

  if (bubble) {
    // Capture phase ensures we run before native handler in ui.js
    bubble.addEventListener('click', handleTranslateMenuClickCapture, true);
  }

  // -------------------------------------------------------------
  // Intercept native speech events within this bubble and reroute
  // to our hidden speech source and custom Read/Stop buttons
  // -------------------------------------------------------------
  function handleSpeechToggleCapture(e) {
    try {
      const detail = e && e.detail ? e.detail : {};
      if (detail && detail.element === speechSource && detail.button === readBtn) {
        // This is our re-dispatched event; allow it through
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      speechSource.textContent = String(contentArea.value || '');
      const ev2 = new CustomEvent('speech-toggle', { bubbles: true, composed: true, detail: { element: speechSource, button: readBtn } });
      document.dispatchEvent(ev2);
    } catch (err) {
      log.warn('Speech toggle capture error:', err);
    }
  }

  function handleSpeechStopCapture(e) {
    try {
      e.preventDefault();
      e.stopPropagation();
      const ev2 = new CustomEvent('speech-stop', { bubbles: true, composed: true });
      document.dispatchEvent(ev2);
    } catch (err) {
      log.warn('Speech stop capture error:', err);
    }
  }

  if (bubble) {
    bubble.addEventListener('speech-toggle', handleSpeechToggleCapture, true);
    bubble.addEventListener('speech-stop', handleSpeechStopCapture, true);
  }

  // Auto-save with visual feedback
  const debouncedSave = debounce(async () => {
    try {
      await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
      
      saveIndicator.style.opacity = '1';
      setTimeout(() => {
        saveIndicator.style.opacity = '0';
      }, 1500);
      
      log.info('Auto-saved note', noteId);
    } catch (e) {
      log.warn('Auto-save failed', e);
      saveIndicator.textContent = '⚠ Failed';
      saveIndicator.style.opacity = '1';
    }
  }, 800);

  nameInput.addEventListener('input', () => {
    debouncedSave();
  });
  
  contentArea.addEventListener('input', () => {
    // Interrupt animation if user types (if configured)
    const cfg = (window.CONFIG && window.CONFIG.chromePad && window.CONFIG.chromePad.typewriterEffect) || {};
    if (cfg.allowInterrupt && currentAnimationAbort) {
      currentAnimationAbort.abort();
      currentAnimationAbort = null;
    }
    updateStats();
    debouncedSave();
  });

  saveBtn.addEventListener('click', async () => {
    await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
    saveIndicator.textContent = '✓ Saved';
    saveIndicator.style.opacity = '1';
    setTimeout(() => {
      saveIndicator.style.opacity = '0';
    }, 1500);
  });

  proofBtn.addEventListener('click', async () => {
    startProcessing('Proofreading');
    try {
      const res = await proofreadText(contentArea.value || '');
      if (res && res.ok) {
        contentArea.value = res.text || '';
        updateStats();
        await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
      }
    } finally {
      stopProcessing();
    }
  });

  backBtn.addEventListener('click', async () => {
    if (isChromePadTransitioning) return;
    isChromePadTransitioning = true;
    try {
      // Remove current editor bubble and return to list
      cleanupCurrentBubble();
      chromePadListVisible = false;
      await renderNotesListBubble();
      scrollToBottom();
    } finally {
      setTimeout(() => { isChromePadTransitioning = false; }, 200);
    }
  });

  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = confirm(`Delete "${note.name}"?`);
    if (!ok) return;
    await deleteNote(noteId);
    if (isChromePadTransitioning) return;
    isChromePadTransitioning = true;
    try {
      // Remove current editor bubble and show updated list
      cleanupCurrentBubble();
      chromePadListVisible = false;
      await renderNotesListBubble();
      scrollToBottom();
    } finally {
      setTimeout(() => { isChromePadTransitioning = false; }, 200);
    }
  });

  // Auto-focus name input if new note
  if (note.name === 'Untitled' && !note.content) {
    setTimeout(() => nameInput.focus(), 100);
  }

  return body;
}

// -----------------------------
// Sidepanel integration
// -----------------------------
export async function handleChromePadSelected() {
  // When tool is selected, show list
  await renderNotesListBubble();
}

export async function handleChromePadRequest(_queryText) {
  // Phase 1: ignore free-form prompts; always ensure there is a list or editor
  await renderNotesListBubble();
}

// CommonJS fallback for tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllNotes,
    createNote,
    updateNote,
    deleteNote,
    getNoteById,
    renderNotesListBubble,
    renderEditorBubble,
    handleChromePadSelected,
    handleChromePadRequest,
  };
}


