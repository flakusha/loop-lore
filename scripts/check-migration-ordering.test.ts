// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { type FileRow, isDeclaredOrderStable, } from "./check-migration-ordering";

const row = (name: string,): FileRow => ({
  name,
  prefix: name.slice(0, 3,),
  relDir: "src/db/migrations",
});

describe("migration ordering gate: declared order", () => {
  test("accepts a list already in comparator order", () => {
    expect(
      isDeclaredOrderStable([
        row("001_init.ts",),
        row("002_next.ts",),
        row("010_later.ts",),
      ],),
    ).toBe(true,);
  });

  test("FAILS a deliberately misordered list", () => {
    expect(
      isDeclaredOrderStable([
        row("010_later.ts",),
        row("001_init.ts",),
        row("002_next.ts",),
      ],),
    ).toBe(false,);
  });

  test("FAILS equal prefixes declared out of alphabetical order", () => {
    expect(
      isDeclaredOrderStable([
        row("001_zeta.ts",),
        row("001_alpha.ts",),
      ],),
    ).toBe(false,);
  });
});
