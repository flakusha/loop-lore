// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// repo-access/grants.test.ts — default grants per principal kind + the
// fail-closed intersection. Parallel-safe: pure functions, no IO.
import { describe, expect, it, } from "bun:test";
import { principalKind, } from "../../../middleware/principal-kind";
import { DEFAULT_KIND_GRANTS, resolveRepoGrants, } from "./grants";

describe("DEFAULT_KIND_GRANTS — the epic defaults table", () => {
  it("internal-service holds all six capabilities", () => {
    expect([...DEFAULT_KIND_GRANTS["internal-service"],].sort(),).toEqual([
      "check:run",
      "commit:signed",
      "finalize:merge",
      "repo:write",
      "ticket:ops",
      "worktree:spawn",
    ],);
  });

  it("users and user-worktrees hold none of repo:*", () => {
    expect(DEFAULT_KIND_GRANTS.user,).toEqual([],);
    expect(DEFAULT_KIND_GRANTS["user-worktree"],).toEqual([],);
  });

  it("external agents default to worktree:spawn + check:run only", () => {
    expect([...DEFAULT_KIND_GRANTS["external-agent"],].sort(),).toEqual([
      "check:run",
      "worktree:spawn",
    ],);
  });
});

describe("resolveRepoGrants — fail-closed composition", () => {
  it("returns the kind defaults when no grant list is given", () => {
    const grants = resolveRepoGrants({ kind: principalKind("internal-service",), },);
    expect(grants.has("finalize:merge",),).toBe(true,);
    expect(grants.has("check:run",),).toBe(true,);
  });

  it("narrows an explicit list to the kind defaults' intersection", () => {
    const grants = resolveRepoGrants({ kind: principalKind("internal-service",), granted: ["check:run",], },);
    expect(grants.has("check:run",),).toBe(true,);
    // An explicit list means EXACTLY those (never defaults-plus-list).
    expect(grants.has("finalize:merge",),).toBe(false,);
    expect(grants.size,).toBe(1,);
  });

  it("drops unknown names instead of guessing", () => {
    const grants = resolveRepoGrants({
      kind: principalKind("external-agent",),
      granted: ["worktree:spawn", "finalize:merge", "repo:read", "bogus", "",],
    },);

    expect(grants.has("worktree:spawn",),).toBe(true,);
    // finalize:merge exceeds what an external agent may hold — dropped.
    expect(grants.has("finalize:merge",),).toBe(false,);
    expect(grants.size,).toBe(1,);
  });

  it("a user principal stays capability-free even with a grant list", () => {
    const grants = resolveRepoGrants({
      kind: principalKind("user",),
      granted: ["repo:write", "finalize:merge",],
    },);

    expect(grants.size,).toBe(0,);
  });
});
