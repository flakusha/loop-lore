<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shared ComfyUI node-id allocator (fixes silent graph corruption)

**Effort:** Small
**Summary:** Two independent code paths invent ComfyUI node ids by arithmetic. One produces `NaN`; the other silently overwrites existing nodes.
**Context:** Found by investigation 2026-09-27 (`docs/meta/research/comfyui-first-class-investigation.md` §2.4, Defect 4). Reproduced by probe, not inferred.
**Acceptance Criteria:** One `allocateNodeId` helper; both call sites use it; regression tests for both failure modes.

**Priority:** P0 — Critical
**Status:** In Progress
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** none

## Description

ComfyUI node ids are **opaque strings**. Two places in loop-lore assume they are
integers, and both are wrong.

### Site 1 — `injectComfyUILora` produces the literal id `"NaN"`

`src/generation/lora/discovery-comfyui.ts:218-224`:

```ts
const maxId = Math.max(...Array.from(Object.keys(nodes), Number,), 0,);
nodeId = String(maxId + 1,);
```

`Number("60:45")` is `NaN`; `Math.max(NaN, 0)` is `NaN`; the node is written under
the key `"NaN"`. Verified against the operator's Anima reference workflow, whose
ids are colon-grouped.

Already covered by `TASK-comfyui-workflow-parameterization` Defect 2. **This
ticket generalises that fix** so the second site cannot regress independently.

### Site 2 — `buildLoraNodes` silently clobbers existing nodes (NEW)

`src/image-edit/templates/builtin/lora.ts:40-69` starts at a **hardcoded**
`nodeIndex = 100` and increments:

```ts
let nodeIndex = 100; // Start LORA nodes at 100 to avoid collisions
for (const lora of loras) { nodes[String(nodeIndex)] = {...}; nodeIndex++; }
```

The comment asserts collision avoidance, but the function is handed a start
model/clip ref and **not the set of existing ids** — it cannot know what is taken.
Probe against a graph already owning `100` and `101`:

```
parsed:        [{style.safetensors, 0.7}, {detail.safetensors, 0.4}]
generated ids: ["100","101"]
ASSERT no collision: FAIL — clobbers ["100","101"]
```

Worse than Site 1: this failure is **silent**. Site 1 produces an obviously
malformed id; this one produces a valid-looking id that overwrites a real node,
and the graph still submits.

Real operator graphs exceed 100 nodes routinely — the Anima reference is 10, but
sprite-sheet and ControlNet graphs are far larger. The hardcoded 100 is a
heuristic that happens to hold for small graphs and breaks for real ones.

### Why one helper

Same root cause, two sites, two different failure modes. A third site will appear
when LoRA stacks land (`TASK-comfyui-first-class-lora-stacks`). One exported
helper makes the correct thing the only thing.

Independently corroborated: InvokeAI's graph
(`invokeai/app/services/shared/graph.py:88-110`) keys nodes by string `node_id`
with `Edge = {source: {node_id, field}, dest: {...}}` and never does arithmetic
on ids.

## Acceptance Criteria

- [x] `allocateNodeId(reserved: Iterable<string>)` exported from a shared
      module under `src/generation/` — implemented in `src/generation/node-id.ts`.
      No `prefer` parameter: nothing needed it, and an unused parameter is a
      second convention to keep in sync.
- [x] It never coerces a whole key with `Number()`. It reads the **leading integer
      run**, so a colon-grouped id contributes its prefix instead of `NaN`. It
      returns an id that is provably not already present in `reserved`.
- [x] Allocation is deterministic and collision-free for arbitrary input: an
      empty graph, an all-colon-id graph, a graph with numeric ids, and a graph
      that already contains every candidate in a naive probe range.
- [x] `injectComfyUILora` uses it (Defect 2 regression). The duplicated
      `Math.max(...keys.map(Number))` computation also collapsed into one call.
- [x] `buildLoraNodes` uses it, and its signature changes to accept the existing
      node key set. `txt2img.ts` is the **only** caller (verified by grep — an
      earlier draft of this ticket claimed more than one; it was wrong).
- [x] Regression test: the probe above (graph owning `100`/`101`) passes after the
      fix and fails before it.
- [x] Regression test: colon-grouped ids (the Anima shape) do not yield `NaN`.
- [x] Existing LoRA chaining behavior is otherwise unchanged — same output shape,
      same model/clip threading.
- [x] The misleading `// Start LORA nodes at 100 to avoid collisions` comment is
      removed, not reworded.

## Technical Notes

- **Id format — decided: bare integer, not `lora-<n>`.** An earlier draft of this
  note asked for a namespaced `lora-<n>` id on readability grounds. Not taken:
  the builtin templates and every shipped reference workflow already use bare
  integers, `KSampler` refs are typed `[string, number]`, and a bare integer is
  the maximally-compatible choice for ComfyUI's prompt API. The collision was
  never caused by *integer-ness* — it was caused by inventing ids without
  checking. Fixing the check makes the format question moot.
- **A real second trap, found while fixing this.** `txt2img.build` builds the
  LoRA chain *before* the sampler node exists, so allocating against the nodes
  present at that moment hands out the sampler's id `"5"` and the subsequent
  spread silently overwrites the `KSampler`. `buildLoraNodes` therefore takes
  the **full** id space the template will use, and `txt2img` derives it by
  building its fixed nodes first (they are pure, so the double build is cheap).
  Any future template that interleaves node construction with id allocation hits
  this; the test asserts the invariant rather than a literal id.
- Callers of `buildLoraNodes` must be updated in the same change. There is one:
  `txt2img.ts`.
- Do not special-case colon ids — treat every id as opaque and the problem
  disappears without enumerating id formats.


git issue: 7fe2a33
