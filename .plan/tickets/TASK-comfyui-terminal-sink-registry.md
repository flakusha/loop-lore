<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI terminal sink registry

**Status:** In Progress
**Priority:** high
**Effort:** Small
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, comfyui, workflow
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Workflow-loader sink registry (TERMINAL_SINK_CLASSES in workflow-validation.ts:14-21) lacks DaSiWa and VHS terminal nodes. loader.ts:169-180 rejects any graph with unreferenced non-sink nodes, so the pinned v-0010 DaSiWa MiniMax H3 graph is skipped as 'dead nodes' and no H3 workflow can load.

**Context:**
Discovered in the 2026-11-19 ComfyUI-side audit. A converted v-0010 graph has unreferenced DaSiWa_NodeStatusSwitch, DaSiWaH3ContinuityPublish, ResolutionSelector and ModelPatchTorchSettings nodes; the converter already allowlists those four in UNREFERENCED_LIVE_CLASSES. Reuse that set and add the DaSiWa/VHS media sinks used by the pinned catalog. Unknown non-sink nodes must still be rejected.

**Acceptance Criteria:**

- [ ] UNREFERENCED_LIVE_CLASSES reused; DaSiWa_EnhancedVideoCombine, DaSiWaH3ClipAssemble, VHS_VideoCombine added to TERMINAL_SINK_CLASSES
- [ ] v-0010 DaSiWa fixture loads with no dead-node warning
- [ ] A genuinely unreferenced unknown node is still rejected
