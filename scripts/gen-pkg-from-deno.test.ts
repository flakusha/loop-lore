// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for scripts/audit-runtime-compat.ts
 * Tests for scripts/gen-pkg-from-deno.ts
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { buildPkgScripts, transformCommand, transformSegment, } from "./gen-pkg-from-deno";

// ── gen-pkg-from-deno.ts — transformSegment ────────────────────

describe("gen-pkg-from-deno: transformSegment", () => {
  test("deno task <script> → bun run <script>", () => {
    expect(transformSegment("deno task build:frontend",),).toBe("bun run build:frontend",);
  });

  test("deno run <file> → bun run <file>", () => {
    expect(transformSegment("deno run src/server/index.ts",),).toBe("bun run src/server/index.ts",);
  });

  test("deno run -A npm:<pkg> → bunx <pkg>", () => {
    expect(transformSegment("deno run -A npm:vitepress dev docs",),).toBe("bunx vitepress dev docs",);
  });

  test("deno test → bun test", () => {
    expect(transformSegment("deno test --isolate",),).toBe("bun test --isolate",);
  });

  test("deno <other> → bun <other>", () => {
    expect(transformSegment("deno fmt",),).toBe("bun fmt",);
  });

  test("non-deno commands unchanged", () => {
    expect(transformSegment("cargo test",),).toBe("cargo test",);
  });

  test("empty string returns empty", () => {
    expect(transformSegment("",),).toBe("",);
  });
});

// ── gen-pkg-from-deno.ts — transformCommand ────────────────────

describe("gen-pkg-from-deno: transformCommand", () => {
  test("preserves && with spacing", () => {
    expect(transformCommand("deno task build:frontend && deno run src/server/index.ts",),).toBe(
      "bun run build:frontend && bun run src/server/index.ts",
    );
  });

  test("preserves || operator", () => {
    expect(transformCommand("deno task lint || echo failed",),).toBe(
      "bun run lint || echo failed",
    );
  });

  test("preserves | pipe", () => {
    expect(transformCommand("deno run -A npm:eslint . | head -20",),).toBe(
      "bunx eslint . | head -20",
    );
  });

  test("preserves ; separator", () => {
    expect(transformCommand("deno task build; deno task test",),).toBe(
      "bun run build; bun run test",
    );
  });

  test("bare command unchanged", () => {
    expect(transformCommand("cargo fmt",),).toBe("cargo fmt",);
  });
});

// ── gen-pkg-from-deno.ts — buildPkgScripts ─────────────────────

describe("gen-pkg-from-deno: buildPkgScripts", () => {
  test("transforms all tasks", () => {
    const deno = {
      tasks: {
        dev: "deno task build:frontend && deno run --watch src/server/index.ts",
        start: "deno run src/server/index.ts",
        test: "deno test",
        docs: "deno run -A npm:vitepress dev docs",
        "build:server": "bun build src/server/index.ts --outdir ./dist --target bun",
      },
    };
    const scripts = buildPkgScripts(deno,);
    expect(scripts.dev,).toBe("bun run build:frontend && bun run --watch src/server/index.ts",);
    expect(scripts.start,).toBe("bun run src/server/index.ts",);
    expect(scripts.test,).toBe("bun test",);
    expect(scripts.docs,).toBe("bunx vitepress dev docs",);
    expect(scripts["build:server"],).toBe("bun build src/server/index.ts --outdir ./dist --target bun",);
  });

  test("empty tasks yields empty object", () => {
    expect(buildPkgScripts({},),).toEqual({},);
  });

  test("no tasks field yields empty object", () => {
    expect(buildPkgScripts({ imports: {}, },),).toEqual({},);
  });
});

// ── Round-trip: gen-deno-config → gen-pkg-from-deno ────────────

describe("round-trip: bun → deno → bun", () => {
  test("bun run <script> round-trips through deno task", () => {
    // Forward: bun run build:frontend → deno task build:frontend
    // Reverse: deno task build:frontend → bun run build:frontend
    const original = "bun run build:frontend";
    const forward = "deno task build:frontend";
    expect(transformSegment(forward,),).toBe(original,);
  });

  test("bun run <file> round-trips through deno run", () => {
    const original = "bun run src/server/index.ts";
    const forward = "deno run src/server/index.ts";
    expect(transformSegment(forward,),).toBe(original,);
  });

  test("bunx <pkg> round-trips through deno run -A npm:", () => {
    const original = "bunx vitepress dev docs";
    const forward = "deno run -A npm:vitepress dev docs";
    expect(transformSegment(forward,),).toBe(original,);
  });

  test("bun test round-trips through deno test", () => {
    const original = "bun test --isolate";
    const forward = "deno test --isolate";
    expect(transformSegment(forward,),).toBe(original,);
  });
});

// ── CLI ────────────────────────────────────────────────────────

const SCRIPT = `${import.meta.dir}/gen-pkg-from-deno.ts`;

const DENO_JSON = JSON.stringify({
  tasks: { "build:frontend": "deno run -A npm:vitepress build", dev: "deno task start", },
},);
const PKG_JSON = JSON.stringify({ scripts: { start: "bun run src/server/index.ts", }, },);

/** Run the generator in `cwd`; it resolves deno.json/package.json from there. */
function run(cwd: string, ...args: string[]) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], { cwd, },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("gen-pkg-from-deno CLI", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gen-pkg-from-deno-",),);
    writeFileSync(join(dir, "deno.json",), DENO_JSON,);
    writeFileSync(join(dir, "package.json",), PKG_JSON,);
  },);

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("--dry-run prints the mapped scripts and writes nothing", () => {
    const result = run(dir, "--dry-run",);
    expect(result.exitCode,).toBe(0,);
    expect(JSON.parse(result.stdout,).dev,).toBe("bun run start",);
    expect(JSON.parse(readFileSync(join(dir, "package.json",), "utf8",),).scripts.dev,).toBeUndefined();
  });

  test("--check exits 1 when package.json scripts are stale", () => {
    const result = run(dir, "--check",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("package.json scripts stale",);
  });

  test("--check exits 0 once package.json matches deno.json", () => {
    const expected = JSON.parse(run(dir, "--dry-run",).stdout,) as Record<string, string>;
    writeFileSync(
      join(dir, "package.json",),
      JSON.stringify({ scripts: { start: "bun run src/server/index.ts", ...expected, }, },),
    );
    const result = run(dir, "--check",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("package.json scripts up to date",);
  });

  test("missing deno.json exits 1", () => {
    rmSync(join(dir, "deno.json",),);
    const result = run(dir, "--check",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("deno.json not found",);
  });

  test("unknown flag is rejected with exit 1", () => {
    const result = run(dir, "--no-such-flag",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("--no-such-flag",);
  });
});
