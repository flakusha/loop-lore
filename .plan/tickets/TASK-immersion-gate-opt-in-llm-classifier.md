<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: immersion gate opt-in llm classifier

**Status:** Not Started
**Priority:** high
**Epic:** epic-immersion-consistency-gate
**Tags:** immersion
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

WI-4 of epic-immersion-consistency-gate: opt-in LLM consistency classifier as an aux-pipeline sidecar (template registry descriptor, AuxTaskName), flow-control budget-governed (src/generation/flow-control.ts). Downgrade-only precedence vs deterministic verdicts; default OFF; never blocks the deterministic default path. See .plan/epics/epic-immersion-consistency-gate.md.

**Context:**

Regex cannot catch prose-level contradictions; the classifier covers those but must not create false-positive lockouts — it may only downgrade deterministic severity. Budget governance via flow-control keeps it from blocking the default path.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
