// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regex precision telemetry — opt-in per-pattern match counters.
 *
 * Counts regex calls vs matches per stable pattern label so precision
 * regressions (false positives) surface in telemetry. OFF by default;
 * {@link recordRegexCall} early-returns when disabled, so the enabled
 * check is the only per-call cost.
 *
 * Deliberately free of db/logger imports: this module sits in the
 * `safe-exec` import graph, which must stay light.
 *
 * @module regex/telemetry
 */

interface PatternCounter {
  calls: number;
  matches: number;
}

let enabled = false;
const counters = new Map<string, PatternCounter>();

/**
 * @param next — `true` to start counting, `false` to stop.
 */
export function setRegexTelemetryEnabled(next: boolean,): void {
  enabled = next;
}

/**
 * @returns `true` while counters are recording.
 */
export function isRegexTelemetryEnabled(): boolean {
  return enabled;
}

/**
 * Count one regex invocation. No-op while disabled.
 * @param patternName — stable label (e.g. `intent:generate:character`)
 * @param matched — whether the pattern matched
 */
export function recordRegexCall(patternName: string, matched: boolean,): void {
  if (!enabled) { return; }
  let counter = counters.get(patternName,);
  if (counter === undefined) {
    counter = { calls: 0, matches: 0, };
    counters.set(patternName, counter,);
  }

  counter.calls += 1;
  if (matched) { counter.matches += 1; }
}

/**
 * @returns one entry per pattern seen since the last reset, in first-seen order.
 */
export function getRegexTelemetrySnapshot(): Array<{ pattern: string; calls: number; matches: number }> {
  return [...counters.entries(),].map(([pattern, counter,],) => ({
    pattern,
    calls: counter.calls,
    matches: counter.matches,
  }));
}

/** Drop all counters. */
export function resetRegexTelemetry(): void {
  counters.clear();
}
