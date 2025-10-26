// ============================================================================
// PERMISSIONS MANAGER - Chrome Permissions Handling
// ============================================================================
// FILE SUMMARY:
// Centralized permission management for Chrome APIs (history, bookmarks, downloads).
// Provides DRY (Don't Repeat Yourself) implementation for permission checks and requests.
//
// FEATURES:
// - Check if permissions are granted
// - Request permissions from user
// - Unified error handling
// - Logging for debugging
// ============================================================================

import { PERMISSIONS, ERROR_MESSAGES } from '../core/constants.js';
import { logger } from '../core/logger.js';

const log = logger.permissions;

/**
 * Permission request result object
 * @typedef {Object} PermissionResult
 * @property {boolean} granted - Whether permission was granted
 * @property {string|null} error - Error message if request failed
 */

/**
 * Checks if a specific permission is already granted
 * @param {string} permission - Permission name (e.g., 'history', 'bookmarks')
 * @returns {Promise<boolean>} True if permission is granted
 */
export async function hasPermission(permission) {
  try {
    if (!chrome?.permissions) {
      log.warn('Permissions API not available');
      return false;
    }

    const granted = await chrome.permissions.contains({ permissions: [permission] });
    log.debug(`Permission check for '${permission}': ${granted}`);
    return granted;
  } catch (error) {
    log.error(`Error checking permission '${permission}':`, error);
    return false;
  }
}

/**
 * Requests a specific permission from the user
 * Must be called in response to a user action (e.g., button click)
 * @param {string} permission - Permission name (e.g., 'history', 'bookmarks')
 * @returns {Promise<PermissionResult>} Result object with granted status and error
 */
export async function requestPermission(permission) {
  try {
    if (!chrome?.permissions) {
      const error = 'Permissions API not available';
      log.error(error);
      return { granted: false, error };
    }

    log.info(`Requesting permission: ${permission}`);
    const granted = await chrome.permissions.request({ permissions: [permission] });
    
    if (granted) {
      log.info(`Permission granted: ${permission}`);
    } else {
      log.warn(`Permission denied by user: ${permission}`);
    }

    return { granted, error: null };
  } catch (error) {
    const errorMsg = `Error requesting permission '${permission}': ${error.message}`;
    log.error(errorMsg, error);
    return { granted: false, error: errorMsg };
  }
}

/**
 * Ensures a permission is granted, requesting it if necessary
 * @param {string} permission - Permission name
 * @returns {Promise<PermissionResult>} Result object with granted status and error
 */
export async function ensurePermission(permission) {
  const alreadyGranted = await hasPermission(permission);
  
  if (alreadyGranted) {
    return { granted: true, error: null };
  }

  return await requestPermission(permission);
}

/**
 * Gets appropriate error message for a denied permission
 * @param {string} permission - Permission name
 * @returns {string} User-friendly error message
 */
export function getPermissionDeniedMessage(permission) {
  switch (permission) {
    case PERMISSIONS.HISTORY:
      return ERROR_MESSAGES.PERMISSION_DENIED_HISTORY;
    case PERMISSIONS.BOOKMARKS:
      return ERROR_MESSAGES.PERMISSION_DENIED_BOOKMARKS;
    case PERMISSIONS.DOWNLOADS:
      return ERROR_MESSAGES.PERMISSION_DENIED_DOWNLOADS;
    default:
      return `Permission denied for ${permission}`;
  }
}

/**
 * Checks multiple permissions in parallel
 * @param {string[]} permissions - Array of permission names
 * @returns {Promise<Object>} Object with permission names as keys, boolean values
 */
export async function checkMultiplePermissions(permissions) {
  const results = await Promise.all(
    permissions.map(async (perm) => {
      const granted = await hasPermission(perm);
      return [perm, granted];
    })
  );

  return Object.fromEntries(results);
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasPermission,
    requestPermission,
    ensurePermission,
    getPermissionDeniedMessage,
    checkMultiplePermissions,
  };
}

