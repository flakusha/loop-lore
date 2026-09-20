// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared migration parser for DB codegen scripts.
 *
 * Single source for extracting createTable/addColumn/alterTable structure
 * from migration `up()` bodies. Used by generate-db-types.ts and
 * generate-schema-manifest.ts — do not fork copies back into callers.
 *
 * Kept free of process.exit / argv so the pure parts are unit-testable.
 */

import { readdirSync, readFileSync, } from "node:fs";
import { join, } from "node:path";

export interface ColumnDef {
  type: "text" | "integer" | "real" | "blob";
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
}

export interface TableDef {
  columns: Record<string, ColumnDef>;
  /** Migration file that created this table */
  createdBy: string;
}

export interface ParsedMigration {
  creates: Map<string, TableDef>;
  alters: Map<string, Record<string, ColumnDef>>;
  drops: Map<string, Set<string>>;
  droppedTables: Set<string>;
}

export interface ParseOptions {
  /** Log renameTable pairs to stdout (generate-schema-manifest.ts only). */
  logRenames?: boolean;
}

/**
 * Parse one migration file's `up()` body into table creates/alters/drops.
 * @param filePath absolute path to the migration file
 * @param opts set logRenames for per-file rename logging
 */
export function parseMigration(filePath: string, opts?: ParseOptions,): ParsedMigration {
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
        if (opts?.logRenames) { console.log(`  [rename] ${tblRef[1]} -> ${toTable}`,); }
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

/**
 * Parse `.addColumn("name", "type", ...)` entries from a create/alter block.
 * Accepts the 2-arg form (name, type) and the 3-arg form (name, type, builder).
 * @param block matched createTable/alterTable source block
 */
export function parseColumns(block: string,): Record<string, ColumnDef> {
  const columns: Record<string, ColumnDef> = {};

  // Split by .addColumn( to process each column separately
  const parts = block.split(/\.addColumn\(/g,);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Extract column name and type: "name", "type"
    const headerMatch = part.match(/^\s*"(\w+)"\s*,\s*"(text|integer|real|blob)"/,);
    if (!headerMatch) { continue; }

    const [, name, type,] = headerMatch;

    // Get everything from the type onward — includes the callback chain
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

/**
 * List top-level migration files (numbered `NNN_*.ts`) sorted by basename.
 * Shared file-enumeration for both DB codegen entry points.
 * @param migrationsDir absolute path to src/db/migrations
 */
export function listMigrationFiles(migrationsDir: string,): string[] {
  return readdirSync(migrationsDir,)
    .filter((f,) => f.endsWith(".ts",) && /^\d{3}_/.test(f,))
    .sort()
    .map((f,) => join(migrationsDir, f,));
}
