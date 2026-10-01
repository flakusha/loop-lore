<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI builder: upload validation endpoint + operator reference-graph cleanup

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, builder, validation, workflow

git issue: 14920d7

**Summary:**

Implements docs/meta/research/comfyui-graph-builder-frontend-plan.md section 4 phased ticket 6. Server upload validation reuses isValidWorkflow/findDeadNodes + TERMINAL_SINK_CLASSES (src/generation/workflow-loader/workflow-validation.ts:14,31,60) with dead-node-sink rule from investigation Defect 3 (reject dead non-sink nodes; SaveImage/PreviewImage/sinks legitimate terminals). Cleans operator reference graphs (i-anima-0001.json probe findings) so library ingest stays green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
