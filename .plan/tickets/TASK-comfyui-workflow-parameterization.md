<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI Workflow Parameterization Correctness

**Effort:** Small–Medium
**Summary:** Fix the three defects that stop operator-supplied API workflows from working end-to-end.
**Context:** `substituteWorkflow` stringifies every placeholder; `injectComfyUILora` assumes integer node ids; upload validation has no terminal-sink-aware dead-node rule. All three proven by runnable probe against the operator-supplied Anima reference workflow.
**Acceptance Criteria:** All three fixes land with regression tests that fail on the current code.

**Priority:** P0 — Critical
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** existing `src/generation/workflow-substitutor.ts`, `src/generation/lora/discovery-comfyui.ts`

## Description

Phase 0 of `epic-comfyui-first-class-citizen`. Nothing else in that epic can be
verified until these three are fixed — each one breaks real operator workflows.

### Defect 1 — numeric type destruction

`substituteString` (`src/generation/workflow-substitutor.ts:70-85`) returns
`String(vars[key])` for every placeholder. Probe on the shipped
`configs/workflows/txt2img.json` shape:

```
width:  "512"  string      seed:  "42"  string
height: "768"  string      steps: "20"  string
```

ComfyUI's `/prompt` validator type-checks inputs against each node's schema;
`KSampler.seed` and `EmptyLatentImage.width` are `INT`. Both shipped workflows
are broken for every numeric input.

The existing tests only assert `buildSubstitutionVars` *returns* numbers — never
that the *substituted workflow* preserves them. That is the test gap that let
this ship.

### Defect 2 — integer-only node ids in LoRA injection

`injectComfyUILora` (`src/generation/lora/discovery-comfyui.ts:218-224`) computes
the new node id as `Math.max(...Object.keys(nodes).map(Number)) + 1`. ComfyUI node
ids are opaque strings; the Anima reference uses colon-grouped ids (`60:45`).
`Number("60:45")` is `NaN` → `Math.max` is `NaN` → the injected `LoraLoader` gets
the literal node id `"NaN"`. Verified by probe.

### Defect 3 — no terminal-sink-aware dead-node rule

Probe on the Anima reference found 2 of 10 nodes unreferenced as a link source:
`46` (`SaveImage`, a legitimate terminal sink) and `60:45` (`CLIPLoader`,
genuinely dead — superseded by `60:61` `CLIPLoaderGGUF`). Unreferenced alone is
therefore not a defect signal. Validation (TASK-comfyui-first-class-workflow-library)
needs a rule that separates the two, and it must not reject the operator's own
reference workflow.

### Out of scope

The stale `/api/image-edit/*` → `/api/v1/*` doc comments in
`src/image-edit/routes.ts` are **already owned** by
`TASK-comfyui-first-class-mount-image-edit-routes-verify-asset-per` (epic
`epic-comfyui-plugin`). Not duplicated here — do not fix them in this ticket.

## Acceptance Criteria

### Defect 1

- [ ] A string that is exactly one placeholder returns the **typed** var value:
      `"{{width}}"` + `512` → `512` (number).
- [ ] Interpolation stays a string: `"a {{width}} b"` + `512` → `"a 512 b"`.
- [ ] Booleans preserved the same way (`"{{flag}}"` + `true` → `true`).
- [ ] Unknown placeholders keep the existing empty-string behavior (graph
      structure preserved).
- [ ] Regression test asserts the **substituted workflow** — not the vars map —
      keeps `number`/`boolean` for `width`/`height`/`seed`/`steps`/`cfg_scale`.
      Fails on current code.
- [ ] `configs/workflows/txt2img.json` + `img2img.json` substitute to valid
      typed ComfyUI input (assert against the real files).

### Defect 2

- [ ] New node id derived by scanning existing keys for the first free integer;
      `Number()` is never applied to a node id key.
- [ ] Regression test using colon-grouped ids (the reference workflow shape):
      injected id is a valid unique id, not `"NaN"`.
- [ ] Existing behavior for integer-keyed workflows is unchanged (current tests
      stay green).

### Defect 3

- [ ] Dead-node detection exported as a reusable function: a node is dead only if
      unreferenced **and** its `class_type` is not a known sink (`SaveImage`,
      `PreviewImage`, …).
- [ ] Test on the real Anima fixture: `46` classified terminal, `60:45`
      classified dead. Fixture lands under `configs/workflows/uploads/` (decision
      deferred to the library ticket).

## Technical Notes

- ComfyUI `/prompt` validates input types per node schema — the string-vs-number
  defect is a hard rejection at submit, not a silent coercion.
- Node ids are opaque strings, full stop. Any code path doing arithmetic on them
  is suspect. `applyNodeOverrides` and the loader's `isValidWorkflow` only do
  key lookups / entry counts, so they are safe.
- Per the epic's testing strategy table, Defects 1+2 unit tests belong in the
  existing `workflow-substitutor.test.ts` and `discovery-comfyui.test.ts`.


git issue: cefeb42
