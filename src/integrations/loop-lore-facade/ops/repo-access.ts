// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/repo-access.ts — the RSI repo-access
// tier ops (epic-harness-rsi-repo-access).
//
// These ops are the tier's DANGEROUS surface: they run repo commands and
// expose repo-root facts for the self-dev loop. Layering:
//  1. facade authz (authz.ts) refuses every principal kind except
//     internal-service BEFORE any handler runs (fail-closed, DB-free);
//  2. the gate (repo-access/gate.ts) re-checks INSIDE the handler: operator
//     master switch (default off) + capability grants + root resolution,
//     auditing every decision into tool_call_audit;
//  3. runFacadeOp adds the per-principal budget (repoAccessPolicy) + the
//     log_entries call audit on top.
// The tier executes no caller-supplied commands: the check argv is the
// repository's own fixed script (`bun run check`), never request input.
import type { Kysely, } from "kysely";
import { execFile, } from "node:child_process";
import { promisify, } from "node:util";
import { repoAccessPolicy, } from "../../../api-governance/rate-limiting/policies";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { getGitContext, } from "../../../harness/run-context";
import { type RepoCapability, } from "../../harness/repo-access/capabilities";
import {
  assertRepoAccessExecution,
  type RepoAccessVerdict,
} from "../../harness/repo-access/gate";
import { type FacadeRegistry, } from "../registry";
import type { FacadeContext, FacadeOp, FacadeResult, } from "../types";

/** Shared registration deps — the same shape HandlerOpts carries. */
export interface RepoAccessFacadeDeps {
  database: Kysely<DB>;
  config: Config;
}

/** The repo-context payload repo.context returns. */
interface RepoContextPayload {
  root: string;
  branch: string | null;
  gitSha: string | null;
}

/** Outcome of one check run. */
interface RepoCheckOutcome {
  ok: boolean;
  output: string;
}

/**
 * A check runner — production spawns the repo's own fixed check script;
 * tests inject a fake (parallel-safe: no subprocess, no fixed paths).
 */
export type RepoCheckRunner = (root: string,) => Promise<RepoCheckOutcome>;

/** `bun run check` timeout — the repo gate suite is minutes, not seconds. */
const REPO_CHECK_TIMEOUT_MS = 600_000;

const execFileP = promisify(execFile,);

/**
 * The production runner: the repository's OWN fixed check script, spawned in
 * the gate-resolved repo root. The argv is a constant — request input never
 * becomes a command.
 * @param root - the repo worktree root the gate resolved
 * @returns the run outcome with trimmed combined output.
 */
const defaultCheckRunner: RepoCheckRunner = async (root,) => {
  try {
    const result = await execFileP("bun", ["run", "check",], {
      cwd: root,
      timeout: REPO_CHECK_TIMEOUT_MS,
      windowsHide: true,
    },);

    return {
      ok: true,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    };
  } catch (error) {
    const cause = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: `${cause.stdout ?? ""}${cause.stderr ?? ""}${cause.message ?? ""}`.trim(),
    };
  }
};

/**
 * Map a gate denial to the typed FacadeResult. 403 for every policy denial
 * (disabled/principal/capability — the caller learns nothing more), 409 when
 * the environment cannot resolve a repo root (a server-side condition).
 * @param verdict - the gate's denial
 * @returns the rejection result.
 */
function denialResult(verdict: Extract<RepoAccessVerdict, { allowed: false }>,): FacadeResult {
  const envDenial = verdict.code === "root_unresolved" ||
    verdict.code === "root_required" ||
    verdict.code === "agent_worktree_required" ||
    verdict.code === "agent_worktree_invalid";

  return {
    ok: false,
    status: envDenial ? 409 : 403,
    json: { error: "repo_access_denied", code: verdict.code, message: verdict.message, },
  };
}

/** The gate outcome an op handler branches on: proceed with the root, or deny. */
type GateOutcome = { ok: true; root: string } | { ok: false; denial: FacadeResult };

/**
 * Run the gate ONCE for an op handler (single audited decision per call).
 * @param ctx - the facade context (server-resolved principal inside)
 * @param required - the capability the op demands (omit for admission-only)
 * @returns the allowed root/grants, or the typed denial result.
 */
async function runGate(ctx: FacadeContext, required?: RepoCapability,): Promise<GateOutcome> {
  const verdict = await assertRepoAccessExecution({
    // The facade principal IS the server-resolved one (facadeContextFromRequestContext
    // mints it from the verified RequestContext); no body field can assert it.
    principal: {
      kind: ctx.principal.kind,
      userId: ctx.principal.userId,
      credentialId: ctx.principal.credentialId,
    },
    required,
    db: ctx.database,
  },);

  return verdict.allowed
    ? { ok: true, root: verdict.root, }
    : { ok: false, denial: denialResult(verdict,), };
}

/**
 * Register the repo-access ops on a registry.
 * @param registry - the facade registry
 * @param _deps - registration deps, kept for signature symmetry with the
 *   other register*Ops functions; the repo-access ops read the database
 *   from the per-call FacadeContext (ctx.database), so nothing is closed
 *   over here.
 * @param checkRunner - check-runner override (tests); default spawns `bun run check`
 * @throws {Error} when an op name collides on registration
 */
export function registerRepoAccessOps(
  registry: FacadeRegistry,
  _deps: RepoAccessFacadeDeps,
  checkRunner: RepoCheckRunner = defaultCheckRunner,
): void {
  const ops: FacadeOp[] = [
    {
      name: "repo.context",
      domain: "repo-access",
      summary: "Return the repo worktree context the tier executes against",
      description: "Admission-only repo-access op: the gate-resolved repo root plus the exec-log " +
        "git context (branch + short sha). Requires the tier enabled AND the internal-service " +
        "principal; every decision is audited to tool_call_audit.",
      // Inert for this domain: facade authz refuses non-internal-service
      // principals BEFORE the token tier ladder is ever consulted, so no
      // token scope reaches these ops.
      scope: "read",
      ratePolicy: repoAccessPolicy,
      handler: async (ctx,) => {
        const gate = await runGate(ctx,);
        if (!gate.ok) { return gate.denial; }

        const git = getGitContext();
        const payload: RepoContextPayload = {
          root: gate.root,
          branch: git.branch,
          gitSha: git.gitSha,
        };

        return { ok: true, status: 200, json: payload, };
      },
    },
    {
      name: "repo.check",
      domain: "repo-access",
      summary: "Run the repository's own check suite in the repo root",
      description: "Spawns the repo's fixed `bun run check` script (never caller-supplied argv) in the " +
        "gate-resolved repo root. Requires the tier enabled, the internal-service principal, and " +
        "the check:run capability; every decision is audited to tool_call_audit. The check's own " +
        "pass/fail is the payload, not the op's status.",
      scope: "read",
      ratePolicy: repoAccessPolicy,
      // Annotation rule (types.ts, FacadeToolAnnotations): this op is NOT a
      // bounded read - it spawns the repo's own check suite as an external
      // process in the repo root, so it reaches outside the loop-lore store
      // (openWorldHint) and a host must not treat it as a pure read
      // (readOnlyHint false). A repeat is not effect-free, so idempotentHint
      // stays UNSET (the MCP default is false).
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
      handler: async (ctx,) => {
        const gate = await runGate(ctx, "check:run",);
        if (!gate.ok) { return gate.denial; }

        const outcome = await checkRunner(gate.root,);
        return { ok: true, status: 200, json: outcome, };
      },
    },
  ];

  for (const op of ops) {
    const registered = registry.register(op,);
    if (!registered.ok) {
      throw new Error(registered.message,);
    }
  }
}
