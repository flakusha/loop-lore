// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/index.test.ts — Startup exit-code mapping.

import { describe, expect, test, } from "bun:test";
import { FirstBootContentionError, } from "../config/load";
import { FIRST_BOOT_RETRY_EXIT, startupExitCode, } from "./index";

describe("startupExitCode", () => {
  test("maps first-boot contention to 75", () => {
    expect(FIRST_BOOT_RETRY_EXIT,).toBe(75,);
    expect(startupExitCode(new FirstBootContentionError("test-dir", 20, 100,),),).toBe(75,);
  });

  test("keeps the crash path for other errors", () => {
    expect(startupExitCode(new Error("boom",),),).toBe(1,);
    expect(startupExitCode("string failure",),).toBe(1,);
  });
});
