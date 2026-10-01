<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI builder Track A: chain model + prompt_templates workflow-modality persistence

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, builder, workflow, prompt-templates

git issue: f021379

**Summary:**

Implements Track A phase 1 of docs/meta/research/comfyui-graph-builder-frontend-plan.md section 4 (phased ticket 1). Saved builder chain = ordered list of WorkflowTemplate steps with per-stage param bindings, persisted as a prompt_templates row with workflow modality per the first-class-citizen epic amendment (inline graph in payload, payload variant, TemplateModality enum sites, parseTemplatePayload + apply.ts branches). Depends on epic-comfyui-first-class-citizen workflow-library amendment work. Acceptance: chain CRUD round-trips through prompt_templates; chain-run delegates to handleRun. Blocked on handleRun IDOR authz close (epic-comfyui-plugin Phase 0) before exposing run to non-operator roles.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
