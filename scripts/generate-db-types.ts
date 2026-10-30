// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generate DB types, test helpers, and validation schemas from migrations.
 *
 * Produces:
 *   - src/db/schema-{domain}.ts — Kysely interfaces per domain
 *   - src/db/schema.ts — DB aggregate interface
 *   - src/test-utils/insert-helpers.ts — Typed insert functions
 *   - src/validation/db-schemas.ts — TypeBox schemas for DB tables
 *
 * Usage: bun run scripts/generate-db-types.ts
 */
import { readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { COLUMN_TYPE_OVERRIDES, } from "../src/db/column-types";
import { type ColumnDef, listMigrationFiles, parseMigration, } from "./lib/migration-parser";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../src/db/migrations",);
// Output override for check-db-schemas.ts: generates into a temp dir instead of src/.
const DB_OUTPUT_DIR = process.env.DB_GEN_OUTPUT_DIR ?? null;
// Enum sources always come from src/db (input); only generated artifacts redirect.
const ENUM_DIR = resolve(import.meta.dir, "../src/db",);
const DB_DIR = DB_OUTPUT_DIR ? resolve(DB_OUTPUT_DIR,) : ENUM_DIR;
const TEST_UTILS_DIR = DB_OUTPUT_DIR
  ? resolve(DB_OUTPUT_DIR, "test-utils",)
  : resolve(import.meta.dir, "../src/test-utils",);
const VALIDATION_DIR = DB_OUTPUT_DIR
  ? resolve(DB_OUTPUT_DIR, "validation",)
  : resolve(import.meta.dir, "../src/validation",);

// ── Schema Building uses ./lib/migration-parser (parseMigration, listMigrationFiles) ──

/**
 * Apply `pairs` (`[oldName, newName]`) to `table`: carry each renamed
 * column's definition across under the new name, keeping its original
 * position. Re-keying in place rather than delete-then-add matters — appending
 * would silently reorder every renamed column to the end of its table, which
 * shows up as churn across every generated artifact.
 */
function applyRenames(
  table: Record<string, ColumnDef>,
  pairs: ReadonlyArray<readonly [string, string,]>,
): void {
  for (const [from, to,] of pairs) {
    const def = table[from];
    if (!def || table[to]) { continue; }
    const next: Record<string, ColumnDef> = {};
    for (const [name, col,] of Object.entries(table,)) {
      if (name === from) { next[to] = def; }
      else { next[name] = col; }
    }
    for (const key of Object.keys(table,)) { delete table[key]; }
    Object.assign(table, next,);
  }
}

// ── Schema Building ──────────────────────────────────────

function buildSchema(): Map<string, Record<string, ColumnDef>> {
  const allFiles = listMigrationFiles(MIGRATIONS_DIR,);

  const allTables = new Map<string, Record<string, ColumnDef>>();
  const allAlters = new Map<string, Record<string, ColumnDef>>();
  const allDrops = new Map<string, Set<string>>();
  const droppedTables = new Set<string>();
  const allRenames = new Map<string, Array<[string, string,]>>();

  for (const filePath of allFiles) {
    const { creates, alters, drops, droppedTables: dt, renames, } = parseMigration(filePath,);

    for (const [name, pairs,] of renames) {
      if (!allRenames.has(name,)) { allRenames.set(name, [],); }
      allRenames.get(name,)!.push(...pairs,);
    }

    for (const [name, def,] of creates) {
      if (dt.has(name,)) { continue; }
      if (!allTables.has(name,)) { allTables.set(name, def.columns,); }
    }

    for (const [name, cols,] of alters) {
      if (!allAlters.has(name,)) { allAlters.set(name, {},); }
      Object.assign(allAlters.get(name,)!, cols,);
    }

    for (const [name, colSet,] of drops) {
      if (!allDrops.has(name,)) { allDrops.set(name, new Set(),); }
      for (const c of colSet) { allDrops.get(name,)!.add(c,); }
    }

    for (const d of dt) { droppedTables.add(d,); }
  }

  // Apply alters then renames then drops
  for (const [name, cols,] of allAlters) {
    const table = allTables.get(name,);
    if (table) { Object.assign(table, cols,); }
  }

  // A rename keeps the column's type/NOT NULL/DEFAULT; SQLite preserves them
  // across RENAME COLUMN, so copy the definition across. The old name is
  // already in allDrops and is removed below.
  for (const [name, pairs,] of allRenames) {
    const table = allTables.get(name,);
    if (!table) { continue; }
    applyRenames(table, pairs,);
  }

  for (const [name, colSet,] of allDrops) {
    const table = allTables.get(name,);
    if (table) {
      for (const c of colSet) { delete table[c]; }
    }
  }

  return allTables;
}

// ── Domain Grouping ────────────────────────────────────────

const DOMAIN_MAP: Record<string, string> = {
  // Core
  users: "core",
  sessions: "core",
  chats: "core",
  actors: "core",
  chat_participants: "core",
  characters: "core",
  personas: "core",
  messages: "core",
  message_translations: "core",
  actor_keys: "core",
  group_initiatives: "core",
  chat_mentions: "core",
  notifications: "core",
  user_api_keys: "core",
  actor_notes: "core",
  actor_items: "core",
  model_role_overrides: "core",
  system_config: "core",
  log_entries: "core",
  plugin_state: "core",
  message_reactions: "core",
  chat_pins: "core",
  // Content
  assets: "content",
  asset_links: "content",
  asset_shares: "content",
  asset_tags: "content",
  asset_tag_dismissals: "content",
  // Story
  worlds: "story",
  locations: "story",
  items: "story",
  world_items: "story",
  quest_reward_ledger: "story",
  rpg_questions: "story",
  world_lore_entries: "story",
  actor_lore_entries: "story",
  actor_memories: "story",
  story_turns: "story",
  quests: "story",
  quest_progress: "story",
  world_states: "story",
  npc_states: "story",
  location_states: "story",
  world_timescale: "story",
  world_timescale_history: "story",
  // Generation
  generation_attempts: "generation",
  synthetic_data: "synthetic",
  // Character
  character_permanent_traits: "character",
  character_world_traits: "character",
  character_location_traits: "character",
  character_mood: "character",
  mood_events: "character",
  character_relationships: "character",
  character_avatars: "character",
  character_avatar_config: "character",
  world_avatar_config: "character",
  emotions: "character",
  character_emotions: "character",
  character_availability: "character",
  character_license_history: "character",
  character_licensing: "character",
  admin_character_overrides: "character",
  character_intimacy: "character",
  character_arousal: "character",
  character_desire_profile: "character",
  character_seduction_skills: "character",
  nsfw_encounters: "character",
  character_body_profile: "character",
  character_heat_cycle: "character",
  character_fantasies: "character",
  location_nsfw_config: "character",
  character_world_setup: "character",
  // Crafting
  crafting_recipes: "crafting",
  crafting_recipe_materials: "crafting",
  crafting_station_defs: "crafting",
  crafting_station_instances: "crafting",
  professions: "crafting",
  profession_specializations: "crafting",
  recipe_discoveries: "crafting",
  gathering_node_defs: "crafting",
  gathering_node_materials: "crafting",
  gathering_node_instances: "crafting",
  crafting_attempts: "crafting",
  crafting_orders: "crafting",
  // Telemetry
  telemetry_events: "telemetry",
  model_rankings: "telemetry",
  ranking_snapshots: "telemetry",
  // Blog
  blog_posts: "blog",
  blog_comments: "blog",
  blog_tags: "blog",
  blog_follows: "blog",
  blog_rag_sources: "blog",
  // Moderation
  model_comparisons: "moderation",
  nsfw_user_preferences: "moderation",
  content_flags: "moderation",
  moderation_actions: "moderation",
  moderation_appeals: "moderation",
  // GM
  shadow_notes: "gm",
  whitenotes: "gm",
  // Misc
  data_migrations: "core",
};

function getDomain(table: string,): string {
  return DOMAIN_MAP[table] || "core";
}

function pascalCase(snake: string,): string {
  return snake
    .split("_",)
    .map((w,) => w.charAt(0,).toUpperCase() + w.slice(1,))
    .join("",);
}

// ── TypeScript Type Mapping ─────────────────────────────────

/**
 * Does the DATABASE supply this primary key's value?
 *
 * SQLite fills a PK in exactly two ways: a DEFAULT expression, or the
 * INTEGER PRIMARY KEY rowid alias (auto-assigned, no DEFAULT clause).
 * A TEXT PRIMARY KEY with neither is filled by nobody — an id-less INSERT
 * stores NULL, silently.
 *
 * The schema manifest's `hasDefault` flag cannot see the rowid alias, so the
 * column TYPE is part of the rule: without it every INTEGER PRIMARY KEY
 * would become an insert-time compile error even though SQLite fills it.
 *
 * @param cols - every column of the table the primary key belongs to
 * @param colName - the primary key column to judge
 * @returns true when the database fills the column on its own
 */
export function dbSuppliesPrimaryKey(cols: Record<string, ColumnDef>, colName: string,): boolean {
  const col = cols[colName];
  if (!col?.primaryKey) { return false; }
  if (col.hasDefault) { return true; }
  // Rowid alias: the sole INTEGER PRIMARY KEY column of a rowid table.
  const pkCount = Object.values(cols,).filter((c,) => c.primaryKey).length;
  return pkCount === 1 && col.type === "integer";
}

export function tsType(
  col: ColumnDef,
  tableName: string,
  colName: string,
  tableCols: Record<string, ColumnDef>,
): string {
  // Check override first
  const overrides = COLUMN_TYPE_OVERRIDES[tableName] || COLUMN_TYPE_OVERRIDES[pascalCase(tableName,)] || {};
  const override = overrides[colName];

  let base: string;
  if (override) {
    base = override;
  } else {
    switch (col.type) {
      case "text":
        base = "string";
        break;
      case "integer":
        base = "number";
        break;
      case "real":
        base = "number";
        break;
      case "blob":
        base = "Uint8Array";
        break;
      default:
        base = "string";
    }
  }

  // Primary keys: the database fills the value only when it has a DEFAULT or
  // is the INTEGER PRIMARY KEY rowid alias. Any other PK must be supplied by
  // the caller — typing it as `Generated<>` made `id` optional in the insert
  // object, so omitting it type-checked and SQLite stored NULL.
  if (col.primaryKey) {
    return dbSuppliesPrimaryKey(tableCols, colName,) ? `Generated<${base}>` : base;
  }

  // Apply Generated wrapper for columns with defaults (auto-generated by DB)
  if (col.hasDefault && col.notNull) {
    return `Generated<${base}>`;
  }

  // Apply nullable
  if (!col.notNull) {
    return `${base} | null`;
  }

  return base;
}

// ── Generator: schema-*.ts ──────────────────────────────────

function generateDomainFiles(tables: Map<string, Record<string, ColumnDef>>,): void {
  // Group tables by domain
  const domains = new Map<string, Map<string, Record<string, ColumnDef>>>();

  for (const [name, cols,] of tables) {
    const domain = getDomain(name,);
    if (!domains.has(domain,)) { domains.set(domain, new Map(),); }
    domains.get(domain,)!.set(name, cols,);
  }

  for (const [domain, domainTables,] of domains) {
    // Body first: the `Generated` import is only emitted when a column uses it.
    const body: string[] = [];

    for (const [name, cols,] of domainTables) {
      const interfaceName = pascalCase(name,);
      body.push(`// ── ${name} ────────────────────────────────────────────`,);

      // Check if this table has all 4 audit columns — if so, use shared type
      const auditCols = ["created_at", "updated_at", "content_version", "record_hash",];
      const hasAllAudit = auditCols.every(c => c in cols);
      if (hasAllAudit) {
        body.push(`export interface ${interfaceName} extends AuditColumns {`,);
      } else {
        body.push(`export interface ${interfaceName} {`,);
      }

      for (const [colName, colDef,] of Object.entries(cols,)) {
        if (hasAllAudit && auditCols.includes(colName,)) { continue; }
        const type = tsType(colDef, name, colName, cols,);
        body.push(`  ${colName}: ${type};`,);
      }

      body.push(`}`,);
      body.push(``,);
    }

    const lines: string[] = [];
    lines.push(`/**`,);
    lines.push(` * DB Schema — ${domain.charAt(0,).toUpperCase() + domain.slice(1,)} Domain Tables`,);
    lines.push(` *`,);
    lines.push(` * Auto-generated by scripts/generate-db-types.ts`,);
    lines.push(` * DO NOT EDIT MANUALLY — run \`bun run db:sync-types\` to regenerate.`,);
    lines.push(` */`,);
    if (body.some((l,) => l.includes("Generated<",))) {
      lines.push(`import type { Generated, } from "kysely";`,);
    }

    // Collect enum imports
    const enumImports = new Set<string>();
    for (const [name, cols,] of domainTables) {
      const tableName = pascalCase(name,);
      for (const [colName, _colDef,] of Object.entries(cols,)) {
        const overrides = COLUMN_TYPE_OVERRIDES[tableName] || COLUMN_TYPE_OVERRIDES[name] || {};
        if (overrides[colName]) {
          enumImports.add(overrides[colName],);
        }
      }
    }

    if (enumImports.size > 0) {
      const sorted = [...enumImports,].sort();
      // Emit wrapped import (dprint-compliant, lineWidth 120).
      lines.push(`import type {`,);
      for (const name of sorted) { lines.push(`  ${name},`,); }
      lines.push(`} from "./enums";`,);
    }

    // Check if any table in this domain uses AuditColumns
    const usesAudit = [...domainTables.values(),].some(cols =>
      ["created_at", "updated_at", "content_version", "record_hash",].every(c => c in cols)
    );
    if (usesAudit) {
      lines.push(`import type { AuditColumns, } from "./schema-audit";`,);
    }

    lines.push(``,);

    lines.push(...body,);

    const filePath = join(DB_DIR, `schema-${domain}.ts`,);
    writeFileSync(filePath, lines.join("\n",), "utf-8",);
    console.log(`  [schema] ${filePath}`,);
  }
}

// ── Generator: schema.ts barrel ──────────────────────────────

function generateBarrel(tables: Map<string, Record<string, ColumnDef>>,): void {
  const lines: string[] = [];
  lines.push(`/**`,);
  lines.push(` * DB Schema — Barrel`,);
  lines.push(` *`,);
  lines.push(` * Auto-generated by scripts/generate-db-types.ts`,);
  lines.push(` * All table type interfaces + DB aggregate for Kysely.`,);
  lines.push(` */`,);

  // Collect unique domains
  const domains = new Set<string>();
  for (const [name,] of tables) {
    domains.add(getDomain(name,),);
  }

  // Exports
  for (const domain of [...domains,].sort()) {
    lines.push(`export * from "./schema-${domain}";`,);
  }

  lines.push(``,);
  lines.push(`// ── DB Aggregate ────────────────────────────────────────────────────`,);
  lines.push(`export interface DB {`,);

  for (const [name,] of tables) {
    const domain = getDomain(name,);
    const interfaceName = pascalCase(name,);
    lines.push(`  ${name}: import("./schema-${domain}").${interfaceName};`,);
  }

  lines.push(`}`,);
  lines.push(``,);

  writeFileSync(join(DB_DIR, "schema.ts",), lines.join("\n",), "utf-8",);
  console.log(`  [barrel] ${join(DB_DIR, "schema.ts",)}`,);
}

// ── Generator: test insert helpers ───────────────────────────

/** Strip Generated<> wrapper for test-helper input types. */
function inputType(t: string,): string {
  const m = t.match(/^Generated<(.+)>$/,);
  return m ? m[1]! : t;
}

function generateTestHelpers(tables: Map<string, Record<string, ColumnDef>>,): void {
  const lines: string[] = [];
  lines.push(`/**`,);
  lines.push(` * Test Insert Helpers — Auto-generated`,);
  lines.push(` *`,);
  lines.push(` * Typed functions for inserting test data. Required fields are params,`,);
  lines.push(` * optional fields use defaults or accept undefined.`,);
  lines.push(` *`,);
  lines.push(` * Auto-generated by scripts/generate-db-types.ts`,);
  lines.push(` * DO NOT EDIT MANUALLY — run \`bun run db:sync-types\` to regenerate.`,);
  lines.push(` */`,);
  lines.push(`import type { Kysely, } from "kysely";`,);

  // Collect enum imports used across all tables
  const enumImports = new Set<string>();
  for (const [name, cols,] of tables) {
    const tableName = pascalCase(name,);
    for (const [colName,] of Object.entries(cols,)) {
      const overrides = COLUMN_TYPE_OVERRIDES[tableName] || COLUMN_TYPE_OVERRIDES[name] || {};
      if (overrides[colName]) {
        enumImports.add(overrides[colName],);
      }
    }
  }
  if (enumImports.size > 0) {
    const sorted = [...enumImports,].sort();
    // Emit wrapped import (dprint-compliant, lineWidth 120).
    lines.push(`import type {`,);
    for (const name of sorted) { lines.push(`  ${name},`,); }
    lines.push(`} from "../db/enums";`,);
  }
  // dprint sorts imports by module path; "../db/enums" < "../db/schema", so the DB
  // import must follow the enums import.
  lines.push(`import type { DB, } from "../db/schema";`,);

  lines.push(``,);
  lines.push(`type Db = Kysely<DB>;`,);
  lines.push(``,);

  for (const [name, cols,] of tables) {
    const interfaceName = pascalCase(name,);
    const fnName = `insert${interfaceName}`;

    // Required fields (not null, no default)
    const required: [string, string,][] = [];
    // Fields passed through `opts`: [name, type, caller must supply it]
    const optFields: Array<[string, string, boolean,]> = [];

    for (const [colName, colDef,] of Object.entries(cols,)) {
      const type = inputType(tsType(colDef, name, colName, cols,),);
      if (colDef.notNull && !colDef.hasDefault && !colDef.primaryKey) {
        required.push([colName, type,],);
        continue;
      }
      // The helper mints `id`; every other primary key the database does not
      // fill has to come from the caller — otherwise the row lands with a
      // NULL id, silently.
      const keyFromCaller = colDef.primaryKey && colName !== "id" &&
        !dbSuppliesPrimaryKey(cols, colName,);
      optFields.push([colName, type, keyFromCaller,],);
    }

    // Build function signature
    const params: string[] = [];
    for (const [colName, colType,] of required) {
      params.push(`${colName}: ${colType}`,);
    }
    // A primary key the caller must supply makes `opts` itself required.
    const optsRequired = optFields.some(([, , req,],) => req);
    if (optFields.length > 0) {
      const fields = optFields.map(([n, t, req,],) => req ? `${n}: ${t}` : `${n}?: ${t}`).join("; ",);
      params.push(`opts${optsRequired ? "" : "?"}: { ${fields} }`,);
    }

    lines.push(`/** Insert a ${name} row. */`,);
    // ponytail: return the generated id so FK chains in tests can resolve
    // the parent row without an extra SELECT; honor opts.id when supplied
    // (and strip it from opts so the spread does not override our local var).
    // Tables without an `id` column (e.g. resource_quota_counters keyed by
    // resource_id) cannot mint one: inserting `id` would fail and returning
    // the minted value would hand back a row key that was never stored.
    // Return the table's own primary key instead.
    // ponytail: keyless-junction tables (message_search_tokens has no PK at
    // all) have nothing meaningful to hand back — void, not a first-param
    // echo that callers mistake for a row key.
    const hasIdCol = Boolean(cols.id,);
    const returnCol = hasIdCol
      ? "id"
      : (Object.keys(cols,).find((c,) => cols[c]?.primaryKey) ?? "");
    const hasKey = hasIdCol || returnCol.length > 0;
    lines.push(
      hasKey
        ? `export async function ${fnName}(db: Db, ${params.join(", ",)}): Promise<string> {`
        : `export async function ${fnName}(db: Db, ${params.join(", ",)}): Promise<void> {`,
    );
    if (hasIdCol) {
      if (optFields.length > 0) {
        const source = optsRequired ? "opts" : "(opts ?? {})";
        lines.push(`  const { id: providedId, ...restOpts } = ${source} as { id?: string };`,);
        lines.push(`  const id = providedId ?? crypto.randomUUID();`,);
      } else {
        lines.push(`  const id = crypto.randomUUID();`,);
      }
    } else if (optFields.length > 0) {
      const source = optsRequired ? "opts" : "(opts ?? {})";
      lines.push(`  const { ...restOpts } = ${source} as Record<string, unknown>;`,);
    }
    lines.push(`  await db.insertInto("${name}",).values({` as string,);

    // Always include id (UUID generated by app)
    if (hasIdCol) {
      lines.push(`    id,`,);
    }

    // Required fields
    for (const [colName,] of required) {
      if (colName === "id") { continue; // already handled
       }
      lines.push(`    ${colName},`,);
    }

    // Fields from opts (id already destructured above)
    if (optFields.length > 0) {
      lines.push(`    ...restOpts,`,);
    }

    lines.push(`  } as any,).execute();`,);
    if (name === "chats") {
      lines.push(`  // Epic-chat-multi-ownership: mirror the production create path —`,);
      lines.push(`  // every chat is born with exactly one chat_owners row (its creator).`,);
      lines.push(`  // Kept in the GENERATOR (not hand-patched) so db:sync-types`,);
      lines.push(`  // regenerations preserve it and the db-schema gate stays green.`,);
      lines.push(`  await db.insertInto("chat_owners",).values({`,);
      lines.push(`    id: crypto.randomUUID(),`,);
      lines.push(`    chat_id: id,`,);
      lines.push(`    user_id: created_by,`,);
      lines.push(`  },).execute();`,);
    }
    // `id` column: return the local (generated or provided) — restOpts has
    // `id` destructured out, so reading it back would hand callers undefined.
    // No `id` column: the PK arrives from the caller, either as a required
    // param or inside opts/restOpts — read whichever binding holds it.
    if (hasIdCol) {
      lines.push(`  return id;`,);
    } else if (required.some(([n,],) => n === returnCol)) {
      lines.push(`  return ${returnCol};`,);
    } else if (optFields.length === 0) {
      if (hasKey) { lines.push(`  return ${returnCol};`,); }
    } else if (hasKey) {
      lines.push(`  return (restOpts as Record<string, unknown>).${returnCol} as string;`,);
    }
    lines.push(`}`,);
    lines.push(``,);
  }

  writeFileSync(join(TEST_UTILS_DIR, "insert-helpers.ts",), lines.join("\n",), "utf-8",);
  console.log(`  [helpers] ${join(TEST_UTILS_DIR, "insert-helpers.ts",)}`,);
}

// ── Generator: validation schemas ────────────────────────────

function generateValidationSchemas(tables: Map<string, Record<string, ColumnDef>>,): void {
  const lines: string[] = [];
  lines.push(`/**`,);
  lines.push(` * DB Validation Schemas — Auto-generated TypeBox schemas for DB tables.`,);
  lines.push(` *`,);
  lines.push(` * Generates insert/update schemas for each table based on column metadata.`,);
  lines.push(` * Use these in route handlers for request validation.`,);
  lines.push(` *`,);
  lines.push(` * Auto-generated by scripts/generate-db-types.ts`,);
  lines.push(` * DO NOT EDIT MANUALLY — run \`bun run db:sync-types\` to regenerate.`,);
  lines.push(` */`,);
  lines.push(`import { t, } from "elysia";`,);
  lines.push(``,);

  // No longer importing from schemas.ts — enum schemas generated inline

  // Enum schemas are generated inline below (hand-authored validation
  // schemas re-export them instead of mirroring values).

  // We need the actual enum values to generate schemas. Read them from enums-*.ts
  // files (top-level) AND from within split enums-*/ subdirectory modules.
  const enumDir = ENUM_DIR;
  const enumFiles: string[] = readdirSync(enumDir,).filter((f,) => f.startsWith("enums-",) && f.endsWith(".ts",));
  for (const dir of readdirSync(enumDir,)) {
    if (dir.startsWith("enums-",) && !dir.endsWith(".ts",)) {
      for (const f of readdirSync(join(enumDir, dir,),)) {
        if (f.endsWith(".ts",) && !f.endsWith(".test.ts",)) {
          enumFiles.push(join(dir, f,),);
        }
      }
    }
  }
  let allEnumsContent = "";
  for (const f of enumFiles) {
    allEnumsContent += readFileSync(join(enumDir, f,), "utf-8",) + "\n";
  }

  // Every const-object enum becomes a schema (column-referenced or not).
  const allEnumTypes = [
    ...new Set(
      [...allEnumsContent.matchAll(/export const (\w+) = \{/g,),].map((m,) => m[1] ?? ""),
    ),
  ].sort();
  for (const enumName of allEnumTypes) {
    // Match the const object pattern: export const UserRole = { ... } as const;
    const constRegex = new RegExp(`export const ${enumName} = \\{([^}]+)\\} as const;`, "m",);
    const match = allEnumsContent.match(constRegex,);
    if (match) {
      const values = match[1]?.match(/"([^"]+)"/g,)?.map((v,) => v.replace(/"/g, "",));
      if (values && values.length > 0) {
        const quoted = values.map((v,) => `"${v}"`);
        // Wrap long union arrays (dprint-compliant, lineWidth 120).
        if (quoted.join(", ",).length + enumName.length + 40 > 120) {
          lines.push(`export const ${enumName}Schema = t.UnionEnum([`,);
          for (const q of quoted) { lines.push(`  ${q},`,); }
          lines.push(`],);`,);
        } else {
          lines.push(`export const ${enumName}Schema = t.UnionEnum([${quoted.join(", ",)},],);`,);
        }
      }
    }
  }
  lines.push(``,);

  for (const [name, cols,] of tables) {
    const schemaName = `${pascalCase(name,)}Schema`;

    // Build insert schema (required fields only)
    const requiredFields: string[] = [];
    const optionalFields: string[] = [];

    for (const [colName, colDef,] of Object.entries(cols,)) {
      if (colName === "id") { continue; // UUID auto-generated
       }

      const tableName = pascalCase(name,);
      const overrides = COLUMN_TYPE_OVERRIDES[tableName] || COLUMN_TYPE_OVERRIDES[name] || {};
      const enumType = overrides[colName];

      let typeBox: string;
      if (enumType) {
        typeBox = `${enumType}Schema`;
      } else {
        switch (colDef.type) {
          case "text":
            typeBox = "t.String()";
            break;
          case "integer":
            typeBox = "t.Number()";
            break;
          case "real":
            typeBox = "t.Number()";
            break;
          case "blob":
            typeBox = "t.String()";
            break;
          default:
            typeBox = "t.String()";
        }
      }

      if (colDef.notNull && !colDef.hasDefault && !colDef.primaryKey) {
        requiredFields.push(`    ${colName}: ${typeBox},`,);
      } else {
        optionalFields.push(`    ${colName}: t.Optional(${typeBox},),`,);
      }
    }

    lines.push(`// ── ${name} ────────────────────────────────────────────`,);
    lines.push(`export const ${schemaName} = t.Object({`,);

    for (const f of requiredFields) { lines.push(f,); }
    for (const f of optionalFields) { lines.push(f,); }

    lines.push(`},);`,);
    lines.push(``,);
  }

  writeFileSync(join(VALIDATION_DIR, "db-schemas.ts",), lines.join("\n",), "utf-8",);
  console.log(`  [validation] ${join(VALIDATION_DIR, "db-schemas.ts",)}`,);
}

// ── Main ─────────────────────────────────────────────────

function main() {
  console.log("Building schema from migrations...",);
  const tables = buildSchema();
  console.log(`Found ${tables.size} tables\n`,);

  console.log("Generating outputs:",);
  generateDomainFiles(tables,);
  generateBarrel(tables,);
  generateTestHelpers(tables,);
  generateValidationSchemas(tables,);

  // Generated artifacts must be dprint-compliant (lineWidth 120) or `format - dprint`
  // fails on every regeneration. Format the output dir in place. When generating into
  // a temp dir (check-db-schemas.ts), pass the repo config explicitly so dprint still
  // applies the project's formatting rules outside the repo root.
  const targets = [
    join(DB_DIR, "schema.ts",),
    join(TEST_UTILS_DIR, "insert-helpers.ts",),
    join(VALIDATION_DIR, "db-schemas.ts",),
    ...readdirSync(DB_DIR,).filter((f,) => f.startsWith("schema-",) && f.endsWith(".ts",)).map((f,) =>
      join(DB_DIR, f,)
    ),
  ];
  const dprintConfig = resolve(import.meta.dir, "..", "dprint.json",);
  const fmt = Bun.spawnSync(["bunx", "dprint", "fmt", "--config", dprintConfig, ...targets,], {
    stdout: "ignore",
    stderr: "ignore",
    cwd: resolve(import.meta.dir, "..",),
  },);
  if (fmt.exitCode !== 0) {
    console.warn("  [warn] dprint fmt on generated files failed; run `bun run format:fix` manually",);
  }

  console.log(`\nDone. Run \`bun run check\` to verify.`,);
}

// CLI guard: importing this module (tests) must not rewrite the generated files.
if (import.meta.main) {
  main();
}
