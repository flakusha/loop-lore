// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for credentials.mjs fallback chain:
 *   1. `.credentials.env` (parent walk from script's __dirname).
 *   2. git config (`user.signingkey`, `user.name`, `user.email`).
 *   3. Hard fail (not tested here — see smoke-test).
 *
 * Strategy: the loader resolves repoRoot from its own `__dirname`. We
 * mirror that layout under a temp dir, copy credentials.mjs into the
 * mirror, then probe by running `bun -e` with that mirror's nested
 * location as cwd. The probe imports the local copy so __dirname is
 * the temp dir's path and the parent walk / git-config lookup see the
 * fixtures we set up.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, resolve, } from "node:path";

interface ProbeResult {
  credentials: {
    keyId: string;
    name: string;
    email: string;
    found: boolean;
    source: string;
    path?: string;
  };
  stderr: string;
}

const LOADER_SRC = resolve(import.meta.dir, "credentials.mjs",);

async function probe(loaderPath: string, cwd: string,): Promise<ProbeResult> {
  const PROBE = `
    import { credentials } from ${JSON.stringify(loaderPath)};
    process.stdout.write(JSON.stringify({ keyId: credentials.keyId, name: credentials.name, email: credentials.email, found: credentials.found, source: credentials.source, path: credentials.path, }),);
  `;
  const proc = Bun.spawnSync(
    ["bun", "-e", PROBE,],
    { cwd, env: { ...process.env, }, stdout: "pipe", stderr: "pipe", },
  );
  if (proc.exitCode !== 0) {
    throw new Error(`probe failed (exit ${proc.exitCode}): ${proc.stderr.toString()}`,);
  }
  return {
    credentials: JSON.parse(proc.stdout.toString(),),
    stderr: proc.stderr.toString(),
  };
}

function writeCredentialsEnv(dir: string, content: string,): string {
  const path = join(dir, ".credentials.env",);
  writeFileSync(path, content,);
  return path;
}

function initGitRepo(dir: string, signingKey: string, name: string, email: string,): void {
  Bun.spawnSync(["git", "init", "--quiet",], { cwd: dir, },);
  Bun.spawnSync(["git", "config", "user.signingkey", signingKey,], { cwd: dir, },);
  Bun.spawnSync(["git", "config", "user.name", name,], { cwd: dir, },);
  Bun.spawnSync(["git", "config", "user.email", email,], { cwd: dir, },);
}

/** Mirror the main repo's `scripts/worktree/utils/` layout under `workdir`
 *  and copy `credentials.mjs` into it. Returns the nested cwd the probe
 *  should run from (mimics `scripts/worktree/utils/credentials.mjs`).
 */
function installLoader(workdir: string,): { loaderPath: string; nestedCwd: string } {
  const nestedDir = join(workdir, "scripts", "worktree", "utils",);
  mkdirSync(nestedDir, { recursive: true, });
  const loaderPath = join(nestedDir, "credentials.mjs",);
  copyFileSync(LOADER_SRC, loaderPath,);
  return { loaderPath, nestedCwd: nestedDir };
}

describe("credentials.mjs fallback chain", () => {
  let workdir: string;
  let loaderPath: string;
  let nestedCwd: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "ll-cred-",),);
    ;({ loaderPath, nestedCwd, } = installLoader(workdir,),);
  },);

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true, },);
  },);

  it("uses .credentials.env walked up from __dirname (source=env)", async () => {
    const credContent = [
      `AGENT_GPG_KEY_ID="DEADBEEFCAFEBABE112233445566778899AABBCC"`,
      `AGENT_GPG_NAME="Test Agent"`,
      `AGENT_GPG_EMAIL="agent@test.local"`,
      ``,
    ].join("\n",);
    writeCredentialsEnv(workdir, credContent,);
    initGitRepo(workdir, "OTHERKEY", "Other", "other@test.local",); // git-config fallback should NOT fire

    const result = await probe(loaderPath, nestedCwd,);
    expect(result.credentials.found,).toBe(true,);
    expect(result.credentials.source,).toBe("env",);
    expect(result.credentials.keyId,).toBe("DEADBEEFCAFEBABE112233445566778899AABBCC",);
    expect(result.credentials.name,).toBe("Test Agent",);
    expect(result.credentials.email,).toBe("agent@test.local",);
    expect(result.credentials.path,).toBe(join(workdir, ".credentials.env",),);
  },);

  it("falls back to git config when .credentials.env is missing (source=git-config)", async () => {
    // No .credentials.env at all.
    initGitRepo(workdir, "GITCONFIGKEY", "Git Config", "git@test.local",);

    const result = await probe(loaderPath, nestedCwd,);
    expect(result.credentials.found,).toBe(true,);
    expect(result.credentials.source,).toBe("git-config",);
    expect(result.credentials.keyId,).toBe("GITCONFIGKEY",);
    expect(result.credentials.name,).toBe("Git Config",);
    expect(result.credentials.email,).toBe("git@test.local",);
    expect(result.credentials.path,).toBe(join(workdir, ".git", "config",),);
  },);

  it("prefers .credentials.env when both are present", async () => {
    writeCredentialsEnv(
      workdir,
      [
        `AGENT_GPG_KEY_ID="ENVKEY"`,
        `AGENT_GPG_NAME="Env Name"`,
        `AGENT_GPG_EMAIL="env@test.local"`,
        ``,
      ].join("\n",),
    );
    initGitRepo(workdir, "GITKEY", "Git Name", "git@test.local",);

    const result = await probe(loaderPath, nestedCwd,);
    expect(result.credentials.source,).toBe("env",);
    expect(result.credentials.keyId,).toBe("ENVKEY",);
    expect(result.credentials.name,).toBe("Env Name",);
    expect(result.credentials.email,).toBe("env@test.local",);
  },);

  it("treats incomplete .credentials.env (one missing var) as not found, falls back to git config", async () => {
    writeCredentialsEnv(
      workdir,
      [
        `AGENT_GPG_KEY_ID="ENVKEY"`,
        `AGENT_GPG_NAME="Env Name"`,
        // AGENT_GPG_EMAIL missing on purpose
        ``,
      ].join("\n",),
    );
    initGitRepo(workdir, "GITKEY", "Git Name", "git@test.local",);

    const result = await probe(loaderPath, nestedCwd,);
    expect(result.credentials.source,).toBe("git-config",);
    expect(result.credentials.email,).toBe("git@test.local",);
  },);

  it("fails closed (found=false) when neither source is available", async () => {
    // No .credentials.env, no git init → both lookups return empty.
    const result = await probe(loaderPath, nestedCwd,);
    expect(result.credentials.found,).toBe(false,);
    expect(result.credentials.keyId,).toBe("",);
    expect(result.credentials.name,).toBe("",);
    expect(result.credentials.email,).toBe("",);
    expect(result.credentials.source,).toBe("",);
  },);
},);
