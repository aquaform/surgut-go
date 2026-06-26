/**
 * Typed environment config loader.
 * Reads only from process.env — never imports dotenv (CLAUDE.md constraint).
 */

export interface AppConfig {
  /** HTTP server port (default: 3000) */
  port: number;
  /** Directory for the JSON cache file (default: /app/cache) */
  cacheDir: string;
  /** Cache TTL in milliseconds (default: 14400000 = 4 hours) */
  cacheTtlMs: number;
}

/**
 * Load typed application configuration from environment variables.
 * Throws if PORT is set to an invalid number.
 */
export function loadConfig(): AppConfig {
  const rawPort = process.env['PORT'] ?? '3000';
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const rawTtl = process.env['CACHE_TTL_MS'] ?? '14400000';
  const cacheTtlMs = parseInt(rawTtl, 10);
  if (isNaN(cacheTtlMs) || cacheTtlMs < 0) {
    throw new Error(`Invalid CACHE_TTL_MS value: "${rawTtl}"`);
  }

  return {
    port,
    cacheDir: process.env['CACHE_DIR'] ?? '/app/cache',
    cacheTtlMs,
  };
}
