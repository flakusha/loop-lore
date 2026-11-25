// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { watchdogBootMode, } from "./boot";

describe("watchdogBootMode", () => {
  test("default startup stays a plain server", () => {
    expect(watchdogBootMode({},),).toBe("off",);
  });

  test("supervised children never re-supervise", () => {
    expect(watchdogBootMode({ LOOP_LORE_WATCHDOG: "1", },),).toBe("child",);
  });

  test("supervise opt-in starts the supervisor at startup", () => {
    expect(watchdogBootMode({ LOOP_LORE_WATCHDOG: "supervise", },),).toBe("supervisor",);
  });

  test("unknown flag values stay off", () => {
    expect(watchdogBootMode({ LOOP_LORE_WATCHDOG: "true", },),).toBe("off",);
  });
});
