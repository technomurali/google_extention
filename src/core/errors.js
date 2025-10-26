// ============================================================================
// ERROR HANDLING - Custom Error Classes and Error Utilities
// ============================================================================
// FILE SUMMARY:
// Defines custom error types for better error handling and debugging.
// Provides utilities for consistent error management across the application.
//
// FEATURES:
// - Custom error classes for different error categories
// - Error formatting utilities
// - User-friendly error messages
// ============================================================================

/**
 * Base class for all application-specific errors
 */
export class AppError extends Error {
  constructor(message, code = 'APP_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Error for AI/Language Model related issues
 */
export class AIError extends AppError {
  constructor(message, code = 'AI_ERROR') {
    super(message, code);
  }
}

/**
 * Error for permission-related issues
 */
export class PermissionError extends AppError {
  constructor(message, permission, code = 'PERMISSION_ERROR') {
    super(message, code);
    this.permission = permission;
  }
}

/**
 * Error for data validation issues
 */
export class ValidationError extends AppError {
  constructor(message, field = null, code = 'VALIDATION_ERROR') {
    super(message, code);
    this.field = field;
  }
}

/**
 * Error for network/API issues
 */
export class NetworkError extends AppError {
  constructor(message, statusCode = null, code = 'NETWORK_ERROR') {
    super(message, code);
    this.statusCode = statusCode;
  }
}

/**
 * Error for DOM/UI related issues
 */
export class UIError extends AppError {
  constructor(message, element = null, code = 'UI_ERROR') {
    super(message, code);
    this.element = element;
  }
}

/**
 * Formats an error for user display
 * @param {Error|AppError|unknown} error - Error to format
 * @param {string} fallback - Fallback message if error is unknown
 * @returns {string} User-friendly error message
 */
export function formatErrorForUser(error, fallback = 'An unexpected error occurred') {
  if (error instanceof AppError) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  
  return fallback;
}

/**
 * Logs error with appropriate level and context
 * @param {Error|AppError} error - Error to log
 * @param {Object} logger - Logger instance
 * @param {Object} context - Additional context information
 */
export function logError(error, logger, context = {}) {
  const errorInfo = {
    name: error.name,
    message: error.message,
    code: error.code || 'UNKNOWN',
    timestamp: error.timestamp || new Date().toISOString(),
    stack: error.stack,
    ...context,
  };

  if (error instanceof AppError) {
    logger.error('Application error:', errorInfo);
  } else {
    logger.error('Unexpected error:', errorInfo);
  }
}

/**
 * Wraps an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} errorMessage - Error message prefix
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, errorMessage = 'Operation failed') {
  return async function wrapped(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      const message = `${errorMessage}: ${formatErrorForUser(error)}`;
      throw new AppError(message);
    }
  };
}

/**
 * Creates a safe version of a function that never throws
 * @param {Function} fn - Function to make safe
 * @param {*} defaultValue - Value to return on error
 * @returns {Function} Safe function
 */
export function makeSafe(fn, defaultValue = null) {
  return async function safe(...args) {
    try {
      return await fn(...args);
    } catch {
      return defaultValue;
    }
  };
}

// For non-module script compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AppError,
    AIError,
    PermissionError,
    ValidationError,
    NetworkError,
    UIError,
    formatErrorForUser,
    logError,
    withErrorHandling,
    makeSafe,
  };
}

