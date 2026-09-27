<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Minimal video generation dispatch route for workflow engine

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-workflow-engine
**Tags:** assistant, workflow, video

**Summary:** configs/templates/workflows/defaults.yaml dispatches video-minimax-h3 to a generation-video target but src/routes/generation/video.ts does not exist; workflow confirmRun dead-ends. Add minimal POST /api/generation/video accepting the dispatch envelope, auth-gated, returning 202 with job id.

**Context:** Verified 2026-09-26: src/routes/generation/video.ts and third-party.ts both missing; the YAML dispatch envelope has no HTTP receiver. Minimal stub unblocks the Minimax H3 workflow end-to-end.

**Acceptance Criteria:**

- [ ] Workflow confirmRun reaches the route (test); unknown dispatch targets still error cleanly.
- [ ] `bun run check` green.
