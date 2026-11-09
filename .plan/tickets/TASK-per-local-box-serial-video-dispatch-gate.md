<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Per-local-box serial video dispatch gate

**Status:** Not Started
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

- [ ] **One render per local box at a time**: two submissions targeting the
  same local box are serialized (the second does not start until the first
  finishes); two submissions targeting different local boxes run concurrently

- [ ] The **gate key derivation is documented in code** and used consistently
  by the gate, the pre-dispatch hook, and the logging that reports which box
  a render is holding

- [ ] **Caller identity is enforced server-side before a job reaches the
  gate**: the submit route's existing per-request checks (401 no user, 403
  foreign chat) run first and still apply; the gate itself is reachable only
  from the dispatch path; a queued job keeps its submitter's identity, and no
  request-supplied value selects the provider instance, the box key, or the
  model the pre-dispatch hook releases

- [ ] **External providers bypass the gate** with no added latency
- [ ] The **local-vs-remote decision is resolved and recorded** in this
  ticket (explicit config field vs `baseUrl` detection), including the
  config-migration story if a field is added

- [ ] A queued submission stays **`pending`** and is dispatched when a slot
  frees; the poll-by-job-id shape (`handleVideoGenerationStatus`) is unchanged

- [ ] The in-memory job store at `src/generation/video-jobs.ts:45` is
  **bounded** (cap and/or eviction of settled jobs) with the ceiling
  documented in code

- [ ] A **single named pre-dispatch model-rotation hook** exists on the
  dispatch path; it is a no-op when nothing needs releasing, its failure does
  not abort the render, and it composes with the sibling
  precise-unload ticket in either landing order

- [ ] The hook's release sequence is the sibling's **precise** one —
  enumerate via `GET /running`, evict per-model ids only (`comfyui_auto`
  excluded), one `POST /api/models/unload/{id}` per id with both 404 shapes
  treated as continue-cases, drain via a bounded `GET /running` poll, and
  submit the render only after the drain; the global unload and `pause`
  endpoints are never called

- [ ] Submit still returns **202 promptly** (the gate queues; it does not
  block the HTTP request)

- [ ] A **named queue-wait ceiling** fails the job with a defined status, and
  the interaction with `generationTimeoutMs` is documented

- [ ] **Provider health is either consulted by the gate or explicitly not
  consulted**, with the reason stated in the ticket

- [ ] **Tests:** same-box serialization; different-box concurrency; external
  provider not serialized; queued job dispatched on slot release; hook called
  before dispatch and no-op when nothing to release; job store bounded under a
  burst of submissions

- [ ] The behaviour is **documented** outside this ticket (where the video
  generation and provider configuration docs live)
