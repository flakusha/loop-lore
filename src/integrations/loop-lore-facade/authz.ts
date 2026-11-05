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
 * Admit (or reject) a facade call BEFORE any wrapped service runs.
 *
 * Fail-closed rules, this slice:
 *  - the principal must be server-resolved (it always is — the only
 *    constructor is facadeContextFromRequestContext over a verified
 *    RequestContext) AND must carry a userId. Anonymous calls have no owner
 *    to attribute audit rows or budgets to, so they never proceed;
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
