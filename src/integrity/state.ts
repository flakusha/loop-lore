// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Process-local integrity state: last verdict, unclean-shutdown flag, and
 * safe-mode switch. Single source of truth read by the health probe, the
 * request write gate, and the scheduled check. No DB table — state is
 * re-derived at every boot from the sentinel + a fresh integrity check.
 */
export type IntegrityVerdict = "pass" | "warn" | "fail" | "unknown";

export interface IntegrityState {
  verdict: IntegrityVerdict;
  detail: string | null;
  checkedAtMs: number | null;
  uncleanShutdown: boolean;
  safeMode: boolean;
  safeModeReason: string | null;
}

const state: IntegrityState = {
  verdict: "unknown",
  detail: null,
  checkedAtMs: null,
  uncleanShutdown: false,
  safeMode: false,
  safeModeReason: null,
};

/** Current integrity state. Callers see a readonly view; only this module writes. */
export function getIntegrityState(): Readonly<IntegrityState> {
  return state;
}

interface RecordVerdictOpts {
  verdict: IntegrityVerdict;
  detail?: string | null;
  checkedAtMs?: number;
}

/** Publish a fresh verdict. Does not change safe mode. */
export function recordVerdict(opts: RecordVerdictOpts,): void {
  state.verdict = opts.verdict;
  state.detail = opts.detail ?? null;
  state.checkedAtMs = opts.checkedAtMs ?? Date.now();
}

/** Set the unclean-shutdown flag from the sentinel at boot. */
export function setUncleanShutdown(value: boolean,): void {
  state.uncleanShutdown = value;
}

/** Enter safe mode: writes are rejected until an operator acknowledges. */
export function enterSafeMode(reason: string,): void {
  state.safeMode = true;
  state.safeModeReason = reason;
}

/** Leave safe mode. Called only by the admin-gated recovery route. */
export function clearSafeMode(): void {
  state.safeMode = false;
  state.safeModeReason = null;
}

/** Reset state for isolated tests. Never call in production. */
export function resetIntegrityState(): void {
  state.verdict = "unknown";
  state.detail = null;
  state.checkedAtMs = null;
  state.uncleanShutdown = false;
  state.safeMode = false;
  state.safeModeReason = null;
}
