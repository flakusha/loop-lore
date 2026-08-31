// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Messaging — Timing Helpers
 *
 * Quiet hours, backoff calculation, and time utilities.
 * Extracted from the main service to stay under size limits.
 */

/** Frequency presets — maps to interval in milliseconds */
export const PROACTIVE_FREQUENCY_MS = {
  very_frequent: 60 * 60 * 1000, // ~1 hour
  frequent: 3 * 60 * 60 * 1000, // ~3 hours
  normal: 24 * 60 * 60 * 1000, // ~1 day
  infrequent: 4 * 24 * 60 * 60 * 1000, // ~4 days
} as const;

/** */
export type ProactiveFrequency = keyof typeof PROACTIVE_FREQUENCY_MS;

/**
 * Check if current time falls within quiet hours window
 * @param start
 * @param end
 * @param now
 */
export function isInQuietHours(start: string | null, end: string | null, now: Date,): boolean {
  if (!start || !end) { return false; }

  const [startHStr, startMStr,] = start.split(":", 2,);
  const startH = Number(startHStr,);
  const startM = Number(startMStr,);
  const [endHStr, endMStr,] = end.split(":", 2,);
  const endH = Number(endHStr,);
  const endM = Number(endMStr,);

  if (startH === undefined || endH === undefined) { return false; }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + (startM ?? 0);
  const endMinutes = endH * 60 + (endM ?? 0);

  // Handle overnight quiet hours (e.g., 22:00 — 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Calculate the wait time with exponential backoff.
 * Each unanswered message doubles the wait time.
 * @param baseMs
 * @param backoffCount
 */
export function backoffMs(baseMs: number, backoffCount: number,): number {
  return baseMs * Math.pow(2, backoffCount,);
}

/**
 * Milliseconds until quiet hours end
 * @param end
 * @param now
 */
export function msUntilQuietHoursEnd(end: string | null, now: Date,): number {
  if (!end) { return 0; }
  const [endHStr, endMStr,] = end.split(":", 2,);
  const endH = Number(endHStr,);
  const endM = Number(endMStr,);
  if (endH === undefined) { return 0; }

  const target = new Date(now,);
  target.setHours(endH, endM ?? 0, 0, 0,);

  if (target <= now) {
    target.setDate(target.getDate() + 1,);
  }

  return target.getTime() - now.getTime();
}

/**
 * Milliseconds until midnight
 * @param now
 */
export function msUntilMidnight(now: Date,): number {
  const midnight = new Date(now,);
  midnight.setDate(midnight.getDate() + 1,);
  midnight.setHours(0, 0, 0, 0,);
  return midnight.getTime() - now.getTime();
}
