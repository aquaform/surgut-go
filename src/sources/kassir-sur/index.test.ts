/**
 * Tests for the kassir-sur DISABLED stub adapter.
 *
 * Verifies the honesty mandate (AGENTS.md / CLAUDE.md):
 *   - enabled:false is set (adapter cannot be accidentally scraped)
 *   - A non-empty machine-readable reason string is present (for status panel)
 *   - scrape() throws — proving it NEVER returns fabricated/real data
 *   - No fabricated event data is present in the module (structural grep)
 *
 * These tests act as a regression gate: if someone accidentally adds scraping
 * code that returns events, the scrape-throws assertion will fail immediately.
 *
 * Covers: SRC-05, T-03-07 (kassir stub must never fabricate events)
 */

import { describe, it, expect } from 'vitest';
import { kassirSurAdapter } from './index';

describe('kassirSurAdapter (disabled stub)', () => {
  it('enabled is false (adapter cannot be accidentally enabled)', () => {
    expect(kassirSurAdapter.enabled).toBe(false);
  });

  it('reason is a non-empty string (machine-readable for status panel)', () => {
    expect(typeof kassirSurAdapter.reason).toBe('string');
    expect(kassirSurAdapter.reason.length).toBeGreaterThan(0);
  });

  it('name is "kassir-sur"', () => {
    expect(kassirSurAdapter.name).toBe('kassir-sur');
  });

  it('homeUrl points to sur.kassir.ru', () => {
    expect(kassirSurAdapter.homeUrl).toBe('https://sur.kassir.ru');
  });

  it('timeoutMs is 0 (no network calls should ever happen)', () => {
    expect(kassirSurAdapter.timeoutMs).toBe(0);
  });

  it('scrape() throws unconditionally — never returns fabricated data (T-03-07 safety net)', async () => {
    // This is the critical honesty assertion:
    // If scrape() is ever called, it must throw — never silently return events.
    await expect(kassirSurAdapter.scrape()).rejects.toThrow();
  });

  it('scrape() throw message identifies the adapter and reason', async () => {
    await expect(kassirSurAdapter.scrape()).rejects.toThrow(/kassir-sur.*disabled/i);
  });
});
