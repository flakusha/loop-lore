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

Source artifact: `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/graph.py`
— **scratch, will be pruned. Read it; do not import it.** 128 lines, and it is the
one genuinely generic file in the handoff.

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
- [ ] `bun run check` green
