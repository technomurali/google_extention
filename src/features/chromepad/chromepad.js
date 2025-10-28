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
import { debounce } from '../../core/utils.js';
import { logger } from '../../core/logger.js';
import { proofreadText, rewriteText, generateTextFromPrompt } from '../../services/ai_editing.js';

const log = logger.create('ChromePad');

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
  const updated = { ...existing, ...fields, updatedAt: Date.now() };
  map[noteId] = updated;
  await writeNotesMap(map);
  return updated;
}

export async function deleteNote(noteId) {
  if (!noteId) return false;
  const map = await readNotesMap();
  if (!map[noteId]) return false;
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
  const body = appendMessage('', 'ai');
  body.innerHTML = '';
  body.style.padding = '8px';

  // Hide speech and translate buttons, add + New button in their place
  const bubble = body.parentElement;
  if (bubble) {
    // Reduce top padding to reclaim space since we hide native header controls
    bubble.style.paddingTop = '8px';
    // Hide unwanted buttons
    const speechBtn = bubble.querySelector('.msg-speech-btn');
    const speechStopBtn = bubble.querySelector('.msg-speech-stop-btn');
    const translateBtn = bubble.querySelector('.msg-translate-btn');
    if (speechBtn) speechBtn.style.display = 'none';
    if (speechStopBtn) speechStopBtn.style.display = 'none';
    if (translateBtn) translateBtn.style.display = 'none';

    // Add + New button in top-right (where translate button was)
    const newBtn = document.createElement('button');
    newBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>`;
    newBtn.style.position = 'absolute';
    newBtn.style.top = '6px';
    newBtn.style.right = '42px'; // Where translate button was
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

    bubble.appendChild(newBtn);
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

      // Create custom styled tooltip (for filename only)
      let tooltip = null;
      if (n.content) {
        const previewText = getPreviewLines(n.content);
        if (previewText) {
          tooltip = document.createElement('div');
          tooltip.textContent = previewText;
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
          tooltip.style.pointerEvents = 'none';
          tooltip.style.transition = 'opacity 0.2s ease';
          tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
          tooltip.style.maxWidth = '300px'; // Limit width for readability
        }
      }

      // Row hover effect (no tooltip)
      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(255,255,255,0.1)';
      });

      row.addEventListener('mouseleave', () => {
        row.style.background = 'rgba(255,255,255,0.05)';
      });

      // Single line: title + timestamp + actions
      const mainRow = document.createElement('div');
      mainRow.style.display = 'flex';
      mainRow.style.alignItems = 'center';
      mainRow.style.gap = '8px';

      const noteTitle = document.createElement('div');
      noteTitle.textContent = n.name || 'Untitled';
      noteTitle.style.fontWeight = '600';
      noteTitle.style.fontSize = '13px';
      noteTitle.style.flex = '1';
      noteTitle.style.overflow = 'hidden';
      noteTitle.style.textOverflow = 'ellipsis';
      noteTitle.style.whiteSpace = 'nowrap';

      // Tooltip only on filename hover
      if (tooltip) {
        noteTitle.addEventListener('mouseenter', () => {
          document.body.appendChild(tooltip);
          setTimeout(() => {
            tooltip.style.opacity = '1';
          }, 10);
        });

        noteTitle.addEventListener('mousemove', (e) => {
          if (tooltip && tooltip.parentElement) {
            // Position above cursor
            const offsetX = 10;
            const offsetY = -10;
            tooltip.style.left = `${e.clientX + offsetX}px`;
            tooltip.style.top = `${e.clientY + offsetY - tooltip.offsetHeight}px`;
          }
        });

        noteTitle.addEventListener('mouseleave', () => {
          if (tooltip && tooltip.parentElement) {
            tooltip.style.opacity = '0';
            setTimeout(() => {
              if (tooltip && tooltip.parentElement) {
                document.body.removeChild(tooltip);
              }
            }, 200);
          }
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
      editBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await renderEditorBubble(n.id);
      });

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
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = confirm(`Delete "${n.name}"?`);
        if (!ok) return;
        await deleteNote(n.id);
        await refreshList();
        scrollToBottom();
      });

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
        if (text) addExternalContext(text.slice(0, 2000), label);
      });

      actions.appendChild(askBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      mainRow.appendChild(noteTitle);
      mainRow.appendChild(timestamp);
      mainRow.appendChild(actions);

      row.appendChild(mainRow);

      // Click to open
      row.addEventListener('click', async (e) => {
        if (e.target === editBtn || e.target === delBtn) return;
        await renderEditorBubble(n.id);
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

export async function renderEditorBubble(noteId) {
  const note = await getNoteById(noteId);
  if (!note) {
    const err = appendMessage('Note not found.', 'ai');
    return err;
  }

  const body = appendMessage('', 'ai');
  body.innerHTML = '';
  body.style.padding = '8px';

  // Hide speech and translate buttons for ChromePad editor
  const bubble = body.parentElement;
  if (bubble) {
    // Reduce top padding to reclaim vertical space (native controls are hidden)
    bubble.style.paddingTop = '8px';
    const speechBtn = bubble.querySelector('.msg-speech-btn');
    const speechStopBtn = bubble.querySelector('.msg-speech-stop-btn');
    const translateBtn = bubble.querySelector('.msg-translate-btn');
    const minimizeBtn = bubble.querySelector('.msg-minimize-btn');
    if (speechBtn) speechBtn.style.display = 'none';
    if (speechStopBtn) speechStopBtn.style.display = 'none';
    if (translateBtn) translateBtn.style.display = 'none';
    if (minimizeBtn) minimizeBtn.style.display = 'none';
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
      const bubbleEl = body.parentElement;
      startPulsing(bubbleEl);
      try {
        const res = await rewriteText(contentArea.value || '', mode);
        if (res && res.ok) {
          contentArea.value = res.text || '';
          updateStats();
          await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
        }
      } finally {
        stopPulsing(bubbleEl);
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

  // Ask iChrome button to add current note as context
  const askBtn = document.createElement('button');
  askBtn.textContent = 'Ask iChrome';
  askBtn.className = 'send-btn';
  askBtn.style.padding = '2px 8px';
  askBtn.title = 'Add this note as chat context';

  askBtn.addEventListener('click', async () => {
    const label = `📄 ${nameInput.value || 'Untitled'}`;
    const text = (contentArea.value || '').trim();
    if (text) {
      addExternalContext(text.slice(0, 2000), label);
    }
  });

  // Generate button
  const genBtn = document.createElement('button');
  genBtn.textContent = 'Generate';
  genBtn.className = 'send-btn';
  genBtn.style.padding = '2px 8px';
  genBtn.title = 'Generate content into this note';
  genBtn.addEventListener('click', async () => {
    const prompt = promptUser('Describe what to generate');
    if (!prompt) return;
    const bubbleEl = body.parentElement;
    startPulsing(bubbleEl);
    try {
      const res = await generateTextFromPrompt(prompt);
      if (res && res.ok) {
        contentArea.value = (contentArea.value || '') + (contentArea.value ? '\n\n' : '') + (res.text || '');
        updateStats();
        await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
      }
    } finally {
      stopPulsing(bubbleEl);
    }
  });
  // Helper prompt wrapper to avoid shadowing window.prompt accidentally
  function promptUser(message) {
    try { return window.prompt(message || ''); } catch { return null; }
  }

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

  // ORDER: Generate, Ask iChrome, Proofread, Rewrite, Save, Delete, Close, Min/Max
  actions.appendChild(genBtn);
  actions.appendChild(askBtn);
  actions.appendChild(proofBtn);
  actions.appendChild(rewriteBtn);
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
  body.appendChild(statusBar);

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
    const bubbleEl = body.parentElement;
    startPulsing(bubbleEl);
    try {
      const res = await proofreadText(contentArea.value || '');
      if (res && res.ok) {
        contentArea.value = res.text || '';
        updateStats();
        await updateNote(noteId, { name: nameInput.value || 'Untitled', content: contentArea.value || '' });
      }
    } finally {
      stopPulsing(bubbleEl);
    }
  });

  backBtn.addEventListener('click', async () => {
    await renderNotesListBubble();
    scrollToBottom();
  });

  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = confirm(`Delete "${note.name}"?`);
    if (!ok) return;
    await deleteNote(noteId);
    await renderNotesListBubble();
    scrollToBottom();
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


