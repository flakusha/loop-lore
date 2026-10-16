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

Source artifact: a Python ComfyUI HTTP-route extension (its `graph.py`, ~128 lines
per a 2026-10-16 read), handed over **2026-09-30** by an external acquaintance of the
repo owner and vendored **only** under `.tmp/H3_Stills_5080_Handoff_20260930/`.
That directory was scratch, was never committed, and **has been pruned — the source
is not on disk and is not recoverable from git history.** Do not go looking for it.

Every line number, count, and behavior below is a **prior observation from one read
on 2026-10-16, not a re-readable source.** Treat it as an unverified claim to be
re-derived — against a live ComfyUI, and against the upstream author if the artifact
is ever re-acquired. Do not implement against a remembered line number; where a claim
is load-bearing, confirm it and record where the confirmation came from (see the
last AC).

`class Graph` (`graph.py:5-56`):

- `__init__(self, schemas)` — takes ComfyUI's `/object_info` schema map
- `add(self, typ, values=None) -> node id` — allocates a node and populates **two**
  structures at once: the UI node dict (`widgets_values`, `inputs`, `outputs`,
  `:11-34`) and `self.api[str(nid)] = {class_type: typ}` (`:35`)
- `wire(self, source, slot, target, name)` — writes both the UI `links` array and
  `api[target]['inputs'][name] = [src, slot]` (`:47-49`); raises on duplicate input
  binding (`:41`)
- `finish(self, state) -> {workflow, prompt}` — returns both representations and
  embeds the API prompt under `extra.h3_studio.executablePrompt` (`:55`)

**It names no model.** No H3, no Dareties, no checkpoint. That is why it is worth
porting and `studio_stills.py` is not.

Why port rather than call the sidecar: the sidecar registers **no node types**
(`NODE_CLASS_MAPPINGS = {}` at `__init__.py:206`) and exposes 11 HTTP routes under
`/h3-stills/*` (`__init__.py:21`). Calling it means loop-lore depends on a
second, undocumented, uninstalled HTTP contract with its own loopback guard, for
~150 lines of `add()`/`wire()`.

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
- [ ] The import-validation policy is ported: node-count ceiling, required sink
      classes, PNG-`prompt` vs embedded-prompt disagreement refusal, and
      **downgrade-not-fail** on a non-recompiling structured prompt
- [ ] The builder is **model-agnostic** — a test builds a graph with no H3 or
      Dareties class type in it and it succeeds
- [ ] Test: UI and API representations agree node-for-node; a deliberately
      mismatched PNG prompt is refused; a missing input file is a warning
- [ ] **Provenance recorded.** The source artifact is gone, so every sidecar-derived
      claim this ticket relied on (the `Graph` semantics, the `wire` duplicate-binding
      behavior, the `extra_pnginfo.workflow` key, the import-validation thresholds)
      is either re-derived from a live ComfyUI or explicitly marked unverified. The
      ticket records, per claim, **where the evidence came from** — an executed test,
      an `/object_info` or `/history` observation with its date, or a written answer
      from the upstream author — and a claim with no provenance is not used as if
      confirmed
- [ ] `bun run check` green
