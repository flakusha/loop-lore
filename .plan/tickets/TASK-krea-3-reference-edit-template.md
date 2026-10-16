<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Krea 3 reference-edit workflow template

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-krea-2-reference-edit-template.md`, `TASK-krea-2-reference-edit-diagnosis.md`, `TASK-reference-capability-matrix-data-model.md`, `epic-model-family-presets.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The `krea-3-edit` ComfyUI workflow plus a capability-matrix row for Krea 3 — a
family loop-lore has never run.

## Context

Krea 3 appears in `.plan/` **only as an unimplemented bullet** — in
`epic-comfyui-plugin`, `epic-assistant-generation-extensions`,
`epic-reference-conditioned-generation` (an unchecked task line, plus a capability-
matrix scope note), and `epic-technical-comparison-charts` (a variant axis).
`epic-model-family-presets.md` specifies a `krea-2` preset and no Krea 3 one; the
17-family reference table in that epic has no row for it. The only Krea-family
*knowledge* in the repo is the hedged Krea 2 row ("Not working | ~12GB | needs
retest") in `epic-comfyui-plugin.md` and `epic-assistant-generation-extensions.md`.
No epic claims a Krea 3 measurement; every mention is a name in a plan, not a
result.

That is the honest starting position and it must stay visible: **there is no
recorded observation of Krea 3 at all.** The first task is to establish whether
the weights, the node pack, and the license are even available to this project —
before authoring a workflow against an assumed node graph. A template written from
a release announcement is a fabrication.

The Krea 2 diagnosis (`TASK-krea-2-reference-edit-diagnosis.md`) is the cheapest
possible preview of what will go wrong here. Note that both pipeline defects it
cites are already **fixed** — substitutor type coercion and LoRA node-id
allocation are ruled out there, so do not carry either forward as a Krea 3
hypothesis. Read its write-up for the *method* (diagnose before authoring); do
not re-diagnose and do not copy its now-stale defect list.

Scope note: Krea 3 vs Krea 2 is a **model swap inside one template family**, not a
new transport surface. If the two share a graph shape, prefer one parameterized
template over two near-duplicates — `epic-comfyui-plugin.md` already established
that new usecases are template variants consumed by the same call.

## Acceptance Criteria

- [ ] Availability recorded: weights present? which ComfyUI node classes load it?
      The answer lands as a capability-matrix row, not as prose in a ticket
- [ ] If the model is not obtainable or the node pack does not exist, this ticket
      closes `Wontfix` with that finding recorded — that is a valid and useful
      outcome, and it is what the matrix is for
- [ ] If available: `configs/workflows/krea3-edit.json` builds a valid graph from
      the shared reference request model
- [ ] `required_nodes` verified against `/object_info`, template registered in
      `templateRegistry`, result persisted as a loop-lore asset
- [ ] Whether Krea 2 and Krea 3 share a parameterized template or need separate
      ones is **decided and recorded**, not left to whoever edits it next
- [ ] Test: template builds and substituted output passes `isValidWorkflow`
- [ ] `bun run check` green
