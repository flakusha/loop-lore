// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/escalation.ts — the escalation request path
 * (TASK-escalation-audit-queue-with-no-auto-approve).
 *
 * A root-change (escalation) request is RECORDED in `tool_call_audit` and
 * REFUSED. There is NO auto-approve for any principal (amendment A2): only an
 * admin approval (escalation-queue.ts) lets a later request through, and that
 * approval is consumed ATOMICALLY by the request that redeems it.
 *
 * The vocabulary and the audit rows — the key, the markers, the claim — live
 * in escalation-rows.ts; this module is the request path over them.
 */
import { type Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { governanceRateLimiter, } from "../../../api-governance/rate-limiting/instance";
import { type RatePolicy, repoAccessPolicy, } from "../../../api-governance/rate-limiting/policies";
import type { DB, } from "../../../db/schema";
import { getChildLogger, } from "../../../logger";
import { jsonStringifyOr, } from "../../../utils";
import {
  buildEscalationKey,
  buildEscalationTags,
  escalationRowId,
  latestEscalationRow,
  MARKER_DECISION,
  MARKER_RATE_LIMITED,
  MARKER_REQUEST,
  MARKER_USED,
  writeEscalationRow,
} from "./escalation-rows";
import { type RepoAccessPrincipal, } from "./principal-scope";
import { getRepoAccessSettings, } from "./settings";

/** The minimal limiter surface the request path needs (tests inject their own). */
export interface EscalationRateLimiter {
  consume(key: string, policy: RatePolicy,): { allowed: boolean; retryAfterSec?: number };
}

/** The outcome of one root-change request — a Result, never a throw. */
export type RepoRootChangeOutcome =
  | { ok: true; root: string }
  | {
    ok: false;
    code: "escalation_denied" | "escalation_rate_limited" | "repo_access_disabled";
    message: string;
    /** The recorded request id — the queue entry an admin decides on. */
    requestId?: string;
  };

/** Inputs for {@link requestRepoRootChange}. */
export interface RepoRootChangeInput {
  /** The SERVER-RESOLVED principal requesting the root change. */
  principal: RepoAccessPrincipal;
  /** The path the caller asked to escape to (recorded verbatim). */
  targetPath: string;
  /** Database handle — the request is recorded in tool_call_audit. */
  db: Kysely<DB>;
  /** Limiter override; the process-wide governance limiter by default. */
  limiter?: EscalationRateLimiter;
}

/**
 * Record an audited root-change (escalation) request. DEFAULT DENY: the
 * request is written to `tool_call_audit` and refused unless an admin has
 * approved this key — there is NO auto-approve for any principal, and an
 * approval is consumed by the request that redeems it.
 * @param input - principal, target path, db handle, optional limiter
 * @returns the outcome (a Result, never a throw)
 */
export async function requestRepoRootChange(
  input: RepoRootChangeInput,
): Promise<RepoRootChangeOutcome> {
  try {
    return await decideRepoRootChange(input,);
  } catch (cause) {
    getChildLogger("harness-repo-access",)?.warn("repo-access escalation request failed", {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);

    return {
      ok: false,
      code: "escalation_denied",
      message: `root change to "${input.targetPath}" was refused (the escalation audit write failed)`,
    };
  }
}

/**
 * The request path's decision: refuse, redeem an approval, or record a new
 * request. The tier's master switch gates the whole path — a disabled
 * repo-access tier records nothing and grants nothing.
 * @param input - principal, target path, db handle, optional limiter
 * @returns the outcome (a Result, never a throw)
 */
async function decideRepoRootChange(
  input: RepoRootChangeInput,
): Promise<RepoRootChangeOutcome> {
  if (!getRepoAccessSettings().enabled) {
    return {
      ok: false,
      code: "repo_access_disabled",
      message: `the repo-access tier is disabled; the root change to "${input.targetPath}" was refused`,
    };
  }

  const key = buildEscalationKey(input.principal, input.targetPath,);
  if (key === null) {
    getChildLogger("harness-repo-access",)?.warn("repo-access escalation refused: no identity", {
      kind: input.principal.kind,
    },);

    return {
      ok: false,
      code: "escalation_denied",
      message: `root change to "${input.targetPath}" was refused (the principal carries no credential-scoped identity)`,
    };
  }

  const deciding = await latestEscalationRow(input.db, key,);

  // An approval for this key grants ONE root change; redeeming it closes the
  // key (the "used" row is the key's last row from now on). The claim is the
  // insert: a concurrent second redemption inserts nothing and is denied.
  if (deciding !== null && deciding.marker === MARKER_DECISION && deciding.verdict === "reviewed") {
    const claimed = await writeEscalationRow(input.db, {
      id: escalationRowId(MARKER_USED, deciding.id,),
      userId: key.subjectId,
      verdict: "allowed",
      rationale: `approved root change to "${key.target}" redeemed`,
      escalationAttempt: 0,
      tags: jsonStringifyOr(buildEscalationTags(key, MARKER_USED,), "{}",),
    },);

    if (!claimed) {
      return {
        ok: false,
        code: "escalation_denied",
        message: `the approval for "${key.target}" was already redeemed`,
      };
    }

    return { ok: true, root: input.targetPath, };
  }

  // A request that is already pending is idempotent: it re-answers with the
  // recorded request id instead of queueing a second one.
  if (deciding !== null && deciding.marker === MARKER_REQUEST) {
    return {
      ok: false,
      code: "escalation_denied",
      message: `root change to "${input.targetPath}" is awaiting an admin decision`,
      requestId: deciding.id,
    };
  }

  const limiter = input.limiter ?? governanceRateLimiter;
  const verdict = limiter.consume(
    `repo-access:escalation:${key.kind}:${key.scope}`,
    repoAccessPolicy,
  );

  if (!verdict.allowed) {
    getChildLogger("harness-repo-access",)?.warn("repo-access escalation request refused", {
      kind: key.kind,
      scope: key.scope,
      retryAfterSec: verdict.retryAfterSec ?? null,
    },);

    await writeEscalationRow(input.db, {
      id: randomUUID().replaceAll("-", "",),
      userId: key.subjectId,
      verdict: "denied",
      rationale: `root change to "${input.targetPath}" refused (rate limit)`,
      escalationAttempt: 0,
      tags: jsonStringifyOr(buildEscalationTags(key, MARKER_RATE_LIMITED,), "{}",),
    },);

    return {
      ok: false,
      code: "escalation_rate_limited",
      message: `root change to "${input.targetPath}" is rate limited`,
    };
  }

  const id = randomUUID().replaceAll("-", "",);
  const recorded = await writeEscalationRow(input.db, {
    id,
    userId: key.subjectId,
    verdict: "denied",
    rationale: `root change requested to "${input.targetPath}" — recorded, default-deny`,
    escalationAttempt: 1,
    tags: jsonStringifyOr(buildEscalationTags(key, MARKER_REQUEST,), "{}",),
  },);

  if (!recorded) {
    getChildLogger("harness-repo-access",)?.warn("repo-access escalation request not recorded", {
      kind: key.kind,
      scope: key.scope,
    },);

    return {
      ok: false,
      code: "escalation_denied",
      message: `root change to "${input.targetPath}" was refused (the escalation audit write failed)`,
    };
  }

  return {
    ok: false,
    code: "escalation_denied",
    message: `root change to "${input.targetPath}" was recorded and denied (default deny; no auto-approve)`,
    requestId: id,
  };
}
