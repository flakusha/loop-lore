/**
 * User Role Expansion — widen `users.role` CHECK constraint
 *
 * TASK-user-seeding-role-expansion adds roles beyond the original
 * admin/user/viewer/solo. The `ck_users_role` CHECK constraint on `users.role`
 * (defined in parts/001_users.ts) only allows those four, so seeding any new
 * role (moderator/creator/player/guest/bot/tester/custom) fails the constraint.
 *
 * SQLite cannot alter a CHECK constraint in place, so this migration rebuilds
 * the `users` table with the widened constraint. FK enforcement is toggled off
 * for the rebuild (the table is referenced by many child tables) and back on
 * afterwards. All indexes on `users` are recreated.
 */
import { type Kysely, sql, } from "kysely";

/** All assignable roles — must stay in sync with UserRole in src/db/enums-core/users.ts */
const ROLES_SQL = "'admin','moderator','user','creator','player','viewer','guest','bot','tester','custom','solo'";

export async function up(db: Kysely<unknown>,): Promise<void> {
  // SQLite forbids mutating a table with active FK references in some cases;
  // disable FK enforcement for the duration of the rebuild.
  await sql`PRAGMA foreign_keys = OFF`.execute(db,);

  // NOTE: role values are interpolated literally (not bound params) because
  // SQLite does not allow bound parameters inside CHECK constraints. ROLES_SQL
  // is a hardcoded allowlist constant, so there is no injection surface.
  await sql`
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      settings TEXT NOT NULL DEFAULT '{}',
      birth_date TEXT,
      age_gate_accepted_at TEXT,
      format_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT,
      CONSTRAINT ck_users_role CHECK (role IN (${sql.raw(ROLES_SQL,)}))
    )
  `.execute(db,);

  await sql`INSERT INTO users_new SELECT id, username, display_name, password_hash, role, status, settings, birth_date, age_gate_accepted_at, format_version, created_at, last_seen_at FROM users`
    .execute(db,);

  await sql`DROP TABLE users`.execute(db,);
  await sql`ALTER TABLE users_new RENAME TO users`.execute(db,);

  await db.schema.createIndex("idx_users_role",).on("users",).column("role",).execute();
  await db.schema.createIndex("idx_users_created_at",).on("users",).column("created_at",).execute();
  await db.schema.createIndex("idx_users_last_seen_at",).on("users",).column("last_seen_at",).execute();

  await sql`PRAGMA foreign_keys = ON`.execute(db,);
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  // Restore the original 4-role constraint via the same rebuild.
  await sql`PRAGMA foreign_keys = OFF`.execute(db,);

  await sql`
    CREATE TABLE users_old (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      settings TEXT NOT NULL DEFAULT '{}',
      birth_date TEXT,
      age_gate_accepted_at TEXT,
      format_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT,
      CONSTRAINT ck_users_role CHECK (role IN ('admin', 'user', 'viewer', 'solo'))
    )
  `.execute(db,);

  await sql`INSERT INTO users_old SELECT id, username, display_name, password_hash, role, status, settings, birth_date, age_gate_accepted_at, format_version, created_at, last_seen_at FROM users`
    .execute(db,);

  await sql`DROP TABLE users`.execute(db,);
  await sql`ALTER TABLE users_old RENAME TO users`.execute(db,);

  await db.schema.createIndex("idx_users_role",).on("users",).column("role",).execute();
  await db.schema.createIndex("idx_users_created_at",).on("users",).column("created_at",).execute();
  await db.schema.createIndex("idx_users_last_seen_at",).on("users",).column("last_seen_at",).execute();

  await sql`PRAGMA foreign_keys = ON`.execute(db,);
}
