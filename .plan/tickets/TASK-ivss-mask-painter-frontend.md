<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS mask painter frontend

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, frontend, masks
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Konva/Alpine brush-mask painter producing a mask PNG stored as an asset, feeding image-edit inpaint and VACE video inpaint. AC: painting and saving a mask on an asset makes it selectable as the mask input of an inpaint run; eraser, undo, and clear included.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
Besides freehand, the initial mask can come from
`MattingService` output (`src/generation/matting/`) per `FEAT-background.md`
— whose ComfyUI backend may run easy-use `imageRemBg` → `imageToMask`.
The SAM3 concept-prompt path (`TASK-matting-concept-prompt-contract`)
stays separate and unchanged.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Painter can load an existing matting-mask asset as the initial mask
      (brush/eraser still edit on top); no matting code duplicated here.
