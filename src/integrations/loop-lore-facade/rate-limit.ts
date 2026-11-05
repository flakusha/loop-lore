// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/rate-limit.ts — governance-equivalent
// rate limiting for facade calls, keyed on the API-key principal (stdio has
// no userId — the epic pins "rate limits per key").
//
// REUSE, not a second limiter: the process-wide GovernanceRateLimiter backs
// the HTTP routes, and facade ops consume the SAME named policies (chat,
// generation) so an agent cannot outrun a browser client on any budget.

import { governanceRateLimiter, } from "../../api-governance/rate-limiting/instance";
import type { RatePolicy, } from "../../api-governance/rate-limiting/policies";

/** Minimal structural view of a governance limiter (tests inject fakes). */
export interface FacadeRateLimiter {
  consume(key: string, policy: RatePolicy,): { allowed: boolean };
}

/** Budget-check outcome; `retryAfterSec` is the policy window (conservative). */
export type FacadeBudget =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

/**
 * Spend one unit of the caller's facade budget for `policy`.
 * @param opts - key, policy, optional limiter override (defaults to the
 *   process-wide governance singleton, mirroring route behavior)
 * @returns allowed, or the conservative retry-after window in seconds
 */
export function consumeFacadeBudget(opts: {
  key: string;
  policy: RatePolicy;
  limiter?: FacadeRateLimiter;
},): FacadeBudget {
  const limiter = opts.limiter ?? governanceRateLimiter;
  const verdict = limiter.consume(opts.key, opts.policy,);

  if (verdict.allowed) { return { allowed: true, }; }

  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil(opts.policy.windowMs / 1000,),),
  };
}
