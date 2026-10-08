// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * generate-schema-fuzz.smoke.test.ts
 *
 * BUG-fuzz-generator-import-guard regression coverage.
 *
 * `discoverSchemas()` in scripts/generate-schema-fuzz.ts dynamically imports
 * every module it finds under its two scan roots. A route module that reads
 * config at module scope (missing env, unparseable config) THROWS at import
 * time. Before bf5c45caa that `await import()` had no try/catch, so a single
 * such module took down the whole generator — and the generator IS the BLOCKING
 * `fuzz - generated tests` gate, so the break lands on whoever adds the next
 * route file.
 *
 * This drives the REAL script against a fixture tree and asserts the three
 * observable behaviours the guard buys:
 *
 *   1. the run does not crash (exit 0, no uncaught throw on stderr),
 *   2. the failure is COUNTED AND SURFACED ("1 failed to import") rather than
 *      silently swallowed, and
 *   3. the modules that DID import still produce their normal generated file.
 *
 * It asserts behaviour, not source text: removing the try/catch makes this
 * suite fail with a non-zero exit, which is the only thing worth guarding.
 *
 * Fixture strategy — SCAN_ROOTS and OUT_PATH are `new URL(..., import.meta.url)`
 * constants, so the roots cannot be pointed elsewhere by flag or env. Copying
 * the script into a fixture tree is what redirects them; the copy is verbatim,
 * so it is the production source under test, not a re-implementation. The
 * fixture lives in the OS tmpdir (mkdtemp, same convention as
 * check-db-schemas.smoke.test.ts) so no generated artifact is ever left in the
 * repo for `bun test` to discover.
 */

import { describe, expect, test, } from "bun:test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, resolve, } from "node:path";
import { fileURLToPath, } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const REPO_ROOT = resolve(__dirname, "..",);
const SCRIPT_PATH = resolve(__dirname, "generate-schema-fuzz.ts",);

/** Paths a test needs inside its own fixture tree. */
interface Fixture {
  /** The copy of the generator whose import.meta.url points into the fixture. */
  script: string;
  /** Where OUT_PATH resolves for that copy. */
  generated: string;
}

/**
 * Build a fresh fixture tree and run `body` against it, then tear the tree
 * down in a `finally` so a failing assertion cannot leak it.
 *
 * Resource contract: EVERY test owns its own mkdtemp directory and its own
 * generator process, so the three run correctly in any order, in isolation, and
 * under the repo's parallel runner (`bun test --parallel`). No shared fixture,
 * no fixed path, no ordering dependency between them — the `--check` test
 * performs its own write first rather than relying on a sibling's side effect.
 */
async function withFixture<T,>(body: (fx: Fixture,) => Promise<T>,): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "schema-fuzz-import-guard-",),);
  try {
    const scriptsDir = join(dir, "scripts",);
    const schemasDir = join(dir, "src", "validation", "schemas",);
    const routesDir = join(dir, "src", "routes",);
    mkdirSync(scriptsDir, { recursive: true, },);
    mkdirSync(schemasDir, { recursive: true, },);
    mkdirSync(routesDir, { recursive: true, },);

    // The script under test, verbatim — its import.meta.url now resolves
    // SCAN_ROOTS / OUT_PATH / dprint.json into the fixture.
    cpSync(SCRIPT_PATH, join(scriptsDir, "generate-schema-fuzz.ts",),);
    cpSync(resolve(REPO_ROOT, "dprint.json",), join(dir, "dprint.json",),);
    // The script statically imports schema-arbitrary, which reaches
    // ../utils/date. Symlink both so the real helpers stay the real helpers.
    symlinkSync(join(REPO_ROOT, "src", "test-utils",), join(dir, "src", "test-utils",),);
    symlinkSync(join(REPO_ROOT, "src", "utils",), join(dir, "src", "utils",),);

    // Two modules that import cleanly — their schemas must survive into the
    // generated file. One per scan root, so both roots are exercised.
    writeFileSync(
      join(schemasDir, "good.ts",),
      `import { Type, } from "@sinclair/typebox";\n\nexport const ProbeSchema = Type.String({ minLength: 1, });\n`,
    );
    writeFileSync(
      join(routesDir, "good.ts",),
      `import { Type, } from "@sinclair/typebox";\n\nexport const ProbeRouteSchema = Type.Number();\n`,
    );
    // The regression trigger: a top-level throw, i.e. config read at module
    // scope with the env absent.
    writeFileSync(
      join(routesDir, "bad.ts",),
      `throw new Error("route module throws at import time");\n\nexport const NeverExported = 1;\n`,
    );

    return await body({
      script: join(scriptsDir, "generate-schema-fuzz.ts",),
      generated: join(dir, "src", "validation", "schema-fuzz.generated.test.ts",),
    },);
  } finally {
    rmSync(dir, { recursive: true, force: true, },);
  }
}

/** Spawn the fixture's generator and capture its full result. */
async function runScript(script: string, args: string[] = [],): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", script, ...args,],
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  },);
  const [stdout, stderr,] = await Promise.all([
    new Response(proc.stdout,).text(),
    new Response(proc.stderr,).text(),
  ],);
  return { exitCode: await proc.exited, stdout, stderr, };
}

describe("generate-schema-fuzz import guard", () => {
  test("a module that throws at import time is counted and skipped, not fatal", async () => {
    const { exitCode, stdout, stderr, } = await withFixture(async ({ script, },) => await runScript(script,));

    // Without the guard the generator dies here with an uncaught throw.
    expect(stderr,).not.toContain("route module throws at import time",);
    expect(exitCode,).toBe(0,);

    // Counted AND surfaced. A silent `catch {}` that swallows the failure
    // would pass the exit-code check above while hiding a broken module.
    expect(stdout,).toContain("1 failed to import",);

    // The modules that did import still contribute their schemas, so skipping
    // one bad module does not silently drop the rest of the scan.
    expect(stdout,).toContain("scanned 3 module(s)",);
    expect(stdout,).toContain("2 schemas",);
  });

  test("the generated file is produced and excludes the module that threw", async () => {
    const generated = await withFixture(async ({ script, generated: path, },) => {
      const run = await runScript(script,);
      expect(run.exitCode,).toBe(0,);
      return readFileSync(path, "utf8",);
    },);

    expect(generated,).toContain('describe("ProbeSchema"',);
    expect(generated,).toContain('describe("ProbeRouteSchema"',);
    expect(generated,).toContain("2 schemas discovered across 3 module(s)",);
    expect(generated,).not.toContain("NeverExported",);
    expect(generated,).not.toContain("routesBad",);
  });

  test("--check passes on the fixture: the BLOCKING gate command stays green", async () => {
    await withFixture(async ({ script, },) => {
      // Own the write too: `--check` compares against the file on disk, so
      // leaning on a sibling test's side effect would make this one order-
      // dependent. Without the import guard the second spawn exits non-zero on
      // the uncaught throw instead.
      const write = await runScript(script,);
      expect(write.exitCode,).toBe(0,);

      const { exitCode, stderr, } = await runScript(script, ["--check",],);
      expect(stderr,).not.toContain("route module throws at import time",);
      expect(exitCode,).toBe(0,);
    },);
  });
});
