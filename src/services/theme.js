// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// THEME MANAGER - Dark/Light Mode Handling
// ============================================================================
// FILE SUMMARY:
// Manages the application's color theme based on system preferences.
// Automatically detects and applies dark or light mode, with real-time updates.
//
// FEATURES:
// - Automatic theme detection from system preferences
// - Dynamic CSS variable updates
// - Real-time theme switching when system preference changes
// - Cross-browser compatibility
// ============================================================================

import { BROWSER } from '../core/constants.js';
import { logger } from '../core/logger.js';

const log = logger.theme;

/**
 * Applies theme colors by setting CSS custom properties
 * @param {string} theme - Either 'dark' or 'light'
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  log.debug(`Applying ${theme} theme`);

  if (theme === BROWSER.THEME_DARK) {
    // Dark mode color scheme
    root.style.setProperty('--tab-bar-gradient-start', '#1f1f1f');
    root.style.setProperty('--tab-bar-gradient-end', '#2a2a2a');
    root.style.setProperty('--tab-bar-header-overlay', 'rgba(255,255,255,0.05)');
    root.style.setProperty('--search-input-background', 'rgba(255,255,255,0.1)');
    root.style.setProperty('--search-input-focus-background', 'rgba(255,255,255,0.14)');
    root.style.setProperty('--dropdown-background', '#2a2a2a');
    root.style.setProperty('--search-input-text-color', '#f1f1f1');
    root.style.setProperty('--search-input-placeholder-color', 'rgba(255,255,255,0.5)');
    root.style.setProperty('--sp-text-color', '#f1f1f1');
    root.style.setProperty('--sp-border-color', 'rgba(255,255,255,0.15)');
    root.style.setProperty('--sp-input-border', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--sp-input-border-focus', 'rgba(255,255,255,0.35)');
    root.style.setProperty('--sp-button-bg', 'rgba(255,255,255,0.12)');
    root.style.setProperty('--sp-button-bg-hover', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--sp-button-border', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--sp-button-border-hover', 'rgba(255,255,255,0.3)');
    root.style.setProperty('--sp-button-color', '#ffffff');
    root.style.setProperty('--sp-scrollbar-thumb', 'rgba(255,255,255,0.3)');
  } else {
    // Light mode color scheme (from CONFIG)
    // Access CONFIG from window global since it's loaded via script tag
    const config = window.CONFIG || {};
    const colors = config.colors || {};
    const searchInput = config.searchInput || {};
    
    root.style.setProperty('--tab-bar-gradient-start', colors.gradientStart || '#667eea');
    root.style.setProperty('--tab-bar-gradient-end', colors.gradientEnd || '#764ba2');
    root.style.setProperty('--tab-bar-header-overlay', colors.headerOverlay || 'rgba(0,0,0,0.1)');
    root.style.setProperty('--search-input-background', searchInput.background || 'rgba(255,255,255,0.9)');
    root.style.setProperty('--search-input-focus-background', searchInput.focusBackground || 'rgba(255,255,255,1)');
    root.style.setProperty('--dropdown-background', 'rgba(255,255,255,1)');
    root.style.setProperty('--search-input-text-color', searchInput.textColor || '#333');
    root.style.setProperty('--search-input-placeholder-color', searchInput.placeholderColor || 'rgba(0,0,0,0.4)');
    root.style.setProperty('--sp-text-color', '#ffffff');
    root.style.setProperty('--sp-border-color', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--sp-input-border', 'rgba(255,255,255,0.25)');
    root.style.setProperty('--sp-input-border-focus', 'rgba(255,255,255,0.4)');
    root.style.setProperty('--sp-button-bg', 'rgba(255,255,255,0.15)');
    root.style.setProperty('--sp-button-bg-hover', 'rgba(255,255,255,0.25)');
    root.style.setProperty('--sp-button-border', 'rgba(255,255,255,0.25)');
    root.style.setProperty('--sp-button-border-hover', 'rgba(255,255,255,0.35)');
    root.style.setProperty('--sp-button-color', '#ffffff');
    root.style.setProperty('--sp-scrollbar-thumb', 'rgba(255,255,255,0.35)');
  }

  log.info(`Theme applied: ${theme}`);
}

/**
 * Detects current system theme preference
 * @returns {string} 'dark' or 'light'
 */
export function detectSystemTheme() {
  const isDark = window.matchMedia(BROWSER.DARK_MODE_QUERY).matches;
  return isDark ? BROWSER.THEME_DARK : BROWSER.THEME_LIGHT;
}

/**
 * Initializes theme synchronization with system preferences
 * Sets up automatic theme switching when system preference changes
 * @returns {Function} Cleanup function to remove event listener
 */
export function initThemeSync() {
  log.info('Initializing theme synchronization');
  
  const mediaQuery = window.matchMedia(BROWSER.DARK_MODE_QUERY);
  
  const updateTheme = () => {
    const theme = mediaQuery.matches ? BROWSER.THEME_DARK : BROWSER.THEME_LIGHT;
    applyTheme(theme);
  };

  // Apply initial theme
  updateTheme();

  // Listen for system theme changes
  // Use modern addEventListener when available; fall back where required
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', updateTheme);
    
    // Return cleanup function
    return () => mediaQuery.removeEventListener('change', updateTheme);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(updateTheme);
    
    // Return cleanup function for addListener
    return () => mediaQuery.removeListener(updateTheme);
  }

  // No listener support, return no-op cleanup
  return () => {};
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyTheme,
    detectSystemTheme,
    initThemeSync,
  };
}

