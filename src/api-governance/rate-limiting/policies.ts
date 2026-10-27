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

/**
 * Server-side outbound fetches: GET /api/v1/chats/:id/link-preview performs
 * a remote fetch of a caller-chosen URL on every cache miss (S-12), so its
 * budget must sit far below chat UI volume — 300/min would make the instance
 * an open relaying fetcher. 30/min with burst 10 absorbs one rendered
 * back-log of links at once yet stays an order of magnitude under the chat
 * read budget; the 7-day preview cache keeps repeat renders free.
 */
export const outboundFetchPolicy: RatePolicy = {
  name: "outbound-fetch",
  windowMs: 60_000,
  max: 30,
  burst: 10,
};

/** Registry of all named policies. */
export const policies: Record<string, RatePolicy> = {
  [defaultPolicy.name]: defaultPolicy,
  [authPolicy.name]: authPolicy,
  [generationPolicy.name]: generationPolicy,
  [chatPolicy.name]: chatPolicy,
  [outboundFetchPolicy.name]: outboundFetchPolicy,
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
 * the default policy. `prefix` (default) matches on segment boundaries —
 * the path itself or any segment beneath it (`path === pattern` or
 * `path.startsWith(pattern + "/")`), so `/api/v1/authx` does NOT classify
 * as auth. `suffix` matches `endsWith` — for generation routes nested
 * under an id-bearing path no prefix rule can reach.
 */
export const routePolicies: Array<[pattern: string, policy: RatePolicy, match?: RouteMatch,]> = [
  ["/api/v1/auth", authPolicy,],
  // BUG-chat-sse-shares-generation-rate-bucket: the chat generation stream
  // GET /api/v1/generation/stream/:chatId is a read on an open SSE, not a
  // billable generation call. First-match wins, so this exception MUST stay
  // above the /api/v1/generation prefix — otherwise the prefix claims the
  // stream and ~5 turns/reconnects per minute exhaust the 20/min burst-5
  // LLM/image budget. Prefix (not suffix): the path carries a trailing
  // chatId, so endsWith can never match. Other generation/* stays generation.
  ["/api/v1/generation/stream", chatPolicy,],
  ["/api/v1/generation", generationPolicy,],
  // ── Suffix rules — kept ABOVE the prefix rules on purpose ──────────────
  // First-match wins: every path below is nested under /api/v1/chats/:id/…
  // (or an id-bearing parent), so a suffix rule placed after the
  // /api/v1/chats prefix rule is DEAD — the prefix claims the path first and
  // bills an expensive call as chat UI volume. The /story + /vn rules sat in
  // exactly that dead spot until the guard-scope fix (S-6); the wiring tests
  // now pin each rule through the real mounted surface.
  // BUG-ai-action-billable-llm-endpoint-classified-300-min-chatpolic (S-5):
  // POST /api/v1/chats/:id/messages/:messageId/ai-action runs an
  // auxiliary-model call per request — generation budget, not chat volume.
  ["/ai-action", generationPolicy, "suffix",],
  // S-12: GET /api/v1/chats/:id/link-preview performs a server-side fetch of
  // a caller-chosen URL on cache miss — dedicated outbound-fetch budget.
  ["/link-preview", outboundFetchPolicy, "suffix",],
  // S-6: story LLM turns live at /api/v1/chats/:id/story/{step,resume} since
  // the versioned remount; each is a full GM turn through an LLM provider.
  ["/story/step", generationPolicy, "suffix",],
  ["/story/resume", generationPolicy, "suffix",],
  ["/vn/generate-story", generationPolicy, "suffix",],
  ["/vn/generate-choices", generationPolicy, "suffix",],
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
  // BUG-rate-limit-misses-generation-endpoints: these generation POSTs are
  // nested under id-bearing paths, so no prefix rule reaches them and they
  // fall through to defaultPolicy (300/min) despite calling LLM/image-gen
  // services. Each suffix matches only the generation endpoint; sibling
  // read/list/status paths stay on their current policy.
  ["/image-edit/run", generationPolicy, "suffix",],
  ["/comfyui-builder/runs", generationPolicy, "suffix",],
  ["/proactive-messaging/send", generationPolicy, "suffix",],
  // ── Prefix rules — steady-state UI buckets, evaluated after the suffix ──
  // exceptions above.
  ["/api/v1/chats", chatPolicy,],
  // BUG-seen-poller-starves-shared-default-rate-limit-bucket: the seen
  // poller N-GETs /api/v1/messages/:id/seen every 5s per open chat; without
  // this prefix those calls landed in the shared defaultPolicy bucket and a
  // >=26-message chat sustained >300 req/min → 429 storm + starvation of
  // every other unmatched route.
  ["/api/v1/messages", chatPolicy,],
];

/**
 * Match a route pathname to its policy.
 * @param {string} pathname
 * @returns {RatePolicy}
 */
export function policyForRoute(pathname: string,): RatePolicy {
  for (const [pattern, policy, match = "prefix",] of routePolicies) {
    // Segment-boundary prefix match: a path like /api/v1/authx is not an
    // auth route and must not eat into the auth budget shared with real
    // /api/v1/auth/* traffic.
    const hit = match === "suffix"
      ? pathname.endsWith(pattern,)
      : pathname === pattern || pathname.startsWith(`${pattern}/`,);

    if (hit) { return policy; }
  }

  return defaultPolicy;
}
