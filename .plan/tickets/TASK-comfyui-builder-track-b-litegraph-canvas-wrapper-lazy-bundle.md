<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI builder Track B: LiteGraph canvas wrapper + lazy bundle

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, builder, litegraph, canvas

git issue: df1261a

**Summary:**

Implements Track B canvas of docs/meta/research/comfyui-graph-builder-frontend-plan.md section 4 (phased ticket 5), gated on the LiteGraph separability spike passing. Alpine wrapper owns canvas element; LiteGraph lazy-loads as separate bundle outside alpine-init (chat-vendor.js precedent); node palette fed by getNodeInfo; Export/Run call submitWorkflow/runWorkflow (src/generation/providers/comfyui.ts) targeting API format directly. Progress subscription blocked on TASK-comfyui-first-class-client-id-websocket-progress-in-comfyuic (client_id + /ws).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
