<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — schedule VN Sprite Staging cluster (post-VN core)

**Status:** open
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** The 6-issue VN sprite staging cluster (open-untriaged.md § New clusters) covers emotion-driven staging, alpha matting, speaker highlight, multi-character ordering, and per-chat roster. Each has an existing ticket pointer (TASK-vn-emotion-mood-and-action-driven-sprite-staging, TASK-vn-sprite-center-face-anchor-setup-and-detection-for-generat, TASK-vn-alpha-extraction-matting-job-for-opaque-character-images, TASK-vn-active-speaker-sprite-highlight-and-dimming, TASK-vn-multi-character-sprite-ordering-and-positioning, TASK-vn-character-sprite-roster-per-chat). This ticket captures the batch into one tracking ticket so the VN follow-ups (P2-A remainder) ship as one workstream, not re-mined piecemeal.
**Context:** Per priority-p0-p2.md § P2-A details, VN mode is complete; the open follow-ups are gallery-in-scene inheritance and bun test src/story/ verification. The 6 staging tickets are scoped under that follow-up; suggested home is P2-A VN follow-ups.

## Issues in scope

| Git issue | Topic | Existing ticket |
| --- | --- | --- |
| e99e21e | mood/action-driven staging | TASK-vn-emotion-mood-and-action-driven-sprite-staging.md |
| 5cf8b16 | center/face anchor | TASK-vn-sprite-center-face-anchor-setup-and-detection-for-generat.md |
| ea6d881 | alpha matting | TASK-vn-alpha-extraction-matting-job-for-opaque-character-images.md |
| 2fba05b | speaker highlight | TASK-vn-active-speaker-sprite-highlight-and-dimming.md |
| 9da9517 | multi-character ordering | TASK-vn-multi-character-sprite-ordering-and-positioning.md |
| 9cac2d4 | per-chat roster | TASK-vn-character-sprite-roster-per-chat.md |

**Acceptance Criteria:**

- [ ] Each of the 6 git issues is linked (body or comment) to its existing ticket file.
- [ ] Execution order documented: alpha matting (foundational) → center/face anchor → mood/action staging → speaker highlight → multi-character ordering → per-chat roster (consumer order).
- [ ] index.json updated via plan:sync:fix; no duplicate ticket created.
- [ ] bun test src/story/ green; gallery-in-scene inheritance verified separately under TASK-visual-novel-mode.md (already ✅).

**Tags:** vn, sprite, staging, alpha-matting, emotion
**Related:** .plan/backlog/open-untriaged.md § New clusters, .plan/backlog/priority-p0-p2.md § P2-A, .plan/tickets/TASK-visual-novel-mode.md


git issue: d13502f
