// ============================================================================
// INTERNAL MARKDOWN RENDERER (Dependency-free)
// ----------------------------------------------------------------------------
// Supports a useful subset of Markdown using only browser APIs:
// - Headings (# .. ######)
// - Emphasis (**bold**, *italic*, ~~strike~~)
// - Inline code `code`
// - Code blocks ```lang\n...```
// - Lists (-, *, 1.) with simple grouping
// - Blockquotes (> ...)
// - Horizontal rules (---, ***, ___)
// - Links [text](https://...) and basic autolinks
// Security: Escapes HTML first; only whitelisted tags are added
// ----------------------------------------------------------------------------

function getConfig() {
  try { return (window.CONFIG && window.CONFIG.markdown) || {}; } catch { return {}; }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replaceInlinePlaceholders(html, inlineCodes) {
  return html.replace(/@@INLINE_CODE_(\d+)@@/g, (m, idx) => inlineCodes[Number(idx)] || '');
}

function replaceBlockPlaceholders(html, codeBlocks) {
  return html.replace(/@@CODE_BLOCK_(\d+)@@/g, (m, idx) => codeBlocks[Number(idx)] || '');
}

function processInline(mdText) {
  const cfg = getConfig();
  const enabled = (name) => cfg.features?.[name] !== false;

  // Escape first
  let out = escapeHtml(mdText);

  // Inline code: protect with placeholders first
  const inlineCodes = [];
  out = out.replace(/`([^`]+)`/g, (m, code) => {
    const html = `<code>${escapeHtml(code)}</code>`;
    inlineCodes.push(html);
    return `@@INLINE_CODE_${inlineCodes.length - 1}@@`;
  });

  // Links: [text](url)
  if (enabled('links')) {
    const openNew = getConfig().openLinksInNewTab !== false;
    out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, text, href) => {
      const rel = 'noopener noreferrer';
      const target = openNew ? ' target="_blank"' : '';
      return `<a href="${href}" rel="${rel}"${target}>${escapeHtml(text)}</a>`;
    });
  }

  // Autolinks: https://...
  if (enabled('autolinks')) {
    const openNew = getConfig().openLinksInNewTab !== false;
    out = out.replace(/(?<![\"'=])(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g, (url) => {
      const rel = 'noopener noreferrer';
      const target = openNew ? ' target="_blank"' : '';
      return `<a href="${url}" rel="${rel}"${target}>${url}</a>`;
    });
  }

  // Emphasis: bold, italic, strike
  if (enabled('emphasis')) {
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
    out = out.replace(/~~(.+?)~~/g, '<s>$1</s>');
  }

  // Restore inline code placeholders
  out = replaceInlinePlaceholders(out, inlineCodes);
  return out;
}

function processBlocks(md) {
  const cfg = getConfig();
  const enabled = (name) => cfg.features?.[name] !== false;

  // Extract code blocks first (protect content)
  const codeBlocks = [];
  let src = String(md || '');
  
  // Handle both ``` with newline and ``` on same line
  src = src.replace(/```([A-Za-z0-9_-]*)\r?\n([\s\S]*?)\r?\n```|```([A-Za-z0-9_-]*)[ \t]*([\s\S]*?)```/g, (m, lang1, code1, lang2, code2) => {
    const lang = lang1 || lang2 || '';
    const code = code1 || code2 || '';
    const langClass = lang ? ` class="language-${lang}"` : '';
    const html = `<pre><code${langClass}>${escapeHtml(code)}</code></pre>`;
    codeBlocks.push(html);
    return `@@CODE_BLOCK_${codeBlocks.length - 1}@@`;
  });

  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const html = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();

    if (trim === '') { i += 1; continue; }

    // Horizontal rule
    if (enabled('hr') && /^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)$/.test(trim)) {
      html.push('<hr>'); i += 1; continue;
    }

    // Heading
    const hMatch = enabled('headings') && line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = Math.min(6, hMatch[1].length);
      html.push(`<h${level}>${processInline(hMatch[2])}</h${level}>`);
      i += 1; continue;
    }

    // Blockquote (single-line)
    if (enabled('blockquotes') && /^\s{0,3}>\s+/.test(line)) {
      const qtext = line.replace(/^\s{0,3}>\s+/, '');
      html.push(`<blockquote>${processInline(qtext)}</blockquote>`);
      i += 1; continue;
    }

    // Unordered list
    if (enabled('lists') && /^\s*[-*]\s+/.test(line)) {
      html.push('<ul>');
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*[-*]\s+/, '');
        html.push(`<li>${processInline(item)}</li>`);
        i += 1;
      }
      html.push('</ul>');
      continue;
    }

    // Ordered list
    if (enabled('lists') && /^\s*\d+\.\s+/.test(line)) {
      html.push('<ol>');
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*\d+\.\s+/, '');
        html.push(`<li>${processInline(item)}</li>`);
        i += 1;
      }
      html.push('</ol>');
      continue;
    }

    // Paragraph (merge consecutive non-empty, non-special lines)
    const buff = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^\s{0,3}(#{1,6})\s+/.test(lines[i]) &&
           !/^\s{0,3}>\s+/.test(lines[i]) &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i]) &&
           !/^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)$/.test(lines[i].trim())) {
      buff.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${processInline(buff.join(' '))}</p>`);
  }

  // Restore code blocks
  return replaceBlockPlaceholders(html.join('\n'), codeBlocks);
}

export function renderMarkdown(mdText) {
  const cfg = getConfig();
  if (cfg.enabled === false) return escapeHtml(String(mdText || ''));
  try {
    return processBlocks(String(mdText || ''));
  } catch {
    // Fallback: safe escaped text
    return escapeHtml(String(mdText || ''));
  }
}

export default { renderMarkdown };


