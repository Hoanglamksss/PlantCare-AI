import { HttpError } from '../../errors.js';

export const emailCodeResendSeconds = 60;

export function emailCodeLimit(seconds: number, message: string) {
  return new HttpError(429, 'EMAIL_CODE_LIMIT', message, seconds);
}

interface WindowEntry {
  used: number;
  expiresAt: number;
}

const windowMs = 15 * 60_000;
const cleanupIntervalMs = 60_000;
const capacity = 5_000;

export class AttemptWindow {
  private readonly entries = new Map<string, WindowEntry>();
  private nextCleanupAt = 0;

  constructor(private readonly limit: number) {}

  retryAfter(key: string): number {
    const now = Date.now();
    if (now >= this.nextCleanupAt) {
      for (const [entryKey, entry] of this.entries) {
        if (entry.expiresAt <= now) this.entries.delete(entryKey);
      }
      this.nextCleanupAt = now + cleanupIntervalMs;
    }

    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      if (!entry && this.entries.size >= capacity) return Math.ceil(cleanupIntervalMs / 1_000);
      this.entries.set(key, { used: 1, expiresAt: now + windowMs });
      return 0;
    }

    if (entry.used >= this.limit) return Math.ceil((entry.expiresAt - now) / 1_000);
    entry.used += 1;
    return 0;
  }
}
