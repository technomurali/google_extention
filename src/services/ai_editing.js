// =============================================================================
// AI EDITING SERVICES - Proofread, Rewrite, Generate
// =============================================================================
// Provides wrappers around Chrome built-in AI APIs where available, with
// graceful fallbacks to prompt-based calls via existing ai.js services.
// =============================================================================

import { sendPrompt } from './ai.js';
import { logger } from '../core/logger.js';
import { AI } from '../core/constants.js';

const log = logger.create('AIEditing');

function safeGetChromeAI() {
  try {
    // @ts-ignore
    return (window && window.ai) ? window.ai : null;
  } catch {
    return null;
  }
}

function getOutputLanguage() {
  try {
    const cfgLang = (window && window.CONFIG && window.CONFIG.ai && window.CONFIG.ai.outputLanguage) || AI.DEFAULT_LANGUAGE || 'en';
    const lang = String(cfgLang || '').toLowerCase();
    return (AI.ALLOWED_LANGUAGES || ['en']).includes(lang) ? lang : 'en';
  } catch {
    return 'en';
  }
}

export async function proofreadText(text) {
  const ai = safeGetChromeAI();
  const outputLanguage = getOutputLanguage();
  if (ai && ai.languageModel && ai.languageModel.proofread) {
    try {
      const opts = { output: { language: outputLanguage }, outputLanguage };
      const res = await ai.languageModel.proofread(text, opts);
      return { ok: true, text: res?.text || text };
    } catch (e) {
      log.warn('Proofreader API failed, falling back:', e);
      // Retry once with explicit language if not already applied
      try {
        const res2 = await ai.languageModel.proofread(text, { output: { language: 'en' }, outputLanguage: 'en' });
        return { ok: true, text: res2?.text || text };
      } catch {}
    }
  }
  try {
    const prompt = `Proofread the following text. Fix grammar and spelling. Return only corrected text. Output language: ${outputLanguage}.\n\n---\n${text}`;
    const out = await sendPrompt(prompt);
    return { ok: true, text: out };
  } catch (e) {
    log.error('Proofread fallback failed:', e);
    return { ok: false, error: String(e || 'Unknown error') };
  }
}

export async function rewriteText(text, mode = 'formal') {
  const ai = safeGetChromeAI();
  const outputLanguage = getOutputLanguage();
  if (ai && ai.languageModel && ai.languageModel.rewrite) {
    try {
      const opts = { tone: mode, output: { language: outputLanguage }, outputLanguage };
      const res = await ai.languageModel.rewrite(text, opts);
      return { ok: true, text: res?.text || text };
    } catch (e) {
      log.warn('Rewriter API failed, falling back:', e);
      try {
        const res2 = await ai.languageModel.rewrite(text, { tone: mode, output: { language: 'en' }, outputLanguage: 'en' });
        return { ok: true, text: res2?.text || text };
      } catch {}
    }
  }
  try {
    const instruction = {
      formal: 'Rewrite in a more formal, professional tone.',
      casual: 'Rewrite in a friendlier, casual tone.',
      shorter: 'Rewrite to be more concise and shorter.',
      longer: 'Rewrite to be slightly longer and more detailed.',
    }[mode] || 'Rewrite with improvements.';
    const prompt = `${instruction} Return only rewritten text. Output language: ${outputLanguage}.\n\n---\n${text}`;
    const out = await sendPrompt(prompt);
    return { ok: true, text: out };
  } catch (e) {
    log.error('Rewrite fallback failed:', e);
    return { ok: false, error: String(e || 'Unknown error') };
  }
}

export async function generateTextFromPrompt(promptText) {
  const ai = safeGetChromeAI();
  const outputLanguage = getOutputLanguage();
  if (ai && ai.languageModel && ai.languageModel.write) {
    try {
      const res = await ai.languageModel.write({ prompt: promptText, output: { language: outputLanguage }, outputLanguage });
      return { ok: true, text: res?.text || '' };
    } catch (e) {
      log.warn('Writer API failed, falling back:', e);
      try {
        const res2 = await ai.languageModel.write({ prompt: promptText, output: { language: 'en' }, outputLanguage: 'en' });
        return { ok: true, text: res2?.text || '' };
      } catch {}
    }
  }
  try {
    const out = await sendPrompt(`${promptText}\n\nOutput language: ${outputLanguage}.`);
    return { ok: true, text: out };
  } catch (e) {
    log.error('Writer fallback failed:', e);
    return { ok: false, error: String(e || 'Unknown error') };
  }
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { proofreadText, rewriteText, generateTextFromPrompt };
}


