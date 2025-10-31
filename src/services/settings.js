// ============================================================================
// SETTINGS SERVICE - Centralized Settings Management
// ============================================================================
// FILE SUMMARY:
// Provides centralized settings management for the entire extension.
// Handles storage, validation, migration, and provides a unified API for
// all settings categories.
//
// FEATURES:
// - Default settings schema
// - Get/Set operations with validation
// - Automatic migration from old settings format
// - Event system for settings changes
// - Export/Import functionality
// ============================================================================

import { logger } from '../core/logger.js';

const log = logger.create('Settings');

// ============================================
// DEFAULT SETTINGS SCHEMA
// ============================================

/**
 * Default settings structure
 * All settings fall back to these values if not set
 */
const DEFAULT_SETTINGS = {
  version: '2.0',
  audio: {
    voice: null,
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
  },
  chat: {
    markdown: true,
    autoScroll: true,
    timestamps: false,
    historyLimit: 100,
  },
  tools: {
    chat: {
      retrieval: true,
      topM: 12,
      rerankK: 4,
      useLLM: true,
    },
    history: {
      enabled: true,
      maxResults: 10,
      dateRange: 'all', // '7days', '30days', '90days', 'all'
    },
    bookmarks: {
      enabled: true,
      maxResults: 10,
      searchFolders: true,
    },
    downloads: {
      enabled: true,
      maxResults: 10,
      includeMetadata: true,
    },
    page: {
      enabled: true,
      maxChunk: 12000,
      overlap: 500,
      autoCapture: true,
      clearOnSwitch: true,
    },
    chromepad: {
      enabled: true,
      autoSave: true,
      typewriter: true,
      showSuccess: true,
    },
  },
  translation: {
    enabled: true,
    defaultSource: 'auto',
    recentLimit: 3,
    showCodes: true,
    animationSpeed: 8,
  },
  contextSelection: {
    enabled: true,
    maxSnippets: 5,
    maxChars: 800,
    highlight: true,
    useRetrieval: true,
    preIndex: true,
  },
  appearance: {
    theme: 'auto', // 'auto', 'light', 'dark'
    fontSize: 'medium', // 'small', 'medium', 'large'
    inputHeight: { min: 36, max: 40 },
    showIcons: true,
  },
  help: {
    showOnLoad: true, // PRIMARY: Controls whether help/onboarding shows on load
    showOnboarding: true,
    showTooltips: true,
  },
};

// ============================================
// STATE MANAGEMENT
// ============================================

let cachedSettings = null;
let isInitialized = false;
const settingsChangeListeners = new Set();

// ============================================
// VALIDATION
// ============================================

/**
 * Validates a settings object
 * @param {Object} settings - Settings to validate
 * @returns {Object} - Validated settings with defaults applied
 */
function validateSettings(settings) {
  const validated = { ...DEFAULT_SETTINGS };

  // Merge provided settings with defaults
  if (settings) {
    if (settings.audio) validated.audio = { ...validated.audio, ...settings.audio };
    if (settings.chat) validated.chat = { ...validated.chat, ...settings.chat };
    if (settings.tools) validated.tools = { ...validated.tools, ...settings.tools };
    if (settings.translation) validated.translation = { ...validated.translation, ...settings.translation };
    if (settings.contextSelection) validated.contextSelection = { ...validated.contextSelection, ...settings.contextSelection };
    if (settings.appearance) validated.appearance = { ...validated.appearance, ...settings.appearance };
    if (settings.help) validated.help = { ...validated.help, ...settings.help };
  }

  // Validate numeric ranges
  if (validated.audio.rate < 0.1 || validated.audio.rate > 10) {
    validated.audio.rate = DEFAULT_SETTINGS.audio.rate;
  }
  if (validated.audio.pitch < 0 || validated.audio.pitch > 2) {
    validated.audio.pitch = DEFAULT_SETTINGS.audio.pitch;
  }
  if (validated.audio.volume < 0 || validated.audio.volume > 1) {
    validated.audio.volume = DEFAULT_SETTINGS.audio.volume;
  }

  if (validated.chat.historyLimit < 1 || validated.chat.historyLimit > 1000) {
    validated.chat.historyLimit = DEFAULT_SETTINGS.chat.historyLimit;
  }

  // Validate enums
  const validDateRanges = ['7days', '30days', '90days', 'all'];
  if (!validDateRanges.includes(validated.tools.history.dateRange)) {
    validated.tools.history.dateRange = DEFAULT_SETTINGS.tools.history.dateRange;
  }

  const validThemes = ['auto', 'light', 'dark'];
  if (!validThemes.includes(validated.appearance.theme)) {
    validated.appearance.theme = DEFAULT_SETTINGS.appearance.theme;
  }

  const validFontSizes = ['small', 'medium', 'large'];
  if (!validFontSizes.includes(validated.appearance.fontSize)) {
    validated.appearance.fontSize = DEFAULT_SETTINGS.appearance.fontSize;
  }

  return validated;
}

// ============================================
// MIGRATION
// ============================================

/**
 * Migrates old speechSettings to new settings structure
 * @returns {Promise<Object>} - Migrated settings or null if no migration needed
 */
async function migrateOldSettings() {
  try {
    const old = await chrome.storage.local.get(['speechSettings']);
    
    if (!old.speechSettings) {
      return null; // No old settings to migrate
    }

    log.info('Migrating old speechSettings to new structure');

    // Create new settings structure with audio migrated
    const migratedSettings = { ...DEFAULT_SETTINGS };
    
    if (old.speechSettings.voice) {
      migratedSettings.audio.voice = old.speechSettings.voice;
    }
    if (typeof old.speechSettings.rate === 'number') {
      migratedSettings.audio.rate = old.speechSettings.rate;
    }
    if (typeof old.speechSettings.pitch === 'number') {
      migratedSettings.audio.pitch = old.speechSettings.pitch;
    }
    if (typeof old.speechSettings.volume === 'number') {
      migratedSettings.audio.volume = old.speechSettings.volume;
    }

    // Save backup of old settings
    await chrome.storage.local.set({
      speechSettings_backup: old.speechSettings,
    });

    log.info('Migration complete', migratedSettings.audio);
    return migratedSettings;
  } catch (error) {
    log.error('Migration failed:', error);
    return null;
  }
}

// ============================================
// STORAGE OPERATIONS
// ============================================

/**
 * Loads settings from storage
 * @returns {Promise<Object>} - Settings object
 */
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get('settings');
    
    if (stored.settings) {
      return validateSettings(stored.settings);
    }

    // Check for old settings and migrate
    const migrated = await migrateOldSettings();
    if (migrated) {
      await saveSettings(migrated);
      return migrated;
    }

    // No settings found, use defaults
    const defaults = { ...DEFAULT_SETTINGS };
    await saveSettings(defaults);
    return defaults;
  } catch (error) {
    log.error('Failed to load settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Saves settings to storage
 * @param {Object} settings - Settings to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  try {
    const validated = validateSettings(settings);
    await chrome.storage.local.set({ settings: validated });
    cachedSettings = validated;
    log.info('Settings saved');
    return validated;
  } catch (error) {
    log.error('Failed to save settings:', error);
    throw error;
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Initializes the settings service
 * Loads settings from storage and performs migration if needed
 * @returns {Promise<Object>} - Initialized settings
 */
export async function initializeSettings() {
  if (isInitialized && cachedSettings) {
    return cachedSettings;
  }

  try {
    const settings = await loadSettings();
    cachedSettings = settings;
    isInitialized = true;
    
    // Listen for external changes (e.g., from other tabs)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.settings) {
        cachedSettings = validateSettings(changes.settings.newValue);
        notifyListeners(cachedSettings);
      }
    });

    log.info('Settings service initialized');
    return settings;
  } catch (error) {
    log.error('Failed to initialize settings:', error);
    cachedSettings = { ...DEFAULT_SETTINGS };
    isInitialized = true;
    return cachedSettings;
  }
}

/**
 * Gets settings
 * @param {string|null} category - Category to get ('audio', 'chat', etc.) or null for all
 * @returns {Promise<Object>} - Settings object or category settings
 */
export async function getSettings(category = null) {
  if (!isInitialized) {
    await initializeSettings();
  }

  if (!cachedSettings) {
    cachedSettings = await loadSettings();
  }

  if (category === null) {
    return { ...cachedSettings };
  }

  // Support dot notation for nested paths (e.g., 'tools.history')
  const parts = category.split('.');
  let result = cachedSettings;
  
  for (const part of parts) {
    if (result && typeof result === 'object' && part in result) {
      result = result[part];
    } else {
      // Return default for that category
      if (category === 'audio') return { ...DEFAULT_SETTINGS.audio };
      if (category === 'chat') return { ...DEFAULT_SETTINGS.chat };
      if (category === 'tools') return { ...DEFAULT_SETTINGS.tools };
      if (category === 'translation') return { ...DEFAULT_SETTINGS.translation };
      if (category === 'contextSelection') return { ...DEFAULT_SETTINGS.contextSelection };
      if (category === 'appearance') return { ...DEFAULT_SETTINGS.appearance };
      if (category === 'help') return { ...DEFAULT_SETTINGS.help };
      return null;
    }
  }

  return result && typeof result === 'object' ? { ...result } : result;
}

/**
 * Gets settings synchronously (from cache)
 * Use this when you know settings are already loaded
 * @param {string|null} category - Category to get or null for all
 * @returns {Object} - Settings object or category settings
 */
export function getSettingsSync(category = null) {
  if (!cachedSettings) {
    log.warn('Settings not cached, returning defaults');
    if (category === null) return { ...DEFAULT_SETTINGS };
    return getSettingsSync(category);
  }

  if (category === null) {
    return { ...cachedSettings };
  }

  // Support dot notation
  const parts = category.split('.');
  let result = cachedSettings;
  
  for (const part of parts) {
    if (result && typeof result === 'object' && part in result) {
      result = result[part];
    } else {
      return null;
    }
  }

  return result && typeof result === 'object' ? { ...result } : result;
}

/**
 * Updates settings
 * @param {string} category - Category to update ('audio', 'chat', etc.)
 * @param {Object} data - Settings data to merge
 * @returns {Promise<Object>} - Updated settings
 */
export async function updateSettings(category, data) {
  if (!isInitialized) {
    await initializeSettings();
  }

  if (!cachedSettings) {
    cachedSettings = await loadSettings();
  }

  // Support dot notation for nested updates (e.g., 'tools.history')
  const parts = category.split('.');
  const updated = { ...cachedSettings };

  // Navigate to the target object
  let target = updated;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in target) || typeof target[part] !== 'object') {
      target[part] = {};
    }
    target[part] = { ...target[part] };
    target = target[part];
  }

  // Update the final property
  const finalKey = parts[parts.length - 1];
  target[finalKey] = { ...target[finalKey], ...data };

  // Save and update cache
  const validated = await saveSettings(updated);
  notifyListeners(validated);
  
  return validated;
}

/**
 * Resets settings to defaults
 * @param {string|null} category - Category to reset or null for all
 * @returns {Promise<Object>} - Reset settings
 */
export async function resetSettings(category = null) {
  if (category === null) {
    // Reset all
    const defaults = { ...DEFAULT_SETTINGS };
    await saveSettings(defaults);
    notifyListeners(defaults);
    return defaults;
  }

  // Reset specific category
  const parts = category.split('.');
  const updated = { ...cachedSettings };
  let target = updated;

  // Navigate to parent
  for (let i = 0; i < parts.length - 1; i++) {
    target = target[parts[i]];
  }

  // Reset to default
  const finalKey = parts[parts.length - 1];
  if (category === 'audio') {
    target[finalKey] = { ...DEFAULT_SETTINGS.audio };
  } else if (category === 'chat') {
    target[finalKey] = { ...DEFAULT_SETTINGS.chat };
  } else if (category === 'tools') {
    target[finalKey] = { ...DEFAULT_SETTINGS.tools };
  } else if (category === 'translation') {
    target[finalKey] = { ...DEFAULT_SETTINGS.translation };
  } else if (category === 'contextSelection') {
    target[finalKey] = { ...DEFAULT_SETTINGS.contextSelection };
  } else if (category === 'appearance') {
    target[finalKey] = { ...DEFAULT_SETTINGS.appearance };
  } else if (category === 'help') {
    target[finalKey] = { ...DEFAULT_SETTINGS.help };
  }

  await saveSettings(updated);
  notifyListeners(cachedSettings);
  return cachedSettings;
}

/**
 * Exports settings as JSON
 * @returns {Promise<string>} - JSON string
 */
export async function exportSettings() {
  const settings = await getSettings();
  return JSON.stringify(settings, null, 2);
}

/**
 * Imports settings from JSON
 * @param {string} jsonString - JSON string to import
 * @returns {Promise<Object>} - Imported settings
 */
export async function importSettings(jsonString) {
  try {
    const imported = JSON.parse(jsonString);
    const validated = validateSettings(imported);
    await saveSettings(validated);
    notifyListeners(validated);
    return validated;
  } catch (error) {
    log.error('Failed to import settings:', error);
    throw new Error('Invalid settings format');
  }
}

/**
 * Adds a listener for settings changes
 * @param {Function} callback - Callback function (settings) => void
 * @returns {Function} - Unsubscribe function
 */
export function onSettingsChange(callback) {
  settingsChangeListeners.add(callback);
  return () => settingsChangeListeners.delete(callback);
}

/**
 * Notifies all listeners of settings changes
 * @param {Object} settings - New settings
 */
function notifyListeners(settings) {
  settingsChangeListeners.forEach(callback => {
    try {
      callback(settings);
    } catch (error) {
      log.error('Settings change listener error:', error);
    }
  });
}

/**
 * Gets default settings for a category
 * @param {string} category - Category name
 * @returns {Object} - Default settings
 */
export function getDefaultSettings(category = null) {
  if (category === null) {
    return { ...DEFAULT_SETTINGS };
  }
  
  if (category === 'audio') return { ...DEFAULT_SETTINGS.audio };
  if (category === 'chat') return { ...DEFAULT_SETTINGS.chat };
  if (category === 'tools') return { ...DEFAULT_SETTINGS.tools };
  if (category === 'translation') return { ...DEFAULT_SETTINGS.translation };
  if (category === 'contextSelection') return { ...DEFAULT_SETTINGS.contextSelection };
  if (category === 'appearance') return { ...DEFAULT_SETTINGS.appearance };
  if (category === 'help') return { ...DEFAULT_SETTINGS.help };
  
  return null;
}

