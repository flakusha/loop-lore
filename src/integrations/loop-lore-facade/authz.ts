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

import type { FacadeContext, FacadeOp, FacadeResult, } from "./types";

/**
 * Admit (or reject) a facade call BEFORE any wrapped service runs.
 *
 * Fail-closed rules, this slice:
 *  - the principal must be server-resolved (it always is — the only
 *    constructor is facadeContextFromRequestContext over a verified
 *    RequestContext) AND must carry a userId. Anonymous calls have no owner
 *    to attribute audit rows or budgets to, so they never proceed;
 *  - scope (`read` / `chat-write`) is recorded on the audit row and becomes
 *    an enforced key-tier check once the scoped-credential epic lands (Q4);
 *    until then every admitted principal holds both tiers — same as HTTP.
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

  return null;
}
