<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Subagent LLM assignment (price/quality/capability) with a ranked followup list

**Status:** Research — feeds task candidates
**Date:** 2026-10-04
**Source tickets:** `.plan/tickets/TASK-harness-model-routing.md`, `.plan/tickets/TASK-harness-subagent-delegation.md`, `.plan/epics/epic-harness-integration.md` (§1 routing, §9 subagents)

## Question

The harness must assign each subagent task to the best-fit model, not the config-order
first model. Best-fit means a combined **price + quality + capability** judgement, plus a
bounded **ranked followup list** (~5 variants) used when the first choice is rate-limited
or its provider is unavailable. What does the existing router already do, what is
missing, and how should the followup list compose with the provider failover tail
without duplicating it?

## Findings

### What exists today

- `ModelRouter.route(signal, candidates)` is a pure function of
  `(signal, candidates, config)` — no clock, no network, no randomness
  (`src/generation/routing/router.ts:7-16`, `:72-113`). It (a) filters eligibility on
  required capabilities and context window (`router.ts:80-87`), (b) picks a strategy from
  the per-task-type rule or the global default (`router.ts:89-90`), (c) orders by
  `capability-match` (no-op), `cheapest`, `fastest`, or `round-robin`
  (`router.ts:93-107`), and (d) caps the fallback tail at `config.fallbacks`
  (`router.ts:111-112`).
- `RoutableModel` carries `capabilities`, `costPer1kTokens`, `avgLatencyMs`,
  `contextWindow`, `maxOutputTokens` — **no quality field** (`router.ts:21-36`).
- Strategies are the closed union `"capability-match" | "cheapest" | "fastest" |
  "round-robin"` (`routing-config.ts:12`); policy is `GenerationRoutingConfig {
  strategy; fallbacks?; rules? }` (`routing-config.ts:23-30`), wired at
  `config.generation.routing` (`src/config/schema/generation.ts:111-112`).
- `TaskSignal` already carries `taskType`, `contextSize?`, `estimatedTokens?`,
  `requiresCapabilities?`, `priority?`, `budgetMs?`, `budgetTokens?`
  (`src/generation/routing/task-signal.ts:27-41`).
- `ProviderCapabilities` carries the same four optional metrics
  (`src/generation/providers/types.ts:15-40`); it is the only place model metadata lives.
- `buildFailoverList(primaryName, config, signal)` builds `[primary, ...other configured
  providers]` and reorders **only the tail** through the router; the caller's primary is
  pinned first (`src/generation/providers/registry.ts:188-238`, esp. `:222-224` and
  `:237`).
- `callWithFailover(providers, req, handler)` walks that list sequentially, skips open
  circuits (`src/generation/providers/call-with-failover.ts:76-82`), records failures with
  `Retry-After` into the circuit breaker (`:107`), and throws only after every entry
  failed (`:112-117`).
- `ProviderError` carries `statusCode`, `retryable`, `retryAfter`; `ProviderRateLimitError`
  is the 429/retryable subclass (`providers/types.ts:145-194`).
- The circuit breaker tracks per-provider state and honors a `Retry-After` cooldown
  (`src/generation/providers/circuit-breaker.ts:44-187`, `onFailure` `:117-138`,
  `getState`/`getAllStates` `:158-186`).
- The exec log already records one row per egress call and rolls up **per-model failure
  counts** (`src/harness/exec-recorder.ts:98-100`; `HarnessByModel { runs, failures, avgMs,
  costUsd, tokensIn, tokensOut }` at `src/harness/read-models.ts:73-82`; rollup in
  `src/harness/stats.ts:78-148`).
- `resolveModelRole` is a static 3-tier resolver (DB → config → server default) that
  returns exactly one provider+model per role (`src/admin/model-roles.ts:53-100`); it has
  no ranking and no followup.

### Gap analysis (subagent assignment)

| # | Gap | Evidence |
|---|---|---|
| a | **No quality axis.** Every strategy optimises cost or latency; `quality` does not exist on `RoutableModel` or `ProviderCapabilities`. A price/quality/capability score cannot be expressed. | `router.ts:21-36`, `:93-107`; `types.ts:15-40` |
| b | **No bounded ranked followup list distinct from provider failover.** `RouteResult.fallbacks` is the provider-instance chain, capped by `config.fallbacks` (`router.ts:39-42`, `:111-112`). It is consumed verbatim by `callWithFailover` via `buildFailoverList`. There is no "≤5 model variants" layer, and the primary is never re-ranked by the router (`registry.ts:222-224`, `:237`). | `router.ts:38-42`; `registry.ts:220-237` |
| c | **Rate-limit / unavailability does not feed re-rank.** `route()` is pure by contract (`router.ts:7-8`), takes no health input, and `ProviderRateLimitError.retryAfter` is used only as a circuit cooldown (`call-with-failover.ts:107`; `circuit-breaker.ts:117-138`). A 429'd model keeps its rank; the next candidate is simply the next precomputed entry. | `router.ts:72`; `call-with-failover.ts:107` |

The epic already commits to the reuse-first shape: routing *policy* on top of the
scheduler, no second scheduler (`epic-harness-integration.md:48`, `:65-83`), and subagent
delegation layered above `TurnManager`/`turn-selector`, never a parallel scheduler
(`:203-210`). Subagent assignment therefore extends the router; it does not add a second
one.

### External prior art (how each handles a bounded fallback list)

- **LiteLLM model-group routing.** A `model_name` alias load-balances across deployments;
  strategies are `simple-shuffle` (weighted by rpm/tpm, the default), latency-based,
  least-busy, and usage-based ("lowest TPM usage for that minute" — rate-limit aware)
  ([routing](https://docs.litellm.ai/docs/routing)). Failover is ordered, in-order
  fallbacks to *another model group* ([reliability](https://docs.litellm.ai/docs/proxy/reliability)).
  The weighted-failover hop chain keeps an exclusion set that accumulates across hops and
  is **capped by `max_fallbacks` (default 5)**; cooldowns apply independently via
  `allowed_fails`/`cooldown_time`, and `AllowedFailsPolicy`/`RetryPolicy` can tune
  cooldown and retry count per error type ([routing](https://docs.litellm.ai/docs/routing)).
  *Takeaway:* the bound (5) and the exclusion-set semantics are the direct precedent for a
  ≤5 followup list.
- **OpenRouter provider routing.** Default strategy: (1) prioritise providers with no
  significant outages in the last 30s, (2) among stable providers pick lowest-cost
  weighted by inverse-square of price, (3) remaining providers are fallbacks. `sort` is
  `price|throughput|latency`; `order` is explicit; `allow_fallbacks` toggles the tail;
  `max_price` caps spend; `preferred_max_latency`/`preferred_min_throughput` are
  percentile thresholds that *soft-reorder without failing closed*
  ([provider-selection](https://openrouter.ai/docs/guides/routing/provider-selection),
  [latency guide](https://openrouter.ai/docs/guides/best-practices/latency-and-performance.md)).
  Model fallbacks use a `models` array; `sort.partition: "model"|"none"` decides whether
  each model's providers are grouped or pooled
  ([latency guide](https://openrouter.ai/docs/guides/best-practices/latency-and-performance.md)).
  Tool-calling requests route through "Auto Exacto", a quality-first step that tiers
  providers by tool-call quality signals
  ([model-routing](https://openrouter.ai/blog/insights/model-routing/)).
  *Takeaway:* health-aware ordering ("no outage in last N seconds") plus a soft quality
  tier is exactly the (a)+(c) combination we need; `partition` is the precedent for not
  mixing the model layer with the provider layer.
- **Portkey.** Three composable strategies: `conditional` (rule tree over
  metadata/params/url path → named targets), `loadbalance` (weighted targets, optional
  sticky sessions), and `fallback` (ordered targets, triggerable `on_status_codes: [429]`)
  ([conditional](https://portkey.ai/docs/product/ai-gateway/conditional-routing),
  [fallbacks](https://portkey.ai/docs/product/ai-gateway/fallbacks.md),
  [load-balancing](https://portkey.ai/docs/product/ai-gateway/load-balancing.md)).
  Strategies nest: a fallback target can itself be a load balancer or conditional router
  ([fallbacks](https://portkey.ai/docs/product/ai-gateway/fallbacks.md)). Semantic routing
  classifies intent and routes to the model with the best quality-to-cost ratio
  ([routing techniques](https://portkey.ai/blog/llm-routing-techniques-for-high-volume-applications)).
  *Takeaway:* the layer composition is the model for composing a model-variant followup
  list over the existing provider failover chain; `on_status_codes: [429]` is the explicit
  re-rank trigger.

## Recommendation (design sketch, reuse-first)

Two layers, one ranking key, no duplicate chains.

**Layer 1 — model variant (new, small).** Extend the router, don't replace it:

1. Extend `RoutableModel` (`router.ts:21-36`) and `ProviderCapabilities`
   (`types.ts:15-40`) with `quality?: number` (0–1, absent = unknown). Populate it from
   provider metadata where available; otherwise leave absent and rank last, preserving the
   existing unknown-metadata rule (`router.ts:99`).
2. Add a `balanced` strategy to `ModelRoutingStrategy` (`routing-config.ts:12`) and
   `ROUTING_STRATEGIES` (`router.ts:45-50`). Scoring (design proposal, not shipped):
   `score = wCost·normCost + wQuality·(1 − quality) + wLatency·normLatency + healthPenalty`,
   with capability/context fit staying a **hard filter** in `route()`
   (`router.ts:80-87`) rather than a score term. Unknown fields contribute a
   last-place sentinel, as `cheapest`/`fastest` already do (`router.ts:100-104`).
3. Add `followup?: number` (default 5) to `GenerationRoutingConfig`
   (`routing-config.ts:23-30`) — a bound on **model variants**, distinct from the existing
   `fallbacks` bound on provider instances.

**Layer 2 — provider instance (existing, unchanged).** For whichever variant is chosen,
`buildFailoverList` (`registry.ts:188-238`) keeps building the provider-instance chain with
its own tail and cap. A followup entry is a *different model variant*, never another
instance of the same model — de-dup key is the resolved model id, so the two chains cannot
repeat each other.

**Ranked-followup semantics.**

- **Ordering key:** the `balanced` composite above, tie-broken by input index for
  determinism (same pattern as `router.ts:106`).
- **When re-rank happens:** *per call* the ranking stays pure and reproducible, exactly as
  today (`router.ts:7-8`) — the followup list is computed from the current health
  snapshot. *Per rate-limit/unavailable event* the snapshot changes (circuit breaker
  records the 429 + `retryAfter`, `call-with-failover.ts:107`,
  `circuit-breaker.ts:117-138`), and the next dispatch recomputes the list; the demoted
  variant falls behind healthy ones. There is **no in-request re-rank**: once a request
  starts, walking the precomputed chain is the provider failover loop's job
  (`call-with-failover.ts:76-110`), so a mid-request demotion would duplicate that walk.
- **Health input:** a read-only snapshot from `circuitBreaker.getState`/`getAllStates`
  (`circuit-breaker.ts:158-186`) plus the exec log's per-model failure rate
  (`HarnessByModel.failures`, `read-models.ts:73-82`). Both already exist; no new store.
- **Composition with the provider tail:** Layer 1 picks the variant; Layer 2 expands that
  variant's instance chain only when it is actually tried. Total attempts = (≤5 variants)
  × (that variant's provider tail), each layer bounded by its own config knob — the
  LiteLLM `max_fallbacks`/OpenRouter `allow_fallbacks` split applied one layer up.

Proposed seam: a new `rankSubagentModels(signal, candidates, health)` in
`src/generation/routing/` returning `{ primary, followup: RoutableModel[] }`, consumed by
the delegation path (`SubagentTask`, `TASK-harness-subagent-delegation.md:16-19`); the
existing `route()` stays as the provider-instance tail sorter used by
`buildFailoverList`.

## Task candidates

1. **TASK-harness-router-quality-axis — add a quality term and a `balanced` strategy.**
   *Why:* gaps (a); the router can only optimise cost/latency today.
   *Acceptance criteria:* `RoutableModel.quality?` and `ProviderCapabilities.quality?`
   exist and flow through `buildFailoverList` (`registry.ts:226-234`); `"balanced"` is a
   member of `ModelRoutingStrategy` (`routing-config.ts:12`) and `ROUTING_STRATEGIES`
   (`router.ts:45-50`); `ModelRouter.route` (`router.ts:72-113`) orders by the composite
   with deterministic index tie-break; unknown quality sorts last (mirrors
   `router.ts:99-104`); unit tests in `router.test.ts` for ordering, unknown-metadata, and
   determinism.
   *Related files:* `src/generation/routing/router.ts`, `routing-config.ts`,
   `src/generation/providers/types.ts`, `src/generation/providers/registry.ts`.

2. **TASK-harness-subagent-followup-ranking — bounded ≤5 ranked followup + health re-rank.**
   *Why:* gaps (b) and (c); subagent fallback needs a model-variant list and must react to
   429/unavailable.
   *Acceptance criteria:* `rankSubagentModels(signal, candidates, health)` returns
   `{ primary, followup }` with `followup.length ≤ config.generation.routing.followup`
   (default 5); health snapshot is read from `circuitBreaker.getState/getAllStates`
   (`circuit-breaker.ts:158-186`); a rate-limited variant is demoted on the next call;
   followup entries de-dup by resolved model id so they never duplicate a provider chain;
   tests cover cap, de-dup, and re-rank-after-429.
   *Related files:* `src/generation/routing/` (new function), `src/generation/providers/circuit-breaker.ts`,
   `src/harness/read-models.ts`, `src/generation/providers/registry.ts`.

3. **TASK-harness-subagent-assignment-wiring — consume the followup list in delegation.**
   *Why:* the ranked list is inert until the subagent dispatch uses it; ties to the
   delegation ticket.
   *Acceptance criteria:* the delegation path assigns each `SubagentTask`
   (`TASK-harness-subagent-delegation.md:16-19`) via `rankSubagentModels`, then builds
   its provider chain through `buildFailoverList`; exec log records the chosen variant
   (`exec-recorder.ts:98-100`); an integration test asserts variant-then-provider ordering
   with no duplicated attempts.
   *Related files:* `.plan/tickets/TASK-harness-subagent-delegation.md` (target files),
   `src/generation/routing/`, `src/generation/providers/registry.ts`,
   `src/harness/exec-recorder.ts`.

## Open questions

- Where does `quality` come from? No in-repo source today; options are provider metadata
  (`ModelInfo`, `types.ts:203-222`), an admin table, or a static preset. Until one exists,
  `balanced` degenerates to cost+latency — acceptable, but the source must be decided
  before quality routing means anything. `[INFERENCE]`
- Should the followup cap reuse `config.generation.routing.fallbacks` or stay a separate
  `followup` key? A separate key avoids conflating model variants with provider instances,
  but adds a knob. `[INFERENCE]`
- Does the scheduler (`epic-llm-request-scheduler.md`) re-rank on admission, or does the
  router only produce the order the scheduler consumes? The epic says "router output feeds
  it" (`epic-harness-integration.md:365-367`); the re-rank boundary must be pinned when the
  scheduler lands.

## Sources

- Repo: `src/generation/routing/router.ts`, `routing-config.ts`, `task-signal.ts`;
  `src/generation/providers/types.ts`, `registry.ts`, `call-with-failover.ts`,
  `circuit-breaker.ts`, `retry.ts`; `src/harness/exec-recorder.ts`, `read-models.ts`,
  `stats.ts`; `src/config/schema/generation.ts`; `src/admin/model-roles.ts`.
- Plan: `.plan/tickets/TASK-harness-model-routing.md`,
  `.plan/tickets/TASK-harness-subagent-delegation.md`,
  `.plan/epics/epic-harness-integration.md`, `.plan/epics/epic-llm-request-scheduler.md`.
- LiteLLM — Router / load balancing: https://docs.litellm.ai/docs/routing
- LiteLLM — Fallbacks (provider failover): https://docs.litellm.ai/docs/proxy/reliability
- OpenRouter — Provider routing: https://openrouter.ai/docs/guides/routing/provider-selection
- OpenRouter — Latency and performance: https://openrouter.ai/docs/guides/best-practices/latency-and-performance.md
- OpenRouter — How model routing works: https://openrouter.ai/blog/insights/model-routing/
- Portkey — Conditional routing: https://portkey.ai/docs/product/ai-gateway/conditional-routing
- Portkey — Fallbacks: https://portkey.ai/docs/product/ai-gateway/fallbacks.md
- Portkey — Load balancing: https://portkey.ai/docs/product/ai-gateway/load-balancing.md
- Portkey — LLM routing techniques: https://portkey.ai/blog/llm-routing-techniques-for-high-volume-applications

