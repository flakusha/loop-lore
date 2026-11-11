// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/gate.ts — the fail-closed gate for the RSI repo-access tier
 * (epic-harness-rsi-repo-access: principal-aware guard + escalation audit).
 *
 * Enforced IN ORDER on every repo-access execution; denies are values:
 *
 * 1. TIER ENABLED — the operator's master switch (settings.ts: admin
 *    override wins over file config; unseeded/absent = disabled). Disabled
 *    denies everything, regardless of principal or grants. The switch is
 *    NEVER auto-enabled anywhere in the codebase.
 * 2. PRINCIPAL KIND — only the server-resolved `internal-service` principal
 *    is admitted to the repo-root tier (epic: "the only principal that may
 *    touch src/, .plan/, migrations, workflows"). `user`/`user-worktree`
 *    and `external-agent` are denied here even with grants: an
 *    external-agent's `worktree:spawn`/`check:run` grants scope their own
 *    agent worktree (principal-scope.ts), never the repo root.
 * 3. CAPABILITY GRANTED — the required capability must be in the kind's
 *    (optionally narrowed) grant set (grants.ts). Fail-closed: unknown
 *    grant names vanish, a grant list never exceeds the kind defaults.
 * 4. ROOT RESOLVED — the scope root must resolve for the principal
 *    (principal-scope.ts); git-detection failure denies (no cwd fallback).
 *
 * AUDIT: every decision (allow and deny) writes a `tool_call_audit` row
 * (migration 092) via the shared `recordToolCallAudit` writer — no new
 * table (epic amendment A7). Escalation requests are RECORDED DENIALS:
 * `requestRepoRootChange` writes a row with `escalation_attempt = 1` and
 * always returns a denial — default deny, NO auto-approve for ANY principal
 * (amendment A2; `internal-service` holds grants instead of escalating).
 * The admin approval queue (list/approve surface) is a follow-up slice.
 */
import type { Kysely, } from "kysely";
import { recordToolCallAudit, } from "../../../assistant/guard/audit";
import type { DB, } from "../../../db/schema";
import type { RepoCapability, } from "./capabilities";
import { holdsCapability, resolveRepoGrants, } from "./grants";
import { type RepoAccessPrincipal, type RepoScopeResolution, } from "./principal-scope";
import { resolveScopeRoot, } from "./principal-scope";
import { getRepoAccessSettings, } from "./settings";

/** The audit tool name every repo-access decision is recorded under. */
export const REPO_ACCESS_AUDIT_TOOL = "harness.repo-access";

/** What {@link assertRepoAccessExecution} resolves with. */
export type RepoAccessVerdict =
  | {
    allowed: true;
    /** The resolved scope root (repo toplevel for the admitted kind). */
    root: string;
    /** The capability set the principal holds. */
    grants: ReadonlySet<RepoCapability>;
  }
  | {
    allowed: false;
    /**
     * The first four are gate-policy denials; the last three mirror the
     * scope-resolution vocabulary (principal-scope.ts). For the admitted
     * `internal-service` kind only `root_unresolved` is reachable — the
     * others are kept in the union so the deny path stays total over the
     * resolution space without a cast.
     */
    code:
      | "repo_access_disabled"
      | "principal_denied"
      | "capability_missing"
      | "root_unresolved"
      | "root_required"
      | "agent_worktree_required"
      | "agent_worktree_invalid";
    message: string;
  };

/** Inputs for {@link assertRepoAccessExecution}. */
export interface RepoAccessGateInput {
  /** The SERVER-RESOLVED principal (never caller-supplied). */
  principal: RepoAccessPrincipal;
  /** The capability the operation demands; omit for admission-only ops. */
  required?: RepoCapability;
  /**
   * Explicit grant names for this execution (future: the spawn-time grants
   * persisted on the chat branch). Narrowed against the kind defaults —
   * omitted, the kind defaults apply as-is.
   */
  granted?: readonly string[];
  /** Database handle — every decision is audited through it. */
  db: Kysely<DB>;
}

/** One decision's audit row, written for allow AND deny outcomes. */
interface RepoAccessAudit {
  principal: RepoAccessPrincipal;
  verdict: "allowed" | "denied";
  rationale: string;
  escalationAttempt: boolean;
  durationMs: number;
}

/**
 * Write the audit row for one repo-access decision. Best-effort (the shared
 * writer already swallows+logs failures) — an audit outage must not become
 * an availability signal the gate could be tempted to treat as "deny = safe".
 * @param db - database handle
 * @param audit - the decision facts
 */
async function auditDecision(db: Kysely<DB>, audit: RepoAccessAudit,): Promise<void> {
  await recordToolCallAudit(db, {
    tool: REPO_ACCESS_AUDIT_TOOL,
    chatId: "",
    userId: audit.principal.userId ?? "",
    verdict: audit.verdict,
    rationale: audit.rationale,
    escalationAttempt: audit.escalationAttempt,
    requiredRole: null,
    tags: [audit.principal.kind,],
    durationMs: audit.durationMs,
  },);
}

/**
 * Decide whether one repo-access execution may start, enforcing the gate
 * chain (module doc) and auditing the decision.
 * @param input - principal, required capability, db handle
 * @returns the verdict; denies are values, never throws.
 */
export async function assertRepoAccessExecution(input: RepoAccessGateInput,): Promise<RepoAccessVerdict> {
  const startedAt = Date.now();
  const deny = async (
    code: Extract<RepoAccessVerdict, { allowed: false }>["code"],
    rationale: string,
  ): Promise<RepoAccessVerdict> => {
    await auditDecision(input.db, {
      principal: input.principal,
      verdict: "denied",
      rationale: `${code}: ${rationale}`,
      escalationAttempt: false,
      durationMs: Date.now() - startedAt,
    },);

    return { allowed: false, code, message: rationale, };
  };

  // 1. Operator master switch — disabled by default, never auto-enabled.
  if (!getRepoAccessSettings().enabled) {
    return deny(
      "repo_access_disabled",
      "the repo-access tier is disabled (operator has not enabled harness.repoaccess)",
    );
  }

  // 2. Kind admission — only the internal-service principal gets repo-root
  // scope; every other kind is confined by principal-scope resolution and
  // denied here even when its grants list worktree-scoped capabilities.
  if (input.principal.kind !== "internal-service") {
    return deny(
      "principal_denied",
      `principal kind "${input.principal.kind}" is never admitted to the repo-root tier`,
    );
  }

  // 3. Capability grants (fail-closed intersection; admission-only ops skip).
  const grants = resolveRepoGrants({ kind: input.principal.kind, granted: input.granted, },);
  if (input.required !== undefined && !holdsCapability(grants, input.required,)) {
    return deny("capability_missing", `grant "${input.required}" is not held`,);
  }

  // 4. Root resolution — git toplevel, no cwd fallback.
  const resolution: RepoScopeResolution = await resolveScopeRoot(input.principal,);
  if (!resolution.ok) {
    return deny(resolution.code, resolution.message,);
  }

  await auditDecision(input.db, {
    principal: input.principal,
    verdict: "allowed",
    rationale: `repo-access granted (capability: ${input.required ?? "admission-only"}, basis: ${resolution.basis},)`,
    escalationAttempt: false,
    durationMs: Date.now() - startedAt,
  },);

  return { allowed: true, root: resolution.root, grants, };
}

/** The typed refusal {@link requestRepoRootChange} always returns. */
export interface RepoRootChangeDenial {
  ok: false;
  code: "escalation_denied";
  message: string;
}

/** Inputs for {@link requestRepoRootChange}. */
export interface RepoRootChangeInput {
  /** The SERVER-RESOLVED principal requesting the root change. */
  principal: RepoAccessPrincipal;
  /** The path the caller asked to escape to (recorded verbatim). */
  targetPath: string;
  /** Database handle — the request is recorded in tool_call_audit. */
  db: Kysely<DB>;
}

/**
 * Record an audited root-change (escalation) request. DEFAULT DENY: the
 * request is written to `tool_call_audit` with `escalation_attempt = 1` and
 * refused — there is NO auto-approve for any principal, and no approval
 * flow approves from this seam yet (the admin approval queue is a
 * follow-up slice; until it exists, denial is the only live behavior).
 * @param input - principal, target path, db handle
 * @returns the typed denial (always; never a promise of approval).
 */
export async function requestRepoRootChange(input: RepoRootChangeInput,): Promise<RepoRootChangeDenial> {
  await recordToolCallAudit(input.db, {
    tool: REPO_ACCESS_AUDIT_TOOL,
    chatId: "",
    userId: input.principal.userId ?? "",
    verdict: "denied",
    rationale: `root change requested to "${input.targetPath}" — recorded, default-deny (no approval flow)`,
    escalationAttempt: true,
    requiredRole: null,
    tags: [input.principal.kind, "escalation-request",],
    durationMs: 0,
  },);

  return {
    ok: false,
    code: "escalation_denied",
    message: `root change to "${input.targetPath}" was recorded and denied (default deny; no auto-approve)`,
  };
}
