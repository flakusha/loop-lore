// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors:

// src/autonomy/governor/kill-switch.ts — global autonomy kill switch
//
// One env flag, read fresh on every check so an operator flip takes
// effect between actions with no restart. Engaged → every tryConsume
// denies (even unbounded unlimited-stress scopes) and the scheduler
// skips dispatch before any target runs.

/** Env var holding the switch. `1` / `true` (any case) halts all autonomous LLM calls. */
export const KILL_SWITCH_ENV_VAR = "AUTONOMY_KILL_SWITCH";

/**
 * Whether the global kill switch is engaged right now.
 * @returns true when the env flag halts autonomous dispatch
 */
export function isKillSwitchEngaged(): boolean {
  const raw = process.env[KILL_SWITCH_ENV_VAR]?.toLowerCase();
  return raw === "1" || raw === "true";
}
