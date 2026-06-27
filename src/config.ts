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
  /**
   * Enable the Yandex Afisha source adapter (disabled by default — ToS §3.1 risk).
   * Set ENABLE_YANDEX_AFISHA=true to opt in. The operator accepts the ToS risk.
   * (SRC-06, T-03-15)
   */
  enableYandexAfisha: boolean;
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
    // Default false — operator must explicitly opt in to accept Yandex ToS §3.1 risk (T-03-15)
    enableYandexAfisha: process.env['ENABLE_YANDEX_AFISHA'] === 'true',
  };
}
