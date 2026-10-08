// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 311

/**
 * generate-schema-fuzz.ts — emits src/validation/schema-fuzz.generated.test.ts.
 *
 * Scans TypeBox schema modules ON DISK across multiple source roots (configured
 * in SCAN_ROOTS below), keeps every TypeBox schema those modules export, and
 * writes one `describe` block per schema:
 *
 *   - "accepts generated values"   → schemaToArbitrary only emits valid values
 *   - "survives a JSON round-trip" → only for isJsonRoundTrippable schemas
 *
 * Discovery does NOT go through index.ts barrels. Barrel-based discovery silently
 * skipped schemas; reading the directory makes a new schema module impossible
 * to leave unwired and unfuzzed.
 *
 * Export names collide across modules (`ActionSchema`, `AdminAuditRow`, …), so
 * each module keeps its own namespace in the generated file and each `test()`
 * references `alias.Name` — a duplicate name always exercises the module it was
 * discovered in, never the first one alphabetically.
 *
 * Every property runs with a FIXED seed, so a regenerated file produces the
 * same values on every machine and CI never flakes on a lucky draw.
 *
 * Usage:
 *   bun run scripts/generate-schema-fuzz.ts            # write the file
 *   bun run scripts/generate-schema-fuzz.ts --check    # exit 1 if stale
 */

import {
  isJsonRoundTrippable,
  isTypeBoxSchema,
} from "../src/test-utils/schema-arbitrary.ts";

/** Scan roots: each entry is a directory to scan for schema modules.
 *
 *   - directory: on-disk path handed to the glob. The glob is RECURSIVE
 *     (`**\/*.ts`), so this must be the NARROWEST directory that still holds
 *     every in-scope module. Pointing the validation root at `src/validation/`
 *     instead of `src/validation/schemas/` drags in `db-schemas.ts` (333
 *     schemas) that was never in scope.
 *   - importPrefix: `@/` prefix for generated import lines. Must mirror
 *     `directory` exactly, or the emitted import does not resolve.
 *   - moduleIdPrefix: prepended to the glob-relative path to form moduleId,
 *     which is both the alias source and the duplicate-disambiguation tag —
 *     must be unique across ALL roots.
 *
 * Example for "src/routes/blog/comments.ts" under the `routes/` root:
 *   - glob returns: "blog/comments.ts" (relative to src/routes/)
 *   - importPath = "@/routes/blog/comments"
 *   - moduleId = "routes/blog/comments"
 */
const SCAN_ROOTS = [
  {
    moduleIdPrefix: "validation/",
    importPrefix: "@/validation/schemas",
    directory: new URL("../src/validation/schemas/", import.meta.url,),
  },
  {
    moduleIdPrefix: "routes/",
    importPrefix: "@/routes",
    directory: new URL("../src/routes/", import.meta.url,),
  },
] as const;

const OUT_PATH = new URL("../src/validation/schema-fuzz.generated.test.ts", import.meta.url,);

/** Fixed run count + seed — a regenerated file must replay identical values. */
const FC_RUNS = { numRuns: 100, seed: 20260101, };

/** One discovered schema, pinned to the module that actually exports it. */
interface Found {
  /** Export name, as spelled in its module. */
  name: string;
  /** Full moduleId (prefix + filename) — unique across all roots; used for alias. */
  module: string;
  /** True when the same export name is also found in another module. */
  duplicate: boolean;
  /** The schema value, so render needs no second pass over the modules. */
  schema: Parameters<typeof isJsonRoundTrippable>[0];
}

/**
 * Normalize rendered text through the repo's dprint config, so the emitted file
 * is already `format - dprint` clean and `--check` stays byte-stable.
 *
 * `src/validation/*.generated.test.ts` is NOT excluded by dprint.json, so the
 * generated artifact must be formatted like any other source file. Formatting
 * the RENDERED TEXT (not the written file) keeps --check honest: write and
 * compare paths see identical normalized bytes.
 */
function format(source: string,): string {
  const proc = Bun.spawnSync({
    cmd: [
      "bunx",
      "dprint",
      "fmt",
      "--config",
      new URL("../dprint.json", import.meta.url,).pathname,
      "--stdin",
      OUT_PATH.pathname,
    ],
    cwd: new URL("..", import.meta.url,).pathname,
    stdin: Buffer.from(source,),
    stdout: "pipe",
    stderr: "pipe",
  },);
  if (proc.exitCode !== 0) {
    throw new Error(
      `dprint fmt failed (exit ${proc.exitCode}): ${proc.stderr.toString().trim() || "no stderr"}`,
    );
  }
  return proc.stdout.toString();
}

/**
 * `asset-tags` → `assetTags`, a valid JS identifier.
 *
 * NOT injective on its own — `responses-admin` and `responsesAdmin` would both
 * yield `responsesAdmin`. `discoverSchemas` rejects that before render, so a
 * future module can never cross-wire another module's schemas.
 */
function aliasFor(module: string,): string {
  // Strip ALL path separators so "routes/api-keys" → "routesApiKeys"
  const noSlash = module.replace(/\//gu, "_",);
  const camel = noSlash.replace(/-([a-z])/gu, (_, c: string,) => c.toUpperCase(),);
  return /^[A-Za-z_$]/u.test(camel,) ? camel : `_${camel}`;
}

/** All schema module entries across every scan root. */
async function schemaModules(): Promise<
  Array<{
    file: string;
    moduleId: string;
    importPath: string;
    directory: URL;
  }>
> {
  const entries: Array<{
    file: string;
    moduleId: string;
    importPath: string;
    directory: URL;
  }> = [];
  for (const root of SCAN_ROOTS) {
    const files = await Array.fromAsync(
      new Bun.Glob("**/*.ts",).scan({ cwd: root.directory.pathname, },),
    );
    for (const file of files) {
      if (file.endsWith(".test.ts",) || file === "index.ts" || file.endsWith("/index.ts",)) {
        continue;
      }
      // e.g. "blog/comments.ts" → "routes/blog/comments"
      const moduleId = `${root.moduleIdPrefix}${file.slice(0, -3,)}`;
      // e.g. "blog/comments.ts" → "@/routes/blog/comments"
      const importPath = `${root.importPrefix}/${file.slice(0, -3,)}`;
      entries.push({ file, moduleId, importPath, directory: root.directory, },);
    }
  }
  return entries.sort((a, b,) => a.moduleId.localeCompare(b.moduleId,));
}

/** Every schema exported by every module on disk, sorted for stable output. */
async function discoverSchemas(): Promise<{
  found: Found[];
  moduleImportPaths: Map<string, string>;
  modules: string[];
  nonSchema: number;
  throwing: number;
}> {
  const entries = await schemaModules();
  const aliases = new Map<string, string>();
  const found: Found[] = [];
  const moduleImportPaths = new Map<string, string>();
  let nonSchema = 0;
  let throwing = 0;

  for (const { file, moduleId, importPath, directory, } of entries) {
    const alias = aliasFor(moduleId,);
    const clash = aliases.get(alias,);
    if (clash !== undefined) {
      throw new Error(`alias collision: ${moduleId} and ${clash} both map to "${alias}"`,);
    }
    aliases.set(alias, moduleId,);
    moduleImportPaths.set(moduleId, importPath,);
    // Dynamic import is required: the module list comes from a directory read
    // at runtime, so no static import list can cover it.
    // eslint-disable-next-line no-await-in-loop
    const namespace: Record<string, unknown> = await import(
      new URL(file, directory,).href
    );
    for (const name of Object.keys(namespace,).sort()) {
      let value: unknown;
      try {
        // A module may re-export a live binding whose getter throws on access.
        value = namespace[name];
      } catch {
        throwing++;
        continue;
      }
      if (isTypeBoxSchema(value,)) {
        found.push({ name, module: moduleId, duplicate: false, schema: value, },);
      } else {
        nonSchema++;
      }
    }
  }

  const occurrences = new Map<string, number>();
  for (const f of found) { occurrences.set(f.name, (occurrences.get(f.name,) ?? 0) + 1,); }
  for (const f of found) { f.duplicate = (occurrences.get(f.name,) ?? 0) > 1; }
  found.sort((a, b,) => a.name.localeCompare(b.name,) || a.module.localeCompare(b.module,));

  const modules = entries.map((e,) => e.moduleId);
  return { found, moduleImportPaths, modules, nonSchema, throwing, };
}

/** Describe title — module-qualified only when the name alone is ambiguous. */
function titleFor(f: Found,): string {
  return f.duplicate ? `${f.name} [${f.module}]` : f.name;
}

/** One schema's two (or one) cases, as source lines.
 *
 * The blank line between the cases is NOT cosmetic: eslint's
 * `padding-line-between-statements` demands one after any multi-line
 * expression statement, and dprint wraps a `test(...)` call across lines once
 * a module-qualified alias pushes it past the line width. Whether a given case
 * wraps is not knowable before formatting, so the separator is unconditional —
 * `format()` preserves it either way.
 */
function casesFor(f: Found,): string[] {
  const ref = `${aliasFor(f.module,)}.${f.name}`;
  const cases = [`  test("accepts generated values", () => checkAllValid(${ref}));`,];
  if (isJsonRoundTrippable(f.schema,)) {
    cases.push("", `  test("survives a JSON round-trip", () => checkJsonRoundTrip(${ref}));`,);
  }
  return cases;
}

/** Static preamble emitted verbatim, before the per-module schema imports. */
const PREAMBLE = `// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// AUTO-GENERATED by scripts/generate-schema-fuzz.ts — DO NOT EDIT MANUALLY.
// Regenerate: bun run scripts/generate-schema-fuzz.ts

/**
 * Schema fuzz (property) tests for the validation schema modules.
 *
 * Each \`describe\` block is one TypeBox schema exported by a module under
 * \`@/validation\` or \`@/routes\`. Schemas are discovered from the directory,
 * not the barrel, so modules index.ts does not re-export are covered too. Every
 * schema is referenced through its own module namespace (\`alias.Name\`), so a
 * name exported by several modules resolves to the right definition.
 *
 * Arbitraries come from \`@/test-utils/schema-arbitrary\`, which only emits
 * schema-valid values — a failure here means the mapper drifted from the schema.
 */

import type { TSchema, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { describe, expect, test, } from "bun:test";
import fc from "fast-check";

import { schemaToArbitrary, } from "@/test-utils/schema-arbitrary";
`;

/** Static body emitted after the imports: run config plus both check helpers. */
const BODY = `
/** Fixed run count + seed — a regenerated file must replay identical values. */
const FC_RUNS = { numRuns: ${FC_RUNS.numRuns}, seed: ${FC_RUNS.seed}, };

/** Every generated value must satisfy its own schema. */
function checkAllValid(schema: TSchema): void {
  fc.assert(
    fc.property(schemaToArbitrary(schema), (v) => Value.Check(schema, v) === true),
    FC_RUNS,
  );
}

/** JSON.stringify must be lossless — no dropped keys, no coerced values. */
function checkJsonRoundTrip(schema: TSchema): void {
  fc.assert(
    fc.property(schemaToArbitrary(schema), (v) => {
      const round: unknown = JSON.parse(JSON.stringify(v));
      expect(round).toEqual(v);
    }),
    FC_RUNS,
  );
}
`;

/** Render the whole test file. Pure — same modules on disk in, same bytes out. */
function render(
  found: Found[],
  moduleImportPaths: Map<string, string>,
  moduleCount: number,
): string {
  const used = [...new Set(found.map((f,) => f.module),),].sort();
  const lines = [PREAMBLE,];
  for (const module of used) {
    const importPath = moduleImportPaths.get(module,) ?? "@/validation/schemas";
    lines.push(`import * as ${aliasFor(module,)} from "${importPath}";`,);
  }
  lines.push(BODY,);
  for (const f of found) {
    lines.push(`describe("${titleFor(f,)}", () => {`, ...casesFor(f,), "});", "",);
  }
  lines.push(`// ${found.length} schemas discovered across ${moduleCount} module(s).`,);
  return format(`${lines.join("\n",)}\n`,);
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.main) {
  const { found, moduleImportPaths, modules, nonSchema, throwing, } = await discoverSchemas();
  const content = render(found, moduleImportPaths, modules.length,);
  const outPath = OUT_PATH.pathname;

  if (process.argv.includes("--check",)) {
    const existing = await Bun.file(OUT_PATH,).text().catch(() => "");
    if (existing !== content) {
      console.error(`[schema-fuzz] ${outPath} is stale — regenerate it`,);
      process.exit(1,);
    }
    console.log(`[schema-fuzz] check ok — ${found.length} schemas, up to date (${outPath})`,);
  } else {
    await Bun.write(OUT_PATH, content,);
    console.log(`[schema-fuzz] wrote ${outPath} — ${found.length} schemas`,);
  }

  const skipped = throwing > 0
    ? `${nonSchema} non-schema, ${throwing} throwing on access`
    : `${nonSchema} non-schema`;
  console.log(`[schema-fuzz] scanned ${modules.length} module(s); skipped ${skipped}`,);

  // ponytail: importing the schema modules (and, via their transitive imports,
  // 416 route modules) leaves open handles on the event loop, so the process
  // never exits on its own (observed: hung until killed at the gate's 900s
  // timeout, with the work already done). `discoverSchemas()` itself takes ~1s;
  // the hang is entirely the wait to exit. Explicit exit after the write and
  // the final log, rather than bisecting the offending module; revisit only if
  // the generator ever has to run twice in one process.
  process.exit(0,);
}
