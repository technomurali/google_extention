// ============================================================================
// TRANSLATION SERVICE - Chrome Built-in Translation API Wrapper
// ============================================================================
// FILE SUMMARY:
// Provides a thin wrapper around Chrome's on-device translation APIs.
// Handles availability, translator creation, and text translation with
// graceful fallbacks and helpful errors.
// ============================================================================

import { logger } from '../core/logger.js';
import { sendPrompt } from './ai.js';

const log = logger.create('Translation');

/**
 * Checks whether translation is available in the current environment.
 * Returns a boolean instead of throwing; callers can decide UI behavior.
 * @returns {Promise<boolean>}
 */
export async function isTranslationAvailable() {
  try {
    // Chrome built-in Translation API probe
    if (!('translation' in self)) {
      log.warn('translation API not present on window');
      return false;
    }
    if (typeof self.translation?.canTranslate !== 'function') {
      log.warn('translation.canTranslate is not a function');
      return false;
    }
    return true;
  } catch (error) {
    log.warn('Error checking translation availability:', error);
    return false;
  }
}

/**
 * Creates a translator instance for given language pair.
 * @param {{ sourceLanguage?: string, targetLanguage: string }} opts
 * @returns {Promise<any|null>} translator instance or null
 */
export async function createTranslator(opts) {
  try {
    if (!(await isTranslationAvailable())) return null;
    const options = {
      sourceLanguage: opts?.sourceLanguage || 'auto',
      targetLanguage: opts?.targetLanguage,
    };
    const can = await self.translation.canTranslate(options);
    if (can !== 'readily' && can !== 'after-download') {
      log.warn('Translation not available for opts:', options, 'state:', can);
      return null;
    }
    if (typeof self.translation.createTranslator !== 'function') {
      log.warn('translation.createTranslator is not a function');
      return null;
    }
    const translator = await self.translation.createTranslator(options);
    return translator || null;
  } catch (error) {
    log.error('Failed to create translator:', error);
    return null;
  }
}

/**
 * Translates text to the target language. Returns original text when
 * translator is unavailable, so callers can decide how to present errors.
 * @param {string} text
 * @param {{ sourceLanguage?: string, targetLanguage: string }} opts
 * @returns {Promise<{ ok: boolean, text: string, error?: string }>} result
 */
export async function translateText(text, opts) {
  try {
    const translator = await createTranslator(opts);
    if (!translator) {
      // Fallback: Use AI model to translate via prompt
      log.info('Translation API unavailable, using AI fallback');
      const target = String(opts?.targetLanguage || '').toLowerCase();
      if (!target) return { ok: false, text, error: 'translator_unavailable' };
      
      // Map language codes to full names for better AI understanding
      const langMap = {
        'en': 'English', 'es': 'Spanish', 'fr': 'French', 'ja': 'Japanese',
        'pt': 'Portuguese', 'de': 'German', 'zh': 'Chinese', 'hi': 'Hindi',
        'ar': 'Arabic', 'te': 'Telugu', 'ko': 'Korean', 'it': 'Italian',
        'ru': 'Russian', 'nl': 'Dutch', 'pl': 'Polish', 'tr': 'Turkish'
      };
      const langName = langMap[target] || target;
      
      const prompt = `Translate the following text to ${langName}. Output ONLY the translated text, nothing else.\n\nText to translate:\n${String(text || '')}`;
      try {
        log.debug(`Translating to ${langName} via AI`);
        const response = await sendPrompt(prompt);
        if (typeof response === 'string' && response.trim()) {
          log.info('AI translation successful');
          return { ok: true, text: response.trim() };
        }
        log.warn('AI returned empty response');
      } catch (e) {
        log.error('AI fallback translation failed:', e);
      }
      return { ok: false, text, error: 'translator_unavailable' };
    }
    if (typeof translator.translate !== 'function') {
      return { ok: false, text, error: 'translate_method_missing' };
    }
    const result = await translator.translate(String(text || ''));
    if (typeof result === 'string') {
      return { ok: true, text: result };
    }
    // Some variants may return { translatedText }
    if (result && typeof result.translatedText === 'string') {
      return { ok: true, text: result.translatedText };
    }
    return { ok: false, text, error: 'unexpected_result' };
  } catch (error) {
    log.error('translateText error:', error);
    return { ok: false, text, error: 'exception' };
  }
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isTranslationAvailable,
    createTranslator,
    translateText,
  };
}


