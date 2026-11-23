// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { compareMigrationNames, } from "../src/db/migrate";

describe("migration ordering gate: compareMigrationNames", () => {
  test("sorts a misordered list by numeric prefix, then alphabetically", () => {
    const names = [
      "010_later.ts",
      "003_init.ts",
      "001_zeta.ts",
      "001_alpha.ts",
      "002_next.ts",
    ];
    expect([...names,].sort(compareMigrationNames,),).toEqual([
      "001_alpha.ts",
      "001_zeta.ts",
      "002_next.ts",
      "003_init.ts",
      "010_later.ts",
    ],);
  });
});
