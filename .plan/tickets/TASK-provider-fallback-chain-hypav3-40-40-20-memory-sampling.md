<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Provider fallback chain + HypaV3 40-40-20 memory sampling

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** fallback, memory, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Two portable Risu internals (research 03/04/06): (1) requestChatData iterates fallbackModels on fail/blank (fallbackWhenBlankResponse, db.requestRetrys) — the concrete shape for our provider-health/failover gap; (2) HypaV3 40% recent / 40% similar / 20% random summaries (memoryTokensRatio 0.2, maxChatsPerSummary 6, rate caps 20 summ + 100 emb/min) — the random slice is anti-echo-chamber, one line to copy into aux-enrichment. Split if sizes diverge; both land in memory/ + provider-health. Research: .tmp/research/ai-cheat/03-expanded-takes.md, 04-code-internals.md Risu section, 06-observability-sandbox.md Risu section.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
