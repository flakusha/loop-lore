// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { appTmpRoot, } from "../../../src/test-utils/tmp-root";
import { SOURCE_ROOTS, TEST_ROOTS, } from "../source-paths.mjs";
import {
  COVERAGE_DIR,
  JSCPD_DIR,
  PER_RUN_REPORT_PATH,
  PROJECT_ROOT,
  REPORT_PATH,
} from "./config.mjs";
import { DIFF_ROOT, } from "./context.mjs";
import { checks, } from "./gate-table.mjs";

/**
 * Resource contract: the path assertions own NOTHING. The preload probe at
 * the end allocates one unique OS temp dir (never a fixed repo .tmp path)
 * and removes it in `finally`; it shares no global or port.
 *
 * They only read module-level constants derived from import.meta.dir and
 * assert on them. No shared state is allocated, so nothing can interleave.
 * Importing context.mjs is side-effect free without --diff-base:
 * changedFiles() returns [] for a null base and the gate flags are absent.
 *
 * Why this file exists: the split moved these modules from scripts/ down to
 * scripts/check/parallel/, two levels deeper. The relative hops were bumped by
 * one instead of two, so PROJECT_ROOT resolved to scripts/ and DIFF_ROOT did
 * too. PROJECT_ROOT broke the GPG pre-flight outright (it looked for
 * .credentials.env under scripts/), while DIFF_ROOT failed silently —
 * diff-scoped discovery resolved every repo-relative path against scripts/,
 * found nothing, and the scoped test gates reported success having run zero
 * tests. A wrong-but-resolvable path is invisible to an import-resolution
 * check, so it needs pinning here.
 */

const REPO_ROOT = path.resolve(import.meta.dir, "../../..",);

describe("PROJECT_ROOT", () => {
  test("is the repo root, not a scripts/ subdirectory", () => {
    expect(PROJECT_ROOT,).toBe(REPO_ROOT,);
  });

  test("the runner's cwd is the repo root", () => {
    expect(PROJECT_ROOT,).toBe(process.cwd(),);
  });

  test("holds the directories the runner resolves against", () => {
    expect(existsSync(path.join(PROJECT_ROOT, "package.json",),),).toBe(true,);
    expect(existsSync(path.join(PROJECT_ROOT, "scripts",),),).toBe(true,);
    expect(existsSync(path.join(PROJECT_ROOT, "src",),),).toBe(true,);
  });

  test("finds .credentials.env at the repo root, where giwt links it", () => {
    const creds = path.resolve(PROJECT_ROOT, ".credentials.env",);
    expect(creds,).toBe(path.join(REPO_ROOT, ".credentials.env",),);
  });

  // The file is gitignored, so it is absent on a fresh clone or CI that runs
  // the gate with CHECK_SKIP_GPG_PRECHECK=1. The path derivation above is the
  // invariant that must hold everywhere; assert presence only where it exists.
  test.skipIf(!existsSync(path.join(REPO_ROOT, ".credentials.env",),),)(
    "reads the linked .credentials.env when present",
    () => {
      expect(existsSync(path.resolve(PROJECT_ROOT, ".credentials.env",),),).toBe(true,);
    },
  );
});

describe("DIFF_ROOT", () => {
  test("is the repo root, matching PROJECT_ROOT", () => {
    expect(DIFF_ROOT,).toBe(PROJECT_ROOT,);
  });

  test("resolves a repo-relative src path to a real file", () => {
    // This is what scoped test discovery does. Under the old bug this
    // resolved to <repo>/scripts/src/... and matched nothing.
    expect(existsSync(path.resolve(DIFF_ROOT, "src",),),).toBe(true,);
    expect(existsSync(path.resolve(DIFF_ROOT, "scripts", "check-parallel.mjs",),),).toBe(true,);
  });
});

describe("paths derived from PROJECT_ROOT", () => {
  test("report, coverage and jscpd paths all land under the repo root", () => {
    for (const p of [REPORT_PATH, PER_RUN_REPORT_PATH, COVERAGE_DIR, JSCPD_DIR,]) {
      expect(p.startsWith(PROJECT_ROOT + path.sep,),).toBe(true,);
    }
  });
});

describe("typecheck gate script wiring", () => {
  const manifest: unknown = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json",), "utf8",),);
  const scripts = (manifest as { scripts: Record<string, string> }).scripts;

  test("every typecheck gate delegates to a package.json script", () => {
    const missing = Object.entries(checks,)
      .filter(([name,],) => name.startsWith("typecheck - ",))
      .map(([name, cmd,],) => [name, /^bun run ([^\s]+)$/.exec(cmd,)?.[1],] as const)
      .filter(([, script,],) => !script || !(script in scripts))
      .map(([name,],) => name);
    expect(missing,).toEqual([],);
  });
});

/**
 * Slice-2 gate coverage. Every registry entry must be consumed by a real
 * consumer; a new workspace under packages/ must either gain a direct
 * typecheck gate or fail here instead of silently skipping coverage.
 */
const readText = (rel: string,): string => readFileSync(path.join(REPO_ROOT, rel,), "utf8",);
const gateCommands = checks as Record<string, string>;
const workspaces = readdirSync(path.join(REPO_ROOT, "packages",), { withFileTypes: true, },)
  .filter((entry,) => entry.isDirectory())
  .map((entry,) => entry.name)
  .sort();
const rootScripts = (JSON.parse(readText("package.json",),) as { scripts: Record<string, string> }).scripts;

describe("workspace typecheck gates", () => {
  test("every workspace has a direct gate and resolving aliases", () => {
    expect(workspaces.length,).toBeGreaterThan(0,);
    for (const ws of workspaces) {
      const script = `typecheck:${ws}`;
      expect(rootScripts[script],).toBeDefined();
      expect(rootScripts[script],).toContain(`packages/${ws}/tsconfig.json`,);
      expect(gateCommands[`typecheck - ${ws}`],).toBe(`bun run ${script}`,);
      expect(existsSync(path.join(REPO_ROOT, "packages", ws, "tsconfig.json",),),).toBe(true,);
      expect(existsSync(path.join(REPO_ROOT, "packages", ws, "src/index.ts",),),).toBe(true,);
      for (const cfg of ["tsconfig.backend.json", "tsconfig.frontend.json",]) {
        const paths = (JSON.parse(readText(cfg,),) as {
          compilerOptions: { paths: Record<string, string[]> };
        }).compilerOptions.paths;
        expect(paths[`@loop-lore/${ws}`],).toEqual([`./packages/${ws}/src/index.ts`,],);
        expect(paths[`@loop-lore/${ws}/*`],).toEqual([`./packages/${ws}/src/*`,],);
      }
    }
  });
});

describe("test root consumption", () => {
  const gatesSource = readText("scripts/check/parallel/gates.mjs",);

  test("every TEST_ROOTS entry is named in the gate builder and exists", () => {
    for (const [key, root,] of Object.entries(TEST_ROOTS,)) {
      expect(gatesSource,).toContain(`TEST_ROOTS.${key}`,);
      expect(existsSync(path.join(REPO_ROOT, root,),),).toBe(true,);
    }
  });

  test("unit and coverage gates walk both src and packages", () => {
    expect(gatesSource,).toContain("walkTestFiles(PROJECT_ROOT, TEST_ROOTS.src,)",);
    expect(gatesSource,).toContain("walkTestFiles(PROJECT_ROOT, TEST_ROOTS.packages,)",);
  });
});

describe("source root consumption", () => {
  const knip = readText("knip.json",);
  const jscpd = readText("scripts/check/jscpd-scan.mjs",);
  const dprint = JSON.parse(readText("dprint.json",),) as { excludes: string[] };
  const eslint = readText("eslint.config.mjs",);

  test("every SOURCE_ROOTS entry reaches scanners and is not lint/format excluded", () => {
    expect(jscpd,).toContain("SOURCE_ROOTS",);
    for (const root of SOURCE_ROOTS) {
      expect(knip,).toContain(`"${root}**`,);
      expect(dprint.excludes,).not.toContain(root,);
      expect(dprint.excludes,).not.toContain(`${root.replace(/\/$/, "",)}/**`,);
      expect(eslint,).not.toContain(`"${root}"`,);
    }
  });
});

describe("bunfig preload inheritance", () => {
  test("no workspace overrides the root preload", () => {
    for (const ws of workspaces) {
      expect(existsSync(path.join(REPO_ROOT, "packages", ws, "bunfig.toml",),),).toBe(false,);
    }
  });

  test("root preload sets a per-process DB path", () => {
    expect(readText("bunfig.toml",),).toContain('preload = ["./tests/setup-globals.ts"]',);
    const preload = readText("tests/setup-globals.ts",);
    expect(preload,).toContain("LOOP_LORE_DB_PATH",);
    expect(preload,).toContain("appTmpRoot",);
    expect(preload,).toContain("mkdtempSync",);
  });

  test("a test run from the repo root inherits the preload", () => {
    // Isolation from the tree is deliberate: a fixed repo .tmp path would be
    // shared across parallel workers and could collide with other lanes.
    const dir = mkdtempSync(path.join(tmpdir(), "loop-lore-roots-preload-",),);
    try {
      const file = path.join(dir, "preload.test.ts",);
      writeFileSync(
        file,
        [
          'import { expect, test } from "bun:test";',
          'test("preload inherited", () => {',
          '  const db = process.env.LOOP_LORE_DB_PATH ?? "";',
          `  expect(db.startsWith(${
            JSON.stringify(path.join(process.env.LOOP_LORE_TMP_ROOT?.trim() || tmpdir(), "loop-lore", "test", "db-",),)
          })).toBe(true);`,
          '  expect(db.endsWith("loop-lore-test.db",),).toBe(true,);',
          "});",
          "",
        ].join("\n",),
      );
      const env = { ...process.env, };
      delete env.LOOP_LORE_DB_PATH;
      const result = Bun.spawnSync({
        cmd: [process.execPath, "test", file,],
        cwd: REPO_ROOT,
        env,
        stdout: "pipe",
        stderr: "pipe",
      },);
      expect(result.exitCode,).toBe(0,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });
});

describe("app-owned temp root", () => {
  test("creates an isolated subsystem directory under the configured base", () => {
    const base = process.env.LOOP_LORE_TMP_ROOT?.trim() || tmpdir();
    const root = appTmpRoot(`roots-${process.pid}`,);
    try {
      expect(existsSync(root,),).toBe(true,);
      expect(root.startsWith(path.join(base, "loop-lore", "roots-",),),).toBe(true,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });
});
