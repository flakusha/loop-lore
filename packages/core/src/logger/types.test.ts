// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { LogLevelNumeric, } from "./types";

describe("types", () => {
  test("LogLevelNumeric has correct numeric mappings", () => {
    expect(LogLevelNumeric.trace,).toBe(5,);
    expect(LogLevelNumeric.debug,).toBe(10,);
    expect(LogLevelNumeric.info,).toBe(20,);
    expect(LogLevelNumeric.warn,).toBe(30,);
    expect(LogLevelNumeric.error,).toBe(40,);
    expect(LogLevelNumeric.fatal,).toBe(50,);
  });

  test("LogLevelNumeric is a const object", () => {
    expect(typeof LogLevelNumeric,).toBe("object",);
    expect(LogLevelNumeric,).toHaveProperty("trace",);
    expect(LogLevelNumeric,).toHaveProperty("debug",);
    expect(LogLevelNumeric,).toHaveProperty("info",);
    expect(LogLevelNumeric,).toHaveProperty("warn",);
    expect(LogLevelNumeric,).toHaveProperty("error",);
    expect(LogLevelNumeric,).toHaveProperty("fatal",);
  });

  test("LogLevelNumeric values are integers", () => {
    for (const [, value,] of Object.entries(LogLevelNumeric,)) {
      expect(typeof value,).toBe("number",);
      expect(Number.isInteger(value,),).toBe(true,);
      expect(value,).toBeGreaterThan(0,);
    }
  });

  test("LogLevelNumeric ordering is correct", () => {
    // Higher severity = higher number
    expect(LogLevelNumeric.trace,).toBeLessThan(LogLevelNumeric.debug,);
    expect(LogLevelNumeric.debug,).toBeLessThan(LogLevelNumeric.info,);
    expect(LogLevelNumeric.info,).toBeLessThan(LogLevelNumeric.warn,);
    expect(LogLevelNumeric.warn,).toBeLessThan(LogLevelNumeric.error,);
    expect(LogLevelNumeric.error,).toBeLessThan(LogLevelNumeric.fatal,);
  });
});
