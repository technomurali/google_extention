// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// LOGGER - Structured Logging Utility
// ============================================================================
// FILE SUMMARY:
// Provides a structured logging system with different severity levels.
// Improves debugging and monitoring by adding context and categorization.
//
// FEATURES:
// - Multiple log levels (debug, info, warn, error)
// - Contextual information (timestamps, component names)
// - Easy to disable in production
// - Colored output for better readability
// ============================================================================

/**
 * Log levels in order of severity
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Logger class for structured logging throughout the application
 */
class Logger {
  /**
   * Creates a new logger instance
   * @param {string} component - Name of the component using this logger
   * @param {number} minLevel - Minimum log level to display (default: DEBUG)
   */
  constructor(component = 'App', minLevel = LogLevel.DEBUG) {
    this.component = component;
    this.minLevel = minLevel;
  }

  /**
   * Internal method to format and output log messages
   * @private
   */
  _log(level, levelName, color, ...args) {
    if (level < this.minLevel) return;

    const timestamp = new Date().toISOString().substr(11, 12);
    const prefix = `[${timestamp}] [${this.component}] [${levelName}]`;

    if (typeof console[levelName.toLowerCase()] === 'function') {
      console[levelName.toLowerCase()](
        `%c${prefix}`,
        `color: ${color}; font-weight: bold;`,
        ...args
      );
    } else {
      console.log(prefix, ...args);
    }
  }

  /**
   * Log debug information (detailed technical info for developers)
   * @param {...any} args - Values to log
   */
  debug(...args) {
    this._log(LogLevel.DEBUG, 'DEBUG', '#888', ...args);
  }

  /**
   * Log general information (normal operation events)
   * @param {...any} args - Values to log
   */
  info(...args) {
    this._log(LogLevel.INFO, 'INFO', '#2196F3', ...args);
  }

  /**
   * Log warnings (potential issues that don't prevent operation)
   * @param {...any} args - Values to log
   */
  warn(...args) {
    this._log(LogLevel.WARN, 'WARN', '#FF9800', ...args);
  }

  /**
   * Log errors (serious issues that prevent normal operation)
   * @param {...any} args - Values to log
   */
  error(...args) {
    this._log(LogLevel.ERROR, 'ERROR', '#F44336', ...args);
  }

  /**
   * Creates a child logger with a sub-component name
   * @param {string} subComponent - Name of the sub-component
   * @returns {Logger} New logger instance
   */
  child(subComponent) {
    return new Logger(`${this.component}:${subComponent}`, this.minLevel);
  }
}

/**
 * Create default logger instances for different components
 */
const logger = {
  ui: new Logger('UI'),
  ai: new Logger('AI'),
  history: new Logger('History'),
  theme: new Logger('Theme'),
  permissions: new Logger('Permissions'),
  background: new Logger('Background'),
  
  /**
   * Creates a custom logger for any component
   * @param {string} component - Component name
   * @returns {Logger} New logger instance
   */
  create(component) {
    return new Logger(component);
  },
};

// ESM exports for browser modules
export { Logger, logger, LogLevel };

// CommonJS fallback for Node tooling/tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Logger, logger, LogLevel };
}

