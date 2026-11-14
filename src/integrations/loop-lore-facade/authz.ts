// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/authz.ts — fail-closed facade admission.
//
// Route-level access control (checkChatAccess + friends) stays inside the
// wrapped services — the facade never bypasses a guard. This seam adds the
// facade-level admission check (epic BLOCKING fix: "access control is
// ROUTE-level and a guard-skipping facade bypasses every guard").
//
// CREDENTIAL POLICY (Q4 decision, owner-verbatim):
//  - Admin/subscribed harness API keys are LOCKED. The ToS forbid sharing a
//    subscription's harness API keys with any other client (1 subscription
//    = 1 person/user) — the scoped-credential epic must NOT mint
//    credentials backed by admin/subscription harness keys.
//  - Open scenarios, research candidates OUT OF SCOPE until a ticket exists:
//    BYOK (the user supplies their own keys / runs the harness locally) and
//    federation (the federated instance runs its own harness, sharing
//    DB/chat with the head/master instance).

import type { FacadeContext, FacadeOp, FacadeResult, FacadeScope, } from "./types";

/**
 * The principal kinds each data domain admits — DEFAULT DENY: a kind that is
 * not listed for a domain is refused before the handler runs. `user` is the
 * platform's own authenticated user; `external-agent` is the scoped
 * integration token whose subject IS that user's id (the tier ladder below
 * still applies to it). Every other kind (`user-worktree`,
 * `internal-service`) is refused — no kind inherits another domain's access.
 */
const ADMITTED_PRINCIPAL_KINDS: Partial<Record<FacadeOp["domain"], readonly string[]>> = {
  assets: ["user", "external-agent",],
  characters: ["user", "external-agent",],
  memory: ["user", "external-agent",],
  rpg: ["user", "external-agent",],
};

/**
 * Admit (or reject) a facade call BEFORE any wrapped service runs.
 *
 * Fail-closed rules, this slice:
 *  - the principal must be server-resolved (it always is — the only
 *    constructor is facadeContextFromRequestContext over a verified
 *    RequestContext) AND must carry a userId. Anonymous calls have no owner
 *    to attribute audit rows or budgets to, so they never proceed;
 *  - PER-DOMAIN KIND ADMISSION (default deny): the data domains (assets,
 *    characters, memory, rpg) admit an explicit list of principal kinds; a
 *    kind that is not listed for that domain is refused with a typed 403
 *    `forbidden` before any handler runs. The chat/generation domains keep
 *    their existing kind behaviour, and the repo-access tier keeps its own
 *    internal-service-only rule;
 *  - TIER ENFORCEMENT (ADR-credentials-issuer-model, admin-scoped slice):
 *    an integration-token principal (`external-agent` carrying a credential)
 *    must hold the tier the op demands. Tiers are cumulative — `chat-write`
 *    implies `read` — so a `read` token is denied every chat-write op with a
 *    typed 403 `forbidden`, and a token with NO readable scope is denied
 *    everything. JWT user principals keep today's both-tiers behavior: they
 *    are the platform's own authenticated users, not scoped credentials.
 *    BYOK subject binding (TASK-byok-agent-subject-binding): a token never
 *    spends a user's stored provider key un-attributed — its subject IS the
 *    issuing admin's userId, bound at the verification seam.
 *
 * @param ctx - the facade context
 * @param op - the op being admitted
 * @returns a rejection FacadeResult, or null when the call may proceed
 */
export function authorizeFacadeOp(ctx: FacadeContext, op: FacadeOp,): FacadeResult | null {
  if (ctx.principal.userId === null) {
    return {
      ok: false,
      status: 401,
      json: {
        error: "unauthorized",
        message: `facade op "${op.name}" requires a server-resolved user principal`,
      },
    };
  }

  // RSI repo-access tier (epic-harness-rsi-repo-access): kind admission is
  // decided HERE, fail-closed, before any handler runs. Only the
  // server-resolved internal-service principal is ever admitted; users,
  // user-worktrees, and integration-token external agents are refused even
  // when a token's scope ladder would satisfy the op's nominal scope (the
  // repo-root tier is not part of the token tier ladder — no credential
  // mints it). The full gate (operator master switch + grants + audit)
  // still runs inside the op handler; this seam keeps the kind refusal
  // independent of any DB state.
  if (op.domain === "repo-access" && ctx.principal.kind !== "internal-service") {
    return {
      ok: false,
      status: 403,
      json: {
        error: "forbidden",
        message:
          `facade op "${op.name}" requires the internal-service principal (repo-access tier); kind "${ctx.principal.kind}" is never admitted`,
      },
    };
  }

  // PER-DOMAIN KIND ADMISSION (fail-closed, DEFAULT DENY): the data domains
  // admit an explicit list of principal kinds; every other kind is refused
  // BEFORE the handler runs, so the domain's data never reaches it. The rule
  // is per domain — no kind inherits another domain's access implicitly.
  const admitted = ADMITTED_PRINCIPAL_KINDS[op.domain];
  if (admitted !== undefined && !admitted.includes(ctx.principal.kind,)) {
    return {
      ok: false,
      status: 403,
      json: {
        error: "forbidden",
        message:
          `facade op "${op.name}" does not admit principal kind "${ctx.principal.kind}"; kind admission is per domain`,
      },
    };
  }

  if (ctx.principal.kind === "external-agent" && !tokenSatisfiesTier(ctx.principal.credentialScope, op.scope,)) {
    return {
      ok: false,
      status: 403,
      json: {
        error: "forbidden",
        message: `integration token "${
          ctx.principal.credentialName ?? "?"
        }" lacks the "${op.scope}" tier required by "${op.name}"`,
      },
    };
  }

  return null;
}

/**
 * Whether a token's granted tier covers an op's required tier. Tiers are a
 * two-step ladder: `chat-write` (write) implies `read`; `read` covers only
 * read ops. Null (no parsed scope) satisfies nothing — fail closed.
 * @param granted - the token's granted tier, null when unattributable
 * @param required - the op's required tier
 * @returns true when the granted tier covers the requirement
 */
function tokenSatisfiesTier(granted: FacadeScope | null, required: FacadeScope,): boolean {
  if (granted === null) { return false; }
  return granted === required || granted === "chat-write";
}
