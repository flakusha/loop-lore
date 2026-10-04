// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 018_guard_triggers_update_twins
 *
 * The guard triggers in 003 (memory_audit_log.action enum) and 005
 * (world_lore_entries confidence/distortion ranges) are BEFORE INSERT only —
 * an UPDATE bypasses them entirely. Add BEFORE UPDATE twins with the same
 * WHEN predicates so existing rows cannot be edited into invalid states.
 *
 * Purely additive: no new columns, no rewrites of shipped migrations.
 *
 * Resolves: BUG-db-guard-triggers-bypassed-on-update-003-005
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

const ALLOWED_ACTIONS = [
  "create",
  "pin",
  "unpin",
  "modify",
  "decay",
  "purge",
  "inject",
  "delete",
] as const;

export async function up(database: Kysely<unknown>,): Promise<void> {
  const inList = ALLOWED_ACTIONS.map((a,) => `'${a.replace(/'/g, "''",)}'`).join(", ",);
  await sql.raw(`
      CREATE TRIGGER IF NOT EXISTS memory_audit_log_action_check_update
      BEFORE UPDATE OF action ON memory_audit_log
      FOR EACH ROW
      WHEN NEW.action NOT IN (${inList})
      BEGIN
        SELECT RAISE(ABORT, 'memory_audit_log.action not in allowed enum');
      END;
    `,).execute(database,);

  await sql`
      CREATE TRIGGER IF NOT EXISTS world_lore_entries_confidence_check_update
      BEFORE UPDATE OF confidence ON world_lore_entries
      FOR EACH ROW
      WHEN NEW.confidence < 0 OR NEW.confidence > 100
      BEGIN
        SELECT RAISE(ABORT, 'world_lore_entries.confidence must be 0..100');
      END;
    `.execute(database,);

  await sql`
      CREATE TRIGGER IF NOT EXISTS world_lore_entries_distortion_check_update
      BEFORE UPDATE OF distortion_level ON world_lore_entries
      FOR EACH ROW
      WHEN NEW.distortion_level < 0 OR NEW.distortion_level > 100
      BEGIN
        SELECT RAISE(ABORT, 'world_lore_entries.distortion_level must be 0..100');
      END;
    `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS world_lore_entries_distortion_check_update`.execute(
    database,
  );

  await sql`DROP TRIGGER IF EXISTS world_lore_entries_confidence_check_update`.execute(
    database,
  );

  await sql`DROP TRIGGER IF EXISTS memory_audit_log_action_check_update`.execute(
    database,
  );
}
