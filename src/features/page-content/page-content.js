// Page content capture and chunking utilities for @Page tool

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

export function chunkContent(payload, config) {
  const cfg = Object.assign({ maxChunkChars: 12000, overlapChars: 500, minChunkChars: 1000 }, config || {});
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

export const pageState = {
  title: '',
  url: '',
  favicon: '',
  chunks: [],
  selectedChunkId: null,
  timestamp: 0,
};

export function setPageState(data) {
  pageState.title = data.title || '';
  pageState.url = data.url || '';
  pageState.favicon = data.favicon || '';
  pageState.chunks = Array.isArray(data.chunks) ? data.chunks : [];
  pageState.selectedChunkId = data.selectedChunkId || null;
  pageState.timestamp = data.timestamp || Date.now();
}

export function clearPageState() {
  setPageState({ title: '', url: '', favicon: '', chunks: [], selectedChunkId: null, timestamp: 0 });
}

export function selectChunkById(id) {
  pageState.selectedChunkId = id || null;
}


