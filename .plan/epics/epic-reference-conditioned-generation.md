<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Reference-Conditioned Generation — Model Matrix, Templates, and Sidecar Absorption

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Not Started (2026-10-16: no `reference-conditioned` module in `src/generation/`; no reference-edit workflow JSON in `configs/workflows/` beyond `txt2img.json` / `img2img.json`; `ComfyUIClient` still sends no `client_id`; the Python sidecar at `.tmp/H3_Stills_5080_Handoff_20260930/` is scratch and unvetted).
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** comfyui, image-generation, reference-image, model-matrix, capability-probe, sidecar, graph-builder, lora-audit

## Overview

Reference-based generation and editing — "change this, keep that" driven by one or
more reference images — is a **first-class requirement** across four model families:
**Krea 2**, **Krea 3**, **Qwen Image Edit 2.1**, and **MiniMax H3**. Today each of
those is a one-line bullet in someone else's phase list, and none of them is
implemented.

This epic is the **model-matrix home**: for each family it records what the model
actually supports (multi-reference, inpainting/mask, strength/denoise, LoRA,
resolution, VRAM floor, expected latency), how a reference request is expressed,
which workflow template satisfies it, and how a failure is diagnosed. It also owns
the **cross-model comparison harness** (one prompt → N models → a comparable
result set) and the **absorption of the Python sidecar handoff** into native
TypeScript.

### Why a new epic rather than extending `epic-comfyui-plugin`

Decisive: **this is knowledge that changes on every model release, and it is not
transport.** `epic-comfyui-plugin` owns the machinery — `POST /prompt`,
`GET /history/{id}`, `/object_info`, `/view`, `/upload`, the `WorkflowTemplate`
interface, the registry, LoRA builders — and it has explicitly and correctly ruled
that new usecases are *"workflow templates consumed by the existing call, not new
endpoints"* (`epic-comfyui-plugin.md` → *Integration Decision*). That decision
holds; nothing here changes it.

What does not fit there: the capability matrix is **per-model data**, not
machinery. It needs a data model, a runtime probe that records real VRAM/latency
numbers, and a schema that a new family can join without anyone editing a phase
checklist in a transport epic. It also spans **two backends** (ComfyUI and sd.cpp)
and a **third** concern the transport epic has no vocabulary for at all (Python
sidecar absorption, the Graph-builder port, cross-platform de-hardcoding, the
standalone LoRA audit). Folding a matrix + probe + sidecar port into
`epic-comfyui-plugin` would grow an already 5-phase epic by 3 more phases whose
content is orthogonal to every existing one.

The split is therefore: **this epic references `epic-comfyui-plugin` for the
transport and template machinery; it never duplicates it.** Where the transport
epic has an open checklist item this epic's work depends on (notably `client_id` +
`/ws`, epic Phase 0 and Phase 4), the dependency is declared here and the
implementing ticket is cross-linked — the transport epic's checklist stays the
authoritative state record and is **not** rewritten from here.

## Verified Ground State (2026-10-16)

Read against the worktree, not inferred:

| Area | File | State |
| --- | --- | --- |
| ComfyUI HTTP client | `src/generation/providers/comfyui.ts` | `submitWorkflow` / `pollResult` / `waitForFiles` / `waitForCompletion` / `cancelExecution` / `getNodeInfo` / `downloadImage` / `downloadFile` / `runWorkflow` / `runWorkflowFiles` / `uploadImage`. **No `client_id`, no `/ws`.** |
| Generation engine | `src/generation/image-engine/comfyui.ts` | `generateComfyUI` — loads a named workflow, injects one LoRA, `runWorkflow` → buffers. `width`/`height` read from `sdConfig.defaults`, not the request. |
| Workflow loader | `src/generation/workflow-loader/` | `loader.ts` (dir-mtime cache, `configs/workflows/*.json`), `workflow-substitutor.ts`, `workflow-validation.ts` (`isValidWorkflow`, `findDeadNodes`). |
| On-disk templates | `configs/workflows/` | `txt2img.json`, `img2img.json`, `uploads/i-anima-0001.json`. No reference-edit template. |
| Image-edit templates | `src/image-edit/templates/builtin/` | txt2img, img2img, inpaint, upscale, controlnet + `lora.ts`, `_helpers.ts`. No model-family template. |
| Template registry | `src/image-edit/template-registry.ts` | `listForBackend` / `listByCategory` / `listAvailable(backend, installedNodes)`. **`listAvailable` has no production caller** — auto-filtering by installed nodes is implemented and unwired. |
| Image-edit routes | `src/image-edit/routes.ts` | `handleRun` (authz wired via `authorizeRunLinkage`, `routes.ts:78`), `handleTemplates`, `handleNodes`, `handleCapabilities`, `handleHealth`; mounted via `imageEditRoutes` (`/api` prefix). |
| sd.cpp engine | `src/generation/image-engine/sdcpp.ts` | `generateSDCPP` — `POST /sdcpp/v1/img_gen` + poll, tested. **No reference/img2img contract.** |
| Provider selection | `src/config/schema/sd-provider.ts` | `pickSdProvider(providers, purpose)` — exact purpose → `"both"` → first. |
| Model-family presets | `configs/templates/workflows/model-families.yaml` | **Design-only.** `epic-model-family-presets.md` status note: file "does not exist and no formatter engine is implemented". A `krea-2` and a `minimax-h3` preset are *specified* there; no `krea-3`, no `qwen-image-edit-2.1`. |

### Model capability claims already on record (all UNVERIFIED since 2026-07-28)

`epic-comfyui-plugin.md` (*Practical Testing Results*) and
`epic-assistant-generation-extensions.md` (*Editing Models*) carry the same table.
Every row is a first-hand RX 7900 XT observation from 2026-07-28 and has not been
re-run. The matrix this epic builds **replaces prose claims with recorded
measurements** — that is the point of the capability probe.

| Family | Recorded claim | Recorded VRAM | Status |
| --- | --- | --- | --- |
| FLUX.1 Kontext | "Not tested" | 4–6GB (`--clip-on-cpu`) | untested |
| Qwen Image Edit | "Works, decent" | >20GB real usage | slow, needs layer rotation |
| Krea 2 | "Not working — needs retest" | ~12GB | **root cause uninvestigated** |
| Klein 4B/9B | "Strange results" | 4–16GB | uninvestigated |
| LoRA | "Works" | varies | coeff 0.3–0.7 |

## Scope

### 1. Capability matrix (data + probe)

A typed per-family record — support flags plus **measured** floor numbers — that
any reference-edit request can be validated against before a workflow is
submitted. Emits a hard, early failure ("this family takes one reference image,
you passed three") instead of a confusing ComfyUI graph rejection minutes later.

### 2. Multi-reference conditioning request model

How N reference assets are passed and ordered. This is the shared contract every
per-family template consumes; per-family templates that each invent their own
reference encoding are the failure mode this ticket exists to prevent.

### 3. Per-family reference-edit templates

Krea 2, Krea 3, Qwen Image Edit 2.1, MiniMax H3. One ticket each. Krea 2 ships
**diagnosis before template** — its "not working" state is unexplained and the
template cannot be authored until it is.

### 4. Comparison harness

One prompt → N models → a result set comparable enough to put side by side. This
epic owns the **data and asset side** (run record, per-model result rows, shared
prompt/recipe identity, latency capture). The chart/gallery **rendering** is
another worker's.

### 5. Python sidecar absorption

See *Python Handoff* below.

## Python Handoff (source artifact — scratch, will be pruned)

`.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/` — a Python
ComfyUI custom-node integration authored outside loop-lore. **`.tmp/` is scratch
and will be pruned**; this epic cites it as a *reference artifact*, not a
dependency. Nothing may import from `.tmp/`. Anything worth keeping is
re-implemented natively and lands under `src/generation/`.

Read 2026-10-16. Corrections to the working assumptions, with citations:

- **11 routes, not 12.** All on `PromptServer.instance.routes`
  (`__init__.py:21`), each behind a loopback-only guard (`__init__.py:24-28`).
  The set is `entry`, `page`, `capabilities`, `prepare`, `register`, `results`,
  `inspect_import`, `run_workflow`, `use_as_picture`, `queue_progress`,
  `open_take`.
- **`NODE_CLASS_MAPPINGS = {}`** (`__init__.py:206`). It contributes **zero**
  node types — it is a route bundle, not a node. It *requires* 6 externally
  installed node types: `MiniMaxH3ReferenceToVideo`, `FizgigH3StillLatent`,
  `FizgigH3StillDecode`, `MiniMaxH3SigmaShift`, `ImageBlur`,
  `ModelAttentionBackend` (`__init__.py:19-20`).
- **`graph.py` is entirely generic.** `Graph` (`graph.py:5`) is schema-driven and
  names no model: `add(typ, values) -> node id`, `wire(src, slot, dst, name)`
  (rejects duplicate input binding, `:41`), `finish(state) -> {workflow, prompt}`
  (`:51-56`). One pass produces the UI graph and the API prompt; `finish()` embeds
  the API prompt under `extra.h3_studio_still` with schema `codex.h3.still.v1`.
  **This is the reusable half.**
- **11-node chain** (`studio_stills.py:183-216`): `UNETLoader` →
  chain-wired `LoraLoaderModelOnly` → `MiniMaxH3SigmaShift` →
  `ModelAttentionBackend` → `CLIPLoader`+2×`VAELoader` →
  `MiniMaxH3ReferenceToVideo` → per-reference `LoadImage` (+ optional
  `ImageScaleToTotalPixels`/`ImageBlur`) → `BasicGuider`/`KSamplerSelect`/
  `BasicScheduler`/`FizgigH3StillLatent`/`RandomNoise`/
  `SamplerCustomAdvanced`/`FizgigH3StillDecode` → `SaveImage`.
- **`normalize()` (`:114-181`) is model-locked, not a guard.** Steps pinned to 8,
  sampler pinned to `euler`, sigma shifts pinned 8.0/3.0, model basename pinned to
  the b30-49 hybrid, CLIP/VAE/audio-VAE pinned to three literals, reference
  megapixels pinned to 1.0, **exactly one** LoRA (`:153`) whose SHA-256 must
  equal a hardcoded constant (`studio_loras.py:11-12`). The 4.2-megapixel canvas
  cap is explicitly a *"5080 handoff"* limit (`:120`).
- **`inspect_import()` (`:231-285`)** is the genuinely reusable *policy*: refuse a
  graph over 256 nodes, require the sink/loader trio, refuse when the PNG
  `prompt` chunk and the workflow's embedded `executablePrompt` disagree
  (`:246-247`), and downgrade to `raw` rather than fail when a structured prompt
  no longer recompiles (`:277-283`).
- **`extra_pnginfo` carries exactly one key: `workflow`** — the UI graph.
- **The client already sends `client_id`.** `web/stills.mjs:174-175` posts
  `POST /prompt` with `{prompt, client_id, extra_data:{extra_pnginfo:{workflow}}}`.
  Independent confirmation from outside loop-lore that `client_id` is the field
  the transport epic's Phase 0 item must add.
- **`studio_loras.py` cannot run standalone.** Header parse + SHA-256 + shape
  audit, cached on `(path, size, mtime_ns)` (`:21-47`) — but discovery is
  `folder_paths.get_full_path` (`:15-18`) and the whole package imports
  `comfy_execution.progress`, `PromptServer`, `nodes.NODE_CLASS_MAPPINGS`. A
  ComfyUI process must be alive.
- **Windows-only:** `subprocess.Popen(['explorer.exe', '/select,', str(path)])`
  (`__init__.py:199`).
- **RTX 5080 assumption** is soft: no `torch`/`cuda` calls anywhere; it is the
  4.2MP cap, the UI copy, and `attention='comfy kitchen attention'` (`:190`).
- **`profile_verified` is advisory only** (`__init__.py:42-48`): surfaced in
  `capabilities`, never blocks a run.
- **No installer.** No `install.sh`, `README`, `requirements.txt`, or
  `pyproject.toml` anywhere in the tree; no `WEB_DIRECTORY` /
  `NODE_DISPLAY_NAME_MAPPINGS` registration.

### Absorption decision

| Half | Decision |
| --- | --- |
| **Generic** — `Graph` builder, workflow lifecycle, `extra_pnginfo` metadata embedding, `/upload/image`, `/history`, `/queue` polling, LoRA chain wiring, `inspect_import` policy, the PNG `workflow`/`prompt` chunk reader (`stills_import.mjs:6-36`), `queue_progress.mjs`, `job_timing.mjs`, `stills_gallery_status.mjs` | **Re-implement natively in TypeScript.** Lands under `src/generation/workflow-loader/` (builder + validation policy) and `src/generation/image-engine/comfyui.ts` (lifecycle, `extra_pnginfo`, queue/history). |
| **Model-specific** — H3 node types, the Dareties LoRA and its hash, the H3 prompt format, sigma shifts, reference preprocessing defaults, the 8-step/euler pinning | **Stays in config + templates, not in code.** A family preset describing these is data; the sidecar's hardcoded literals are the bug being removed. |
| **Delegation to the Python sidecar** | **Not adopted as a runtime dependency.** It has no installer, no `NODE_CLASS_MAPPINGS`, six unshipped external node prerequisites, and a single-artifact LoRA pin. It stays a reference artifact. |

Why native over sidecar: loop-lore already speaks the ComfyUI REST contract
directly (`src/generation/providers/comfyui.ts`). Adding a second, undocumented
HTTP contract (`/h3-stills/*`) between loop-lore and its own backend adds a
failure surface to re-derive what the existing client already does, in exchange for
a graph builder that is ~150 lines of `add()`/`wire()`.

## Tasks

### Phase 0: Contract + measurement

- [ ] Capability-matrix data model (typed record + validation)
- [ ] Per-model capability probe (records VRAM floor / latency / support flags)
- [ ] Multi-reference conditioning request model (ordering + role contract)

### Phase 1: Per-family reference-edit templates

- [ ] Krea 2 — **diagnose "not working" first**, then template
- [ ] Krea 3 reference-edit template
- [ ] Qwen Image Edit 2.1 reference-edit template
- [ ] MiniMax H3 stills reference template

### Phase 2: Sidecar absorption

- [ ] TS `Graph` builder port + `inspect_import`-class validation policy
- [ ] Stills lifecycle / queue-progress client + `extra_pnginfo` metadata embedding
- [ ] De-hardcoding + cross-platform (`explorer.exe`) + installer
- [ ] Standalone LoRA audit (runs with no ComfyUI process)

### Phase 3: Comparison harness (data side)

- [ ] Same-prompt multi-model comparison run + result rows
- [ ] Node-driven template auto-filtering wired (`listAvailable` has no caller)

## Cross-References

- `epic-comfyui-plugin.md` — **owns** the transport, the template interface, the
  registry, and the `client_id` + `/ws` checklist items this epic depends on. Its
  phase checklists are the authoritative state record and are NOT edited here.
- `epic-assistant-generation-extensions.md` — the `/image edit` command surface
  that consumes these templates.
- `epic-model-family-presets.md` — where the per-family prompt-format /
  parameter presets live. **Both files are currently design-only** (no
  `model-families.yaml` on disk); the matrix here is the measurement half of the
  same gap, and the two must land together or the matrix has nothing to bind to.
- `epic-comfyui-first-class-citizen.md` — workflow library + admin surface.
- `epic-external-creative-tool-bridge.md` — **different scope.** That epic is an
  MCP bridge to *desktop* creative applications (Krita, Blender, GIMP). This
  epic absorbs a *Python ComfyUI sidecar* into loop-lore's own generation path.
  No shared code, no shared routes.
- `TASK-sd-cpp-provider.md` — owns the **assistant-side sd.cpp adapter**. This
  epic's sd.cpp work is reference-edit **capability** only, and must not
  duplicate that ticket's routing/fallback criteria.
- `epic-technical-comparison-charts.md` — **split, not duplicate.** That epic owns
  the comparison *surface* (comparison sets, cells, grid rendering, charts). This
  epic owns the comparison *run*: one prompt fanned out across model families,
  the per-model result rows, and the captured latency/VRAM. Same-prompt identity
  is the join key between them. Do not build a second comparison-set model here.
- `epic-narrative-publishing-workflows.md` — books/comics. Its illustrated-book
  and comic-panel workflows are the first consumer that needs reference passes
  (character identity held across panels), which is exactly what this epic's
  per-family reference templates provide.

## Risks

- **Model churn.** Krea 3 and Qwen Image Edit 2.1 have no recorded test result at
  all here. The capability probe exists so that churn costs one re-run, not a
  re-architecture.
- **Measured numbers rot.** VRAM and latency floors are machine-specific. The
  probe records *which machine*; a number without a host is a rumor.
- **The 4.2MP cap is not a model property.** It is this handoff's hardware. Do
  not let it become the family's declared ceiling.
