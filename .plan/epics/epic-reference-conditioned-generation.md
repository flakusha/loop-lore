<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Reference-Conditioned Generation — Model Matrix, Templates, and Sidecar Absorption

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Not Started (2026-10-16: no `reference-conditioned` module in `src/generation/`; no reference-edit workflow JSON in `configs/workflows/` beyond `txt2img.json` / `img2img.json`; `ComfyUIClient` still sends no `client_id`. The Python sidecar handoff was vendored **only** under `.tmp/H3_Stills_5080_Handoff_20260930/` — scratch, gitignored, never committed — and was pruned before implementation. It has since been **re-acquired and functionally reviewed on 2026-10-16** by reading the on-disk source, so every source-read observation in *Python Handoff* is now verified per claim; the runtime claims (live-ComfyUI `/object_info`, VRAM, latency) remain unmeasured because loop-lore has never executed a graph. Per the separate-plugin-repo decision it stays a review-only reference artifact, never an import target. See *Source Artifact*.)
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

See *Python Handoff* below. Only the **generic** halves are absorbed natively; the
H3 stills custom-node/plugin half is destined for its own plugin repository and
is never vendored or re-shipped by loop-lore.

## Python Handoff

### Source Artifact

The handoff was **external**: a Python ComfyUI custom-node package — an HTTP-route
extension (`__init__.py`, `graph.py`, `studio_stills.py`, `studio_loras.py`) plus a
served SPA (`web/`), with `START_HERE.md` as the recipient-facing install brief.
Handed over **2026-09-30** by an acquaintance of the repo owner. Its stated target is
an existing Windows ComfyUI install on an RTX 5080 (16 GB VRAM), 64 GB system RAM,
running stock MiniMax H3 nodes plus the public Fizgig single-frame nodes.

It is vendored **only** under
`.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/` — `START_HERE.md`, four
`.py` files, and `web/` holding exactly eight assets (`stills.html`, `stills.css`,
`stills.mjs`, `stills_import.mjs`, `stills_file_names.mjs`,
`stills_gallery_status.mjs`, `queue_progress.mjs`, `job_timing.mjs` — the same set as
the `FILES` allow-list, `__init__.py:17-18`). That path is scratch, gitignored, and
**never committed**. It was **pruned before any of it was implemented**, which is why
the five tickets below were first written as unverified claims.

**The artifact has since been re-acquired and was functionally reviewed on
2026-10-16 by reading the on-disk source.** Every line number, route name, node name,
constant, and literal quoted in this section is now verified against that read, and
the verification is stated per claim below. The five sidecar-absorption tickets
(Scope item 5) are no longer blocked on re-acquiring anything; the *Provenance
recorded* acceptance criterion each ticket carries now records where the confirming
evidence came from and which claims only a live ComfyUI can still confirm.

It remains a **review-only reference artifact**: never committed, `.tmp/` only, never
an import target, and no runtime dependency. Nothing may import from `.tmp/` or from
any re-acquired copy of the handoff. Anything worth keeping is re-implemented natively
and lands under `src/generation/`.

**Discipline that still applies.** A verified line citation proves only "this code
says this". The *runtime* claims — live-ComfyUI `/object_info` output for the six
external node types, VRAM, latency, and whether a compiled graph executes on any
hardware — are still **unmeasured**, because loop-lore has not executed a graph
against a live ComfyUI. Nothing in this section should be read as "the code was run".

### Observations (2026-10-16 — verified by source read; runtime claims open)

Corrections to the working assumptions, with citations against
`.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`. Each bullet is
marked **[read]** — confirmed against the on-disk source, with the literal quoted —
or **[live]** — a behavior only a running ComfyUI can confirm, still unmeasured.
Nothing below was executed; the review is a read.

- **11 routes, not 12. [read]** All on `PromptServer.instance.routes`
  (`__init__.py:21`), each behind the loopback-only guard `private_request`
  (`__init__.py:24-28`: `request.remote` in `('127.0.0.1','::1')`, host allow-list,
  same-origin `Origin`). The set is `entry`, `page`, `capabilities`, `prepare`,
  `register`, `results`, `inspect_import`, `run_workflow`, `use_as_picture`,
  `queue_progress`, `open_take` — one decorator each at `__init__.py:56,62,70,92,
  107,118,140,153,163,174,191`. **[live]** that all 11 register on a given
  ComfyUI build.
- **`NODE_CLASS_MAPPINGS = {}` (`__init__.py:206`). [read]** It contributes **zero**
  node types — it is a route bundle, not a node. It *requires* 6 externally
  installed node types (`__init__.py:19-20`): `MiniMaxH3ReferenceToVideo`,
  `FizgigH3StillLatent`, `FizgigH3StillDecode`, `MiniMaxH3SigmaShift`,
  `ImageBlur`, `ModelAttentionBackend`. **[live]** which of the six a target
  install actually resolves.
- **`graph.py` is entirely generic. [read]** `Graph` (`graph.py:5`) is schema-driven
  and names no model: `add(typ, values) -> node id` (body `:11-34`, ending at
  `self.api[str(nid)] = {'class_type':typ,'inputs':args}`, `:35`),
  `wire(src, slot, target, name)` (`:38-49`, duplicate input binding rejected at
  `:41` with `raise ValueError('Duplicate input binding')`),
  `finish(state) -> {workflow, prompt}` (`:51-56`). One pass produces the UI graph
  and the API prompt. **Where the API prompt lands — settled.** `finish()` itself
  embeds it under **`extra.h3_studio.executablePrompt`** with schema
  **`codex.h3.studio.v2`** (`graph.py:54-55`); the H3-specific layer then *relocates*
  it: `studio_stills.build_graph` pops `extra.h3_studio` and writes
  **`extra.h3_studio_still`** with schema **`codex.h3.still.v1`** and the same
  `executablePrompt` key (`studio_stills.py:213-215`). So `codex.h3.still.v1` /
  `extra.h3_studio_still` is what persists (PNG `workflow` chunk, sibling
  `.workflow.json`, `run_workflow` output at `studio_stills.py:294`) and
  `codex.h3.studio.v2` / `extra.h3_studio` exists only inside the builder's
  intermediate return value. Both literals are real; the epic previously attributed
  the final form to `finish()` itself, which was wrong. **This is the reusable
  half.**
- **The H3 chain is 18 nodes with one non-pose reference — not 11. [read]**
  `build_graph` (`studio_stills.py:183-216`) issues **16 fixed `add()` calls** plus
  **2 per reference** (3 when the reference role is `pose_layout`), so a single
  `identity` reference yields 18 nodes, not 11. The fixed 16, in emission order:
  `UNETLoader` (`:185`) → chain-wired `LoraLoaderModelOnly` (`:186-188`, exactly
  one — `normalize` refuses any other count) → `MiniMaxH3SigmaShift` (`:189`) →
  `ModelAttentionBackend` (`:190`) → `CLIPLoader` (`:191`) → 2×`VAELoader` (`:192`,
  video + audio) → `MiniMaxH3ReferenceToVideo` (`:193-194`) → `BasicGuider`
  (`:205`) → `KSamplerSelect` (`:206`) → `BasicScheduler` (`:207`) →
  `FizgigH3StillLatent` (`:208`) → `RandomNoise` (`:209`) →
  `SamplerCustomAdvanced` (`:210`) → `FizgigH3StillDecode` (`:211`) → `SaveImage`
  (`:212`). Per reference (`:196-204`): `LoadImage`; if `pose_layout`, an extra
  `ImageScaleToTotalPixels` (`megapixels:0.01, upscale_method:'area'`, `:199`)
  feeding `ImageBlur` (`blur_radius:3, sigma:3.0`, `:201`); then
  `ImageScaleToTotalPixels` (`megapixels:` `state['reference_megapixels']`,
  `upscale_method:'nearest-exact'`, `:203`). Node literals worth noting:
  `length:5`, `ref_image_size:'max'`, `ref_images:len(references)` (`:193-194`),
  `attention:'comfy kitchen attention'` (`:190`), `scheduler:'simple'`,
  `denoise:1.0` (`:207`), `batch_size:1` (`:208`).
- **`normalize()` (`:114-181`) is model-locked, not a guard. [read]** steps pinned
  to 8 (`_integer(...,'Steps',8,8)`, `:123`), sampler pinned to `euler`
  (`:124-125`), sigma shifts pinned 8.0/3.0 (`:126-127`), model basename pinned to
  the b30-49 hybrid (`:128-132`), CLIP/VAE/audio-VAE pinned to three literals
  (`:133-135`, constants at `studio_stills.py:17-20`), reference megapixels pinned
  to 1.0 (`:136-137`), **exactly one** LoRA (`:153`) whose SHA-256 must equal a
  hardcoded constant (`studio_loras.py:11-12`, checked at
  `studio_stills.py:170-171`). The 4.2-megapixel canvas cap is explicitly a
  *"5080 handoff"* limit (`:120`, with the `width*height>2048*2048` test at `:120`
  and the 64–2048 range clamp at `:118`).
- **`inspect_import()` (`:231-285`) is the genuinely reusable *policy*. [read]**
  256-node ceiling (`:233`), sink/loader trio `FizgigH3StillLatent` /
  `FizgigH3StillDecode` / `SaveImage` (`:236`), PNG `prompt` chunk vs embedded
  `executablePrompt` disagreement refusal (`:246-247`), missing-input *warnings*
  not errors (`:268-272`), and downgrade to `raw` rather than fail when a
  structured prompt no longer recompiles (`:277-283`). **[live]** whether any of
  these branches is exercised by a real PNG round-trip here.
- **`extra_pnginfo` carries exactly one key: `workflow`. [read]** The client posts
  `extra_data:{extra_pnginfo:{workflow:compiled.workflow}}` — no second key
  (`web/stills.mjs:175`).
- **The client already sends `client_id`. [read]** `web/stills.mjs:174-175` posts
  `POST /prompt` with `{prompt, client_id:crypto.randomUUID(), extra_data:{...}}`.
  Independent confirmation from outside loop-lore that `client_id` is the field
  the transport epic's Phase 0 item must add.
- **`studio_loras.py` cannot run standalone — and the coupling is narrower than
  claimed. [read]** Header parse + SHA-256 + shape audit, cached on
  `(path, size, mtime_ns)` (`:21-47`: `@lru_cache(maxsize=4)` on
  `_header/entry` at `:21-34`, `@lru_cache(maxsize=2)` on the SHA at `:37-47`).
  Discovery is `folder_paths.get_full_path(kind, name)` (`:15-18`). **The module
  itself imports exactly one ComfyUI name — `import folder_paths` (`:8`) — and
  nothing else non-stdlib** (`hashlib`, `json`, `struct`, `functools`, `pathlib`).
  The `comfy_execution.progress` / `PromptServer` / `nodes.NODE_CLASS_MAPPINGS`
  imports belong to the *package*, not this file: `__init__.py:10` (`PromptServer`)
  and `__init__.py:177` (`comfy_execution.progress`, imported inside the
  `queue_progress` handler). A ComfyUI process must be alive only to resolve
  discovery.
- **Windows-only. [read]**
  `subprocess.Popen(['explorer.exe', '/select,', str(path)], close_fds=True)`
  (`__init__.py:199`), `import subprocess` at `:4`, guarded by the input/output
  root containment check at `:196-198` and returning the
  "selection cannot be confirmed" warning at `:200-201`. `START_HERE.md`
  corroborates: "Use an interactive Windows account if the Explorer button is
  desired."
- **`profile_verified` is **not** advisory in the shipped product. [read]**
  Server-side it is advisory: `reviewed_profile()` (`__init__.py:42-48`) reads
  `sys.argv` for `--fast`, `fp16_accumulation`, `--use-ck-attention`,
  `--reserve-vram`, the *absence* of `--lowvram`/`--novram`/`--cpu`/`--highvram`/
  `--gpu-only`/`--disable-dynamic-vram`, and `--listen 127.0.0.1`; the result is
  surfaced in `capabilities` (`:75,86`) and no Python route blocks a run on it.
  **But the SPA gates queueing on it**: the Queue button is disabled when
  `!capabilities.profile_verified` (`web/stills.mjs:160,388`) and `prepare(true)`
  throws "The approved local H3 launch profile is not active. Save the workflow,
  but do not queue this server." (`web/stills.mjs:167`). The earlier epic wording
  ("never blocks a run") was wrong about the product as shipped, though right
  about the server routes.
- **RTX 5080 assumption is soft. [read]** No `torch` or `cuda` call anywhere in
  the package; it is the 4.2MP cap (`studio_stills.py:120`), the UI copy
  ("5080 sizing is not yet render-validated" / "The 5080 output size still needs
  local validation", `web/stills.html:16,18`), and
  `attention='comfy kitchen attention'` (`:190`). `START_HERE.md` states the
  sizing and speed "remain to be tested on the recipient machine" and calls the
  launch profile "an unvalidated 5080 starting profile, not a benchmark result".
- **No installer. [read]** The whole artifact is `START_HERE.md`, four `.py` files,
  and eight `web/` assets — no `install.sh`, `README`, `requirements.txt`, or
  `pyproject.toml`, and no `WEB_DIRECTORY` / `NODE_DISPLAY_NAME_MAPPINGS`
  registration anywhere. `START_HERE.md` documents the install as a manual copy
  into `ComfyUI/custom_nodes/` with no additional pip package.

### Absorption decision

| Half | Decision |
| --- | --- |
| **Generic** — `Graph` builder, workflow lifecycle, `extra_pnginfo` metadata embedding, `/upload/image`, `/history`, `/queue` polling, LoRA chain wiring, `inspect_import` policy, the PNG `workflow`/`prompt` chunk reader (`stills_import.mjs:6-36`), `queue_progress.mjs`, `job_timing.mjs`, `stills_gallery_status.mjs` | **Re-implement natively in TypeScript.** Lands under `src/generation/workflow-loader/` (builder + validation policy) and `src/generation/image-engine/comfyui.ts` (lifecycle, `extra_pnginfo`, queue/history). |
| **Model-specific** — H3 node types, the Dareties LoRA and its hash, the H3 prompt format, sigma shifts, reference preprocessing defaults, the 8-step/euler pinning | **Stays in config + templates, not in code.** A family preset describing these is data; the sidecar's hardcoded literals are the bug being removed. |
| **H3 stills custom-node / plugin half** — the `__init__.py` route bundle, `studio_stills.py`, `studio_loras.py`, the `web/` SPA, the `/h3-stills/*` HTTP contract, and the Dareties hash pin | **Split out into its own ComfyUI plugin repository (later).** The artifact has been functionally reviewed (2026-10-16) and this half is destined for a separate plugin repo, so loop-lore consumes the **documented ComfyUI REST contract only** (`POST /prompt`, `GET /history/{id}`, `GET /queue`, `/view`, `/upload/image`, `/object_info`) and **never vendors, installs, or re-ships the Python sidecar**. See the note below the table. |
| **Delegation to the Python sidecar** | **Not adopted as a runtime dependency, and not adopted at all.** It has no installer, no `NODE_CLASS_MAPPINGS`, six unshipped external node prerequisites, a single-artifact LoRA hash pin, and a Windows-only reveal action. It stays a review-only reference artifact under `.tmp/` — never committed, never an import target. |

Why native over sidecar: loop-lore already speaks the ComfyUI REST contract
directly (`src/generation/providers/comfyui.ts`). Adding a second, undocumented
HTTP contract (`/h3-stills/*`) between loop-lore and its own backend adds a
failure surface to re-derive what the existing client already does, in exchange for
a graph builder that is ~56 lines of `add()`/`wire()`.

**Separate plugin repo (decision, 2026-10-16).** The H3 stills package is a
self-contained ComfyUI custom node with its own SPA and its own
`/h3-stills/*` contract; it was reviewed functionally on 2026-10-16 and will be
carried forward as its **own ComfyUI plugin repository**, separate from
loop-lore. Consequences, and they are binding on this epic:

- loop-lore consumes the **documented ComfyUI REST contract only** — `POST /prompt`,
  `GET /history/{prompt_id}`, `GET /queue`, `/view`, `/upload/image`,
  `/object_info` — and never calls `/h3-stills/*`.
- loop-lore **never vendors, installs, or re-ships** the Python sidecar: no copy
  under any tracked path, no `custom_nodes/` install step, no re-implementation of
  its routes. The absorption work stays limited to the **generic** halves (the
  `Graph` builder, the `inspect_import` validation policy, the stills lifecycle
  client, the PNG chunk reader, the de-hardcoded defaults).
- The plugin repo inherits the artifact as reviewed, including its review-only
  status while it is still solely under `.tmp/`; the review notes in this epic are
  the reference for what it does and does not prove.
- Any future loop-lore feature that needs H3 stills states the deployment
  prerequisite (the six external node types, the pinned model/LoRA files) instead
  of shipping a workaround.

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
