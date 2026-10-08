// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Named rate-limit policies (epic-api-rate-limiting).
 *
 * Steady state = sliding window; `burst` adds a token bucket so short
 * spikes above steady state are absorbed without changing the window cap.
 */

/** Named rate limit policy configuration. */
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

/** Registry of all named policies. */
export const policies: Record<string, RatePolicy> = {
  [defaultPolicy.name]: defaultPolicy,
  [authPolicy.name]: authPolicy,
  [generationPolicy.name]: generationPolicy,
  [chatPolicy.name]: chatPolicy,
};

/**
 * Resolve a policy by name, falling back to default.
 * @param {string | undefined} name
 * @returns {RatePolicy}
 */
export function resolvePolicy(name: string | undefined,): RatePolicy {
  if (name && policies[name]) { return policies[name]!; }
  return defaultPolicy;
}

/** How a rule pattern is compared against the request pathname. */
export type RouteMatch = "prefix" | "suffix";

/**
 * Route-pattern → policy. First matching rule wins; anything else gets
 * the default policy. `prefix` (default) matches `startsWith`; `suffix`
 * matches `endsWith` — for generation routes nested under an id-bearing
 * path no prefix rule can reach.
 */
export const routePolicies: Array<[pattern: string, policy: RatePolicy, match?: RouteMatch,]> = [
  ["/api/v1/auth", authPolicy,],
  ["/api/v1/generation", generationPolicy,],
  ["/api/v1/chats", chatPolicy,],
  // BUG-seen-poller-starves-shared-default-rate-limit-bucket: the seen
  // poller N-GETs /api/v1/messages/:id/seen every 5s per open chat; without
  // this prefix those calls landed in the shared defaultPolicy bucket and a
  // >=26-message chat sustained >300 req/min → 429 storm + starvation of
  // every other unmatched route.
  ["/api/v1/messages", chatPolicy,],
  // BUG-emotion-avatar-emotions-array-uncapped-x-default-rate-policy: batch
  // avatar generation is POST /api/v1/actors/:actorId/emotion-avatars (and the
  // wardrobe variant) — nested under an id, so no prefix rule ever reached it
  // and each request fanned out image-gen jobs inside the shared 300/min
  // default bucket. This suffix hits exactly the generation POSTs: the job
  // list/status/cancel paths end with `/jobs…` and stay unmatched.
  ["/emotion-avatars", generationPolicy, "suffix",],
  // BUG-rate-limit-misses-post-emotion-avatars-single: the wardrobe
  // single-generation endpoint POST /api/v1/actors/:actorId/wardrobe/:itemId/emotion-avatars/single
  // ends with /single, so the /emotion-avatars suffix rule above misses it and
  // it falls through to defaultPolicy (300/min) despite calling the same
  // startBatchGeneration() fan-out as the batch endpoint.
  ["/emotion-avatars/single", generationPolicy, "suffix",],
];

/**
 * Match a route pathname to its policy.
 * @param {string} pathname
 * @returns {RatePolicy}
 */
export function policyForRoute(pathname: string,): RatePolicy {
  for (const [pattern, policy, match = "prefix",] of routePolicies) {
    const hit = match === "suffix" ? pathname.endsWith(pattern,) : pathname.startsWith(pattern,);
    if (hit) { return policy; }
  }

  return defaultPolicy;
}
