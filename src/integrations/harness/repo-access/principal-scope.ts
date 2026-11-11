// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/principal-scope.ts — principal-aware scope-root resolution
 * (epic-harness-rsi-repo-access, "Scope-root resolution" + trust boundary).
 *
 * TRUST BOUNDARY: a principal is NEVER caller-supplied. Tool params, chat
 * context, and request bodies cannot assert one — the ONLY constructor input
 * here is the server-resolved principal the auth seam minted
 * (`RequestContext.principalKind`, middleware/types.ts). The AC "a
 * param-supplied principal is ignored" is structural: `assertParamsWithinPrincipalScope`
 * takes the principal as an ARGUMENT and never reads a principal-shaped key
 * out of `params` (asserted in tests).
 *
 * Root resolution per principal kind (epic-verbatim):
 *  - `user` / `user-worktree`: pass-through — the explicit `root` param is
 *    trusted (today's behavior) until project spaces land (epic
 *    project-spaces is the hard prerequisite for the real user resolver;
 *    PROVISIONAL per DECISIONS §5 Q5). Absent root = deny, fail-closed.
 *  - `internal-service`: the repo worktree root (git toplevel) — the only
 *    principal that may touch `src/`, `.plan/`, migrations, workflows.
 *    Git detection failure denies (no cwd fallback: guessing a repo root for
 *    the repo-root tier would fail OPEN).
 *  - `external-agent`: confined to its assigned agent worktree
 *    (`tree/agent-<id>/`), never the repo root. The assigned worktree is
 *    required server-side context, must realpath-resolve under
 *    `<repoRoot>/tree/`, and an absent/escaping path denies.
 */
import { realpath, } from "node:fs/promises";
import { runGit, } from "../../../harness/run-context";
import {
  assertParamsWithinScope,
  resolveWithinScope,
} from "../../../harness/worktree-scope";
import { type PrincipalKind, } from "../../../middleware/principal-kind";

/**
 * A server-resolved principal, shaped for repo-access decisions. Minted only
 * from verified credential evidence at the auth seam; never from tool params.
 */
export interface RepoAccessPrincipal {
  /** The principal kind resolved server-side (closed vocabulary). */
  readonly kind: PrincipalKind;
  /** Attributed user id, when the credential carries one. */
  readonly userId: string | null;
  /**
   * The agent worktree assigned to this principal (`tree/agent-<id>/`),
   * server-side spawn context. Required for `external-agent`; ignored for
   * every other kind.
   */
  readonly agentWorktree?: string;
}

/** Success: the resolved scope root plus what it was derived from. */
export type RepoScopeResolution =
  | { ok: true; root: string; basis: "repo-root" | "explicit" | "agent-worktree" }
  | {
    ok: false;
    code: "root_unresolved" | "root_required" | "agent_worktree_required" | "agent_worktree_invalid";
    message: string;
  };

/** Inputs for {@link assertParamsWithinPrincipalScope}. */
export interface PrincipalScopeInput {
  /** Tool name, for the underlying scope guard's escalation log line. */
  toolName: string;
  /** The SERVER-RESOLVED principal; never taken from params. */
  principal: RepoAccessPrincipal;
  /** Handler parameters; only path-named string values are inspected. */
  params: Record<string, unknown>;
  /** Explicit root for user-kind pass-through (until project spaces land). */
  explicitRoot?: string;
}

/** Detector for the repo worktree root; "" or a throw signals failure. */
type RepoRootDetector = () => string;

/** The real detector: the enclosing git worktree toplevel, no cwd fallback. */
const defaultRepoRootDetector: RepoRootDetector = () => runGit(["rev-parse", "--show-toplevel",],);

/** Active detector. Test-only seam replaces it; null restores the default. */
let repoRootDetector: RepoRootDetector = defaultRepoRootDetector;

/**
 * Replace the repo-root detector. Test-only seam (mirrors
 * worktree-scope's `setScopeRootDetectorForTests`).
 * @param detector - replacement detector, or null to restore the default
 */
export function setRepoScopeRootDetectorForTests(detector: (() => string) | null,): void {
  repoRootDetector = detector ?? defaultRepoRootDetector;
}

/**
 * Detect the repo worktree root; "" on any failure.
 * @returns the absolute repo root, or "" when git fails.
 */
function detectRepoRoot(): string {
  try {
    return repoRootDetector().trim();
  } catch {
    return "";
  }
}

/**
 * Resolve the scope root for one server-resolved principal (see the module
 * doc for the per-kind table). Denies are VALUES — never throws.
 * @param principal - the server-resolved principal
 * @param explicitRoot - explicit root for user-kind pass-through
 * @returns the resolution; `ok: false` with a typed code on every refusal
 */
export async function resolveScopeRoot(
  principal: RepoAccessPrincipal,
  explicitRoot?: string,
): Promise<RepoScopeResolution> {
  switch (principal.kind) {
    case "user":
    case "user-worktree": {
      // Pass-through-until-spaces (PROVISIONAL, epic DECISIONS §5 Q5): the
      // explicit root is the current behavior. Absent = deny — a principal
      // without a root never falls back to process cwd (that would widen
      // user scope beyond what the caller declared).
      if (explicitRoot === undefined || explicitRoot === "") {
        return {
          ok: false,
          code: "root_required",
          message: `principal kind "${principal.kind}" needs an explicit root until project spaces land`,
        };
      }

      return { ok: true, root: explicitRoot, basis: "explicit", };
    }

    case "internal-service": {
      const root = detectRepoRoot();
      if (root === "") {
        return {
          ok: false,
          code: "root_unresolved",
          message: "git toplevel detection failed; refusing repo-root scope (no cwd fallback)",
        };
      }

      return { ok: true, root, basis: "repo-root", };
    }

    case "external-agent": {
      const assigned = principal.agentWorktree;
      if (assigned === undefined || assigned === "") {
        return {
          ok: false,
          code: "agent_worktree_required",
          message:
            "external-agent principals are confined to an assigned agent worktree; none was provided server-side",
        };
      }

      const repoRoot = detectRepoRoot();
      if (repoRoot === "") {
        return {
          ok: false,
          code: "root_unresolved",
          message: "git toplevel detection failed; refusing to validate the agent worktree",
        };
      }

      // Symlink-safe resolve under the repo root first (throws on escape),
      // then the tighter confinement: agent worktrees live in `tree/` only.
      // The confinement compares against the CANONICAL repo root (realpath)
      // so a symlinked checkout cannot smuggle a `tree/` prefix past it.
      // Sequential awaits BY DESIGN (no-restricted-syntax: no Promise.all —
      // both rejections mean the same refusal, order is irrelevant).
      let realRepoRoot: string;
      let resolved: string;
      try {
        realRepoRoot = await realpath(repoRoot,);
        resolved = await resolveWithinScope(repoRoot, assigned,);
      } catch {
        return {
          ok: false,
          code: "agent_worktree_invalid",
          message: `assigned worktree "${assigned}" escapes the repo root`,
        };
      }

      const treePrefix = `${realRepoRoot}/tree/`;
      if (!resolved.startsWith(treePrefix,)) {
        return {
          ok: false,
          code: "agent_worktree_invalid",
          message: `assigned worktree "${assigned}" is not under the repo's tree/ directory`,
        };
      }

      return { ok: true, root: resolved, basis: "agent-worktree", };
    }

    default: {
      // Unreachable over the closed kind set (all four kinds are cased above)
      // — kept so an unknown kind FAILS CLOSED instead of resolving a root.
      return {
        ok: false,
        code: "root_unresolved",
        message: `unknown principal kind "${principal.kind}"; refusing scope resolution`,
      };
    }
  }
}

/**
 * Guard every path-bearing parameter of one tool invocation against the
 * root the SERVER-RESOLVED principal is entitled to. Delegates the path
 * walk to the existing worktree-scope guard; this wrapper contributes only
 * the per-kind root resolution. A `principal`-shaped key inside `params` is
 * inert data — it is never read (the AC: a param-supplied principal is
 * ignored).
 * @param input - see {@link PrincipalScopeInput}.
 * @returns the resolution result; `ok: false` when the root itself was
 *   refused (the caller audits + denies).
 * @throws {PathOutsideScopeError} When a path escapes the resolved root
 *   (rethrown from the underlying guard; escalation stays default-deny).
 */
export async function assertParamsWithinPrincipalScope(
  input: PrincipalScopeInput,
): Promise<RepoScopeResolution> {
  const resolution = await resolveScopeRoot(input.principal, input.explicitRoot,);
  if (!resolution.ok) {
    return resolution;
  }

  await assertParamsWithinScope({
    toolName: input.toolName,
    params: input.params,
    root: resolution.root,
  },);

  return resolution;
}
