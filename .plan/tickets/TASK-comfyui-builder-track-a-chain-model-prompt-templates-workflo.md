<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI builder Track A: chain model + prompt_templates workflow-modality persistence

**Status:** Done
**Status Note:** Done 2026-10-01 — commit a8e01ade (chain model, graph validation, run jobs)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, builder, workflow, prompt-templates

git issue: f021379

**Summary:**

Implements Track A phase 1 of docs/meta/research/comfyui-graph-builder-frontend-plan.md section 4 (phased ticket 1). Saved builder chain = ordered list of WorkflowTemplate steps with per-stage param bindings, persisted as a prompt_templates row with workflow modality per the first-class-citizen epic amendment (inline graph in payload, payload variant, TemplateModality enum sites, parseTemplatePayload + apply.ts branches). Depends on epic-comfyui-first-class-citizen workflow-library amendment work. Acceptance: chain CRUD round-trips through prompt_templates; chain-run delegates to handleRun. Blocked on handleRun IDOR authz close (epic-comfyui-plugin Phase 0) before exposing run to non-operator roles.

**Context:**

No new migration: chains persist as prompt_templates rows with modality `workflow`, payload `{ kind: "chain", steps: [...] }` (kind discriminates chain vs graph rows; graph rows are skipped by chain listing). Validation lives in chain-types.ts (validateChainPayload); async runs are in-memory jobs (run-job-store.ts) delegating each step to handleRun.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
