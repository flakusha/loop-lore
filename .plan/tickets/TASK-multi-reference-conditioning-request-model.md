<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Multi-reference conditioning request model

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-reference-capability-matrix-data-model.md`, `TASK-krea-2-reference-edit-diagnosis.md`, `TASK-qwen-image-edit-21-reference-template.md`, `epic-assistant-generation-extensions.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The shared request shape for reference-conditioned generation: an ordered list of
reference assets, each with a role, plus the cross-family rule for what happens
when a family supports fewer references than were supplied.

## Context

`ImageGenRequest` in `epic-assistant-generation-extensions.md` currently carries a
single `ref_image?: string` and a single `mask_image?: string`. That is the
generation-era shape and it cannot express a two-image "pose from this, palette
from that" request — which is exactly what the reference workflows need.

Every per-family template would otherwise invent its own encoding of "these
references, in this order, with these roles", and the four templates would then
disagree about what reference #2 means. That disagreement is the failure this
ticket prevents: **one** request model, N per-family renderings of it.

The Python sidecar has a usable precedent worth stealing. Its `normalize()`
(`studio_stills.py:114-181`) accepts 1-9 references against a fixed role
whitelist (`ROLES`, `:14`), and applies **role-dependent preprocessing** per
reference — a `pose_layout` reference is downscaled to 0.01 MP then blurred before
being fed to the conditioner (`:198-202`), while a plain reference only gets
`ImageScaleToTotalPixels` (`:203-204`). Two learnings:

1. Role is not decoration; it changes the graph.
2. Ordering is explicit and bounded (1-9), not an open array.

Constraint to respect: loop-lore has no list-shaped image param yet.
`TemplateParamType` (`src/image-edit/types.ts:30-36`) has no array type. This ticket
must decide deliberately between (a) adding a list param type and (b) a
`references` field on the request envelope that templates read directly — and
record the choice rather than leaving it implicit. Note the precedent that
`TASK-multi-concept-segmentation-masks.md` chose (a bounded `max_matches` int,
not a list param type) for the same class of problem.

Assets, not paths: references are loop-lore asset ids, resolved to bytes at
submission. The sidecar takes filenames on disk (`LoadImage`) and re-pins by
sha256 against a user Pictures folder (`:148-149`) — that hash-against-a-desktop-
folder contract does not survive multi-user or container installs.

## Acceptance Criteria

- [ ] A `ReferenceSpec` type: `{ assetId, role, order }` with an explicit bounded
      role union; ordering is the array order and is preserved end to end
- [ ] Role is carried into graph construction and demonstrably changes node shape
      (role-dependent preprocessing), not just metadata
- [ ] The over-supply rule is decided and documented: a family with
      `maxReferences: 1` given 3 references either (a) rejects with the matrix's
      violation, or (b) truncates under an explicitly recorded policy. Silent
      truncation is not an option.
- [ ] References resolve from loop-lore asset ids, not filesystem paths; a missing
      or unreadable asset fails before submit, naming the asset
- [ ] Ownership/access is enforced per reference (same `checkChatAccess` class of
      gate as `src/image-edit/run-authz.ts`) — a reference from another user's
      chat must not be conditionable on
- [ ] Test: three ordered references with mixed roles render three conditionings in
      the given order; the over-supply rule behaves as documented
- [ ] `bun run check` green
