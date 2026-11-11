// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// repo-access/principal-scope.test.ts — the per-kind root resolution matrix.
//
// Resource contract (parallel-safe): the detector is replaced with a seam
// pointing at a unique mkdtemp directory (never the real repo), and every
// file/systemd-free assertion runs against paths under that temp root; the
// directory is removed in afterEach. No ports, no env, no sleeps.
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { PathOutsideScopeError, } from "../../../harness/worktree-scope";
import { principalKind, } from "../../../middleware/principal-kind";
import {
  assertParamsWithinPrincipalScope,
  type RepoAccessPrincipal,
  resolveScopeRoot,
  setRepoScopeRootDetectorForTests,
} from "./principal-scope";

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), "rsi-scope-",),);
  await mkdir(join(repoRoot, "tree", "agent-1",), { recursive: true, },);
  await mkdir(join(repoRoot, "src",), { recursive: true, },);
  agent = {
    kind: principalKind("external-agent",),
    userId: "agent-1",
    agentWorktree: join(repoRoot, "tree", "agent-1",),
  };

  setRepoScopeRootDetectorForTests(() => repoRoot);
},);

afterEach(async () => {
  setRepoScopeRootDetectorForTests(null,);
  await rm(repoRoot, { recursive: true, force: true, },);
},);

const internal: RepoAccessPrincipal = { kind: principalKind("internal-service",), userId: "svc-1", };
/** Built per test in beforeEach — the worktree path depends on the temp root. */
let agent: RepoAccessPrincipal;

describe("resolveScopeRoot — per-kind matrix", () => {
  it("internal-service resolves the repo worktree root", async () => {
    const r = await resolveScopeRoot(internal,);
    expect(r,).toEqual({ ok: true, root: repoRoot, basis: "repo-root", },);
  });

  it("internal-service denies when git detection fails (no cwd fallback)", async () => {
    setRepoScopeRootDetectorForTests(() => "");
    const r = await resolveScopeRoot(internal,);
    expect(r.ok,).toBe(false,);
    expect(r.ok === false && r.code,).toBe("root_unresolved",);
  });

  it("user principals pass through the explicit root (until project spaces)", async () => {
    const explicit = join(repoRoot, "src",);
    const r = await resolveScopeRoot({ kind: principalKind("user",), userId: "u-1", }, explicit,);
    expect(r,).toEqual({ ok: true, root: explicit, basis: "explicit", },);
  });

  it("user principals deny without an explicit root", async () => {
    const r = await resolveScopeRoot({ kind: principalKind("user",), userId: "u-1", },);
    expect(r.ok,).toBe(false,);
    expect(r.ok === false && r.code,).toBe("root_required",);
  });

  it("user-worktree behaves like user (pass-through-until-spaces)", async () => {
    const r = await resolveScopeRoot({ kind: principalKind("user-worktree",), userId: "u-1", },);
    expect(r.ok,).toBe(false,);
    expect(r.ok === false && r.code,).toBe("root_required",);
  });

  it("external-agent resolves inside its assigned tree/ worktree", async () => {
    const r = await resolveScopeRoot(agent,);
    expect(r.ok,).toBe(true,);
    expect(r.ok === true && r.basis,).toBe("agent-worktree",);
    expect(r.ok === true && r.root.startsWith(`${repoRoot}/tree/`,),).toBe(true,);
  });

  it("external-agent denies when no worktree was assigned server-side", async () => {
    const r = await resolveScopeRoot({ kind: principalKind("external-agent",), userId: "agent-2", },);
    expect(r.ok,).toBe(false,);
    expect(r.ok === false && r.code,).toBe("agent_worktree_required",);
  });

  it("external-agent denies an assigned path outside tree/ (src/ is not agent land)", async () => {
    const r = await resolveScopeRoot({
      kind: principalKind("external-agent",),
      userId: "agent-3",
      agentWorktree: join(repoRoot, "src",),
    },);

    expect(r.ok,).toBe(false,);
    expect(r.ok === false && r.code,).toBe("agent_worktree_invalid",);
  });

  it("external-agent denies an escaping worktree path", async () => {
    const r = await resolveScopeRoot({
      kind: principalKind("external-agent",),
      userId: "agent-4",
      agentWorktree: join(repoRoot, "tree", "..", "..",),
    },);

    expect(r.ok,).toBe(false,);
    expect(r.ok === false && r.code,).toBe("agent_worktree_invalid",);
  });

  it("external-agent denies a symlink pointing outside tree/ (realpath-safe)", async () => {
    const outside = await mkdtemp(join(tmpdir(), "rsi-outside-",),);
    try {
      await writeFile(join(outside, "leak.txt",), "secret",);
      const link = join(repoRoot, "tree", "agent-link",);
      await symlink(outside, link,);
      const r = await resolveScopeRoot({
        kind: principalKind("external-agent",),
        userId: "agent-5",
        agentWorktree: link,
      },);

      expect(r.ok,).toBe(false,);
      expect(r.ok === false && r.code,).toBe("agent_worktree_invalid",);
    } finally {
      await rm(outside, { recursive: true, force: true, },);
    }
  });

  it("FAILS CLOSED on a kind outside the vocabulary (never resolves a root)", async () => {
    // The brand is compile-time only, so a value that escaped the mint (a
    // hand-built principal, a stale persisted kind) must still be refused
    // rather than falling through to a resolved scope root.
    const rogue = { kind: "rogue-kind", userId: "u-rogue", } as unknown as RepoAccessPrincipal;
    const r = await resolveScopeRoot(rogue,);

    expect(r.ok,).toBe(false,);
    expect(r.ok === false && r.code,).toBe("root_unresolved",);
  });
});

describe("assertParamsWithinPrincipalScope — trust boundary", () => {
  it("guards path params against the kind-resolved root", async () => {
    const inside = join(repoRoot, "tree", "agent-1", "patch.diff",);
    const r = await assertParamsWithinPrincipalScope({
      toolName: "probe",
      principal: agent,
      params: { path: inside, },
    },);

    expect(r.ok,).toBe(true,);
  });

  it("throws PathOutsideScopeError when a path escapes the resolved root", async () => {
    await expect(
      assertParamsWithinPrincipalScope({
        toolName: "probe",
        principal: agent,
        params: { path: join(repoRoot, "src", "secret.ts",), },
      },),
    ).rejects.toBeInstanceOf(PathOutsideScopeError,);
  });

  it("a param-supplied principal is IGNORED (the AC)", async () => {
    // The body claims internal-service and demands repo-root access, but the
    // SERVER-resolved principal is an agent confined to its worktree: the
    // guard must resolve the agent root and throw on the escape.
    await expect(
      assertParamsWithinPrincipalScope({
        toolName: "probe",
        principal: agent,
        params: {
          principal: { kind: principalKind("internal-service",), userId: "svc-1", },
          path: join(repoRoot, "src", "secret.ts",),
        },
      },),
    ).rejects.toBeInstanceOf(PathOutsideScopeError,);
  });

  it("external-agent cannot reach ANOTHER agent's worktree (cross-agent isolation)", async () => {
    await mkdir(join(repoRoot, "tree", "agent-2",), { recursive: true, },);
    await writeFile(join(repoRoot, "tree", "agent-2", "secret.diff",), "other agent",);
    await expect(
      assertParamsWithinPrincipalScope({
        toolName: "probe",
        principal: agent,
        params: { path: join(repoRoot, "tree", "agent-2", "secret.diff",), },
      },),
    ).rejects.toBeInstanceOf(PathOutsideScopeError,);
  });

  it("returns the typed root refusal instead of guarding when the root itself is denied", async () => {
    const r = await assertParamsWithinPrincipalScope({
      toolName: "probe",
      principal: { kind: principalKind("user",), userId: "u-2", },
      params: { path: "anywhere", },
    },);

    expect(r.ok,).toBe(false,);
    expect(r.ok === false && r.code,).toBe("root_required",);
  });
});
