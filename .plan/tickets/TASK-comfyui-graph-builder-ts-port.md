<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI Graph builder — TypeScript port + import-validation policy

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-stills-lifecycle-queue-progress-client.md`, `TASK-minimax-h3-stills-reference-template.md`, `TASK-comfyui-node-id-allocation.md`, `epic-comfyui-first-class-citizen.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Port the Python sidecar's generic `Graph` builder to TypeScript under
`src/generation/workflow-loader/`, together with the reusable half of its import
validation. It builds a ComfyUI graph programmatically and emits the UI and API
representations from one pass.

## Context

Source artifact: a Python ComfyUI HTTP-route extension (its `graph.py`, 56
lines, plus `__init__.py` for the route bundle it lives in), handed over
**2026-09-30** by an external acquaintance of the repo owner and vendored **only**
under `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`. That directory
is scratch, gitignored, and was **never committed**. It was pruned before
implementation — which is why this ticket was first written as an unverified claim
— and it **has since been re-acquired and was functionally reviewed on 2026-10-16
by reading the on-disk source.** It is a **review-only reference artifact**: never
committed, `.tmp/` only, never an import target, and nothing in `src/` may reference
it.

Every line number, count, and literal below is verified against that read. What is
**not** verified is anything that needs a live ComfyUI: the `/object_info` schema
shape `Graph.__init__` consumes, and whether a graph this builder emits actually
executes. Those are collected in the last AC; nothing here was run.

`class Graph` (`graph.py:5-56`):

- `__init__(self, schemas)` — takes ComfyUI's `/object_info` schema map
- `add(self, typ, values=None) -> node id` — allocates a node and populates **two**
  structures at once: the UI node dict (`widgets_values`, `inputs`, `outputs`,
  `:11-34`) and `self.api[str(nid)] = {class_type: typ}` (`:35`)
- `wire(self, source, slot, target, name)` — writes both the UI `links` array and
  `api[target]['inputs'][name] = [src, slot]` (`:47-49`); raises on duplicate input
  binding (`:41`)
- `finish(self, state) -> {workflow, prompt}` — returns both representations and
  embeds the API prompt in the UI graph under **`extra.h3_studio.executablePrompt`**
  with schema **`codex.h3.studio.v2`** (`graph.py:54-55`). The H3-specific layer
  later *relocates* that blob: `studio_stills.build_graph` pops `extra.h3_studio`
  and rewrites it as **`extra.h3_studio_still.executablePrompt`** / schema
  **`codex.h3.still.v1`** (`studio_stills.py:213-215`), which is the form that
  persists in PNGs and sibling `.workflow.json` files
  (`studio_stills.py:294`). Both literals are real and the two are **not** the
  same key. **Neither is this port's business.** `graph.py:54-55` hardcodes
  `extra.h3_studio` / `codex.h3.studio.v2` inside `finish()`, and
  `studio_stills.py:213-215` then relocates it to `extra.h3_studio_still` /
  `codex.h3.still.v1`. The TypeScript port takes the embedding key and schema id
  **from its caller** and emits whatever key the caller names; it contains no
  `h3` literal of its own. Model-specific embedding is the template ticket's job
  (`TASK-minimax-h3-stills-reference-template.md`), and that ticket is itself
  conditional on the separate plugin repo existing.

**It names no model.** No H3, no Dareties, no checkpoint — and the one place it
comes close is the `extra.h3_studio` embedding key, which is exactly what the port
must parameterise. That is why the builder is worth porting and `studio_stills.py`
is not.

Why port rather than call the sidecar: the sidecar registers **no node types**
(`NODE_CLASS_MAPPINGS = {}` at `__init__.py:206`) and exposes 11 HTTP routes under
`/h3-stills/*` (`__init__.py:21`). Calling it means loop-lore depends on a
second, undocumented, uninstalled HTTP contract with its own loopback guard, for
the ~41 lines of `add()`/`wire()`/`finish()` that are worth porting
(`graph.py:9-56`).

### The reusable validation policy, and the two node-id bugs it must not inherit

`inspect_import()` (`studio_stills.py:231-285`) is worth porting as policy:

- reject a graph over 256 nodes (`:233`)
- require the sink/loader trio — `FizgigH3StillLatent`, `FizgigH3StillDecode`,
  `SaveImage` (`:236`) — generalized to "the family's declared sinks"
- **refuse when the PNG `prompt` chunk and the workflow's embedded
  `executablePrompt` disagree** (`:246-247`) — the single most valuable check in
  the file; it catches "this PNG was made by a different graph"
- **downgrade, do not fail**, when a structured prompt no longer recompiles
  (`:277-283`) — missing input files are warnings (`:268-272`), not errors

loop-lore's own LoRA path had two node-id defects that `graph.py` does not have.
Both are documented in `epic-comfyui-first-class-citizen.md`, and **both are now
fixed** — that epic's checklist is stale on these points, so re-verify before
relying on it:

- `injectComfyUILora` computed `Math.max(...Object.keys(nodes).map(Number)) + 1`,
  which is `NaN` on colon-grouped ids like `60:45`. It now calls the shared
  `allocateNodeId` (`src/generation/node-id.ts:20`, called at
  `src/generation/lora/discovery-comfyui.ts:196-198`).
- `buildLoraNodes` started at a hardcoded `nodeIndex = 100` and silently clobbered
  existing ids. It now takes a **required** `reserved` set
  (`src/image-edit/templates/builtin/lora.ts:37-54`).

The Graph builder must still route id allocation through that one shared
`allocateNodeId(reserved)` helper — not through a fresh `Number()` scan or a
literal start index, even though the two call sites it came from are fixed.

## Acceptance Criteria

- [ ] A `Graph` builder lands under `src/generation/workflow-loader/` with
      `add` / `wire` / `finish` semantics matching `graph.py:5-56`, typed
- [ ] Node ids are allocated by the shared `allocateNodeId` helper — the builder
      contains no `Number(nodeId)` and no hardcoded start index. A test asserts an
      existing `60:45` id does not produce `NaN` and that existing `100`/`101` are
      not clobbered
- [ ] `wire` rejects a duplicate input binding on the same target input, as
      `graph.py:41` does
- [ ] `finish` emits the UI workflow and the API prompt from one pass, and the API
      prompt is embeddable as `extra_pnginfo.workflow` (the only key the sidecar
      uses — `web/stills.mjs:174-175`)
- [ ] `finish` takes the embedding key and schema id **from its caller** — it
      contains no `h3` literal. A test builds a graph with a caller-named `extra`
      key (not `h3_studio`, not `h3_studio_still`) and the emitted graph carries
      that key and only that key
- [ ] The import-validation policy is ported: node-count ceiling, required sink
      classes, PNG-`prompt` vs embedded-prompt disagreement refusal, and
      **downgrade-not-fail** on a non-recompiling structured prompt
- [ ] The builder is **model-agnostic** — a test builds a graph with no H3 or
      Dareties class type in it and it succeeds
- [ ] Test: UI and API representations agree node-for-node; a deliberately
      mismatched PNG prompt is refused; a missing input file is a warning
- [ ] **Provenance recorded.** Every sidecar-derived claim this ticket relies on is
      now **verified by source read** (2026-10-16,
      `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`): the `Graph`
      class (`graph.py:5`), `add` and its dual UI/API write (`graph.py:9-36`, with
      `self.api[str(nid)] = {'class_type':typ,'inputs':args}` at `:35`), `wire` and
      its duplicate-binding raise `ValueError('Duplicate input binding')`
      (`:38-41`, link array `:47-49`), `finish` and the
      `extra.h3_studio.executablePrompt` / `codex.h3.studio.v2` embedding
      (`:54-55`), the separate H3-layer relocation to `extra.h3_studio_still` /
      `codex.h3.still.v1` (`studio_stills.py:213-215`), the
      `extra_pnginfo.workflow` single key (`web/stills.mjs:175`), and the
      import-validation thresholds — 256 nodes (`studio_stills.py:233`), the sink
      trio `FizgigH3StillLatent`/`FizgigH3StillDecode`/`SaveImage` (`:236`),
      PNG-`prompt`-vs-`executablePrompt` disagreement (`:246-247`),
      missing-input warnings (`:268-272`), downgrade-not-fail (`:277-283`).
      Still **not** verified, and to be recorded as such rather than as confirmed:
      (a) the live `/object_info` schema shape the builder consumes, (b) an
      executed graph from the ported builder, (c) the six external node types
      resolving on a real install. For each, the ticket records the evidence — an
      executed test, an `/object_info` or `/history` observation **with its date**,
      or a written answer from the upstream author — and a claim with no provenance
      is not used as if confirmed
- [ ] `bun run check` green
