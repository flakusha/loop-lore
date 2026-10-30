<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: model news ingestion pipeline

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Greenfield feed fan-in + news table + cron: HF model API (/api/models filter=gguf sort=lastModified, per-model /commits/main for weight-change confirmation, card + tree), GitHub releases.atom for runtimes (llama.cpp, llama-swap, tabbyAPI, Ollama, LocalAI, vLLM), HF/Ollama blog RSS, arXiv Atom API. News gets its own table (event, not score). Spec: .tmp/research/llmfit/08-news-feeds.md section F.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
