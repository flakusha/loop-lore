// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for build-native.ts exit code propagation.
 *
 * B4: build:native must exit non-zero when cargo compilation fails.
 * Previously it swallowed the failure and exited 0.
 */
import { describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "build-native.ts",);

/** Create a fake cargo that fails on build but passes --version. Returns { dir, cleanup }. */
function makeFailingCargo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "b4-fail-",),);
  const shim = join(dir, "cargo",);
  writeFileSync(
    shim,
    '#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then echo "cargo 1.0.0"; exit 0; fi\necho "error: fake cargo failure" >&2\nexit 42\n',
  );
  chmodSync(shim, 0o755,);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
}

/** Create a fake cargo that succeeds. Returns { dir, cleanup }. */
function makePassingCargo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "b4-pass-",),);
  const shim = join(dir, "cargo",);
  writeFileSync(shim, "#!/usr/bin/env bash\nexit 0\n",);
  chmodSync(shim, 0o755,);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
}

describe("build-native exit code (B4)", () => {
  test("exits non-zero when cargo build fails", () => {
    const { dir, cleanup, } = makeFailingCargo();
    try {
      const result = spawnSync("bun", [SCRIPT,], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, },
        encoding: "utf8",
      },);
      expect(result.status,).not.toBe(0,);
    } finally {
      cleanup();
    }
  });

  test("does not exit 1 with cargo failure when cargo succeeds", () => {
    const { dir, cleanup, } = makePassingCargo();
    try {
      const result = spawnSync("bun", [SCRIPT,], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, },
        encoding: "utf8",
      },);
      // The fake cargo succeeds for all invocations, so the script must not
      // report a cargo failure. It may still exit non-zero for other reasons
      // (e.g., missing Cargo.toml in the worktree) — that is fine.
      const output = (result.stderr ?? "") + (result.stdout ?? "");
      expect(output,).not.toContain("cargo build failed",);
    } finally {
      cleanup();
    }
  });
});
