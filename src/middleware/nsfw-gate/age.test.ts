// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { calculateAge, } from "./constants";

describe("calculateAge", () => {
  test("computes age from a valid birth date", () => {
    const now = new Date();
    const birth = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate(),);
    expect(calculateAge(birth.toISOString(),),).toBe(30,);
  });

  test("returns null for an invalid date (pre-fix this was NaN, letting `NaN < minAge` pass the NSFW gate)", () => {
    expect(calculateAge("not-a-date",),).toBeNull();
    expect(calculateAge("",),).toBeNull();
    expect(calculateAge("9999-99-99",),).toBeNull();
  });
});
