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
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { COLUMN_TYPE_OVERRIDES } from "../src/db/column-types";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../src/db/migrations");
const DB_DIR = resolve(import.meta.dir, "../src/db");
const TEST_UTILS_DIR = resolve(import.meta.dir, "../src/test-utils");
const VALIDATION_DIR = resolve(import.meta.dir, "../src/validation");

// ── Types ──────────────────────────────────────────────────

interface ColumnDef {
  type: "text" | "integer" | "real";
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
}

// ── Migration Parser (reused from generate-schema-manifest) ──

function parseMigration(filePath: string): {
  creates: Map<string, Record<string, ColumnDef>>;
  alters: Map<string, Record<string, ColumnDef>>;
  drops: Map<string, Set<string>>;
  droppedTables: Set<string>;
} {
  const fullSource = readFileSync(filePath, "utf-8");

  // Extract only the up() function body
  const upMatch = fullSource.match(/export\s+async\s+function\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\n\}/);
  const source = upMatch ? upMatch[1] : fullSource;

  const creates = new Map<string, Record<string, ColumnDef>>();
  const alters = new Map<string, Record<string, ColumnDef>>();
  const drops = new Map<string, Set<string>>();
  const droppedTables = new Set<string>();

  // Create table blocks
  const createTableRegex = /\.createTable\(\s*"(\w+)"\s*,?\s*\)[\s\S]*?\.execute\(\)/g;
  let match;
  while ((match = createTableRegex.exec(source)) !== null) {
    const tableName = match[1];
    const block = match[0];
    const columns = parseColumns(block);
    creates.set(tableName, columns);
  }

  // Rename table — mark intermediate table as dropped
  const renameTableRegex = /\.renameTo\(\s*"(\w+)"\s*,?\s*\)\.execute\(\)/g;
  while ((match = renameTableRegex.exec(source)) !== null) {
    const before = source.substring(0, match.index);
    const alterMatch = before.lastIndexOf(".alterTable(");
    if (alterMatch !== -1) {
      const tblRef = before.substring(alterMatch).match(/\.alterTable\(\s*"(\w+)"\s*,?\s*\)/);
      if (tblRef) droppedTables.add(tblRef[1]);
    }
  }

  // Alter table blocks
  const alterBlockRegex = /\.alterTable\(\s*"(\w+)"\s*,?\s*\)[\s\S]*?\.execute\(\)/g;
  while ((match = alterBlockRegex.exec(source)) !== null) {
    const tableName = match[1];
    const block = match[0];

    if (block.includes(".renameTo(")) continue;

    if (block.includes(".renameColumn(")) {
      const rcRegex = /\.renameColumn\(\s*"(\w+)"\s*,?\s*"(\w+)"\s*,?\s*\)/g;
      let rcMatch;
      while ((rcMatch = rcRegex.exec(block)) !== null) {
        const [, oldName, newName] = rcMatch;
        if (!drops.has(tableName)) drops.set(tableName, new Set());
        drops.get(tableName)!.add(oldName);
        drops.get(tableName)?.delete(newName);

        const addBlock = source.substring(Math.max(0, match.index - 500), match.index);
        const typeMatch = addBlock.match(new RegExp(`\\.addColumn\\(\\s*"${oldName}"\\s*,\\s*"(\\w+)"`));
        if (typeMatch) {
          if (!alters.has(tableName)) alters.set(tableName, {});
          alters.get(tableName)![newName] = {
            type: typeMatch[1] as ColumnDef["type"],
            notNull: block.includes(".notNull()"),
            hasDefault: block.includes(".defaultTo("),
            primaryKey: false,
          };
        }
      }
      continue;
    }

    if (block.includes(".dropColumn(")) {
      const dropColRegex = /\.dropColumn\(\s*"(\w+)"\s*,?\s*\)/g;
      let dropMatch;
      while ((dropMatch = dropColRegex.exec(block)) !== null) {
        if (!drops.has(tableName)) drops.set(tableName, new Set());
        drops.get(tableName)!.add(dropMatch[1]);
      }
      continue;
    }

    if (block.includes(".addColumn(")) {
      const columns = parseColumns(block);
      if (!alters.has(tableName)) alters.set(tableName, {});
      Object.assign(alters.get(tableName)!, columns);
    }
  }

  return { creates, alters, drops, droppedTables };
}

function parseColumns(block: string): Record<string, ColumnDef> {
  const columns: Record<string, ColumnDef> = {};
  const parts = block.split(/\.addColumn\(/g);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const headerMatch = part.match(/^\s*"(\w+)"\s*,\s*"(text|integer|real)"/);
    if (!headerMatch) continue;

    const [, name, type] = headerMatch;
    const restOfPart = part.substring(part.indexOf(`"${type}"`));

    columns[name] = {
      type: type as ColumnDef["type"],
      notNull: restOfPart.includes(".notNull()"),
      hasDefault: restOfPart.includes(".defaultTo("),
      primaryKey: restOfPart.includes(".primaryKey()"),
    };
  }

  return columns;
}

// ── Schema Building ──────────────────────────────────────

function buildSchema(): Map<string, Record<string, ColumnDef>> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".ts") && /^\d{3}_/.test(f))
    .sort();

  const partsDir = join(MIGRATIONS_DIR, "parts");
  let partFiles: string[] = [];
  try {
    partFiles = readdirSync(partsDir).filter((f) => f.endsWith(".ts")).sort();
  } catch { /* no parts dir */ }

  const allFiles = [
    ...files.map((f) => join(MIGRATIONS_DIR, f)),
    ...partFiles.map((f) => join(partsDir, f)),
  ].sort((a, b) => a.split("/").pop()!.localeCompare(b.split("/").pop()!));

  const allTables = new Map<string, Record<string, ColumnDef>>();
  const allAlters = new Map<string, Record<string, ColumnDef>>();
  const allDrops = new Map<string, Set<string>>();
  const droppedTables = new Set<string>();

  for (const filePath of allFiles) {
    const { creates, alters, drops, droppedTables: dt } = parseMigration(filePath);

    for (const [name, cols] of creates) {
      if (dt.has(name)) continue;
      if (!allTables.has(name)) allTables.set(name, cols);
    }

    for (const [name, cols] of alters) {
      if (!allAlters.has(name)) allAlters.set(name, {});
      Object.assign(allAlters.get(name)!, cols);
    }

    for (const [name, colSet] of drops) {
      if (!allDrops.has(name)) allDrops.set(name, new Set());
      for (const c of colSet) allDrops.get(name)!.add(c);
    }

    for (const d of dt) droppedTables.add(d);
  }

  // Apply alters then drops
  for (const [name, cols] of allAlters) {
    const table = allTables.get(name);
    if (table) Object.assign(table, cols);
  }

  for (const [name, colSet] of allDrops) {
    const table = allTables.get(name);
    if (table) {
      for (const c of colSet) delete table[c];
    }
  }

  return allTables;
}

// ── Domain Grouping ────────────────────────────────────────

const DOMAIN_MAP: Record<string, string> = {
  // Core
  users: "core", sessions: "core", chats: "core", actors: "core",
  chat_participants: "core", characters: "core", personas: "core",
  messages: "core", message_translations: "core", actor_keys: "core",
  group_initiatives: "core", chat_mentions: "core", notifications: "core",
  user_api_keys: "core", actor_notes: "core", actor_items: "core",
  model_role_overrides: "core", system_config: "core", log_entries: "core",
  plugin_state: "core", message_reactions: "core", chat_pins: "core",
  // Content
  assets: "content", asset_links: "content", asset_shares: "content",
  // Story
  worlds: "story", locations: "story", items: "story", world_items: "story",
  world_lore_entries: "story", actor_lore_entries: "story", actor_memories: "story",
  story_turns: "story", quests: "story", quest_progress: "story",
  world_states: "story", npc_states: "story", location_states: "story",
  // Generation
  generation_attempts: "generation", synthetic_data: "synthetic",
  // Character
  character_permanent_traits: "character", character_world_traits: "character",
  character_location_traits: "character", character_mood: "character",
  mood_events: "character", character_relationships: "character",
  character_avatars: "character", character_avatar_config: "character",
  world_avatar_config: "character", emotions: "character",
  character_emotions: "character", character_availability: "character",
  character_licensing: "character", admin_character_overrides: "character",
  character_intimacy: "character", character_arousal: "character",
  character_desire_profile: "character", character_seduction_skills: "character",
  nsfw_encounters: "character", character_body_profile: "character",
  character_heat_cycle: "character", character_fantasies: "character",
  location_nsfw_config: "character",
  // Crafting
  crafting_recipes: "crafting", crafting_recipe_materials: "crafting",
  crafting_station_defs: "crafting", crafting_station_instances: "crafting",
  professions: "crafting", profession_specializations: "crafting",
  recipe_discoveries: "crafting", gathering_node_defs: "crafting",
  gathering_node_materials: "crafting", gathering_node_instances: "crafting",
  crafting_attempts: "crafting", crafting_orders: "crafting",
  // Telemetry
  telemetry_events: "telemetry",
  // Blog
  blog_posts: "blog", blog_comments: "blog", blog_tags: "blog",
  blog_follows: "blog", blog_rag_sources: "blog",
  // Moderation
  model_comparisons: "moderation", nsfw_user_preferences: "moderation",
  content_flags: "moderation", moderation_actions: "moderation",
  moderation_appeals: "moderation",
  // GM
  shadow_notes: "gm", whitenotes: "gm",
  // Misc
  data_migrations: "core",
};

function getDomain(table: string): string {
  return DOMAIN_MAP[table] || "core";
}

function pascalCase(snake: string): string {
  return snake
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// ── TypeScript Type Mapping ─────────────────────────────────

function tsType(col: ColumnDef, tableName: string, colName: string): string {
  // Check override first
  const overrides = COLUMN_TYPE_OVERRIDES[tableName] || COLUMN_TYPE_OVERRIDES[pascalCase(tableName)] || {};
  const override = overrides[colName];

  let base: string;
  if (override) {
    base = override;
  } else {
    switch (col.type) {
      case "text": base = "string"; break;
      case "integer": base = "number"; break;
      case "real": base = "number"; break;
      default: base = "string";
    }
  }

  // Apply Generated wrapper for columns with defaults (auto-generated by DB)
  if (col.primaryKey || (col.hasDefault && col.notNull)) {
    return `Generated<${base}>`;
  }

  // Apply nullable
  if (!col.notNull) {
    return `${base} | null`;
  }

  return base;
}

// ── Generator: schema-*.ts ──────────────────────────────────

function generateDomainFiles(tables: Map<string, Record<string, ColumnDef>>): void {
  // Group tables by domain
  const domains = new Map<string, Map<string, Record<string, ColumnDef>>>();

  for (const [name, cols] of tables) {
    const domain = getDomain(name);
    if (!domains.has(domain)) domains.set(domain, new Map());
    domains.get(domain)!.set(name, cols);
  }

  for (const [domain, domainTables] of domains) {
    const lines: string[] = [];
    lines.push(`/**`);
    lines.push(` * DB Schema — ${domain.charAt(0).toUpperCase() + domain.slice(1)} Domain Tables`);
    lines.push(` *`);
    lines.push(` * Auto-generated by scripts/generate-db-types.ts`);
    lines.push(` * DO NOT EDIT MANUALLY — run \`bun run db:sync-types\` to regenerate.`);
    lines.push(` */`);
    lines.push(`import type { Generated, } from "kysely";`);

    // Collect enum imports
    const enumImports = new Set<string>();
    for (const [name, cols] of domainTables) {
      const tableName = pascalCase(name);
      for (const [colName, colDef] of Object.entries(cols)) {
        const overrides = COLUMN_TYPE_OVERRIDES[tableName] || COLUMN_TYPE_OVERRIDES[name] || {};
        if (overrides[colName]) {
          enumImports.add(overrides[colName]);
        }
      }
    }

    if (enumImports.size > 0) {
      const sorted = [...enumImports].sort();
      lines.push(`import type { ${sorted.join(", ")}, } from "./enums";`);
    }

    lines.push(``);

    for (const [name, cols] of domainTables) {
      const interfaceName = pascalCase(name);
      lines.push(`// ── ${name} ────────────────────────────────────────────`);
      lines.push(`export interface ${interfaceName} {`);

      for (const [colName, colDef] of Object.entries(cols)) {
        const type = tsType(colDef, name, colName);
        lines.push(`  ${colName}: ${type};`);
      }

      lines.push(`}`);
      lines.push(``);
    }

    const filePath = join(DB_DIR, `schema-${domain}.ts`);
    writeFileSync(filePath, lines.join("\n"), "utf-8");
    console.log(`  [schema] ${filePath}`);
  }
}

// ── Generator: schema.ts barrel ──────────────────────────────

function generateBarrel(tables: Map<string, Record<string, ColumnDef>>): void {
  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * DB Schema — Barrel`);
  lines.push(` *`);
  lines.push(` * Auto-generated by scripts/generate-db-types.ts`);
  lines.push(` * All table type interfaces + DB aggregate for Kysely.`);
  lines.push(` */`);

  // Collect unique domains
  const domains = new Set<string>();
  for (const [name] of tables) {
    domains.add(getDomain(name));
  }

  // Exports
  for (const domain of [...domains].sort()) {
    lines.push(`export * from "./schema-${domain}";`);
  }

  lines.push(``);
  lines.push(`// ── DB Aggregate ────────────────────────────────────────────────────`);
  lines.push(`export interface DB {`);

  for (const [name] of tables) {
    const domain = getDomain(name);
    const interfaceName = pascalCase(name);
    lines.push(`  ${name}: import("./schema-${domain}").${interfaceName};`);
  }

  lines.push(`}`);
  lines.push(``);

  writeFileSync(join(DB_DIR, "schema.ts"), lines.join("\n"), "utf-8");
  console.log(`  [barrel] ${join(DB_DIR, "schema.ts")}`);
}

// ── Generator: test insert helpers ───────────────────────────

function generateTestHelpers(tables: Map<string, Record<string, ColumnDef>>): void {
  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Test Insert Helpers — Auto-generated`);
  lines.push(` *`);
  lines.push(` * Typed functions for inserting test data. Required fields are params,`);
  lines.push(` * optional fields use defaults or accept undefined.`);
  lines.push(` *`);
  lines.push(` * Auto-generated by scripts/generate-db-types.ts`);
  lines.push(` * DO NOT EDIT MANUALLY — run \`bun run db:sync-types\` to regenerate.`);
  lines.push(` */`);
  lines.push(`import type { Kysely, } from "kysely";`);
  lines.push(`import type { DB, } from "../db/schema";`);
  lines.push(``);
  lines.push(`type Db = Kysely<DB>;`);
  lines.push(``);

  for (const [name, cols] of tables) {
    const interfaceName = pascalCase(name);
    const fnName = `insert${interfaceName}`;

    // Required fields (not null, no default)
    const required: [string, string][] = [];
    // Optional fields (null allowed or has default)
    const optional: [string, string][] = [];

    for (const [colName, colDef] of Object.entries(cols)) {
      const type = tsType(colDef, name, colName);
      if (colDef.notNull && !colDef.hasDefault && !colDef.primaryKey) {
        required.push([colName, type]);
      } else {
        optional.push([colName, type]);
      }
    }

    // Build function signature
    const params: string[] = [];
    for (const [colName, colType] of required) {
      params.push(`${colName}: ${colType}`);
    }
    if (optional.length > 0) {
      const optFields = optional.map(([n, t]) => `${n}?: ${t}`).join("; ");
      params.push(`opts?: { ${optFields} }`);
    }

    lines.push(`/** Insert a ${name} row. */`);
    lines.push(`export function ${fnName}(db: Db, ${params.join(", ")}): Promise<void> {`);
    lines.push(`  return db.insertInto("${name}",).values({`);

    // Always include id (UUID generated by app)
    if (cols.id) {
      lines.push(`    id: crypto.randomUUID(),`);
    }

    // Required fields
    for (const [colName] of required) {
      if (colName === "id") continue; // already handled
      lines.push(`    ${colName},`);
    }

    // Optional fields from opts
    if (optional.length > 0) {
      lines.push(`    ...opts,`);
    }

    lines.push(`  },).execute();`);
    lines.push(`}`);
    lines.push(``);
  }

  writeFileSync(join(TEST_UTILS_DIR, "insert-helpers.ts"), lines.join("\n"), "utf-8");
  console.log(`  [helpers] ${join(TEST_UTILS_DIR, "insert-helpers.ts")}`);
}

// ── Generator: validation schemas ────────────────────────────

function generateValidationSchemas(tables: Map<string, Record<string, ColumnDef>>): void {
  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * DB Validation Schemas — Auto-generated TypeBox schemas for DB tables.`);
  lines.push(` *`);
  lines.push(` * Generates insert/update schemas for each table based on column metadata.`);
  lines.push(` * Use these in route handlers for request validation.`);
  lines.push(` *`);
  lines.push(` * Auto-generated by scripts/generate-db-types.ts`);
  lines.push(` * DO NOT EDIT MANUALLY — run \`bun run db:sync-types\` to regenerate.`);
  lines.push(` */`);
  lines.push(`import { t, } from "elysia";`);
  lines.push(``);

  // Collect enum schemas to import
  const enumSchemas = new Set<string>();
  for (const [name, cols] of tables) {
    const tableName = pascalCase(name);
    for (const [colName] of Object.entries(cols)) {
      const overrides = COLUMN_TYPE_OVERRIDES[tableName] || COLUMN_TYPE_OVERRIDES[name] || {};
      if (overrides[colName]) {
        enumSchemas.add(overrides[colName]);
      }
    }
  }

  // Also import existing primitives from schemas.ts
  lines.push(`import { Id, Name, PaginationQuery, SuccessResponse, ErrorResponse, } from "./schemas";`);
  if (enumSchemas.size > 0) {
    const sorted = [...enumSchemas].sort();
    lines.push(`import { ${sorted.map((e) => `${e}Schema`).join(", ")}, } from "./enums";`);
  }
  lines.push(``);

  for (const [name, cols] of tables) {
    const schemaName = `${pascalCase(name)}Schema`;

    // Build insert schema (required fields only)
    const requiredFields: string[] = [];
    const optionalFields: string[] = [];

    for (const [colName, colDef] of Object.entries(cols)) {
      if (colName === "id") continue; // UUID auto-generated

      const tableName = pascalCase(name);
      const overrides = COLUMN_TYPE_OVERRIDES[tableName] || COLUMN_TYPE_OVERRIDES[name] || {};
      const enumType = overrides[colName];

      let typeBox: string;
      if (enumType) {
        typeBox = `${enumType}Schema`;
      } else {
        switch (colDef.type) {
          case "text": typeBox = "t.String()"; break;
          case "integer": typeBox = "t.Number()"; break;
          case "real": typeBox = "t.Number()"; break;
          default: typeBox = "t.String()";
        }
      }

      if (colDef.notNull && !colDef.hasDefault && !colDef.primaryKey) {
        requiredFields.push(`    ${colName}: ${typeBox},`);
      } else {
        optionalFields.push(`    ${colName}: t.Optional(${typeBox},),`);
      }
    }

    lines.push(`// ── ${name} ────────────────────────────────────────────`);
    lines.push(`export const ${schemaName} = t.Object({`);

    for (const f of requiredFields) lines.push(f);
    for (const f of optionalFields) lines.push(f);

    lines.push(`},);`);
    lines.push(``);
  }

  writeFileSync(join(VALIDATION_DIR, "db-schemas.ts"), lines.join("\n"), "utf-8");
  console.log(`  [validation] ${join(VALIDATION_DIR, "db-schemas.ts")}`);
}

// ── Main ─────────────────────────────────────────────────

function main() {
  console.log("Building schema from migrations...");
  const tables = buildSchema();
  console.log(`Found ${tables.size} tables\n`);

  console.log("Generating outputs:");
  generateDomainFiles(tables);
  generateBarrel(tables);
  generateTestHelpers(tables);
  generateValidationSchemas(tables);

  console.log(`\nDone. Run \`bun run check\` to verify.`);
}

main();
