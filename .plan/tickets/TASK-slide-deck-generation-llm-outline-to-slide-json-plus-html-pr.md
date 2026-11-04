<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Slide deck generation: LLM outline to slide-JSON plus HTML present view

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Research note 09-docs-svg-slides: zero in-tree presentation support (no deck model, renderer, exporter). Outside pattern (SlidesAI/Gamma): document to outline, outline to editable slides, export PPTX last. Boring path: LLM doc to outline, outline to slide-JSON, HTML present view reusing views/, PPTX exporter only after the HTML deck exists. No new dependency until the HTML deck exists. Deferred: full editable-deck parity, PPTX export. Source: .tmp/research/ai-cheat/09-docs-svg-slides.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
