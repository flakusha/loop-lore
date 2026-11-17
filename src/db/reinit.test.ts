// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The files `db:reinit` archives (F12).
 *
 * The historical "old mangled path" cleanup joined an absolute DATA_DIR onto
 * the process cwd, so the branch could never fire — and resolving it against
 * DATA_DIR instead would have pointed it at ANOTHER instance's database file.
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { reinitArchiveTargets, } from "./reinit";

describe("reinitArchiveTargets (F12)", () => {
  test("archives the live database and its WAL/SHM siblings", () => {
    expect(reinitArchiveTargets("/state/alpha/loop-lore.db",),).toEqual([
      "/state/alpha/loop-lore.db",
      "/state/alpha/loop-lore.db-wal",
      "/state/alpha/loop-lore.db-shm",
    ],);
  });

  test("the targets depend only on the live database path", () => {
    expect(reinitArchiveTargets("/state/alpha/loop-lore.db",),).toEqual(
      reinitArchiveTargets("/state/alpha/loop-lore.db",),
    );
  });

  test("the mangled-path branch is gone — no cwd-derived archive target", () => {
    const source = readFileSync(new URL("./reinit.ts", import.meta.url,), "utf8",);
    expect(source,).not.toContain("process.cwd()",);
  });
});
