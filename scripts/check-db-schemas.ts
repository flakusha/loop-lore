#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * check-db-schemas.ts — Verify DB-generated schemas are up-to-date with migrations.
 *
 * Runs both generators (db-types + schema-manifest) into a temp directory and
 * diffs the output against the committed files. Exits non-zero (for the
 * pre-commit / `bun run check` gate) with a CATEGORIZED failure reason:
 *
 *   - TOOLING ERROR   — a generator crashed (bad regex, missing file, etc.)
 *   - MIGRATION LOGIC — generator ran but produced no/invalid output for a
 *                       committed artifact (e.g. table dropped from manifest)
 *   - STALE SCHEMA    — generator output differs from committed files; run
 *                       `bun run db:sync-types && bun run db:sync-manifest`
 *
 * Usage: bun run scripts/check-db-schemas.ts
 */
import { execFileSync, } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, resolve, } from "node:path";
import { fileURLToPath, } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const ROOT = resolve(__dirname, "..",);

/** Committed artifact → temp-dir file (relative to temp output dir). */
const ARTIFACTS: Array<{ committed: string; generated: string; label: string }> = [
  { committed: "src/db/schema-manifest.ts", generated: "schema-manifest.ts", label: "schema manifest", },
  { committed: "src/db/schema.ts", generated: "schema.ts", label: "schema barrel", },
  { committed: "src/db/schema-core.ts", generated: "schema-core.ts", label: "schema core", },
  { committed: "src/db/schema-character.ts", generated: "schema-character.ts", label: "schema character", },
  { committed: "src/db/schema-content.ts", generated: "schema-content.ts", label: "schema content", },
  { committed: "src/db/schema-crafting.ts", generated: "schema-crafting.ts", label: "schema crafting", },
  { committed: "src/db/schema-generation.ts", generated: "schema-generation.ts", label: "schema generation", },
  { committed: "src/db/schema-gm.ts", generated: "schema-gm.ts", label: "schema gm", },
  { committed: "src/db/schema-moderation.ts", generated: "schema-moderation.ts", label: "schema moderation", },
  { committed: "src/db/schema-story.ts", generated: "schema-story.ts", label: "schema story", },
  { committed: "src/db/schema-synthetic.ts", generated: "schema-synthetic.ts", label: "schema synthetic", },
  { committed: "src/db/schema-telemetry.ts", generated: "schema-telemetry.ts", label: "schema telemetry", },
  { committed: "src/db/schema-blog.ts", generated: "schema-blog.ts", label: "schema blog", },
  {
    committed: "src/test-utils/insert-helpers.ts",
    generated: "test-utils/insert-helpers.ts",
    label: "insert helpers",
  },
  { committed: "src/validation/db-schemas.ts", generated: "validation/db-schemas.ts", label: "db validation schemas", },
];

function runGenerator(script: string, outDir: string,): void {
  execFileSync("bun", ["run", script,], {
    cwd: ROOT,
    env: { ...process.env, DB_GEN_OUTPUT_DIR: outDir, },
    stdio: ["ignore", "ignore", "pipe",],
  },);
}

let stale = false;

// ── Run generators into temp dir ─────────────────────────────
const tmp = join(tmpdir(), `db-schema-check-${process.pid}`,);
rmSync(tmp, { recursive: true, force: true, },);
mkdirSync(tmp,);
mkdirSync(join(tmp, "test-utils",), { recursive: true, },);
mkdirSync(join(tmp, "validation",), { recursive: true, },);

try {
  runGenerator("scripts/generate-db-types.ts", tmp,);
} catch (err) {
  const detail = err instanceof Error ? err.message.split("\n",).slice(0, 5,).join("\n",) : String(err,);
  console.error("[TOOLING ERROR] generate-db-types.ts crashed:\n", detail,);
  process.exit(1,);
}
try {
  runGenerator("scripts/generate-schema-manifest.ts", tmp,);
} catch (err) {
  const detail = err instanceof Error ? err.message.split("\n",).slice(0, 5,).join("\n",) : String(err,);
  console.error("[TOOLING ERROR] generate-schema-manifest.ts crashed:\n", detail,);
  process.exit(1,);
}

// ── Normalize formatting ─────────────────────────────────────
// Committed artifacts are dprint-formatted (lineWidth 120). The generators emit
// raw single-line output and their internal fmt step can't reach files outside
// the repo (dprint config discovery is root-scoped), so the temp outputs are
// reformatted here with the repo config before diffing.
try {
  writeFileSync(join(tmp, "dprint.json",), readFileSync(join(ROOT, "dprint.json",), "utf8",),);
  const _fmt = execFileSync("bunx", ["dprint", "fmt", ...ARTIFACTS.map((a,) => a.generated),], {
    cwd: tmp,
    stdio: ["ignore", "ignore", "pipe",],
  },);
} catch (err) {
  const detail = err instanceof Error ? err.message.split("\n",).slice(0, 5,).join("\n",) : String(err,);
  console.error("[TOOLING ERROR] dprint fmt on generated output failed:\n", detail,);
  process.exit(1,);
}

// ── Diff generated vs committed ──────────────────────────────
for (const artifact of ARTIFACTS) {
  const generatedPath = join(tmp, artifact.generated,);
  const committedPath = join(ROOT, artifact.committed,);

  if (!existsSync(generatedPath,)) {
    console.error(`[MIGRATION LOGIC] generator produced NO output for ${artifact.label} (${artifact.generated},)`,);
    stale = true;
    continue;
  }

  const generated = readFileSync(generatedPath, "utf8",).trimEnd();
  if (!existsSync(committedPath,)) {
    console.error(`[MIGRATION LOGIC] ${artifact.label} missing from repo — run generators to create it`,);
    stale = true;
    continue;
  }

  const committed = readFileSync(committedPath, "utf8",).trimEnd();
  if (generated !== committed) {
    console.error(`✗ ${artifact.label} is STALE — migrations changed but schemas not regenerated`,);
    stale = true;
  } else {
    console.log(`✓ ${artifact.label} up-to-date`,);
  }
}

rmSync(tmp, { recursive: true, force: true, },);

if (stale) {
  console.error("\nRegenerate with: bun run db:sync-types && bun run db:sync-manifest",);
  console.error("Then re-run: bun test src/db/schema-sync.test.ts",);
  process.exit(1,);
}

console.log("\nAll DB schemas up-to-date.",);
