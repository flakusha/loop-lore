<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Per-local-box serial video dispatch gate

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-video-generation
**Tags:** video, queue, concurrency, comfyui, gpu, generation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Put a **serial dispatch gate in front of `runVideoRender`**, keyed per local
box, so two video renders never compete for the same weak GPU, and give the
gate a **pre-dispatch model-rotation hook** that can release VRAM before a
render is admitted.

## Context

The weak local box runs one GPU shared by local llama.cpp (LLM turns) and
ComfyUI (diffusion/video renders). Today the video path has **no admission
control of any kind** — the existing flow-control machinery does not reach it:

- `grep -rn "gateConcurrency|ResourceManager|scheduledCallWithFailover|dispatchThroughScheduler|getUnhealthyProviders|scanAllProviders" src/generation/video-gen-route.ts src/generation/video-engine.ts src/generation/video-jobs.ts`
  returns **zero hits**: the video path touches none of it.

- `gateConcurrency` exists only at `src/generation/flow-control.ts:58`, and its
  only call sites are `src/generation/generate-route/validate.ts:107` and
  `src/immersion/classifier.ts:77` — the LLM path, not video.

- `src/generation/video-jobs.ts:45` — `const videoJobs = new Map<string, VideoJob>();`
  — an unbounded in-memory job store (cleared on restart).

- `src/generation/video-gen-route.ts:195-217` — the submit path fires
  `runVideoRender({...}).catch(...)` as a floating promise and returns **202**
  at `:219`; `generationTimeoutMs = Math.max(...)` is computed at `:181` from
  the slowest configured provider.

- `src/generation/video-engine.ts:101-167` — `runCandidate` builds a
  `ComfyUIClient` from `candidate.baseUrl` and calls `submitWorkflow`.

- `VideoProviderConfig` (`packages/core/src/config/schema/providers.ts:128-145`)
  is `{name, baseUrl, apiFamily, workflow, apiKey?, allowUserApiKey?, timeout,
  generationTimeout}` — **no local/remote kind, no VRAM cap, no concurrency
  slot**. `VideoApiFamily` is `"comfyui"` only (`src/db/enums-config.ts:151-153`).

- `src/admin/provider-health.ts` already exposes the health surface a gate
  would consult (`scanAllProviders:37`, `getHealthCache:125`,
  `getProviderHealth:143`, `hasUnhealthyProviders:155`,
  `getUnhealthyProviders:167`).

ComfyUI has its **own** internal queue, but that is a queue inside one ComfyUI
instance — it is not a **shared semaphore across providers or boxes**, and it
does nothing about the GPU that local llama.cpp and ComfyUI are fighting over.

### The fork: external vs local

Not every video provider is on the weak box. A remote API provider (MiniMax
H3, etc.) is not sharing this GPU, so serializing it against a local render
would be pure latency for no benefit. The gate therefore needs to know which
providers are **local to this box**.

**Decision point (must be resolved and recorded in this ticket before
implementation):** how does the app learn that a provider is local?

1. **Explicit config field** on `VideoProviderConfig` (e.g. a `kind:
   "local" | "external"` or a `localBox` identity), defaulting to **external**.

2. **`baseUrl` heuristic** — treat loopback / private-range hosts as local.

**Recommendation: option 1.** Reasons:

- The default must be **external**. Today every existing config renders
  unserialized; defaulting to local would silently gate every provider,
  including remote APIs, and change behaviour for existing installs.

- The heuristic **mis-classifies in both directions**: a ComfyUI reachable at
  a LAN address (`192.168.x.x`) on another machine looks "not local" but is
  often on the same weak box as the app; a container-published ComfyUI on
  `localhost` looks "local" but may have its own GPU.

- Loopback detection may still be used as a **hint/warning** ("this provider
  looks local — set `kind: "local"` if it shares this box"), but it must never
  be the gate's decision input.

Whichever option is chosen, the ticket ships with the decision **recorded**,
including the config-migration story if a new field is added (default value,
how existing configs behave, whether the admin UI/config schema exposes it).

### Decision (recorded 2026-11-09, gate-impl lane)

**Option 1 — explicit `localBox` field — implemented.**
`VideoProviderConfig.localBox?: string`
(`packages/core/src/config/schema/providers.ts`): absent or empty means
**external** and the provider bypasses the gate with zero added latency;
a non-empty value names the box whose GPU the provider shares and the
dispatch gate serializes one running render per distinct name.
BaseUrl heuristics are NOT a decision input (mis-classify both ways: LAN
ComfyUI on the same weak box; localhost ComfyUI with its own GPU).

Migration story: purely additive optional field — every existing config
parses unchanged and behaves exactly as today (no serialization, since no
provider names a box). Four example configs document the field
(`configs/config.example.{yaml,toml}`,
`configs/config.generation.example.{yaml,toml}`) with `localBox` commented
alongside the video provider entries. No admin-UI surface change in this
ticket: video providers have no provider-health/admin editor wiring in
scope (see Provider health below); the field rides the existing
`VideoProviderConfig` schema the config files already feed.

### What the gate does

- **Serializes per local box.** Keyed by the local box identity (see the
  decision above); renders targeting the same box run **one at a time**;
  renders targeting different boxes run concurrently.

- **External providers bypass the gate** entirely — no added latency.
- **`pending` means queued.** A submission that cannot start immediately
  stays `pending` and is dispatched when a slot frees. The client-visible
  poll shape (`handleVideoGenerationStatus`) does not change.

- **Pre-dispatch model-rotation hook.** Before the gate hands the box to the
  next render, it calls the named hook seam owned by the sibling
  llama-swap precise-unload ticket
  (`TASK-precise-per-model-llama-swap-unload.md`). The hook releases VRAM on
  the box before the render starts: `GET {llama-swap}/running` -> eviction set
  = running LLM ids **minus `comfyui_auto`** -> one
  `POST /api/models/unload/{id}` per id (both 404 shapes are continue-cases) ->
  bounded `GET /running` poll until the set drains -> **then** the render is
  submitted. The global `GET /unload` / `POST /api/models/unload` and the
  `pause` endpoint are **never** called: they stop or stall `comfyui_auto`
  too. The hook is a no-op when there is nothing to release, and its failure
  must not abort the render. The two tickets must land in either order
  without rework: this ticket owns the **gate and the call site**, the sibling
  owns the **unload semantics**.

### Access control around the gate

The gate is **not** an entry point, and it must not become one:

- **Authorization stays at the route.** The submit route's existing per-request
  caller checks run before a job enters the queue: 401 without a user
  (`video-gen-route.ts:84-86`), 403 for a foreign chat via `checkChatAccess`
  (`:105-106` — the IDOR write guard named in the route's own header
  comment at `:8-12`). The poll route keeps its own checks: 401 without a user
  (`:310-312`) and 404 for an unknown **or foreign** job (`:317` — foreign
  jobs report 404, not 403, so job ids are not oracle-probeable). The gate
  serializes work that **already passed** those checks; it never widens,
  narrows, or reinterprets them.

- **The gate is internal.** It is reachable only from the dispatch path. No
  route, handler, or queue-inspection endpoint may admit work into the gate
  without the same caller checks the submit route applies.

- **A queued job carries its submitter's identity.** `VideoJob` already holds
  `ownerId` (`src/generation/video-jobs.ts:28`) and the poll route compares it
  against the caller (`:317`). Queueing delays the render; it must not
  downgrade its authorization — the queued job keeps that same `ownerId`, and
  the dispatch path never renders on behalf of an anonymous or different
  principal.

- **The pre-dispatch hook takes no caller-supplied target.** The model id the
  hook releases is chosen by the dispatch path from its own configuration, not
  from a request body or query parameter — otherwise a caller could use the
  hook to evict another user's model.

### Out of scope for v1

- Durable job state across restart (the job store stays in-memory).
- VRAM-aware admission via ComfyUI `/system_stats`.
- ComfyUI `GET /queue` backpressure.
- Whether queue-wait time counts against `generationTimeoutMs`
  (`video-gen-route.ts:181` computes `max(slowest provider)` at submit time)
  — that interaction must be **documented**, not silently decided.

## Acceptance Criteria

- [x] **One render per local box at a time** — evidence: `video-dispatch-gate.test.ts` same-box serialization + different-box concurrency + queued-dispatch-on-release; route serializes two same-box submits

- [x] The **gate key derivation is documented in code** — evidence: `videoGateKeys` docstring in `video-dispatch-gate.ts:60-68`; gate + `runVideoPreDispatchHook(boxKey)` + `{ boxKey }` logs share it

- [x] **Caller identity enforced before the gate** — evidence: route checks untouched (401/403 submit, 401/404 poll); gate is continuation-internal only; `ownerId` kept on queued jobs; hook takes derived box key only

- [x] **External providers bypass the gate** — evidence: `needsVideoGate` false path awaits `run()` directly (no chaining); external-bypass test
- [x] The **local-vs-remote decision is resolved and recorded** — evidence: Decision section above (explicit `localBox`, additive/optional, existing configs unaffected; examples updated)

- [x] A queued submission stays **`pending`**, dispatched on slot release, poll shape unchanged — evidence: route test serializes two same-box submits to `done` via `submitAndPoll`

- [x] The in-memory job store is **bounded** — evidence: `VIDEO_JOB_STORE_MAX = 500` + eviction rule in `video-jobs.ts` docstring; burst test stores 550, asserts cap + pending preserved

- [x] A **single named pre-dispatch hook** on the dispatch path — evidence: `setVideoPreDispatchHook` + no-op default + failure-never-aborts; hook-called-before-dispatch + no-op + failure-proceeds tests; sibling plugs via setter, no hard import

- [x] The hook's release sequence is the sibling's **precise** one — wired 2026-11-09 (B1): `video-gen-route.ts` registers `releaseModelsForRender` via `setVideoPreDispatchHook` at module load; composition test (`video-dispatch-gate-bounds.test.ts` "replaces the no-op with the precise release") proves the registered hook hits llama-swap `GET /running` (no-op never fetches) and dispatch still runs

- [x] Submit still returns **202 promptly** (the gate queues; it does not
  block the HTTP request)

- [x] A **named queue-wait ceiling** fails the job — evidence: `VIDEO_QUEUE_WAIT_MS` fails waiters with 429 (`failed/429` test); wait-vs-render budget interaction in `docs/spec/integrations/video-generation.md`

- [x] **Provider health explicitly not consulted** — evidence: `scanAllProviders` reads the LLM provider registry, which video providers are never registered in (registry is LLM-only; video failover is a separate config list), so a health read here would always report unknown; failover/timeouts already surface per-candidate

- [x] **Tests** — evidence: `video-dispatch-gate.test.ts` (8) + `video-dispatch-gate-bounds.test.ts` (3) + `video-dispatch-hook-composition.test.ts` (B1: registered hook hits `GET /running`, dispatch runs) + `video-gen-route.test.ts` (24) + `video-jobs.test.ts` (8) + unload suites (21): 65 pass `bun test --isolate`

- [x] The behaviour is **documented** — evidence: `docs/spec/integrations/video-generation.md` (91L) + `localBox` in all four example configs

### Implementation notes (gate-impl lane, 2026-11-09)

- Gate: `src/generation/video-dispatch-gate.ts` (192L) — per-box FIFO tails
  over a promise chain (boring keyed semaphore; no new dep; ResourceManager
  rejected — it is a priority LLM scheduler, wrong shape for one-slot FIFO).
  Key derivation `videoGateKeys` = distinct non-empty `localBox`, first-seen;
  gate + hook + logs all take the derived `boxKey` (call-site never supplies
  a hook target). `VIDEO_QUEUE_WAIT_MS = 300_000` (5 min = generationTimeout
  default, so a waiter that outlasts a render attempt fails 429).
- Call site: `runVideoRender` (`src/generation/video-gen-route.ts`) routes the
  engine call through `dispatchThroughVideoGate`; submit still returns 202
  promptly; pending = queued; poll shape unchanged; ownerId/auth untouched
  (gate is post-checks, internal-only). Queue-wait 429 vs
  `generationTimeoutMs`: the ceiling budgets only the WAIT for a box slot,
  separate from `generationTimeoutMs` which budgets the RENDER itself
  (deadline checked after admission) — documented in
  `docs/spec/integrations/video-generation.md`.
- Store: `VIDEO_JOB_STORE_MAX = 500` (`src/generation/video-jobs.ts`);
  insert-then-evict, oldest settled first, oldest pending only when no
  settled remain (pending jobs are never dropped while a settled job exists).
- Hook seam: `setVideoPreDispatchHook` / `runVideoPreDispatchHook` /
  `__resetVideoPreDispatchHookForTests` — single named seam, no-op default,
  failure logs-and-proceeds (never aborts the render), takes only the box key.
  Sibling composes by calling the setter at startup; landing order free.
- Provider health: explicitly NOT consulted — `scanAllProviders`
  iterates `listProviders()` from the LLM provider registry
  (`src/generation/providers/registry.ts`), and video providers are never
  registered there (video failover is a separate config list,
  `generation.providers.video`, with its own `listVideoProviderInstances`
  surface). A health read in the dispatch path would therefore always
  report unknown. Render failure already surfaces per-candidate via engine
  failover (timeout → 504, failure → 502).
- Open points answered: (1) baseUrl heuristic — declined, reasons above;
  (2) queue-wait vs generationTimeout — separate budgets, documented;
  (3) `comfyui_auto` exclusion + 404-continue + drain-poll semantics belong
  to the sibling unload ticket; this seam passes only the box key and
  imposes nothing on the sibling's sequence.
