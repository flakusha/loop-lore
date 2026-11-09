<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Precise per-model llama-swap unload

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-llama-swap
**Tags:** llama-swap, models, lifecycle, vram, unload
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Add a **precise, per-model unload** against llama-swap that frees VRAM for the
weak local box **without evicting the ComfyUI proxy entry**, plus the
**pre-dispatch hook point** the video serial gate (sibling ticket
`TASK-per-local-box-serial-video-dispatch-gate`) calls before it releases a
render slot.

## Context

The deployment target is a **local weak box**: one GPU shared by local
llama.cpp (LLM turns) and ComfyUI (diffusion/video renders). llama-swap fronts
the local llama.cpp as an OpenAI-compatible proxy and also proxies ComfyUI
through its `/comfyui` entry, so a single llama-swap process is the choke point
for both halves of the box.

**User constraint (load-bearing):** a blanket *unload-all* is not acceptable.
Unloading all models through llama-swap evicts the `/comfyui` proxy entry as
well, which takes ComfyUI down with it — so "free VRAM by unloading
everything" nukes the diffusion half of the same box. Any unload the app
issues must be **per-model**, and must **spare the ComfyUI proxy entry**.

Consequences for the app-side contract:

- The unload surface must name **one model id** (or one group), never "all".
- The ComfyUI proxy entry must be **excluded by construction**, not by
  convention: a per-model call cannot reach it, but a future "free the box"
  convenience path would, so the exclusion needs a stated rule and a test.

- The unload must be **idempotent and non-fatal**: unloading an
  already-unloaded model, or a model llama-swap has not loaded, must not fail
  the render it was clearing the way for.

llama-swap already owns idle eviction (`ttl`), the running-model view
(`/running`), per-model unload (`/api/models/unload[/:id]`), health (`/health`)
and metrics (`/metrics`) for its **OpenAI-compatible model family only** — see
`TASK-cross-family-vram-advisory-lease.md:17`; it proxies ComfyUI via
`/comfyui/` and cannot arbitrate non-LLM creative tools. This ticket is the
**precise, app-driven** counterpart to llama-swap's own TTL eviction — it is
not a second eviction policy, and it does not rewrite the user's llama-swap
config (loop-lore reads, never rewrites — `epic-llama-swap.md` Scope). The
`/comfyui` proxy entry is the `comfyui_auto` model id in
`configs/config.llama-swap.example.yaml:146-154`, whose own comment states
"proxy routes /comfyui + /comfyui/{path} here" — that id is what the unload
must never target.

The **pre-dispatch hook point** matters because the video serial gate has to
free VRAM *before* it hands a box to the next render; today there is no seam
where the video path can ask the model server to release a model. The hook is
the seam; the exact call is this ticket's deliverable.

### The llama-swap unload contract (verified against upstream HEAD + v251)

Three endpoints exist; **only one is usable** for a pre-dispatch release:

- `POST /api/models/unload/{model}` — unloads **ONE** named local process. The
  id is **alias-resolved server-side** (`RealModelName`), so the app may pass
  the alias or the real id. `404 "model not found"` = the id is unknown or
  already gone → **continue**. `404 "no local server found for requested
  model"` = the id is served by a peer, not locally → nothing local to free →
  **continue**. `200 "OK"` = unloaded.

- `GET /unload` and `POST /api/models/unload` — unload **ALL** running local
  processes, `comfyui_auto` included. **NEVER call either.**

- `POST /api/models/pause` — unloads all **and** rejects every local request
  (`/v1/...`, `/upstream/...`, `/comfyui/...`) with `503 all inference is
  paused` until resume. **NEVER use it** for pre-dispatch; it is a maintenance
  mode, not a release.

The pre-dispatch sequence:

1. `GET {llama-swap}/running` → the warm set
   (`{"running":[{"model","state","cmd","proxy",…}]}`).

2. Eviction set `E` = running LLM model ids **minus `comfyui_auto`**.
3. For each id in `E` (the calls may run in parallel): `POST
   /api/models/unload/{id}`. Both 404 shapes are continue-cases, not failures.

4. Poll `GET /running` (bounded) until no member of `E` is still present.
5. **Only then** submit the render.

`E` is **never cached across awaits**: a request arriving after an unload
reloads the model on demand (unload is one-shot, not a pause), so a delayed
dispatch must recompute `E` from a fresh `/running`.

**Why not TTL instead:** TTL eviction is inactivity-based and websocket-blind
for `comfyui_auto` — a long render watched over its websocket counts as idle
and can be evicted mid-render. TTL is the steady-state hygiene; the sequence
above is the deterministic guarantee.

**Sibling warning (ComfyUI side):** the `comfyui_llama_swap` custom node's
`unload_after_generate` toggle fires the **blunt global `GET /unload`** on
both the success **and** the error path (`nodes.py:74-118`), so every in-graph
LLM call with the toggle on evicts `comfyui_auto` too. **Render workflows must
keep `unload_after_generate` false.** Also: the sibling ComfyUI checkout has
**no local llama-swap config and no `/comfyui`-proxy registration** today, so
the deployment this ticket assumes (one llama-swap fronting the local
llama.cpp *and* proxying ComfyUI under `comfyui_auto`) is a **deployment
requirement to document**, not a given. Without the `comfyui_auto` entry the
`/comfyui/` path answers `404 "local model comfyui_auto not found"`.

Failure modes the implementation must handle:

- **Unload races a running inference** on that model → the evicted model's
  waiters and queued requests error with `"<router>: model unloaded"`; the LLM
  caller sees that error and the render path is unaffected. Do **not** retry
  the LLM call before the render completes.

- **Unload races a model that is still starting** → the start is cancelled and
  joined before the stop (the load does not win the race); the step-4 poll
  still converges, no special case.

- **Stale browser tab hits an unloaded ComfyUI** → benign `409` on `/ws`,
  `/api/jobs` and static assets; interacting with the page restarts the model.

### Access control on the unload call

The unload is a **privileged administrative call** — it can evict a running
model. Two boundaries must be closed, and neither may be assumed:

- **Who may trigger it.** The unload is reached only from the video dispatch
  path (the pre-dispatch hook), never straight from user input, and never
  from a route that skips the video submit route's existing per-request caller
  checks (401 without a user at `src/generation/video-gen-route.ts:84-86`; 403
  for a foreign chat via `checkChatAccess` at `:105-106`). The hook is an
  internal seam, not an entry point.

- **How the app authenticates to llama-swap.** Whether llama-swap's per-model
  unload endpoint requires a credential is a property of the **user's own
  llama-swap deployment** and is not known here — **confirm it, do not assume
  it**. If the instance requires a key, the app must supply it from the
  credentials it already holds for that instance; if the instance serves the
  endpoint unauthenticated, the app must target a **loopback-bound** instance
  only, and that binding must be verified (or made a documented deployment
  requirement) rather than assumed.

### Open questions to settle before implementation

1. **Eviction-set membership:** unload every running non-`comfyui_auto` model,
   or only the process-backed ones (`/running` exposes `cmd`/`proxy` per model,
   so a proxy-served model holds no local VRAM)?

   **Resolution:** unload every running non-`comfyui_auto` model (no
   `proxy`/`cmd` filtering). A proxy-served id holds no local VRAM, but
   unloading it is either a no-op success or a `no local server found` 404
   continue-case — both harmless — while filtering would bake in upstream
   `/running` shape guarantees this repo does not own. Implemented in
   `computeEvictionSet` (`src/llm/llama-swap-unload.ts`), asserted by the
   "includes proxy-served models" test.

2. **Poll bound:** the drain deadline = max `unloadTimeout` over `E` plus a
   margin, or a fixed small constant?

   **Resolution:** fixed 30s constant (`DRAIN_TIMEOUT_MS`, polls every 250ms).
   The per-model config knob is not readable from `GET /running`, so a
   max-over-E deadline would invent config access the app does not have; 30s
   covers the max recommended per-model `unloadTimeout` (30s) plus margin.
   Stated in `src/llm/llama-swap-unload.ts`; timeout warns with the still-warm
   ids and the render proceeds.

3. **Node-toggle hygiene:** document "keep `unload_after_generate` false" for
   render workflows, or also propose a sibling-side patch? The sibling node
   lives in another repository — a recommendation only, not a change here.

   **Resolution:** documentation only. `docs/spec/integrations/llm-serving.md`
   ("Sibling hygiene") + the ticket AC require `unload_after_generate`
   false in render workflows; no sibling-side patch — that node lives in
   another repository.

### Close-out nits (2026-11-09, queue-closeout lane)

- **N1 (parallel unload):** the release loop now fans out over the eviction
  set with `Promise.allSettled` (`src/llm/llama-swap-release.ts:79-92`); a
  throw can only land in the settled record, never abort the hook. The ticket
  already permitted parallel calls (`:93`); docs (`llm-serving.md`) say
  "parallel via `Promise.allSettled`".
- **N5 (assertion hardening):** `hitForbidden` normalizes trailing slashes
  before the exact-equality check and the per-model POST assertion compares
  `pathname` only, so a template-built URL never trips the bulk-endpoint
  guard; the never-call assertions are unchanged.

## Acceptance Criteria

- [x] A **per-model unload** call exists against llama-swap and is reachable
  from app code: it issues `POST /api/models/unload/{model}` for exactly one
  model id and can never express "unload everything" — `unloadLlamaSwapModel`
  takes a single `modelId: string` (no array/empty-means-all), asserted by the
  "POSTs the exact one-model endpoint" test.

- [x] The app **never calls** `GET /unload`, `POST /api/models/unload`, or
  `POST /api/models/pause` — the module builds no other path (single
  template literal in `unloadLlamaSwapModel`); the `hitForbidden` helper
  asserts on the mock fetch's seen URLs in the hook tests.

- [x] The **ComfyUI proxy entry is spared**: `comfyui_auto` is excluded from
  the eviction set by construction (`COMFYUI_PROXY_MODEL_ID` constant +
  `continue` in `computeEvictionSet`); asserted by "excludes comfyui_auto"
  and the hook test observing `running` still holding `comfyui_auto` after
  the unload.

- [x] The eviction set is computed from a **fresh `GET /running`** at dispatch
  time and is **never cached across awaits** — `computeEvictionSet` holds no
  state; asserted by the "fresh GET per call" test (two calls, different sets).

- [x] The sequence is **enumerate → unload → drain → render**: `GET /running`
  → one `POST /api/models/unload/{id}` per id → bounded `GET /running` poll
  until the set drains → the render is submitted only after the poll converges
  — `releaseModelsForRender`; asserted by the "drain poll precedes the return"
  test (final empty poll after the POST).

- [x] Both 404 shapes are **continue-cases, not errors**: `"model not found"`
  (unknown or already gone) and `"no local server found for requested
  model"` (peer-served) both let the sequence continue — `classifyUnloadResponse`;
  asserted by both 404 tests + the "both 404 shapes continue" hook test.

- [x] Unload is **idempotent and non-fatal**: a non-2xx or unreachable
  llama-swap is surfaced as a warning, not a crash, and never aborts the
  render it was clearing the way for — all operational paths return
  `ok: false` (warned); asserted by the non-2xx/unreachable/malformed tests.

- [x] The unload is **scoped to the local box**: it targets the llama-swap
  instance that fronts the local models, and never a remote/external endpoint
  — unauthenticated non-loopback bases are refused fail-safe (no fetch); a
  remote instance needs an explicit `apiKey` from app config. Asserted by the
  refuse/proceed non-loopback tests.

- [x] **Caller identity is enforced server-side on the path that reaches the
  unload**: the unload is invoked only from the internal dispatch path, never
  from a route or handler that bypasses the video submit route's existing
  per-request caller checks (401 no user, 403 foreign chat), and no
  request-supplied value can select a different provider instance to unload
  — `releaseModelsForRender` resolves the base from `LLAMA_SWAP_BASE_URL`/
  loopback default only; no request-input seam exists. Call-site wiring is the
  sibling gate ticket's lane.

- [x] **The app-to-llama-swap call carries whatever credential the target
  instance requires** — confirmed against the user's deployment, not assumed;
  if the instance serves the unload endpoint unauthenticated, the app targets
  a loopback-bound instance only and that binding is a verified, documented
  deployment requirement — `apiKey` (Bearer) param + loopback-only refusal;
  documented in the module header and `llm-serving.md`; deployment
  confirmation (key vs loopback) is the operator's step at install.

- [x] The **unload-vs-inference race is documented for the LLM caller**: an
  evicted model's waiters see `"<router>: model unloaded"`, and the LLM
  request is not retried before the render completes — module header
  "Race note" + `llm-serving.md` "Race semantics" section.

- [x] A **pre-dispatch hook point** exists that the video dispatch path can
  call before a render is released onto the box; the hook is a single named
  seam (not a per-callsite inline call), it is invoked by the dispatch path
  rather than by the app's caller, and it is a no-op when no model needs
  releasing — `releaseModelsForRender`; no-op asserted by the
  already-unloaded/unreachable tests.

- [x] The hook's failure mode is defined: an unload failure must not abort the
  render — the render proceeds and the failure is logged with the model id
  — every failure path warns (`model` field) and returns `released` anyway;
  asserted by non-fatal tests.

- [x] **Tests:** the unload targets exactly one model via
  `POST /api/models/unload/{model}`; the global and pause endpoints are never
  called; `comfyui_auto` is excluded from the eviction set and survives the
  unload; both 404 shapes continue; the drain poll precedes the render
  submission; an already-unloaded model is a no-op; an unreachable llama-swap
  is non-fatal; the hook is invoked before dispatch and is a no-op when
  nothing needs releasing — `src/llm/llama-swap-unload.test.ts` +
  `src/llm/llama-swap-release.test.ts` (21 tests, all passing).

- [x] **Documentation:** the unload contract (the one usable endpoint, the
  eviction-set rule, the never-call list, the `unload_after_generate`-must-
  stay-false rule for render workflows, the `comfyui_auto` deployment
  requirement, and the failure semantics) is written where the llama-swap
  integration docs live — not only in the ticket — "Pre-dispatch per-model
  unload" section in `docs/spec/integrations/llm-serving.md`.

- [x] The three **open questions** (eviction-set membership, drain-poll bound,
  node-toggle hygiene) are answered and recorded in this ticket — resolutions
  above.
