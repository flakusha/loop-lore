/**
 * Generate schema-manifest.ts from migration files.
 *
 * Parses all migrations/*.ts files, extracts createTable/addColumn/alterTable
 * calls, and regenerates src/db/schema-manifest.ts as the single source of truth.
 *
 * Usage: bun run scripts/generate-schema-manifest.ts
 */
import { readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../src/db/migrations",);
// Output override for check-db-schemas.ts: generates into a temp dir instead of src/.
const DB_OUTPUT_DIR = process.env.DB_GEN_OUTPUT_DIR ?? null;
const MANIFEST_PATH = DB_OUTPUT_DIR
  ? resolve(DB_OUTPUT_DIR, "schema-manifest.ts",)
  : resolve(import.meta.dir, "../src/db/schema-manifest.ts",);

// ── Types ──────────────────────────────────────────────────

interface ColumnDef {
  type: "text" | "integer" | "real";
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
}

interface TableDef {
  columns: Record<string, ColumnDef>;
  /** Migration file that created this table */
  createdBy: string;
}

// ── Parser ─────────────────────────────────────────────────

function parseMigration(filePath: string,): {
  creates: Map<string, TableDef>;
  alters: Map<string, Record<string, ColumnDef>>;
  drops: Map<string, Set<string>>;
  droppedTables: Set<string>;
} {
  const fullSource = readFileSync(filePath, "utf-8",);
  const fileName = filePath.split("/",).pop()!;

  // Extract only the up() function body to avoid processing down() rollback logic
  const upMatch = fullSource.match(
    /export\s+async\s+function\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\n\}/,
  );
  const source = upMatch ? upMatch[1] : fullSource;

  const creates = new Map<string, TableDef>();
  const alters = new Map<string, Record<string, ColumnDef>>();
  const drops = new Map<string, Set<string>>();
  const droppedTables = new Set<string>();

  // ── Create table blocks ──
  // Pattern: .createTable("name",) followed by .addColumn(...) lines
  const createTableRegex = /\.createTable\(\s*"(\w+)"\s*,?\s*\)[\s\S]*?\.execute\(\)/g;
  let match;
  while ((match = createTableRegex.exec(source,)) !== null) {
    const tableName = match[1];
    const block = match[0];
    const columns = parseColumns(block,);
    creates.set(tableName, { columns, createdBy: fileName, },);
  }

  // ── Rename table (e.g., _ck → original) — mark _ck as dropped ──
  const renameTableRegex = /\.renameTo\(\s*"(\w+)"\s*,?\s*\)\.execute\(\)/g;
  while ((match = renameTableRegex.exec(source,)) !== null) {
    const toTable = match[1];
    // Find the alterTable before this renameTo
    const before = source.substring(0, match.index,);
    const alterMatch = before.lastIndexOf(".alterTable(",);
    if (alterMatch !== -1) {
      const tblRef = before.substring(alterMatch,).match(/\.alterTable\(\s*"(\w+)"\s*,?\s*\)/,);
      if (tblRef) {
        droppedTables.add(tblRef[1],); // mark the _ck/_old table as dropped
        console.log(`  [rename] ${tblRef[1]} → ${toTable}`,);
      }
    }
  }

  // ── Alter table blocks (addColumn / dropColumn / renameColumn) ──
  const alterBlockRegex = /\.alterTable\(\s*"(\w+)"\s*,?\s*\)[\s\S]*?\.execute\(\)/g;
  while ((match = alterBlockRegex.exec(source,)) !== null) {
    const tableName = match[1];
    const block = match[0];

    // Skip renameTable blocks
    if (block.includes(".renameTo(",)) { continue; }

    // Handle renameColumn — mark old as dropped, register new
    if (block.includes(".renameColumn(",)) {
      const rcRegex = /\.renameColumn\(\s*"(\w+)"\s*,?\s*"(\w+)"\s*,?\s*\)/g;
      let rcMatch;
      while ((rcMatch = rcRegex.exec(block,)) !== null) {
        const [, oldName, newName,] = rcMatch;
        // Drop the OLD column name (the temporary one being renamed away)
        if (!drops.has(tableName,)) { drops.set(tableName, new Set(),); }
        drops.get(tableName,)!.add(oldName,);

        // If new name was previously marked for drop, remove it — it's being recreated
        drops.get(tableName,)?.delete(newName,);

        // Register the new column name — try to find its type from the preceding addColumn
        const addBlock = source.substring(Math.max(0, match.index - 500,), match.index,);
        const typeMatch = addBlock.match(new RegExp(`\\.addColumn\\(\\s*"${oldName}"\\s*,\\s*"(\\w+)"`,),);
        if (typeMatch) {
          if (!alters.has(tableName,)) { alters.set(tableName, {},); }
          alters.get(tableName,)![newName] = {
            type: typeMatch[1] as ColumnDef["type"],
            notNull: block.includes(".notNull()",),
            hasDefault: block.includes(".defaultTo(",),
            primaryKey: false,
          };
        }
      }
      continue;
    }

    // Handle dropColumn
    if (block.includes(".dropColumn(",)) {
      const dropColRegex = /\.dropColumn\(\s*"(\w+)"\s*,?\s*\)/g;
      let dropMatch;
      while ((dropMatch = dropColRegex.exec(block,)) !== null) {
        if (!drops.has(tableName,)) { drops.set(tableName, new Set(),); }
        drops.get(tableName,)!.add(dropMatch[1],);
      }
      continue;
    }

    // Handle addColumn
    if (block.includes(".addColumn(",)) {
      const columns = parseColumns(block,);
      if (!alters.has(tableName,)) { alters.set(tableName, {},); }
      Object.assign(alters.get(tableName,)!, columns,);
    }
  }

  return { creates, alters, drops, droppedTables, };
}

function parseColumns(block: string,): Record<string, ColumnDef> {
  const columns: Record<string, ColumnDef> = {};

  // Split by .addColumn( to process each column separately
  const parts = block.split(/\.addColumn\(/g,);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Extract column name and type: "name", "type"
    const headerMatch = part.match(/^\s*"(\w+)"\s*,\s*"(text|integer|real)"/,);
    if (!headerMatch) { continue; }

    const [, name, type,] = headerMatch;

    // Get everything from the type to the next .addColumn or end of block
    // This includes the callback chain
    const restOfPart = part.substring(part.indexOf(`"${type}"`,),);

    columns[name] = {
      type: type as ColumnDef["type"],
      notNull: restOfPart.includes(".notNull()",),
      hasDefault: restOfPart.includes(".defaultTo(",),
      primaryKey: restOfPart.includes(".primaryKey()",),
    };
  }

  return columns;
}

// ── Manifest Generation ────────────────────────────────────

function generateManifest(
  tables: Map<string, TableDef>,
  alterColumns: Map<string, Record<string, ColumnDef>>,
  dropColumns: Map<string, Set<string>>,
): string {
  // Build final schema by applying alters on top of creates
  const finalTables = new Map<string, Record<string, ColumnDef>>();

  // First, collect all tables from creates
  for (const [name, def,] of tables) {
    finalTables.set(name, { ...def.columns, },);
  }

  // Then apply alters (add columns to existing tables)
  for (const [name, cols,] of alterColumns) {
    if (!finalTables.has(name,)) {
      console.warn(`[warn] alterTable references "${name}" but no createTable found — skipping`,);
      continue;
    }
    Object.assign(finalTables.get(name,)!, cols,);
  }

  // Then apply drops (remove columns that were renamed away or dropped)
  for (const [name, colSet,] of dropColumns) {
    const table = finalTables.get(name,);
    if (!table) { continue; }
    for (const col of colSet) {
      delete table[col];
    }
  }

  // Sort tables alphabetically
  const sorted = [...finalTables.entries(),].sort(([a,], [b,],) => a.localeCompare(b,));

  // Generate code
  const lines: string[] = [];
  lines.push(`/**`,);
  lines.push(` * DB Schema Manifest — Single Source of Truth (AUTO-GENERATED)`,);
  lines.push(` *`,);
  lines.push(` * Generated by scripts/generate-schema-manifest.ts`,);
  lines.push(` * DO NOT EDIT MANUALLY — run \`bun run db:sync-manifest\` to regenerate.`,);
  lines.push(` *`,);
  lines.push(` * Runtime representation of every table and its columns.`,);
  lines.push(` * Used by:`,);
  lines.push(` *   - schema-sync.test.ts: verify migrations produce correct DB`,);
  lines.push(` *   - test-utils: typed insert helpers`,);
  lines.push(` *   - future: generate EXPECTED_TABLES, insert defaults, etc.`,);
  lines.push(` *`,);
  lines.push(` * When adding a table or column:`,);
  lines.push(` *   1. Add migration file`,);
  lines.push(` *   2. Run \`bun run db:sync-manifest\``,);
  lines.push(` *   3. This test validates everything lines up`,);
  lines.push(` */`,);
  lines.push(`import type { DB, } from "./schema";`,);
  lines.push(``,);
  lines.push(`/** Type-safe table name from the DB interface. */`,);
  lines.push(`export type TableName = keyof DB;`,);
  lines.push(``,);
  lines.push(`// ── Types ─────────────────────────────────────────────────────`,);
  lines.push(``,);
  lines.push(`interface ColMeta {`,);
  lines.push(`  /** SQLite storage type */`,);
  lines.push(`  type: "text" | "integer" | "real";`,);
  lines.push(`  /** NOT NULL constraint */`,);
  lines.push(`  notNull?: boolean;`,);
  lines.push(`  /** Has DEFAULT expression or value */`,);
  lines.push(`  hasDefault?: boolean;`,);
  lines.push(`  /** Is part of PRIMARY KEY */`,);
  lines.push(`  primaryKey?: boolean;`,);
  lines.push(`}`,);
  lines.push(``,);
  lines.push(`interface TableMeta {`,);
  lines.push(`  columns: Record<string, ColMeta>;`,);
  lines.push(`}`,);
  lines.push(``,);
  lines.push(`// ── SchemaManifest ────────────────────────────────────────────`,);
  lines.push(``,);
  lines.push(`export class SchemaManifest {`,);
  lines.push(`  readonly tables = new Map<string, TableMeta>();`,);
  lines.push(``,);
  lines.push(`  /** Register a table. Chainable. */`,);
  lines.push(`  table(name: string, columns: Record<string, ColMeta>,): this {`,);
  lines.push(`    this.tables.set(name, { columns, },);`,);
  lines.push(`    return this;`,);
  lines.push(`  }`,);
  lines.push(``,);
  lines.push(`  /** All table names, sorted. */`,);
  lines.push(`  get tableNames(): string[] {`,);
  lines.push(`    return [...this.tables.keys(),].sort();`,);
  lines.push(`  }`,);
  lines.push(``,);
  lines.push(`  /** Column names for a table, in registration order. */`,);
  lines.push(`  columnsOf(name: string,): string[] {`,);
  lines.push(`    const t = this.tables.get(name,);`,);
  lines.push(`    if (!t) { throw new Error(\`Unknown table: \${name}\`,); }`,);
  lines.push(`    return Object.keys(t.columns,);`,);
  lines.push(`  }`,);
  lines.push(``,);
  lines.push(`  /** Column metadata for a table. */`,);
  lines.push(`  tableOf(name: string,): TableMeta {`,);
  lines.push(`    const t = this.tables.get(name,);`,);
  lines.push(`    if (!t) { throw new Error(\`Unknown table: \${name}\`,); }`,);
  lines.push(`    return t;`,);
  lines.push(`  }`,);
  lines.push(``,);
  lines.push(`  /**`,);
  lines.push(`   * Verify an in-memory SQLite DB matches this manifest.`,);
  lines.push(`   * Returns structured diff for test assertions.`,);
  lines.push(`   */`,);
  lines.push(`  verify(sqlite: { query(sql: string, params?: unknown[],): { all(): unknown[] } },): {`,);
  lines.push(`    missingTables: string[];`,);
  lines.push(`    extraTables: string[];`,);
  lines.push(`    columnMismatches: {`,);
  lines.push(`      table: string;`,);
  lines.push(`      missingInDb: string[];`,);
  lines.push(`      extraInDb: string[];`,);
  lines.push(`    }[];`,);
  lines.push(`  } {`,);
  lines.push(`    const rows = (`,);
  lines.push(`      sqlite`,);
  lines.push(
    `        .query("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'kysely_%'",)`,
  );
  lines.push(`        .all() as { name: string; sql: string | null }[]`,);
  lines.push(`    );`,);
  lines.push(`    // FTS5 virtual tables (created via raw SQL) and their internal shadow tables`,);
  lines.push(`    // are implementation details — drop them so they are not treated as extra tables.`,);
  lines.push(`    const virtualRoots = new Set(`,);
  lines.push(`      rows.filter((r,) => (r.sql ?? "").trim().toUpperCase().startsWith("CREATE VIRTUAL TABLE",),)`,);
  lines.push(`        .map((r,) => r.name,),`,);
  lines.push(`    );`,);
  lines.push(`    const actualTables = new Set(`,);
  lines.push(`      rows.filter((r,) => {`,);
  lines.push(`        if (virtualRoots.has(r.name,)) { return false; }`,);
  lines.push(`        for (const suffix of ["_data", "_idx", "_content", "_docsize", "_config",]) {`,);
  lines.push(`          if (r.name.endsWith(suffix,) && virtualRoots.has(r.name.slice(0, -suffix.length,),)) {`,);
  lines.push(`            return false;`,);
  lines.push(`          }`,);
  lines.push(`        }`,);
  lines.push(`        return true;`,);
  lines.push(`      },).map((r,) => r.name,),`,);
  lines.push(`    );`,);
  lines.push(``,);
  lines.push(`    const missingTables: string[] = [];`,);
  lines.push(`    const extraTables: string[] = [];`,);
  lines.push(`    const columnMismatches: {`,);
  lines.push(`      table: string;`,);
  lines.push(`      missingInDb: string[];`,);
  lines.push(`      extraInDb: string[];`,);
  lines.push(`    }[] = [];`,);
  lines.push(``,);
  lines.push(`    // Check each manifest table exists in DB`,);
  lines.push(`    for (const name of this.tableNames) {`,);
  lines.push(`      if (!actualTables.has(name,)) {`,);
  lines.push(`        missingTables.push(name,);`,);
  lines.push(`        continue;`,);
  lines.push(`      }`,);
  lines.push(``,);
  lines.push(`      const expected = this.columnsOf(name,);`,);
  lines.push(
    `      const actualCols = (sqlite.query(\`PRAGMA table_info("\${name}")\`,).all() as { name: string }[]).map(`,
  );
  lines.push(`        (r,) => r.name,`,);
  lines.push(`      );`,);
  lines.push(``,);
  lines.push(`      const expectedSet = new Set(expected,);`,);
  lines.push(`      const actualSet = new Set(actualCols,);`,);
  lines.push(``,);
  lines.push(`      const missingInDb = expected.filter((c,) => !actualSet.has(c,));`,);
  lines.push(`      const extraInDb = actualCols.filter((c,) => !expectedSet.has(c,));`,);
  lines.push(``,);
  lines.push(`      if (missingInDb.length > 0 || extraInDb.length > 0) {`,);
  lines.push(`        columnMismatches.push({ table: name, missingInDb, extraInDb, },);`,);
  lines.push(`      }`,);
  lines.push(`    }`,);
  lines.push(``,);
  lines.push(`    // Extra tables in DB (not in manifest)`,);
  lines.push(`    for (const name of actualTables) {`,);
  lines.push(`      if (!this.tables.has(name,)) {`,);
  lines.push(`        extraTables.push(name,);`,);
  lines.push(`      }`,);
  lines.push(`    }`,);
  lines.push(``,);
  lines.push(`    return { missingTables, extraTables, columnMismatches, };`,);
  lines.push(`  }`,);
  lines.push(`}`,);
  lines.push(``,);
  lines.push(`// ── The Single Source of Truth (AUTO-GENERATED) ────────────────`,);
  lines.push(`//`,);
  lines.push(`// Every table, every column — parsed from src/db/migrations/*.ts`,);
  lines.push(`// Generated by: bun run db:sync-manifest`,);
  lines.push(``,);
  lines.push(`function col(type: ColMeta["type"], opts?: Omit<ColMeta, "type">,): ColMeta {`,);
  lines.push(`  return { type, ...opts, };`,);
  lines.push(`}`,);
  lines.push(``,);
  lines.push(`export const SCHEMA = new SchemaManifest()`,);

  // Group tables by rough category based on name prefix
  const groups = new Map<string, [string, Record<string, ColumnDef>,][]>();
  for (const [name, cols,] of sorted) {
    let group = "Misc";
    if (name.startsWith("user",) || name.startsWith("session",) || name.startsWith("persona",)) {
      group = "Core: Users & Sessions";
    } else if (name.startsWith("chat",) || name === "chats" || name === "messages") {
      group = "Core: Chats & Messages";
    } else if (name === "actors" || name === "characters") { group = "Core: Actors & Characters"; }
    else if (name.startsWith("actor_",) || name.startsWith("character_",)) { group = "Core: Actor Systems"; }
    else if (
      name.startsWith("world",) || name.startsWith("location",) || name === "items" || name.startsWith("quest",)
    ) { group = "World & RPG"; } else if (name.startsWith("asset",)) { group = "Assets"; }
    else if (
      name.startsWith("model",) || name.startsWith("provider",) || name.startsWith("prompt",) ||
      name.startsWith("template",)
    ) {
      group = "Generation & Prompts";
    } else if (name.startsWith("plugin",) || name.startsWith("event",) || name === "event_log") {
      group = "Plugin System";
    } else if (name.startsWith("admin",) || name.startsWith("config",)) { group = "Admin & Config"; }
    else if (name.startsWith("turn",) || name.startsWith("story",) || name.startsWith("scene",)) {
      group = "Turn & Story";
    } else if (name.startsWith("encryption",) || name.startsWith("key",)) { group = "Encryption"; }
    else if (
      name.startsWith("nsfw",) || name.startsWith("content_flag",) || name.startsWith("moderation",) ||
      name.startsWith("age_gate",)
    ) { group = "NSFW & Moderation"; } else if (name.startsWith("blog",)) { group = "Blog System"; }
    else if (name.startsWith("activity",) || name.startsWith("notification",)) { group = "Activity & Notifications"; }
    else if (name.startsWith("i18n",) || name.startsWith("translation",)) { group = "i18n"; }
    else if (
      name.startsWith("bookmark",) || name.startsWith("favorite",) || name.startsWith("rating",) ||
      name.startsWith("history",) || name.startsWith("pin",) || name === "pins"
    ) { group = "Bookmarks & History"; }

    if (!groups.has(group,)) { groups.set(group, [],); }
    groups.get(group,)!.push([name, cols,],);
  }

  let tableCount = 0;
  for (const [group, tables,] of groups) {
    lines.push(`  // ── ${group} ──────────────────────────────────────────────`,);
    for (const [name, cols,] of tables) {
      lines.push(`  .table("${name}", {`,);
      for (const [colName, colDef,] of Object.entries(cols,)) {
        const opts: string[] = [];
        if (colDef.primaryKey) { opts.push("primaryKey: true",); }
        if (colDef.notNull) { opts.push("notNull: true",); }
        if (colDef.hasDefault) { opts.push("hasDefault: true",); }

        if (opts.length > 0) {
          lines.push(`    ${colName}: col("${colDef.type}", { ${opts.join(", ",)}, },),`,);
        } else {
          lines.push(`    ${colName}: col("${colDef.type}",),`,);
        }
      }
      lines.push(`  },)`,);
      tableCount++;
    }
  }

  lines.push(`;`,);
  lines.push(``,);

  return lines.join("\n",);
}

// ── Main ───────────────────────────────────────────────────

function main() {
  const files = readdirSync(MIGRATIONS_DIR,)
    .filter((f,) => f.endsWith(".ts",) && /^\d{3}_/.test(f,))
    .sort();

  console.log(`Found ${files.length} migrations`,);

  // Also check parts/ subdirectory
  const partsDir = join(MIGRATIONS_DIR, "parts",);
  let partFiles: string[] = [];
  try {
    partFiles = readdirSync(partsDir,)
      .filter((f,) => f.endsWith(".ts",))
      .sort();
    console.log(`Found ${partFiles.length} migration parts`,);
  } catch {
    // No parts directory
  }

  const allTables = new Map<string, TableDef>();
  const allAlters = new Map<string, Record<string, ColumnDef>>();
  const allDrops = new Map<string, Set<string>>();

  // Process all migrations in order
  const allFiles = [...files.map((f,) => join(MIGRATIONS_DIR, f,)), ...partFiles.map((f,) => join(partsDir, f,)),].sort(
    (a, b,) => {
      // Sort by filename to maintain migration order
      const aBase = a.split("/",).pop()!;
      const bBase = b.split("/",).pop()!;
      return aBase.localeCompare(bBase,);
    },
  );

  for (const filePath of allFiles) {
    const { creates, alters, drops, droppedTables, } = parseMigration(filePath,);

    for (const [name, def,] of creates) {
      if (droppedTables.has(name,)) {
        console.log(`  [skip] ${name} (dropped/intermediate table)`,);
        continue;
      }
      if (!allTables.has(name,)) {
        allTables.set(name, def,);
        console.log(`  [create] ${name} (${Object.keys(def.columns,).length} cols) from ${def.createdBy}`,);
      } else {
        console.warn(`  [warn] duplicate createTable "${name}" in ${def.createdBy} — using first occurrence`,);
      }
    }

    for (const [name, cols,] of alters) {
      if (!allAlters.has(name,)) { allAlters.set(name, {},); }
      Object.assign(allAlters.get(name,)!, cols,);
    }

    for (const [name, colSet,] of drops) {
      if (!allDrops.has(name,)) { allDrops.set(name, new Set(),); }
      for (const c of colSet) { allDrops.get(name,)!.add(c,); }
    }
  }

  console.log(`\nTotal tables: ${allTables.size}`,);
  console.log(`Tables with alters: ${allAlters.size}`,);

  // Generate manifest
  const manifest = generateManifest(allTables, allAlters, allDrops,);
  writeFileSync(MANIFEST_PATH, manifest, "utf-8",);
  console.log(`\nWrote ${MANIFEST_PATH}`,);

  // Generated artifacts must be dprint-compliant (lineWidth 120) or `format - dprint`
  // fails on every regeneration. Format in place; pass repo config explicitly so temp-dir
  // generation (check-db-schemas.ts) still applies the project's formatting rules.
  const dprintConfig = resolve(import.meta.dir, "..", "dprint.json",);
  const fmt = Bun.spawnSync(["bunx", "dprint", "fmt", "--config", dprintConfig, MANIFEST_PATH,], {
    stdout: "ignore",
    stderr: "ignore",
    cwd: resolve(import.meta.dir, "..",),
  },);
  if (fmt.exitCode !== 0) {
    console.warn("  [warn] dprint fmt on generated manifest failed; run `bun run format:dprint` manually",);
  }

  console.log(`Run \`bun test src/db/schema-sync.test.ts\` to verify`,);
}

main();
