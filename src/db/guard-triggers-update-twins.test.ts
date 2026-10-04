// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 017 guard-trigger UPDATE twins.
 *
 * 003 (memory_audit_log.action) and 005 (world_lore confidence/distortion)
 * shipped BEFORE INSERT-only guards. 017 adds BEFORE UPDATE twins so an
 * UPDATE cannot move a row into a state INSERT would reject.
 *
 * Uses createTestDb (full chain, incl. 017) and the typed insert helpers.
 */
import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertMemoryAuditLog, insertUsers, insertWorldLoreEntries, insertWorlds, } from "../test-utils/insert-helpers";

describe("017 guard-trigger UPDATE twins", () => {
  test("UPDATE world_lore_entries confidence outside 0..100 aborts", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `guard-u-${crypto.randomUUID()}`, "Guard",);
      const worldId = await insertWorlds(db, userId, "Guard World",);
      const loreId = await insertWorldLoreEntries(db, worldId, "lore",);
      await expect(
        db.updateTable("world_lore_entries",).set({ confidence: 999, },).where("id", "=", loreId,).execute(),
      ).rejects.toThrow(/confidence must be 0\.\.100/,);

      await expect(
        db.updateTable("world_lore_entries",).set({ confidence: -1, },).where("id", "=", loreId,).execute(),
      ).rejects.toThrow(/confidence must be 0\.\.100/,);

      // In-range UPDATE still passes.
      await db.updateTable("world_lore_entries",).set({ confidence: 50, },).where("id", "=", loreId,).execute();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("UPDATE world_lore_entries distortion_level outside 0..100 aborts", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `guard-u-${crypto.randomUUID()}`, "Guard",);
      const worldId = await insertWorlds(db, userId, "Guard World",);
      const loreId = await insertWorldLoreEntries(db, worldId, "lore",);
      await expect(
        db.updateTable("world_lore_entries",).set({ distortion_level: 101, },).where("id", "=", loreId,).execute(),
      ).rejects.toThrow(/distortion_level must be 0\.\.100/,);

      await db.updateTable("world_lore_entries",).set({ distortion_level: 10, },).where("id", "=", loreId,).execute();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("UPDATE memory_audit_log action outside enum aborts", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `guard-u-${crypto.randomUUID()}`, "Guard",);
      const auditId = await insertMemoryAuditLog(
        db,
        `mem-${crypto.randomUUID()}`,
        `actor-${crypto.randomUUID()}`,
        "create",
        { user_id: userId, },
      );

      await expect(
        db.updateTable("memory_audit_log",).set({ action: "bogus", },).where("id", "=", auditId,).execute(),
      ).rejects.toThrow(/not in allowed enum/,);

      // Enum UPDATE still passes.
      await db.updateTable("memory_audit_log",).set({ action: "pin", },).where("id", "=", auditId,).execute();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("018 down() drops the UPDATE twins, up() restores them", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `guard-u-${crypto.randomUUID()}`, "Guard",);
      const worldId = await insertWorlds(db, userId, "Guard World",);
      const loreId = await insertWorldLoreEntries(db, worldId, "lore",);
      const m018 = await import("./migrations/018_guard_triggers_update_twins");
      await m018.down(db as never,);
      await db.updateTable("world_lore_entries",).set({ confidence: 999, },).where("id", "=", loreId,).execute();
      await m018.up(db as never,);
      await expect(
        db.updateTable("world_lore_entries",).set({ confidence: 999, },).where("id", "=", loreId,).execute(),
      ).rejects.toThrow(/confidence must be 0\.\.100/,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});
