<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Enrich vector-gen ticket Context from placeholder pointers

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-memory-knowledge-systems.md
**Tags:** memory

**Summary:**

The vector-gen tickets and epic now satisfy the plan format gate, but the Context/Overview markers are pointers ("See ## Summary below", "(see sections below)"). Fill them with the actual constraint text so the metadata is useful without opening the body: LLM SVG path is gated by the validate.ts mime allowlist (stored-XSS hardening, BUG-asset-serve-public-immutable-cache-inline-svg-exposure); animated-raster reuses generateImages + persistGeneratedImages/createAsset with duration_secs and adds no video-model code. Files: .plan/tickets/TASK-vector-gen-llm-svg-pipeline.md, .plan/tickets/TASK-vector-gen-animated-raster.md, .plan/epics/epic-vector-graphics-generation.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
