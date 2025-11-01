// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// MULTI-CHUNK PROCESSOR - Query each context chunk and synthesize final answer
// ============================================================================

import { sendPrompt } from './ai.js';
import { logger } from '../core/logger.js';

const log = logger.create('MultiChunkProcessor');

/**
 * Processes a user's query across multiple context snippets (chunks), gathers
 * responses, and synthesizes a final comprehensive answer.
 *
 * @param {Object} params
 * @param {Array<{ id: string, text: string, label?: string }>} params.contexts
 * @param {string} params.query
 * @param {Object} params.config
 * @param {AbortSignal} [params.signal]
 * @param {(info: { phase: 'processing'|'synthesizing', current: number, total: number }) => void} [params.onProgress]
 * @returns {Promise<{ answer: string, items: Array<{ ctxId: string, label?: string, response: string|null, hasAnswer: boolean, error?: string }> }>} result
 */
export async function processMultiContexts({ contexts, query, config = {}, signal, onProgress }) {
  const items = [];
  const total = Array.isArray(contexts) ? contexts.length : 0;
  const chunkTemplate = getChunkPromptTemplate(config);

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new Error('aborted');
    const ctx = contexts[i];

    try {
      if (onProgress) onProgress({ phase: 'processing', current: i + 1, total });
      const prompt = buildChunkPrompt(ctx, query, chunkTemplate, i + 1, total);
      const response = await sendPrompt(prompt, { signal });
      items.push({ ctxId: ctx.id, label: ctx.label, response, hasAnswer: containsAnswer(response) });
    } catch (error) {
      if (String(error?.message) === 'aborted') throw error;
      log.warn('Chunk processing failed:', error);
      items.push({ ctxId: ctx.id, label: ctx.label, response: null, hasAnswer: false, error: String(error?.message || 'failed') });
    }
  }

  if (onProgress) onProgress({ phase: 'synthesizing', current: total, total });
  const answer = await synthesize(items, query, config, signal);
  return { answer, items };
}

function getChunkPromptTemplate(config) {
  return String(config.chunkPromptTemplate || `
You are analyzing part {index} of {total} from a larger selection.

CONTEXT (CHUNK {index}/{total}):
{content}

USER QUESTION:
{query}

INSTRUCTIONS:
- Answer only using information in this chunk
- If not found, reply exactly: "No relevant information found in this section"
- Keep it concise but specific
`).trim();
}

function buildChunkPrompt(ctx, query, template, index, total) {
  const content = String(ctx?.text || '');
  return template
    .replaceAll('{index}', String(index))
    .replaceAll('{total}', String(total))
    .replace('{content}', content)
    .replace('{query}', String(query || ''));
}

function containsAnswer(response) {
  const s = String(response || '').toLowerCase();
  if (!s) return false;
  const negatives = [
    'no relevant information',
    'not found',
    'cannot find',
    'does not contain',
    'not mentioned',
  ];
  return !negatives.some(n => s.includes(n));
}

async function synthesize(items, query, config, signal) {
  const valid = items.filter(it => it.hasAnswer && it.response);
  if (valid.length === 0) {
    return 'I could not find relevant information to answer your question in the provided chunks.';
  }
  if (valid.length === 1) return String(valid[0].response || '');

  if (String(config.synthesizeStrategy || 'llm') === 'llm') {
    const prompt = buildSynthesisPrompt(valid, query);
    try {
      return await sendPrompt(prompt, { signal });
    } catch (e) {
      log.warn('LLM synthesis failed, falling back to concatenation:', e);
      return valid.map(v => v.response).join('\n\n---\n\n');
    }
  }
  return valid.map(v => v.response).join('\n\n---\n\n');
}

function buildSynthesisPrompt(validItems, query) {
  const parts = validItems.map((it, idx) => `CHUNK ${idx + 1}${it.label ? ` (${it.label})` : ''} RESPONSE:\n${it.response}`);
  return `I asked a question about a larger document split into ${validItems.length} relevant chunks.\n\n${parts.join('\n\n---\n\n')}\n\nORIGINAL QUESTION: ${query}\n\nTASK: Synthesize a single comprehensive answer that combines the relevant information, removes redundancy, and remains accurate.`;
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { processMultiContexts };
}


