// ============================================================================
// AI MANAGER - Gemini Nano Language Model Integration
// ============================================================================
// FILE SUMMARY:
// Manages all interactions with Chrome's built-in Gemini Nano AI model.
// Handles session creation, availability checking, prompts, and cleanup.
//
// FEATURES:
// - Session management (create, reuse, destroy)
// - Availability checking
// - Language configuration
// - Streaming and non-streaming prompts
// - Error handling with custom error types
// ============================================================================

import { AI, ERROR_MESSAGES } from '../core/constants.js';
import { AIError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { getErrorMessage } from '../core/utils.js';

const log = logger.ai;

/**
 * AI session singleton
 * @type {Object|null}
 */
let aiSession = null;

/**
 * Configured language options for AI
 * @type {Object}
 */
let languageOptions = null;

/**
 * Picks the best supported output language based on browser preferences
 * @returns {string} Two-letter language code ('en', 'es', or 'ja')
 */
export function selectOutputLanguage() {
  try {
    const browserLang = (navigator.language || AI.DEFAULT_LANGUAGE)
      .slice(0, 2)
      .toLowerCase();
    
    const selectedLang = AI.ALLOWED_LANGUAGES.includes(browserLang)
      ? browserLang
      : AI.DEFAULT_LANGUAGE;
    
    log.info(`Selected AI output language: ${selectedLang}`);
    return selectedLang;
  } catch (error) {
    log.warn('Error detecting language, using default:', error);
    return AI.DEFAULT_LANGUAGE;
  }
}

/**
 * Initializes AI language configuration
 * Should be called once during app initialization
 */
export function initializeAI() {
  const outputLang = selectOutputLanguage();
  languageOptions = { output: { language: outputLang } };
  log.info('AI initialized with language options:', languageOptions);
}

/**
 * Gets current language options
 * @returns {Object} Language options object
 */
export function getLanguageOptions() {
  if (!languageOptions) {
    initializeAI();
  }
  return languageOptions;
}

function ensureOutputLanguage(options = {}) {
  const base = getLanguageOptions();
  const out = { ...base, ...options };
  // Deep-ensure output.language exists
  const lang = (base && base.output && base.output.language) || selectOutputLanguage();
  if (!out.output) out.output = {};
  if (!out.output.language) out.output.language = lang;
  return out;
}

/**
 * Checks AI availability status
 * @returns {Promise<string>} Availability status
 * @throws {AIError} If check fails
 */
export async function checkAIAvailability() {
  try {
    if (!('LanguageModel' in self)) {
      log.warn('LanguageModel API not available');
      return AI.AVAILABILITY_UNAVAILABLE;
    }

    const options = getLanguageOptions();
    const availability = await LanguageModel.availability(options);
    
    log.info(`AI availability: ${availability}`);
    return availability;
  } catch (error) {
    log.error('Error checking AI availability:', error);
    throw new AIError(ERROR_MESSAGES.AI_CHECK_ERROR);
  }
}

/**
 * Creates a new AI session
 * @returns {Promise<Object>} AI session object
 * @throws {AIError} If session creation fails
 */
export async function createAISession() {
  try {
    log.info('Creating new AI session');
    
    const availability = await checkAIAvailability();
    
    if (availability === AI.AVAILABILITY_UNAVAILABLE) {
      throw new AIError(ERROR_MESSAGES.AI_UNAVAILABLE);
    }

    const options = getLanguageOptions();
    const session = await LanguageModel.create(options);
    
    log.info('AI session created successfully');
    return session;
  } catch (error) {
    const message = getErrorMessage(error, ERROR_MESSAGES.AI_SESSION_ERROR);
    log.error('Failed to create AI session:', message);
    throw new AIError(message);
  }
}

/**
 * Gets or creates the AI session (singleton pattern)
 * @returns {Promise<Object|null>} AI session or null if unavailable
 */
export async function ensureAISession() {
  if (aiSession) {
    log.debug('Reusing existing AI session');
    return aiSession;
  }

  try {
    aiSession = await createAISession();
    return aiSession;
  } catch (error) {
    log.error('Could not ensure AI session:', error);
    return null;
  }
}

/**
 * Sends a prompt to the AI and gets a response
 * @param {string} prompt - The prompt text
 * @param {Object} options - Additional options (merged with language options)
 * @returns {Promise<string>} AI response text
 * @throws {AIError} If prompt fails
 */
export async function sendPrompt(prompt, options = {}) {
  const session = await ensureAISession();
  
  if (!session) {
    throw new AIError(ERROR_MESSAGES.AI_UNAVAILABLE);
  }

  try {
    log.debug('Sending prompt to AI');
    let mergedOptions = ensureOutputLanguage(options);
    const response = await session.prompt(prompt, mergedOptions);
    log.debug('Received AI response');
    return response;
  } catch (error) {
    // Retry once with enforced 'en' language if output missing
    const msg = String(error && (error.message || error)) || '';
    if (msg.toLowerCase().includes('no output language')) {
      try {
        const retryOptions = ensureOutputLanguage({ output: { language: 'en' } });
        const response = await session.prompt(prompt, retryOptions);
        return response;
      } catch (e2) {
        const message2 = getErrorMessage(e2, 'AI prompt failed');
        log.error('Prompt error (retry):', message2);
        throw new AIError(message2);
      }
    }
    const message = getErrorMessage(error, 'AI prompt failed');
    log.error('Prompt error:', message);
    throw new AIError(message);
  }
}

/**
 * Sends a streaming prompt to the AI
 * @param {string} prompt - The prompt text
 * @param {Object} options - Additional options (merged with language options)
 * @returns {Promise<AsyncIterable<string>>} Async iterable of response chunks
 * @throws {AIError} If streaming fails
 */
export async function sendStreamingPrompt(prompt, options = {}) {
  const session = await ensureAISession();
  
  if (!session) {
    throw new AIError(ERROR_MESSAGES.AI_UNAVAILABLE);
  }

  if (!session.promptStreaming) {
    log.warn('Streaming not available, falling back to regular prompt');
    const response = await sendPrompt(prompt, options);
    // Convert to async iterable
    return (async function* () {
      yield response;
    })();
  }

  try {
    log.debug('Sending streaming prompt to AI');
    let mergedOptions = ensureOutputLanguage(options);
    let stream = session.promptStreaming(prompt, mergedOptions);
    log.debug('Streaming started');
    return stream;
  } catch (error) {
    // Retry once with enforced 'en' language
    const msg = String(error && (error.message || error)) || '';
    if (msg.toLowerCase().includes('no output language')) {
      try {
        const retryOptions = ensureOutputLanguage({ output: { language: 'en' } });
        const stream2 = session.promptStreaming(prompt, retryOptions);
        log.debug('Streaming started (retry)');
        return stream2;
      } catch (e2) {
        const message2 = getErrorMessage(e2, 'AI streaming failed');
        log.error('Streaming error (retry):', message2);
        throw new AIError(message2);
      }
    }
    const message = getErrorMessage(error, 'AI streaming failed');
    log.error('Streaming error:', message);
    throw new AIError(message);
  }
}

/**
 * Clones the current AI session for isolated operations
 * Useful for one-off operations that shouldn't affect main conversation
 * @returns {Promise<Object|null>} Cloned session or new session
 */
export async function cloneAISession() {
  const session = await ensureAISession();
  
  if (!session) {
    return null;
  }

  try {
    if (session.clone) {
      log.debug('Cloning AI session');
      return await session.clone();
    } else {
      log.debug('Clone not supported, creating new session');
      return await createAISession();
    }
  } catch (error) {
    log.error('Failed to clone session:', error);
    return await createAISession();
  }
}

/**
 * Destroys the current AI session and frees resources
 */
export function destroyAISession() {
  if (aiSession) {
    try {
      log.info('Destroying AI session');
      aiSession.destroy();
      aiSession = null;
      log.info('AI session destroyed');
    } catch (error) {
      log.error('Error destroying AI session:', error);
      aiSession = null;
    }
  }
}

/**
 * Checks if AI session exists and is ready
 * @returns {boolean} True if session exists
 */
export function hasActiveSession() {
  return aiSession !== null;
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    selectOutputLanguage,
    initializeAI,
    getLanguageOptions,
    checkAIAvailability,
    createAISession,
    ensureAISession,
    sendPrompt,
    sendStreamingPrompt,
    cloneAISession,
    destroyAISession,
    hasActiveSession,
  };
}

