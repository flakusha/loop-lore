<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Plan: composable ComfyUI graph-builder frontend (explore)

**Date:** 2026-10-01
**Branch:** `comfyui-graph-builder-explore`
**Related:** `epic-comfyui-first-class-citizen`, `epic-comfyui-plugin`,
`docs/meta/research/comfyui-first-class-investigation.md`
**Constraint:** no changes to the ComfyUI web frontend; builder targets
loop-lore's own htmx+Alpine stack and ComfyUI's HTTP/WS API only.

All `src/...` paths below verified to exist at repo root on 2026-10-01.

## 1. ComfyUI execution contract (what the builder speaks)

Public API surface (docs + `script_examples/basic_api_example.py` +
`websockets_api_example.py` in ComfyUI repo):

- `POST /prompt` body `{prompt: {nodeId: {class_type, inputs}}, client_id?, extra_data?}`
  → `{prompt_id, number, node_errors?}`. `client_id` scopes WS progress to caller.
- `GET /history/{prompt_id}` → execution record + output filenames.
- `GET /view?filename&subfolder&type` → output bytes.
- `GET /object_info` → NodeDef JSON schema per node class
  (shape spec: docs.comfy.org/specs/nodedef_json).
- `WS /ws?clientId=` → progress / execution events for that client.
- UI-format vs API-format: ComfyUI frontend edits UI format (positions,
  links, widget layout) and exports API format (bare `{class_type, inputs}`
  map). The builder targets **API format directly** — no UI-format parse,
  no position persistence.

Current loop-lore client gap (`src/generation/providers/comfyui.ts`):
`submitWorkflow` (:86, `POST {prompt: workflow}` at :87-90) sends **no
`client_id`**; `pollResult` (:114, `GET /history/{id}` at :119) polls only;
`getNodeInfo` (:196, `GET /object_info` at :197), `downloadImage` (:216,
`GET /view` at :224), `runWorkflow` (:243), `uploadImage` (:260) all built.
No `/ws` usage anywhere in the file — progress is poll-only today.

## 2. Ranked options

1. **@comfyorg/litegraph (recommended for canvas).** ComfyUI frontend's own
   fork of litegraph.js. Vanilla canvas, no framework, speaks ComfyUI graphs
   natively incl. API-format export. Best fit for the htmx+Alpine stack:
   lazy-load as a separate bundle outside `alpine-init` (see §4), one Alpine
   wrapper component owns the canvas element. Risk: fork separability —
   must verify it imports standalone outside ComfyUI's frontend (open Q, §5).
2. **Form-based composable preset chains (recommended first).** Linear
   pipeline of named stages: template pick → params → LoRA stack → run.
   Driven by existing `TemplateParameter` (`src/image-edit/types.ts:59-70`)
   + `GET /object_info` via `handleNodes` (`src/image-edit/routes.ts:152-160`).
   No canvas, smallest effort, covers ~80% of operator needs (txt2img /
   img2img / upscale with tuned params). This is Track A.
3. **XYFlow / Svelte Flow — rejected unless LiteGraph fails.** MIT,
   maintained, but framework-tied (React/Svelte bindings, React-idiom core)
   → impedance with the no-React stack, heavier bundle, plus a graph-model
   translation layer LiteGraph does not need. Revisit only if the LiteGraph
   separability check (§5) proves it inseparable.

Also surveyed, not ranked: Rete.js (core MIT, advanced plugins commercial —
license trap for a core plugin candidate); Drawflow (unmaintained);
BaklavaJS (Vue-tied); `@stable-canvas/comfyui-client` (useful as a
reference client lib for `client_id`+WS patterns, not as the graph renderer).

## 3. Recommended two-track shape

- **Track A — form/preset chains first.** Reuses `handleRun`
  (`src/image-edit/routes.ts:69-116`) + `templateRegistry` singleton
  (`src/image-edit/template-registry.ts:146`) + `generateComfyUI`
  (`src/generation/image-engine/comfyui.ts:21-69`: load → `injectComfyUILora`
  → `runWorkflow` → buffers). Chain step = one `WorkflowTemplate`
  (`src/image-edit/types.ts:76-85`) with `substituteWorkflow` /
  `applyNodeOverrides` / `buildSubstitutionVars`
  (`src/generation/workflow-substitutor.ts:81,153,189`) threading params
  between stages. Persist a saved chain as a `prompt_templates` row with
  `workflow` modality per the first-class-citizen epic amendment (do NOT
  create a new table; investigation §0.1–0.2: inline graph in `payload`,
  explicit `workflow` branch in `parseTemplatePayload` + `apply.ts`, 9
  `TemplateModality` enum sites).
- **Track B — LiteGraph canvas later.** Export/Run calls
  `submitWorkflow`/`runWorkflow`; node palette fed by `getNodeInfo`;
  client-side + server upload validation reuses `isValidWorkflow` /
  `findDeadNodes` + `TERMINAL_SINK_CLASSES`
  (`src/generation/workflow-loader/workflow-validation.ts:14,31,60`) with the
  dead-node-sink rule from investigation Defect 3 (reject dead non-sink
  nodes; `SaveImage`/`PreviewImage`/sinks are legitimate terminals).
- **Progress (open gap, both tracks):** real progress needs `client_id` +
  `/ws` first — cite
  `TASK-comfyui-first-class-client-id-websocket-progress-in-comfyuic`
  (acceptance: `submitWorkflow` sends `client_id`, `subscribeProgress` with
  poll fallback, `generateComfyUI` threads per-call id). Until that lands,
  builder run feedback stays poll-based on `GET /history/{id}`.

## 4. Core plugin candidate sketch

`plugins/core/comfyui-builder/plugin.ts`, following
`plugins/core/image-editing/plugin.ts:33-51` (onLoad registers into
`templateRegistry`, onUnload `clear()`s; routes NOT registered in plugin —
they live in the v1 barrel `src/routes/v1/content-surface.ts:49` (`prefix` at :39),
`imageEditRoutes` mounted at `/api/v1/image-edit/*`).

- **New Alpine component:** `src/frontend/alpine/comfyui-builder.ts`
  (registers `globalThis.comfyuiBuilder`, wired via
  `src/frontend/alpine/index.ts`; existing pattern:
  `src/frontend/alpine/admin-workflows/{index,list,form}.ts` (spread into `admin.ts:64`). Track A form
  ships inside `alpine-init.js` (`src/frontend/alpine-init.ts`, single bundle
  entry per `src/views/layout.html:38`); Track B LiteGraph canvas lazy-loads
  as a separate bundle outside `alpine-init` (bundle-weight + framework
  isolation, cf. `chat-vendor.js` precedent).
- **Server view + routes:** admin view partial (sibling of existing
  `src/views/admin.html`; builder state in `admin-workflows` pattern) +
  builder routes mounted in `content-surface.ts` next to `imageEditRoutes`:
  chain CRUD (persist `prompt_templates` workflow rows), chain-run (delegates
  to `handleRun`), palette proxy (`handleNodes`), graph validate
  (`findDeadNodes` + sink rule, reject dead non-sinks at upload).
- **Reuse vs build per seam:** reuse — client submit/poll/download,
  substitutor, registry, LoRA inject, dead-node validation; build — chain
  model + persistence, preset-chain Alpine form, LiteGraph wrapper +
  lazy bundle, upload validation endpoint, progress subscription (blocked on
  the client_id ticket above).
- **Phased tickets (one line each):**
  1. Chain model + `prompt_templates` workflow-modality persistence (amendment work: payload variant, 9 enum sites, apply branch).
  2. Builder routes (chain CRUD/run, palette proxy, validate endpoint) in v1 barrel.
  3. Track A Alpine preset-chain form (`comfyuiBuilder`) inside `alpine-init`.
  4. `client_id` + `/ws` progress (already ticketed — dependency, not new scope).
  5. Track B LiteGraph lazy bundle + canvas wrapper + API-format export/run.
  6. Upload validation (dead-node reject) + operator reference-graph cleanup.

## 5. Open questions

- **LiteGraph separability:** does `@comfyorg/litegraph` import and run
  standalone outside ComfyUI's frontend build? Spike: minimal page, one node,
  API-format export. Falls back to option 3 if inseparable.
- **Bundle weight:** LiteGraph chunk size vs the bundle-optimization budget;
  measure before committing to always-load vs route-lazy.
- **Graph persistence:** inline-in-`payload` (investigation §0.2 decision,
  graphs ≤ ~100 KB) vs file-backed rows for large graphs; revisit at 100 KB.
- **Auth for builder run path:** `handleRun` IDOR gap (bare-request auth,
  fix to `handleImageGeneration`/`checkChatAccess` parity per
  `epic-comfyui-plugin.md` Phase 0) must close before the builder exposes
  run to non-operator roles.
