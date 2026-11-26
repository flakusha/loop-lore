// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { compareMigrationNames, MIGRATION_FILENAME, } from "../src/db/migrate";

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

describe("migration filename gate: MIGRATION_FILENAME", () => {
  test("excludes colocated test files and strays", () => {
    expect(MIGRATION_FILENAME.test("001_init.ts",),).toBe(true,);
    expect(MIGRATION_FILENAME.test("001_init.test.ts",),).toBe(false,);
    expect(MIGRATION_FILENAME.test("README.md",),).toBe(false,);
    expect("001_init.ts".match(MIGRATION_FILENAME,)?.[1],).toBe("001",);
  });
});
