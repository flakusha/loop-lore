<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: LLM Request Scheduler — Complexity, Resources, Model Rotation

**Status:** Proposed
**Status Note:** Proposed 2026-09-28; supersedes the scheduling half of `epic-llm-queue.md` (see Reconciliation)
**Priority:** high
**Effort:** Large
**Type:** Feature Epic
**Tags:** llm, scheduler, queue, concurrency, llama-swap, admission-control, cost
**Overview:** (see sections below)

## Summary

Every LLM completion in loop-lore is issued the moment it is requested.
`callWithFailover` (`src/generation/providers/call-with-failover.ts:25`) is the single
point where the request actually goes out, and it fires immediately — the only
admission logic in front of it is a circuit-breaker gate that *skips dead* providers,
never one that *delays live* ones.

That is fine for one chat, one user, one remote API. It stops being fine the moment
several of these are true at once:

- a local `llama-swap` proxy, which rotates between loaded GGUF models and has its own
  model-load latency and a hard concurrent-slot budget;
- an external API (Anthropic / OpenAI-compatible) with per-key rate limits and quotas;
- background pipelines (`aux-pipeline`, auto-gen cascades, `memory/embeddings`,
  `memory/rerank`) that fire alongside interactive chat turns;
- a mixed fleet where a "cheap" request and an "expensive" request both land on the
  same local GPU and contend for the same VRAM.

The result is predictable and bad: interactive turns queue behind aux classification
jobs (and vice versa), local concurrency overshoots into swap/OOM, external calls trip
429s and the caller sits through the whole retry backoff, and there is no way to say
"this request is trivial, this one is a 32k-token scene — run them in that order."

This epic adds a **scheduler** in front of `callWithFailover` that decides *when* each
request goes out, combining three inputs that are currently ignored:

1. **Arrival order** — preserve today as the default tiebreaker (FIFO).
2. **Request complexity** — classify each request (interactive turn vs. aux classify
   vs. embedding vs. long-context scene) and derive a priority from it, so cheap
   high-frequency work never starves behind one expensive long run.
3. **Available resources** — admit only what the target can actually serve right now:
   local machine (VRAM/RAM headroom, llama-swap loaded-model set, concurrent-slot
   budget) and external API (remaining quota, in-flight count, observed 429 pressure).

and, for the local path specifically, honours **llama-swap's model rotation and
exclusion rules** rather than treating it as a dumb OpenAI-compatible base URL.

## Rationale

### The scheduler already exists in the repo — unwired

`src/llm/` is a complete, tested, **orphaned** scheduling slice:

| Module | Size | Tests | Consumers |
|---|---|---|---|
| `concurrency-limiter.ts` | 3.3K | `concurrency-limiter.test.ts` | **0** |
| `priority-queue.ts` | 3.8K | `priority-queue.test.ts` | **0** |
| `resource-manager.ts` | 7.8K | `resource-manager.test.ts` | **0** |
| `resource-manager-types.ts` | 1.7K | — | **0** |
| `message-state-machine.ts` | 2.5K | `message-state-machine.test.ts` | **0** |
| `internal-handle.ts` | 2.3K | — | **0** |
| `running-handles.ts` | 1.6K | — | **0** |
| `index.ts` (barrel) | 850B | — | **0** |

Its own header comment states the intent verbatim
(`src/llm/resource-manager.ts:13-15`):

> The executor is injected so the resource manager doesn't depend on the provider
> registry. Wiring this into the existing `callWithFailover` happens at the route/service
> call site.

That call site was never written. `ResourceManager.submit()` already accepts
`{ id, provider, priority, run }` and already returns a handle with
`{ result, cancel(), state }`; `PriorityLevel` already defines `High/Normal/Low`;
`llmRequestStateMachine` already encodes `pending → queued → scheduled → generating →
{complete|failed|cancelled}` with pause/resume. **None of it is reachable from a
request.** This epic's first ticket is therefore not "build a queue" — it is "plug in
the queue that is already built", which collapses the largest single chunk of work.

The module even carries an explicit ceiling comment
(`src/llm/resource-manager.ts:17-19`):

> ponytail: in-process, no persistence, no fairness across processes.
> Add DB-backed queue + cross-instance coordination when restart-survival
> or multi-node scheduling matters.

That escalation is *not* in scope here (it belongs to `epic-federation-swarm-sync.md` /
`epic-distributed-compute-sharing.md`), but the ceiling is stated here so nobody
mistakes the wired version for a distributed one.

### What exists today, and what it does not

| Concern | State | Evidence |
|---|---|---|
| Single dispatch choke point | ✅ | `callWithFailover` `src/generation/providers/call-with-failover.ts:25` |
| Per-provider failover | ✅ | `buildFailoverList` `src/generation/providers/registry.ts:173`; sequential `for` loop over providers |
| Circuit breaker (skip dead) | ✅ | `src/generation/providers/circuit-breaker.ts:44`, `onFailure` `:117`, honors `Retry-After` |
| Retry w/ backoff | ✅ | `src/generation/providers/retry.ts:47`; 429 → `ProviderRateLimitError` in all three HTTP drivers |
| Concurrency cap | ❌ | none on the dispatch path; `ConcurrencyLimiter` exists but is never imported outside its own tests |
| Queueing / priority | ❌ | `PriorityQueue` + `ResourceManager` exist, zero consumers |
| Complexity classification | ❌ | no `complexity` field on `GenerateRequest`; `tokenCount` is a *context-window* concept (`src/chat/context-stats.ts:48`), not a scheduling one |
| Resource-aware admission | ❌ | nothing reads local VRAM/RAM, nothing reads external quota before dispatch |
| llama-swap rotation awareness | ❌ | llama-swap is spawned as a subprocess (`src/services/server-external-manager/start-llama.ts:167`) and probed only for liveness (`probes.ts:73`); its model set is opaque |
| Scheduler config surface | ❌ | `GenerationConfig` (`src/config/schema/generation.ts:88`) has no scheduling block; only `transport.limits.maxConcurrentStreams` (HTTP/2 framing) exists |

The two halves of the problem are therefore genuinely missing: **ordering** (priority,
complexity) and **admission** (resources, quota, local model fit). The third —
llama-swap rotation/exclusion — is a local-path special case of admission.

## Design Direction

One insertion point, three inputs, one decision. Deliberately minimal:

```mermaid
flowchart LR
  R["request"] --> C["classify complexity<br/>→ priority"]
  C --> Q["ResourceManager queue<br/>(FIFO within priority)"]
  Q --> A{"admit?"}
  A -- "resources available" --> F["callWithFailover"]
  A -- "no capacity" --> Q
  F --> LS["llama-swap rotation/exclusion<br/>(local providers only)"]
```

### 1. Complexity → priority

Classification is a pure function of the request, evaluated before queueing. Inputs
available at `callWithFailover` time: caller kind (interactive generate / auto-gen
cascade / aux pipeline / embedding / rerank), estimated prompt tokens, requested max
output, and whether streaming is expected. **No LLM call is made to classify** — a
scheduler that needs an LLM call to decide whether to make an LLM call is a deadlock.

The ladder, cheapest signal first:

- **Caller class** — an explicit `requestClass` set at the existing call sites
  (`generate-route/handler.ts:57`, `auto-gen/call-llm.ts:89`, `aux-pipeline/runner.ts`,
  `memory/embeddings.ts`, `memory/rerank.ts`). This is the dominant signal and costs
  nothing; everything below only breaks ties within a class.
- **Prompt size** — reuse the existing `estimateTokens` (`src/chat/token-utils.ts`)
  rather than writing a second estimator.
- **Requested output budget** — a 4k-token scene outranks a 64-token classifier at
  equal prompt size, because it holds the slot longer.

Explicit caller class beats inference. A call site that already knows it is a
background classifier should say so, not have the scheduler guess from a prompt.

### 2. Resources → admission

Admission is a gate between dequeue and dispatch. It answers "can the *target* take
this now?" and is scoped per provider, because a busy remote API says nothing about a
free local GPU.

- **Local (llama-swap / llama.cpp):** capacity is a configured concurrent-slot count,
  not a live VRAM probe on the hot path. A synchronous per-request probe would add
  latency to the interactive path for a signal that is noisy and already implied by the
  slot count. If live headroom is wanted later it is a periodic sampler feeding the
  slot count, not a per-request syscall — and that is exactly the "leave the
  calibration knob" case: the slot count is the knob.
- **External API:** in-flight cap per provider, plus a shared-token budget per window
  (per-minute, per-day). A 429 from the provider is a *reactive* signal — the existing
  circuit breaker and retry loop already handle it — and it should also *proactively*
  narrow the effective cap for that provider, so the scheduler learns instead of
  repeating the penalty. Learning, not replacement: the breaker stays the source of
  truth for "is this provider alive".

### 3. llama-swap rotation and exclusion

llama-swap is a *router* in front of a set of GGUF models, not a single model. Today
loop-lore addresses it as one opaque OpenAI-compatible base URL
(`start-llama.ts:167-203` spawns it; `probes.ts:73` only checks liveness), so
llama-swap picks a model per request behind our back, and its load latency and slot
budget are invisible to us.

The scheduler needs a small amount of visibility to schedule against it:

- **Known model set** — parsed from the same `configPath` the process is spawned with
  (`LlamaSwapAutoStartConfig.configPath`, `src/config/schema/auto-start.ts:169-174`).
  One file, already on disk, already in config. No new discovery mechanism.
- **Rotation** — whether a request may cause a model swap, and whether a swap is
  worth its latency for a request this cheap. Cheap aux work should prefer the model
  already resident over triggering a load.
- **Exclusion** — models the user has marked as not-for-scheduled-traffic (e.g. a
  model kept warm for interactive chat only, or a draft/quantisation under
  evaluation). The user's own llama-swap sample config is the input here; the
  exclusion list is loop-lore's own config layered on top, not a rewrite of theirs.

The user's prepared sample config is explicitly **not yet final** ("a bit of
ironing-out left"). The first ticket in this area therefore specifies the *interface*
loop-lore needs from a llama-swap config, so the eventual config lands against a
written contract rather than against whatever shape it happens to have.

## Relationship to Existing Epics (Reconciliation)

Four epics touch this territory. Ownership is assigned here so the scheduler is built
once:

| Epic | Owns | This epic's stance |
|---|---|---|
| `epic-llm-queue.md` | The **original** request-throttling proposal: `src/llm/queue.ts`, `src/llm/state-machine.ts`, `src/db/schema-queue.ts`, `src/routes/queue.ts`, scheduling UI | **Superseded.** Every file it names under `src/llm/` already exists under a different name (`queue.ts` → `resource-manager.ts`, `state-machine.ts` → `message-state-machine.ts`) and the DB/UI layers are unspecific to a single scheduler. Its one unique idea — `scheduled`/`paused` message states — is already implemented in `llmRequestStateMachine`. Recommend folding its remaining intent (queue UI, restart survival) into this epic as later tickets. |
| `epic-generation-flow-control.md` | **Hold** (pause/kill-switch) and **regulation** (route-level rate limiting, per-user/per-chat concurrency) | **Sibling, upstream.** That epic is the gate *before* the scheduler: it decides whether a request is allowed to be made at all (paused chat, global kill switch, 429). This epic decides the *order* among requests that passed. Neither reimplements the other. Its `FEAT-generation-rate-limiting-and-concurrency-limits` ticket is the natural first consumer of the wired `ResourceManager`. |
| `epic-distributed-compute-sharing.md` | Cross-machine node registry, dispatch, rewards, trust | **Downstream consumer.** Its "capability-filtered FIFO + priority" dispatcher is the same decision this epic makes locally, at larger scale. This epic stays in-process and single-node (per the `resource-manager.ts:17` ceiling); that epic's `distributed` provider becomes one more provider name in this epic's registry when it lands. |
| `epic-actor-autonomy-story-drive.md` | Autonomous actor dispatch + its own budget governor | **Consumer.** Already documented as a governed consumer of generation flow control; it is equally a governed consumer of this scheduler — the autonomy governor stacks actor budgets *on top* of scheduling priority, and must not reimplement ordering. |

## Tickets

| Ticket | Scope | Depends on |
|---|---|---|
| `TASK-wire-llm-resource-manager-into-generation-dispatch` | Construct + inject `ResourceManager` at the `callWithFailover` call sites; priority defaults to `Normal` so behavior is unchanged until a later ticket moves it | — |
| `FEAT-llm-request-complexity-classification` | `requestClass` + complexity score → priority; pure function, no LLM call; explicit caller class at the five call sites | wire |
| `FEAT-llm-scheduler-config-surface` | `[generation.scheduler]` config block: per-provider slot caps, priority classes, budgets, llama-swap path — with env mapping + schema validation | wire |
| `FEAT-llm-resource-aware-admission-control` | Admission gate: local slot budget, external in-flight cap + windowed token budget, reactive learning from 429s | wire, config |
| `FEAT-llama-swap-rotation-exclusion-policy` | Parse model set from the llama-swap config; define the config contract; rotation + exclusion policy for scheduled traffic | wire, config |
| `TASK-llm-scheduler-observability` | Queue depth / wait time / admission-denial / rotation metrics on the existing telemetry surface | wire |
| `TASK-llm-generation-bench-via-local-llama-swap-opt-in` | Opt-in `tests/benchmarks/` LLM bench (p50/p95/p99, token rate, rotation cost) vs local llama-swap; default-off `LL_BENCH_LLM=1` | — (standalone numbers first; queue-wait attribution after wire) |
| `TASK-scheduler-load-soak-bench-queued-llm-traffic` | Soak bench: queued traffic vs wired `ResourceManager` (queueWaitMs/denial/starvation); mock variant first, llama-swap variant after LLM bench | wire |
| `TASK-llama-swap-sample-config-finalization-unblocks-rotation-poli` | Finalize user sample config vs Part-1 contract; unblocks rotation/exclusion parser | — (blocks `FEAT-llama-swap-rotation-exclusion-policy` Part 2) |

`TASK-wire-llm-resource-manager-into-generation-dispatch` is deliberately first and
deliberately behavior-preserving: it makes an existing island reachable with no
scheduling policy attached, so each subsequent ticket is independently revertible.

## Non-Goals

- **Cross-instance / distributed scheduling.** Explicitly out — the `resource-manager.ts:17`
  ceiling stands, and `epic-distributed-compute-sharing.md` owns the multi-node story.
- **Replacing the circuit breaker or the retry loop.** The scheduler orders and admits;
  the breaker decides aliveness; the retry loop handles transient provider faults.
  Three layers, three jobs.
- **DB-backed queue persistence / restart survival.** `queued` requests are lost on
  restart by design. Tracked as a follow-up, not a promise.
- **A second token estimator.** `estimateTokens` is reused; this epic does not
  reimplement prompt accounting.
- **Per-request live VRAM probing.** A periodic sampler feeding the configured slot
  count is the escape hatch; a syscall on the interactive hot path is not.
- **Managing llama-swap's own config format.** loop-lore reads it and layers policy on
  top; it does not rewrite the user's file.

## Integration Points

| Consumer | Direction | Contract |
|---|---|---|
| `epic-generation-flow-control.md` | upstream | Hold/regulation decisions gate request creation; the scheduler never overrides a hold |
| `epic-actor-autonomy-story-drive.md` | downstream | Autonomy governor sets priority band; the scheduler orders within it |
| `epic-aux-enrichment-pipeline.md` | downstream | Aux jobs are a distinct `requestClass`, so they never contend on equal footing with interactive turns |
| `epic-distributed-compute-sharing.md` | downstream | A `distributed` provider joins the per-provider registry like any other |
| `epic-federation-swarm-sync.md` | downstream | Owns the cross-instance ceiling this epic deliberately does not cross |
| `src/llm/` | internal | The existing slice this epic wires rather than rewrites |


> **Host note (2026-10-01):** `llama-swap` + `llama-server` binaries present on dev host (`~/.local/bin`); no `configs/config.llama-swap.yaml` committed yet, only `configs/config.llama-swap.example.yaml`. Opt-in benches/fixtures viable locally once a model path is set.

git issue: 04ef186
