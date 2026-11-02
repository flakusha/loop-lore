<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Model provider download entry: Ollama pull-through with fit verdicts

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Server-side model download entry point (research: .tmp/research/comfyui-workflows/model-download-entry.md). Browser slice complete (catalog/downloader/IDB/manager); server has discovery only (listModels/healthCheck, no pull). Phase 1: proxy Ollama POST /api/pull with progress stream, record llmfit-style fit verdict into model_rankings (basis formula, 7d expiry), upsert model_capabilities row. Entry UI: recommended-models list filtered by fit verdict. Out of scope: auto-download, HF download (phase 2), Manager node parity (phase 3).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
