<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI builder Track B: LiteGraph separability spike

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, builder, litegraph, spike

git issue: 6ca06a4

**Summary:**

Answers open question 1 of docs/meta/research/comfyui-graph-builder-frontend-plan.md section 5. Spike: import @comfyorg/litegraph standalone outside ComfyUI frontend build, render one node on a minimal page, export API format ({class_type, inputs} map, no UI-format positions). Falls back to XYFlow/Svelte Flow (plan section 2 option 3) if inseparable. Also measures chunk size vs bundle-optimization budget (open question 2). No production code; decision record only. Blocks Track B canvas work.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
