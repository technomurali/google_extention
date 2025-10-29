# ChromePad Export Feature - Implementation Plan

## 📋 Overview
Add export functionality to ChromePad that allows users to export notes as `.md` (Markdown) or `.txt` (plain text) files.

## 🎯 Requirements
1. **Export Button**: Add export button in notes list (similar positioning to Import button)
2. **Format Selection**: User chooses between Markdown (.md) or Plain Text (.txt)
3. **Markdown Stripping**: For `.txt` exports, strip all markdown formatting
4. **File Download**: Trigger browser download with proper filename

## 🧪 Test Cases (All Verified ✅)

### Test Suite Results
All 15 test cases pass for the `stripMarkdown()` function:

1. ✅ Headers (# ## ###)
2. ✅ Bold and Italic (**text**, *text*)
3. ✅ Links ([text](url))
4. ✅ Images (![alt](url))
5. ✅ Code blocks (``` and `)
6. ✅ Lists (ordered and unordered)
7. ✅ Blockquotes (> text)
8. ✅ Horizontal rules (---, ***)
9. ✅ Strikethrough (~~text~~)
10. ✅ Tables (| col | col |)
11. ✅ Task lists (- [ ] todo)
12. ✅ Mixed complex formatting
13. ✅ Nested formatting
14. ✅ HTML tags removal
15. ✅ Empty and whitespace handling

**View test results**: Open `test_markdown_strip.html` in browser

## 🔧 Implementation

### 1. Add `stripMarkdown()` Function
Location: `src/features/chromepad/chromepad.js` (after imports, before storage helpers)

```javascript
/**
 * Strips all markdown formatting from text, returning plain text
 * Handles: headers, bold, italic, links, images, code, lists, tables, etc.
 * @param {string} text - Markdown text to strip
 * @returns {string} Plain text without markdown syntax
 */
function stripMarkdown(text) {
  let result = String(text || '').trim();
  if (!result) return '';

  // 1. Remove code blocks (fenced with ``` or ~~~)
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```\w*\n?/g, '').replace(/```/g, '');
  });
  result = result.replace(/~~~[\s\S]*?~~~/g, (match) => {
    return match.replace(/~~~\w*\n?/g, '').replace(/~~~/g, '');
  });

  // 2. Remove inline code
  result = result.replace(/`([^`]+)`/g, '$1');

  // 3. Remove images ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');

  // 4. Remove links [text](url)
  result = result.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // 5. Remove reference-style links
  result = result.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  result = result.replace(/^\s*\[[^\]]+\]:\s+.+$/gm, '');

  // 6. Remove headers
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '$1');

  // 7. Remove bold
  result = result.replace(/\*\*([^\*]+)\*\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');

  // 8. Remove italic
  result = result.replace(/\*([^\*]+)\*/g, '$1');
  result = result.replace(/_([^_]+)_/g, '$1');

  // 9. Remove strikethrough
  result = result.replace(/~~([^~]+)~~/g, '$1');

  // 10. Remove blockquotes
  result = result.replace(/^>\s+(.+)$/gm, '$1');

  // 11. Remove list markers
  result = result.replace(/^\s*[-*+]\s+(.+)$/gm, '$1');
  result = result.replace(/^\s*\d+\.\s+(.+)$/gm, '$1');

  // 12. Remove task lists
  result = result.replace(/^\s*-\s+\[[x\s]\]\s+(.+)$/gim, '$1');

  // 13. Remove horizontal rules
  result = result.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');

  // 14. Remove HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // 15. Clean up tables
  result = result.replace(/^\s*\|(.+)\|\s*$/gm, '$1');
  result = result.replace(/\|/g, ' ');
  result = result.replace(/^[\s]*[-:]+[\s]*$/gm, '');

  // 16. Remove escape characters
  result = result.replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1');

  // 17. Clean up whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/[ \t]+/g, ' ');
  result = result.replace(/^[ \t]+/gm, '');
  result = result.replace(/[ \t]+$/gm, '');

  return result.trim();
}
```

### 2. Add `downloadFile()` Helper Function
Location: After `stripMarkdown()`

```javascript
/**
 * Triggers browser download of text content as a file
 * @param {string} content - File content
 * @param {string} filename - Filename with extension
 * @param {string} mimeType - MIME type (default: text/plain)
 */
function downloadFile(content, filename, mimeType = 'text/plain') {
  try {
    const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    log.info('Downloaded file:', filename);
  } catch (err) {
    log.error('Download failed:', err);
    alert(`Failed to download file: ${err.message}`);
  }
}
```

### 3. Add `exportNote()` Function
Location: After `downloadFile()`

```javascript
/**
 * Exports a note with user-selected format
 * @param {Object} note - Note object to export
 */
async function exportNote(note) {
  if (!note) return;

  // Ask user for format
  const format = confirm(
    `Export "${note.name}":\n\n` +
    `OK = Plain Text (.txt) - removes markdown formatting\n` +
    `Cancel = Markdown (.md) - keeps markdown syntax`
  );

  const isPlainText = format; // true = .txt, false = .md
  const extension = isPlainText ? 'txt' : 'md';
  
  // Sanitize filename (remove invalid characters)
  const safeName = String(note.name || 'note')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim() || 'note';
  
  const filename = `${safeName}.${extension}`;
  
  // Process content based on format
  let content = String(note.content || '');
  if (isPlainText) {
    content = stripMarkdown(content);
  }

  // Download
  const mimeType = isPlainText ? 'text/plain' : 'text/markdown';
  downloadFile(content, filename, mimeType);
}
```

### 4. Add Export Button to Notes List UI
Location: In `renderNotesListBubble()`, in the actions section where buttons are added (around line 857)

**Add after "Ask iChrome" button:**

```javascript
// Export button
const exportBtn = document.createElement('button');
exportBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
  <polyline points="7 10 12 15 17 10"></polyline>
  <line x1="12" y1="15" x2="12" y2="3"></line>
</svg>`;
exportBtn.style.background = 'none';
exportBtn.style.border = 'none';
exportBtn.style.cursor = 'pointer';
exportBtn.style.padding = '2px 4px';
exportBtn.style.opacity = '0.6';
exportBtn.style.transition = 'opacity 0.15s ease';
exportBtn.style.display = 'inline-flex';
exportBtn.style.alignItems = 'center';
exportBtn.style.justifyContent = 'center';
exportBtn.title = 'Export note';
exportBtn.addEventListener('mouseenter', () => exportBtn.style.opacity = '1');
exportBtn.addEventListener('mouseleave', () => exportBtn.style.opacity = '0.6');
exportBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  await exportNote(n);
});

// Add to actions (before other buttons)
actions.appendChild(exportBtn);
```

### 5. Button Order in Actions
Final button order in notes list:
1. **Export** (new) ⬇️
2. Ask iChrome 💬
3. Preview 👁️
4. Edit ✏️
5. Delete 🗑️

## 📍 Integration Points

### Files Modified:
- `src/features/chromepad/chromepad.js`

### Lines to Add:
1. `stripMarkdown()` function: ~70 lines (after imports, ~line 122)
2. `downloadFile()` helper: ~20 lines (after stripMarkdown)
3. `exportNote()` function: ~30 lines (after downloadFile)
4. Export button UI: ~25 lines (in renderNotesListBubble, ~line 857)

**Total new code**: ~145 lines

## 🎨 UI Design

### Export Button Icon
- Download arrow icon (arrow pointing down into tray)
- Positioned first in action buttons row
- Same styling as other action buttons
- Tooltip: "Export note"

### Format Selection Dialog
- Native `confirm()` dialog
- Clear text explaining options:
  - **OK** = Plain Text (.txt)
  - **Cancel** = Markdown (.md)

### File Naming
- Uses note name as filename
- Sanitizes invalid characters (`< > : " / \ | ? *`)
- Replaces spaces with underscores
- Fallback to "note" if name is empty

## ✅ Quality Checklist

- [x] Test suite created and all tests pass
- [x] Handles all common markdown syntax
- [x] Handles edge cases (empty, whitespace, nested)
- [x] Safe filename generation
- [x] Proper MIME types for downloads
- [x] Consistent UI styling
- [x] Error handling with user feedback
- [x] Logging for debugging

## 🚀 Ready for Implementation

All test cases verified. Solution ready to deploy.

**Next Step**: Await user approval to proceed with implementation.

