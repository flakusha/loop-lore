<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Group chat NATURAL speaker selection

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

epic-story-mode-ui turn-order covers LIST-style initiative; ST NATURAL (LLM picks next speaker from history, talkativeness roll, POOLED fallback) not covered. Scope: activation prompt over recent messages parsing a character name, per-character talkativeness 0-1, fallback pooled; functions activateNaturalOrder/generateGroupWrapper analogues. Research: metaapps DeepWiki group-chat Q&A. Follow-up to story-mode-ui lane.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
