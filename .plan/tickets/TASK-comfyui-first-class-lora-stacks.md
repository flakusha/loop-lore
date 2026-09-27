<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI LoRA Stacks (Multi-LoRA Chaining)

**Effort:** Medium
**Summary:** Support a *stack* of LoRAs, not a single injection, with workflow-declared ordered slots.
**Context:** `injectComfyUILora` injects one `LoraLoader` and never rewires the consumer, so a second LoRA orphans the first. It also derives the new node id by `Number()`-ing existing keys, which yields `NaN` for ComfyUI's colon-grouped node ids.
**Acceptance Criteria:** Ordered slot chaining produces a connected MODEL/CLIP chain terminating at a declared anchor, with opaque-string node ids throughout.

**Priority:** P2 — Medium
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** `TASK-comfyui-workflow-parameterization` (Defect 2), `TASK-comfyui-first-class-workflow-library` (`lora_slots` column)

## Description

Phase 4 of `epic-comfyui-first-class-citizen`.

The operator's requested workflow set includes “with LoRA stack” variants for SDXL,
Anima, and Krea 2. A stack is a *chain*: each `LoraLoader` consumes the previous
loader's MODEL and CLIP and emits its own. Today `injectComfyUILora`
(`src/generation/lora/discovery-comfyui.ts:191-233`) adds a single node and
returns, leaving the original consumer wired to the pre-LoRA model — so a second
injection is ignored rather than stacked.

### Slot declaration, not inference

Slots are declared on the workflow row (`lora_slots`, JSON) rather than inferred
from the graph. Inference is unreliable here: ComfyUI graphs vary widely, and the
operator's own Anima reference already contains two CLIP loaders of different
classes (`CLIPLoader`, `CLIPLoaderGGUF`) where one is dead. A declared slot names
its `class_type` (plain `LoraLoader` vs high-noise dual-model variants) and its
position in the chain.

Each slot descriptor needs: an `id`, its `class_type`, and how it anchors. The
chain terminates at the workflow's declared **output anchor** — the node that
originally consumed the model — which the injector must rewire to the last slot.

### Coefficients

Default 0.3-0.7 per the epic's practical test notes (2026-07-28, RX 7900 XT). The
range is 0.1-2.0; defaults sit mid-band, overridable per slot from params.

## Acceptance Criteria

- [ ] Slot chaining: with 2+ slots, slot *n*'s MODEL/CLIP output feeds slot *n+1*'s
      input, and the last slot feeds the declared output anchor.
- [ ] The original anchor node is rewired exactly once; no dangling reference to
      the pre-LoRA model remains in the emitted graph.
- [ ] Node ids are treated as opaque strings end to end — no `Number()` on a key
      anywhere in the injection path. Regression test with colon-grouped ids
      (depends on Defect 2 landing first).
- [ ] A single-slot stack produces the same graph shape as the current
      single-injection path (existing behavior preserved).
- [ ] Slot `class_type` is honored, not hardcoded to `LoraLoader` — Anima and Krea 2
      may need a different loader node.
- [ ] `strength_model` / `strength_clip` are per-slot params, defaulting to
      0.3-0.7, and substitute as **numbers** (depends on Defect 1).
- [ ] A declared slot whose LoRA file is absent from the installed set is reported
      clearly (not silently skipped).
- [ ] Unit test asserting the emitted graph is a connected chain: every slot has
      exactly one consumer and the anchor points at the last slot.

## Open Questions

- Explicit nodes in the operator's JSON vs declared slots + injection. Default to
  **declared slots + injection** (epic Open Question 1): the operator's workflows
  may already contain `LoraLoader` nodes, and injection is the less error-prone
  path once slots are declared. Revisit if an operator supplies a workflow whose
  LoRA chaining is too idiosyncratic to express as ordered slots.
- Anima and Krea 2 LoRA mechanisms are unverified — the operator's LoRA-stack
  workflows (requested, not yet supplied) are the input to this. If their loader
  differs from `LoraLoader`, the slot descriptor shape is settled but the default
  `class_type` is per-family rather than global.

## Technical Notes

- `discoverComfyUILoras` (`src/generation/lora/discovery-comfyui.ts:60`) reads
  LoRA names from `/object_info` → `LoraLoader` node inputs. If a family uses a
  differently-named loader node, discovery must follow — otherwise the admin
  cannot offer the operator's LoRAs in a picker.
- `buildLoraNodes` / `parseLoraString` in
  `src/image-edit/templates/builtin/lora.ts` already chain multiple LoRAs for the
  TS builtin templates. Reconcile with that helper rather than writing a second
  chaining implementation.
- The discovery cache is 5 minutes (`src/generation/lora/discovery.ts`); a newly
  uploaded LoRA is not visible until it expires. Out of scope here, but do not
  build UI that assumes immediate visibility.


git issue: df43373
