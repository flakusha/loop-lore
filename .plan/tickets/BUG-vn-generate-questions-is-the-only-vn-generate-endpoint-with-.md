<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: vn generate-questions is the only vn/generate-* endpoint with no rate rule — falls to chatPolicy (300/min) while its LLM-bearing siblings generate-story/generate-choices are generationPolicy

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-governance-perimeter
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The suffix rules in src/api-governance/rate-limiting/policies.ts cover /vn/generate-story and /vn/generate-choices (moved above the /api/v1/chats prefix rule during epic-api-governance-perimeter, commit ac3562dbf) but NOT /vn/generate-questions — the route is declared at src/routes/vn-generate/questions.ts:145-148 ('/:id/vn/generate-questions', mounted via vnGenerateRoutes in src/routes/v1/chats-surface.ts:56 with prefix /api/v1), so its real path /api/v1/chats/:id/vn/generate-questions ends with none of the suffix patterns and first-match resolution lands it on the /api/v1/chats chatPolicy prefix (300/min, burst 50). Every request assembles prompts and calls an LLM provider through the same generation pipeline as its siblings (see questions.ts header: 'POST /api/chats/:id/vn/generate-questions' — helper + provider call, mirrors choices.ts step for step), so UI-volume budgeting is wrong — same defect class as S-5 / BUG-ai-action-billable-llm-endpoint-classified-300-min-chatpolic. Found during epic-api-governance-perimeter while hoisting the shadowed suffix rules; left out of that diff to keep scope to the rules already on the books.

Fix direction: add ['/vn/generate-questions', generationPolicy, 'suffix'] to routePolicies inside the suffix block that sits above the /api/v1/chats prefix (below it the rule is dead code — first-match wins), extend the dead-rule-order guard in src/api-governance/rate-limiting/policies.test.ts, and pin with a wiring test in src/routes/v1/governance-integration.test.ts following the ai-action/link-preview pattern. Caveats checklist: no data race (policy table is a static module constant read per request); authorization unaffected (route-level access checks unchanged); idempotency of retry — rate limiting is per-request accounting, retrying a 429 is client-visible only; observability — 429s land in the existing loop_lore_rate_limited_total metric; rollback = revert the one-line rule + test pins.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
