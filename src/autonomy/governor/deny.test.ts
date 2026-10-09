// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Governor kill-switch + deny-telemetry coverage.
 *
 * `isKillSwitchEngaged` reads the env flag fresh on every call; `deny.ts`
 * and `limits.ts` only gained coverage via the new split, so pin the flag
 * parsing and the catalog/event constants here.
 */

import { describe, expect, test, } from "bun:test";
import { emitBudgetExceeded, } from "./deny";
import { isKillSwitchEngaged, KILL_SWITCH_ENV_VAR, } from "./kill-switch";
import { LIMIT_CATALOG, TELEMETRY_EVENT_TRIPPED, } from "./limits";

describe("isKillSwitchEngaged", () => {
  test("engages on 1 / true (any case), off otherwise", () => {
    process.env[KILL_SWITCH_ENV_VAR] = "1";
    expect(isKillSwitchEngaged(),).toBe(true,);
    process.env[KILL_SWITCH_ENV_VAR] = "TRUE";
    expect(isKillSwitchEngaged(),).toBe(true,);
    process.env[KILL_SWITCH_ENV_VAR] = "0";
    expect(isKillSwitchEngaged(),).toBe(false,);
    delete process.env[KILL_SWITCH_ENV_VAR];
    expect(isKillSwitchEngaged(),).toBe(false,);
  });
});

describe("governor limits", () => {
  test("catalog + telemetry event stay wired", () => {
    expect(TELEMETRY_EVENT_TRIPPED,).toBe("governor.budget.exceeded",);
    expect(LIMIT_CATALOG.per_minute_generation.windowMs,).toBe(60_000,);
    expect(typeof emitBudgetExceeded,).toBe("function",);
  });
});
