// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 003_memory_audit_log_action_check
 *
 * Enforce the MemoryAuditAction enum at the DB layer. Service code already
 * uses the union (src/memory/audit.ts:MemoryAuditAction) but the column is
 * plain text — nothing prevents a malformed write from bypassing the type.
 *
 * Resolves: BUG-memory-audit-log-action-column-typed-string-not-union
 *
 * Append-only; 001_init.ts is shipped.
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
  // SQLite CHECK constraints can be added via table recreation only. A
  // trigger-based guard avoids that dance and keeps the migration
  // append-only (no recreate-table on a populated DB).
  // Build the IN list as a raw SQL fragment; values are static literals
  // from a compile-time array, so no injection risk.
  const inList = ALLOWED_ACTIONS.map((a,) => `'${a.replace(/'/g, "''")}'`,).join(", ",);
  await sql.raw(`
      CREATE TRIGGER IF NOT EXISTS memory_audit_log_action_check
      BEFORE INSERT ON memory_audit_log
      FOR EACH ROW
      WHEN NEW.action NOT IN (${inList})
      BEGIN
        SELECT RAISE(ABORT, 'memory_audit_log.action not in allowed enum');
      END;
    `).execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS memory_audit_log_action_check`.execute(
    database,
  );
}
