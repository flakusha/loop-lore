<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Document text sidecar at upload (pdf/md/txt) for future RAG retrieval

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Research note 09-docs-svg-slides: assets accept pdf/application-json/text but gallery upload only offers image/audio/video, and attached docs stay opaque blobs with no text extraction, chunking, or retrieval. SillyTavern Data Bank pattern: extract text at ingest, store sidecar, chunk + top-K retrieve into prompt. Cheapest step: at upload, extract text (pdf-text-only/md/txt first, no new deps) into a document-text sidecar next to the asset; retrieval later. Source: .tmp/research/ai-cheat/09-docs-svg-slides.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
