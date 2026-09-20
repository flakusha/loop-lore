<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# DB Content Versioning & Migrations Reconciliation

Status: Planned (EPIC-2026-33). Partially implemented — migration 018 added `data_version` columns.

---

## Goals

1. **Schema versioning** — track which migration level the DB is at
2. **Content versioning** — track format versions of user-facing data
3. **Migration reconciliation** — fix numbering gaps, consolidate, document
4. **Data migration framework** — transform old content formats to new
5. **Testing** — validate migrations against known schemas

---

## Current State

### Migrations

34 flat top-level migrations exist under `src/db/migrations/`. The chain started from v0 — there is no `parts/` orchestrator and no `schema_version` table. Each migration is auto-discovered by filename via `getMigrationFiles()`.

**Numbering gaps:**

- `001_init.ts` through `035_memory_source_chain.ts` — flat sequential migrations. Each migration owns one concern (identity, assets, worlds, actors, characters, chat, personas, story, items-management, RPG systems, blog, memory, generation, moderation, e2e, FTS, workflows, mesh, etc.).

### data_version Columns (Migration 018)

| Table      | Column         | Default | Purpose                         |
| ---------- | -------------- | ------- | ------------------------------- |
| `actors`   | `data_version` | 0       | Character card format version   |
| `users`    | `data_version` | 1       | Settings JSON format version    |
| `personas` | `data_version` | 1       | Persona fields format version   |
| `messages` | `data_version` | 1       | Content/encoding format version |

### data_migrations Table (Migration 018)

```sql
CREATE TABLE data_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Gaps Identified

| Gap                          | Issue                                                                    | Priority |
| ---------------------------- | ------------------------------------------------------------------------ | -------- |
| **Migration numbering**      | 002-007 don't exist; confusing for developers                            | P1       |
| ~~No schema_version table~~  | Resolved: dropped (DB v0 — kysely_migration is the sole ledger)         | —       |
| **No data migration runner** | `data_migrations` table exists but no framework runs transforms          | P1       |
| **No migration tests**       | Can't validate migrations against known schemas                          | P2       |
| **No rollback support**      | Kysely Migrator supports `migrateDown()` but not wired                   | P2       |
| ~~parts/ organization~~      | Resolved: flat top-level migrations only | —       |
| **No migration docs**        | No documentation of what each migration does or why                      | P2       |

---

## Reconciliation Plan

### 1. Migration Numbering Fix

**Option A: Re-number (breaking)**

- Rename 008→002, 009→003, etc.
- Requires squash migration or clean DB reset
- **Verdict: NOT recommended** — existing deployments have migration history

**Option B: Document gaps (safe)**

- Add comments to 001_init explaining 002-007 are in `parts/`
- Add `docs/spec/migrations.md` with full migration index
- **Verdict: Recommended**

**Option C: Fresh start migration**

- Create a squash migration that replaces 001-022 for new installs
- Old installs keep their history
- **Verdict: Consider for v1.0 release**
<!-- GAP: schema_version table is aspirational; current state uses Kysely's
     internal migration tracking table only. Do NOT add the schema_version table
     unless explicitly needed by app code. -->
```sql
-- src/db/schema_version.ts (planned; not yet implemented)
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,     -- migration number (e.g. 22)
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
  checksum TEXT,                     -- SHA256 of migration SQL
  duration_ms INTEGER               -- how long migration took
);
```

The existing `Kysely Migrator` already tracks applied migrations in its internal table. This new table provides a **queryable** version for app code:

```ts
export function getSchemaVersion(db: Db,): number {
  const row = db.selectFrom("schema_version",)
    .selectAll()
    .orderBy("version", "desc",)
    .limit(1,)
    .executeTakeFirst();
  return row?.version ?? 0;
}
```

### 3. Content Versioning Framework

**Problem:** `data_version` columns exist but no code reads/writes them meaningfully.
**Solution:** Content version registry (planned; current code uses `src/db/content-version.ts` for asset content versioning, NOT `content-versioning.ts`):

```ts
// src/db/content-versioning.ts (planned; not yet implemented)
interface ContentVersionDef {
  table: string;
  column: string;
  currentVersion: number;
  migrateUp: (row: Record<string, unknown>,) => Record<string, unknown>;
  migrateDown: (row: Record<string, unknown>,) => Record<string, unknown>;
}

const VERSIONS: ContentVersionDef[] = [
  {
    table: "actors",
    column: "data_version",
    currentVersion: 2,
    migrateUp: (row,) => {
      // v1 → v2: normalize character card fields
      return { ...row, data_version: 2, };
    },
    migrateDown: (row,) => {
      return { ...row, data_version: 1, };
    },
  },
];

export async function migrateContent(
  db: Db,
  table: string,
  options: { batchSize?: number } = {},
): Promise<number> {
  const def = VERSIONS.find(v => v.table === table);
  if (!def) { return 0; }

  const batchSize = options.batchSize ?? 100;
  let migrated = 0;

  while (true) {
    const rows = await db.selectFrom(table,)
      .where(def.column, "<", def.currentVersion,)
      .limit(batchSize,)
      .execute();

    if (rows.length === 0) { break; }

    for (const row of rows) {
      const updated = def.migrateUp(row,);
      await db.updateTable(table,)
        .set({ [def.column]: def.currentVersion, ...updated, },)
        .where("id", "=", row.id,)
        .execute();
      migrated++;
    }
  }

  return migrated;
}
```

### 4. Migration Testing

<!-- GAP: src/db/migrations/__tests__/ directory does not exist. Migration testing
     is covered by src/db/migrations.test.ts + src/db/migration-roundtrip.test.ts
     (top-level test files, gated by CHECK_INCLUDE_HEAVY_DB_TESTS=1 for finalize). -->
```ts
// src/db/migrations.test.ts (illustrative — actual location)
import { Kysely, } from "kysely";
import { runMigrations, } from "../migrate";

describe("migrations", () => {
  it("001_init creates expected tables", async () => {
    const db = new Kysely({ dialect: new SqliteDialect({ database: ":memory:", },), },);
    await runMigrations(db,);

    const tables = await db.selectFrom("sqlite_master",)
      .where("type", "=", "table",)
      .select("name",)
      .execute();

    expect(tables.map(t => t.name),).toContain("users",);
    expect(tables.map(t => t.name),).toContain("actors",);
    expect(tables.map(t => t.name),).toContain("chats",);
  });

  it("018 adds data_version columns", async () => {
    // Run up to 017, verify columns missing, then run 018
  });
});
```

### 5. Migration Documentation

Create `docs/spec/migrations.md`:

```markdown
# Migration Index

| #   | Name             | Purpose                       | Tables Affected   | Rollback                |
| --- | ---------------- | ----------------------------- | ----------------- | ----------------------- |
| 001 | init             | Core schema (19 tables)       | all               | No (fresh install only) |
| 008 | chat_features    | Chat purpose, model settings  | chats             | Yes                     |
| 009 | group_chat       | Multi-participant chat        | chat_participants | Yes                     |
| 010 | bool_to_enum     | Boolean-as-int → enum strings | multiple          | Yes                     |
| ... | ...              | ...                           | ...               | ...                     |
| 024 | encryption_level | Encryption level enum         | chat_settings     | Yes                     |
```

---

## Conventions (Going Forward)

### Naming

- Sequential numbering: `025_descriptive_name.ts`
- No gaps allowed — if unsure, use next number
- Snake_case for file names

### Structure

```ts
// src/db/migrations/025_example.ts
import type { Kysely, } from "kysely";
import type { DB, } from "../schema";

export default {
  async up(db: Kysely<DB>,) {
    // Forward migration
    await db.schema
      .alterTable("table_name",)
      .addColumn("new_col", "text",)
      .execute();
  },
  async down(db: Kysely<DB>,) {
    // Rollback (optional but encouraged)
    await db.schema
      .alterTable("table_name",)
      .dropColumn("new_col",)
      .execute();
  },
};
```

### Splitting Large Migrations

When a migration touches many tables:

```
src/db/migrations/
├── 025_feature_name.ts          ← orchestrator (imports parts)
└── parts/
    └── 025_feature_name/
        ├── 01_table_a.ts
        ├── 02_table_b.ts
        └── 03_indexes.ts
```

---

## See Also

- `src/db/migrate.ts` — current migration runner
- `src/db/migrations/018_data_version_columns.ts` — existing data versioning
- `docs/spec/schema.md` — full DB schema
