// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// Injected into the active tab to extract readable text content.
// Focus on visible text; ignore scripts/styles. PDFs or non-HTML pages will yield minimal text.

(function() {
  try {
    function getVisibleText(node) {
      const walker = document.createTreeWalker(node || document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          if (!n || !n.parentElement) return NodeFilter.FILTER_REJECT;
          const parent = n.parentElement;
          const tag = parent.tagName;
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO'].includes(tag)) return NodeFilter.FILTER_REJECT;
          const text = n.nodeValue || '';
          if (!text.trim()) return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(parent);
          if (style && (style.visibility === 'hidden' || style.display === 'none')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const parts = [];
      while (walker.nextNode()) {
        parts.push(walker.currentNode.nodeValue);
      }
      return parts.join('\n');
    }

    function extractHeadings() {
      const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
      return hs.map(h => (h.textContent || '').trim()).filter(Boolean);
    }

    const payload = {
      title: document.title || '',
      url: location.href,
      text: getVisibleText(document.body),
      headings: extractHeadings(),
      timestamp: Date.now(),
    };

    return payload;
  } catch (err) {
    return { error: String(err && err.message || err) };
  }
})();


