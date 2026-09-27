// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Named rate-limit policies (epic-api-rate-limiting).
 *
 * Steady state = sliding window; `burst` adds a token bucket so short
 * spikes above steady state are absorbed without changing the window cap.
 */

/** */
export interface RatePolicy {
  /** Stable name surfaced in RateLimit headers + the status endpoint. */
  name: string;
  windowMs: number;
  max: number;
  /** Token-bucket burst capacity; refill tracks the steady-state rate. */
  burst?: number;
}

/** Unmatched routes. */
export const defaultPolicy: RatePolicy = { name: "default", windowMs: 60_000, max: 300, };

/** Login / register / token minting. */
export const authPolicy: RatePolicy = { name: "auth", windowMs: 60_000, max: 10, burst: 5, };

/** LLM / SD generation endpoints — money + tokens per call. */
export const generationPolicy: RatePolicy = { name: "generation", windowMs: 60_000, max: 20, burst: 5, };

/** Chat browsing + send cycles + the seen-poller — UI volume, not billable. */
export const chatPolicy: RatePolicy = { name: "chat", windowMs: 60_000, max: 300, burst: 50, };

/** */
export const policies: Record<string, RatePolicy> = {
  [defaultPolicy.name]: defaultPolicy,
  [authPolicy.name]: authPolicy,
  [generationPolicy.name]: generationPolicy,
  [chatPolicy.name]: chatPolicy,
};

/** */
export function resolvePolicy(name: string | undefined,): RatePolicy {
  if (name && policies[name]) { return policies[name]!; }
  return defaultPolicy;
}

/**
 * Route-prefix → policy. First matching prefix wins; anything else gets
 * the default policy.
 */
export const routePolicies: Array<[prefix: string, policy: RatePolicy,]> = [
  ["/api/v1/auth", authPolicy,],
  ["/api/v1/generation", generationPolicy,],
  ["/api/v1/chats", chatPolicy,],
  // BUG-seen-poller-starves-shared-default-rate-limit-bucket: the seen
  // poller N-GETs /api/v1/messages/:id/seen every 5s per open chat; without
  // this prefix those calls landed in the shared defaultPolicy bucket and a
  // >=26-message chat sustained >300 req/min → 429 storm + starvation of
  // every other unmatched route.
  ["/api/v1/messages", chatPolicy,],
];

/** */
export function policyForRoute(pathname: string,): RatePolicy {
  for (const [prefix, policy,] of routePolicies) {
    if (pathname.startsWith(prefix,)) { return policy; }
  }
  return defaultPolicy;
}
