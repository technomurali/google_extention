// ============================================================================
// SPEECH SERVICE - Text-to-Speech using Web Speech API
// ============================================================================
// FILE SUMMARY:
// Provides text-to-speech functionality using Chrome's built-in SpeechSynthesis API.
// Manages voice selection, playback controls, settings persistence, and text highlighting.
//
// FEATURES:
// - Play/pause/stop speech synthesis
// - Voice selection with language info
// - Adjustable rate, pitch, and volume
// - Text highlighting during playback
// - Settings persistence via chrome.storage
// - Multiple instance management (only one speaks at a time)
// ============================================================================

import { logger } from '../core/logger.js';

const log = logger.create('Speech');

// ============================================
// STATE MANAGEMENT
// ============================================

let currentUtterance = null;
let currentElement = null;
let currentButton = null;
let isPaused = false;
let settings = {
  voice: null,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

function dispatchOnButton(type) {
  try {
    if (currentButton && typeof currentButton.dispatchEvent === 'function') {
      currentButton.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
    }
  } catch {}
}

/**
 * Basic language detection using Unicode ranges and punctuation heuristics.
 * Returns a BCP-47 language code guess (e.g., 'en', 'te', 'ja', 'zh', 'ar', 'ru', 'hi').
 * This is a best-effort, lightweight detector.
 * @param {string} text
 * @returns {string|null}
 */
function detectLanguageFromText(text) {
  const s = String(text || '');
  if (!s.trim()) return null;

  // Fast checks by script
  if (/[\u0C00-\u0C7F]/.test(s)) return 'te'; // Telugu
  if (/[\u0900-\u097F]/.test(s)) return 'hi'; // Devanagari (Hindi, etc.)
  if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(s)) return 'ja'; // Japanese (Hiragana/Katakana)
  if (/[\u4E00-\u9FFF]/.test(s)) return 'zh'; // CJK Unified Ideographs (Chinese)
  if (/[\u0600-\u06FF]/.test(s)) return 'ar'; // Arabic
  if (/[\u0400-\u04FF]/.test(s)) return 'ru'; // Cyrillic (Russian, etc.)
  if (/[\u00C0-\u017F]/.test(s)) {
    // Latin with diacritics could still be many langs; guess 'es' if inverted punctuation appears
    if (/¡|¿/.test(s)) return 'es';
  }
  // Simple common words heuristic (very rough)
  const lower = s.toLowerCase();
  if (/( the | and | to | of | you | for | with )/.test(` ${lower} `)) return 'en';
  if (/( el | la | de | que | y | para )/.test(` ${lower} `)) return 'es';
  if (/( le | la | de | et | pour )/.test(` ${lower} `)) return 'fr';
  if (/( der | die | und | zu | ist )/.test(` ${lower} `)) return 'de';
  return 'en';
}

/**
 * Picks the best matching voice for a target language code.
 * Falls back to existing settings.voice or default browser voice.
 * @param {string|null} langCode
 * @returns {Promise<SpeechSynthesisVoice|null>}
 */
async function pickBestVoiceForLanguage(langCode) {
  const voices = await getVoices();
  if (!voices || voices.length === 0) return settings.voice || null;

  const code = (langCode || '').toLowerCase();
  if (!code) return settings.voice || null;

  // Exact language-region match first (e.g., en-US)
  let candidates = voices.filter(v => String(v.lang || '').toLowerCase() === code);
  if (candidates.length > 0) return candidates[0];

  // Language-only match (e.g., en)
  const base = code.split('-')[0];
  candidates = voices.filter(v => String(v.lang || '').toLowerCase().startsWith(base));
  if (candidates.length > 0) return candidates[0];

  // Fallback: any existing settings.voice or first available voice
  return settings.voice || voices[0] || null;
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Checks if Speech Synthesis is available
 * @returns {boolean}
 */
export function isSpeechAvailable() {
  return 'speechSynthesis' in window;
}

/**
 * Gets available voices
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
export function getVoices() {
  return new Promise((resolve) => {
    let voices = window.speechSynthesis.getVoices();
    
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    // Voices might load asynchronously
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices();
      resolve(voices);
    };

    // Fallback timeout
    setTimeout(() => {
      voices = window.speechSynthesis.getVoices();
      resolve(voices);
    }, 100);
  });
}

/**
 * Initializes speech service and loads saved settings
 */
export async function initializeSpeech() {
  if (!isSpeechAvailable()) {
    log.warn('Speech Synthesis API not available');
    return false;
  }

  try {
    // Load saved settings
    const stored = await chrome.storage.local.get('speechSettings');
    if (stored.speechSettings) {
      settings = { ...settings, ...stored.speechSettings };
      log.info('Loaded speech settings:', settings);
    }

    // Ensure voices are loaded
    await getVoices();
    log.info('Speech service initialized');
    return true;
  } catch (error) {
    log.error('Failed to initialize speech service:', error);
    return false;
  }
}

// ============================================
// SETTINGS MANAGEMENT
// ============================================

/**
 * Gets current speech settings
 * @returns {Object}
 */
export function getSettings() {
  return { ...settings };
}

/**
 * Updates speech settings and persists them
 * @param {Object} newSettings - Settings to update
 */
export async function updateSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  
  try {
    // Persist to storage (excluding voice object, save only voice name)
    const toSave = {
      ...settings,
      voice: settings.voice ? settings.voice.name : null,
    };
    await chrome.storage.local.set({ speechSettings: toSave });
    log.info('Speech settings saved:', toSave);
  } catch (error) {
    log.error('Failed to save speech settings:', error);
  }
}

/**
 * Restores voice object from saved voice name
 * @param {string} voiceName - Name of the voice to restore
 * @returns {Promise<SpeechSynthesisVoice|null>}
 */
export async function restoreVoice(voiceName) {
  if (!voiceName) return null;
  
  const voices = await getVoices();
  const voice = voices.find(v => v.name === voiceName);
  
  if (voice) {
    settings.voice = voice;
  }
  
  return voice;
}

// ============================================
// PLAYBACK CONTROLS
// ============================================

/**
 * Highlights text being spoken
 * @param {HTMLElement} element - Element containing the text
 * @param {number} charIndex - Current character index
 * @param {number} charLength - Length of current word
 */
function highlightText(element, charIndex, charLength) {
  if (!element) return;

  const config = window.CONFIG?.speech;
  if (!config || !config.highlightText) return;

  const text = element.textContent || '';
  const before = text.substring(0, charIndex);
  const word = text.substring(charIndex, charIndex + charLength);
  const after = text.substring(charIndex + charLength);

  // Create highlighted version
  element.innerHTML = `${escapeHtml(before)}<mark style="background: rgba(255, 255, 100, 0.4); border-radius: 2px; padding: 0 2px;">${escapeHtml(word)}</mark>${escapeHtml(after)}`;
}

/**
 * Removes text highlighting
 * @param {HTMLElement} element - Element to restore
 */
function removeHighlight(element) {
  if (!element) return;
  
  // Get original text and restore it
  const text = element.textContent || '';
  element.textContent = text;
}

/**
 * Escapes HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Updates button icon based on speech state
 * @param {HTMLElement} button - Speech button element
 * @param {string} state - 'play', 'pause', or 'stop'
 */
function updateButtonIcon(button, state) {
  if (!button) return;

  const config = window.CONFIG?.speech?.labels || {};
  
  switch (state) {
    case 'pause':
      button.innerHTML = '⏸';
      button.title = config.pause || 'Pause';
      break;
    case 'resume':
      button.innerHTML = '▶️';
      button.title = config.resume || 'Resume';
      break;
    case 'play':
    default:
      button.innerHTML = '🔊';
      button.title = config.speak || 'Read aloud';
      break;
  }
}

/**
 * Speaks the text content of an element
 * @param {HTMLElement} element - Element containing text to speak
 * @param {HTMLElement} button - Button that triggered the speech
 */
export function speak(element, button) {
  if (!isSpeechAvailable()) {
    log.error('Speech Synthesis not available');
    return;
  }

  const text = element.textContent || '';
  if (!text.trim()) {
    log.warn('No text to speak');
    return;
  }

  // Stop any current speech
  stop();

  // Create new utterance
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentElement = element;
  currentButton = button;
  isPaused = false;

  // Determine language for voice selection
  // Prefer translated language if present on parent bubble
  let langFromBubble = null;
  try {
    const bubble = element.closest('.msg.ai');
    if (bubble && typeof bubble.dataset.currentLang === 'string' && bubble.dataset.currentLang) {
      langFromBubble = bubble.dataset.currentLang;
    }
  } catch {}

  const detectedLang = langFromBubble || detectLanguageFromText(text);
  currentUtterance.lang = detectedLang || undefined;

  // If user explicitly selected a voice, prefer that
  if (settings.voice) {
    currentUtterance.voice = settings.voice;
    currentUtterance.rate = settings.rate;
    currentUtterance.pitch = settings.pitch;
    currentUtterance.volume = settings.volume;
    window.speechSynthesis.speak(currentUtterance);
    updateButtonIcon(button, 'pause');
    dispatchOnButton('speech-started');
    log.info('Speech started (user voice)', { detectedLang, voice: settings.voice?.name });
  } else {
    // Apply settings and best voice for language
    (async () => {
      try {
        const bestVoice = await pickBestVoiceForLanguage(detectedLang);
        if (bestVoice) currentUtterance.voice = bestVoice;
      } catch (e) {
        // ignore voice selection errors
      } finally {
        currentUtterance.rate = settings.rate;
        currentUtterance.pitch = settings.pitch;
        currentUtterance.volume = settings.volume;

        // Start speaking after voice/rate configured
        window.speechSynthesis.speak(currentUtterance);
        updateButtonIcon(button, 'pause');
        dispatchOnButton('speech-started');
        log.info('Speech started', { detectedLang });
      }
    })();
  }

  // Event handlers
  currentUtterance.onboundary = (event) => {
    if (event.name === 'word') {
      highlightText(currentElement, event.charIndex, event.charLength || 1);
    }
  };

  currentUtterance.onend = () => {
    removeHighlight(currentElement);
    updateButtonIcon(currentButton, 'play');
    dispatchOnButton('speech-ended');
    currentUtterance = null;
    currentElement = null;
    currentButton = null;
    isPaused = false;
    log.info('Speech ended');
  };

  currentUtterance.onerror = (event) => {
    log.error('Speech error:', event.error);
    removeHighlight(currentElement);
    updateButtonIcon(currentButton, 'play');
    dispatchOnButton('speech-ended');
    currentUtterance = null;
    currentElement = null;
    currentButton = null;
    isPaused = false;
  };
  // Speaking is started asynchronously after voice selection
}

/**
 * Pauses current speech
 */
export function pause() {
  if (!currentUtterance || isPaused) return;

  window.speechSynthesis.pause();
  isPaused = true;
  updateButtonIcon(currentButton, 'resume');
  dispatchOnButton('speech-paused');
  log.info('Speech paused');
}

/**
 * Resumes paused speech
 */
export function resume() {
  if (!currentUtterance || !isPaused) return;

  window.speechSynthesis.resume();
  isPaused = false;
  updateButtonIcon(currentButton, 'pause');
  dispatchOnButton('speech-resumed');
  log.info('Speech resumed');
}

/**
 * Stops current speech
 */
export function stop() {
  if (!currentUtterance) return;

  window.speechSynthesis.cancel();
  removeHighlight(currentElement);
  updateButtonIcon(currentButton, 'play');
  dispatchOnButton('speech-ended');
  currentUtterance = null;
  currentElement = null;
  currentButton = null;
  isPaused = false;
  log.info('Speech stopped');
}

/**
 * Toggles play/pause
 * @param {HTMLElement} element - Element containing text
 * @param {HTMLElement} button - Button that was clicked
 */
export function toggle(element, button) {
  // If this is a different element, start new speech
  if (currentElement !== element) {
    speak(element, button);
    return;
  }

  // Same element - toggle pause/resume
  if (isPaused) {
    resume();
  } else if (currentUtterance) {
    pause();
  } else {
    speak(element, button);
  }
}

/**
 * Checks if speech is currently active
 * @returns {boolean}
 */
export function isSpeaking() {
  return window.speechSynthesis.speaking;
}

/**
 * Checks if speech is currently paused
 * @returns {boolean}
 */
export function isPausedState() {
  return isPaused;
}

// ============================================
// CLEANUP
// ============================================

/**
 * Cleans up speech service
 */
export function cleanup() {
  stop();
  log.info('Speech service cleaned up');
}

