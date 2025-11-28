/**
 * Logger utility that can be disabled in production builds.
 * All log/debug/warn calls are stripped in production.
 * Error calls are kept for tracking issues.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /** Log general information (dev only) */
  log: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },

  /** Log debug information (dev only) */
  debug: (...args: unknown[]): void => {
    if (isDev) console.debug(...args);
  },

  /** Log warnings (dev only) */
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },

  /** Log errors (always, including production) */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
