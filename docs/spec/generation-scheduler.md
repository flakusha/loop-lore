<!-- SPDX-License-Identifier: Apache-2.0 OR MIT OR CC-BY-4.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Spec: Generation Scheduler

**Status:** Draft
**Epic:** epic-llm-request-scheduler.md

Normative design contract for the LLM Request Scheduler epic. The epic
(`.plan/epics/epic-llm-request-scheduler.md`) is rationale and history;
this doc is the build contract. On conflict, this doc wins for behavior,
the epic wins for scope.

Insertion point: `callWithFailover`
(`src/generation/providers/call-with-failover.ts:29`). Interactive and
auto-gen completions route through it; the scheduler sits in front of it
and decides *when* each request goes out. Aux issues a direct provider
call and bypasses it today — wiring it through the manager is part of the
first wiring ticket (§2). No second queue, no second dispatcher.

## 1. Problem

Immediate dispatch fails four ways once local + external + background
traffic share one process:

1. **Local swap slot budget.** `llama-swap` (spawned in
   `src/services/server-external-manager/start-llama.ts:167`, liveness-only
   probe in `probes.ts:73`) has a hard concurrent-slot budget. Unbounded
   dispatch overshoots into swap/OOM.
2. **External 429s.** Anthropic / OpenAI-compatible providers enforce
   per-key rate limits. Today a 429 surfaces as `ProviderRateLimitError`,
   is retried with backoff (`src/generation/providers/retry.ts:47`), and
   the caller sits through it. Nothing narrows dispatch beforehand.
3. **Aux vs interactive contention.** `aux-pipeline/runner.ts` and auto-gen
   cascades (`src/generation/auto-gen/call-llm.ts`) fire alongside interactive
   turns (`src/generation/generate-route/handler.ts`) contending on the
   same providers/GPU. Aux issues a direct provider call (bypassing
   `callWithFailover`); auto-gen and interactive route through it.
   FIFO-by-arrival lets a bulk classify job head-block a chat turn and
   vice versa. Embedding and rerank (`embed-provider.ts`, `rerank.ts`)
   bypass `callWithFailover` entirely and do not contend on this queue.
4. **VRAM contention.** A short `aux`-class task and a long-context scene
   share the same llama-swap slot budget with no ordering signal; the
   long run holds the slot while cheap work starves behind it.

What exists today gates aliveness, not order: `buildFailoverList`
(`src/generation/providers/registry.ts:173`) orders providers,
`CircuitBreaker.allowRequest/onFailure`
(`src/generation/providers/circuit-breaker.ts:72,117`) skips dead ones.
Nothing delays a live one.

## 2. Concepts

### requestClass taxonomy

`requestClass` is an explicit label set by the caller, not inferred.
Three call sites carry a class label:

| `requestClass` | Call site | Via |
|---|---|---|
| `interactive` | `src/generation/generate-route/handler.ts` (stream + non-stream paths) | `callWithFailover` |
| `auto-gen` | `src/generation/auto-gen/call-llm.ts` | `callWithFailover` |
| `aux` | `src/aux-pipeline/runner.ts` | direct `provider.complete` (bypasses `callWithFailover`; wiring needed) |

Embedding and rerank use dedicated llama.cpp transports (`embed-provider.ts`,
`rerank.ts`) that bypass `callWithFailover` entirely. They are not in scope
for this scheduler — they serve a single provider each and have no failover
contention to manage. A future pass may add a separate admission layer for
them if aux-class traffic proves saturating.

A call site that knows it is background work says so. The scheduler MUST
NOT guess class from prompt text.

### Priority derivation

Priority is a pure function evaluated before queueing:

```
priority = base(requestClass) + sizeTiebreak(promptTokens, maxTokens)
```

- `base`: `interactive` → `PriorityLevel.High` (0), `auto-gen` →
  `PriorityLevel.Normal` (100), `aux` → `PriorityLevel.Low` (200).
  Constants live in `src/llm/resource-manager-types.ts:14-18`; reuse them, do not redefine.
- `sizeTiebreak`: prompt tokens via existing `estimateTokens`
  (`src/chat/token-utils.ts:23`) plus requested `maxTokens` (slot-hold
  time proxy). Breaks ties *within* a class only; never promotes across
  classes.
- No LLM call during classification. A scheduler that needs an LLM call
  to decide whether to make an LLM call is a deadlock.

### Failover list input

`buildFailoverList` (`src/generation/providers/registry.ts`) emits an
ordered failover list per request. The scheduler treats that list as
opaque input: it orders *when* the list is attempted, never *which*
provider is first. Routing policy stays in the registry;
ordering/admission stays here (§7).

### ResourceManager role

`ResourceManager` (`src/llm/resource-manager.ts:45`) is the queue. Reuse
as-is:

- `submit({ id, provider, priority, run })` → `ScheduleHandle`
  `{ id, result, cancel(), state }` (`resource-manager-types.ts:23-43`).
- Per-provider `ConcurrencyLimiter` + `PriorityQueue` inside; FIFO within
  equal priority is the default tiebreaker.
- Lifecycle states come from `llmRequestStateMachine`
  (`src/llm/message-state-machine.ts`):
  `pending → queued → scheduled → generating → {complete|failed|cancelled}`.
- Ceiling stands: in-process, no persistence, no cross-process fairness
  (`resource-manager.ts:17-19`). Queued requests are lost on restart.

First wiring ticket constructs + injects one shared `ResourceManager` at
the `callWithFailover` call sites with priority defaulting to `Normal`
— behavior-preserving until classification lands.

## 3. Admission contract

Admission is a per-provider gate between dequeue and dispatch. It answers
"can the *target* take this now?" A busy remote API says nothing about a
free local GPU.

- **Local (llama-swap / llama.cpp): slot budget.** Capacity is a
  configured concurrent-slot count (`providerMax[provider]`), not a live
  VRAM probe on the hot path. Rationale: a per-request probe adds latency
  to the interactive path for a noisy signal the slot count already
  implies. Escape hatch: a periodic sampler may feed the slot count later;
  never a per-request syscall.
- **External (Anthropic / OpenAI-compatible): in-flight cap + windowed
  token budget.** Cap concurrent in-flight requests per provider; track a
  shared token budget per window (per-minute, per-day). Over-budget
  requests wait in queue, they do not fail.
- **FIFO default tiebreaker.** Within equal `(provider, priority)`,
  earliest arrival dispatches first. No aging, no preemption in v1.
- **Reactive 429 learning.** `ProviderRateLimitError` (and
  `circuitBreaker.onFailure` with `retryAfterMs`) proactively narrows the
  effective cap for that provider for the `Retry-After` window. Learning,
  not replacement: the circuit breaker stays the source of truth for
  aliveness; retry (`retry.ts:47`) stays the handler for transient faults.
  The scheduler only dispatches less while pressure lasts.
- **Cancellation is not failure.** An aborted `req.signal` propagates
  `GenerationCancelledError` without touching the breaker or triggering
  failover (existing `call-with-failover.ts:55-61` semantics preserved).

## 4. Config surface

One new block on `GenerationConfig`
(`src/config/schema/generation.ts:88`, currently no scheduling block).
Sketch — field names normative, defaults illustrative:

```yaml
generation:
  scheduler:
    defaultMax: 4                    # fallback slot cap per provider
    providerMax:                     # overrides; key = provider name
      local-llama-swap: 2
      anthropic: 8
    tokenBudgets:                    # external windowed budgets
      - provider: anthropic
        window: minute
        maxTokens: 100000
    priorityClass:                   # requestClass → PriorityLevel base
      interactive: 0
      auto-gen: 100
      aux: 200
    llamaSwap:
      configPath: configs/config.llama-swap.yaml  # overrides autoStart.llamaSwap.configPath
      excludedModels: []             # not-for-scheduled-traffic (§5)
```

Rules: env mapping for every field (config-load convention); schema
validation rejects unknown providers only at dispatch, never at parse
(typos fail soft to `defaultMax`). `transport.limits.maxConcurrentStreams`
(HTTP/2 framing) is unrelated and untouched.

## 5. Rotation/exclusion

llama-swap is a router over a GGUF model set, not a single model. The
scheduler needs minimum visibility, all read from the file the proxy
already boots with (`LlamaSwapAutoStartConfig.configPath`,
`src/config/schema/auto-start.ts:169-174`):

- **Model-set parse.** Parse model names from the swap config at startup;
  re-parse on config reload. loop-lore reads the file, never rewrites it.
- **Rotation.** A request may trigger a model load. Background `aux`-class
  work prefers the resident model over causing a swap; `interactive`
  and `auto-gen` traffic may trigger one. Preference only — never a
  hard pin that starves a class.
- **Exclusion.** `scheduler.llamaSwap.excludedModels` marks models kept
  warm for interactive-only use (or drafts under evaluation). Scheduled
  `aux`/`auto-gen` traffic is never dispatched to an excluded model;
  `interactive` traffic may use any model.
- **Contract first.** The user sample config is not final (only
  `configs/config.llama-swap.example.yaml` committed). The rotation ticket
  specifies the interface loop-lore needs; the sample finalizes against
  that contract, not vice versa.

## 6. Observability

Four metrics on the existing telemetry surface — `record` /
`isTelemetryEnabled` (`src/telemetry/service.ts:65,111`), fire-and-forget
like the autonomy scheduler (`src/autonomy/scheduler/telemetry.ts`):

| Metric (event type) | What |
|---|---|
| `scheduler.queue.depth` | queued count per `(provider, requestClass)` |
| `scheduler.queue.wait_ms` | dequeue − submit latency per dispatched request |
| `scheduler.admission.denied` | admission-gate deferrals per provider + reason (slot/token/429-narrowed) |
| `scheduler.rotation.swap` | model loads caused vs avoided, per model |

No new telemetry stack, no dashboard in this epic. Benches (§8, tickets
7–8) consume these events; they do not define new ones.

## 7. Non-goals

- **Routing policy.** `buildFailoverList`
  (`src/generation/providers/registry.ts`) owns which provider is primary
  and in what failover order. The scheduler owns ordering/admission only
  and MUST NOT reorder a failover list.
- **Replacing breaker/retry.** Breaker decides aliveness, retry handles
  transient faults, scheduler orders + admits. Three layers, three jobs.
- **Distributed scheduling.** Single-node, in-process. Multi-node belongs
  to `epic-distributed-compute-sharing.md`.
- **DB-backed queue / restart survival.** Lost-on-restart by design.
- **Second token estimator.** Reuse `estimateTokens`.
- **Per-request VRAM probing.** Periodic sampler feeding the slot count
  is the only sanctioned live signal.
- **Managing llama-swap's config format.** Read + layer policy; never
  rewrite the user's file.

## 8. Ticket map

| Ticket | Scope (one line) |
|---|---|
| `TASK-wire-llm-resource-manager-into-generation-dispatch` | Inject shared `ResourceManager` at `callWithFailover` sites, default `Normal`, no policy. |
| `FEAT-llm-request-complexity-classification` | Pure `requestClass` + score → priority; explicit class at the three call sites. |
| `FEAT-llm-scheduler-config-surface` | `[generation.scheduler]` block with env mapping + schema validation. |
| `FEAT-llm-resource-aware-admission-control` | Slot/token budgets + in-flight caps + reactive 429 narrowing. |
| `FEAT-llama-swap-rotation-exclusion-policy` | Parse swap model set; rotation preference + exclusion list for scheduled traffic. |
| `TASK-llm-scheduler-observability` | Queue depth / wait / denial / rotation events on `telemetry/service`. |
| `TASK-llm-generation-bench-via-local-llama-swap-opt-in` | Opt-in `LL_BENCH_LLM=1` p50/p95/p99 + token-rate bench vs local swap. |
| `TASK-scheduler-load-soak-bench-queued-llm-traffic` | Soak bench queued-vs-wired (mock first, swap variant after bench above). |

Sample-config finalization (`TASK-llama-swap-sample-config-finalization-*`)
is a prerequisite input to the rotation ticket, tracked alongside — not a
scheduler build ticket.
