<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Automated NSFW content detection integration

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-nsfw-moderation-priority
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Discovered in the epic-nsfw-moderation-priority reconciliation pass. No auto-detector exists in src/ today: the moderation flag pipeline only hashes reporter PII (reporterHash, HMAC-derived — src/routes/nsfw-moderation/flags.ts:8-10); flags enter the queue exclusively via user reports through POST /api/nsfw/moderation/flags (open to authenticated users, flags.ts:34-36 requireUserId) and are queued/resolved via NsfwModerationService (src/nsfw/moderation-service.ts). Scope: integrate a detection provider (external classifier API or local model) behind the existing moderation flag pipeline so auto-detected content enters the same flag queue with the same redaction/queue-view invariants. Acceptance: (1) provider-abstracted detector service; (2) flags created by the detector carry a machine-source marker distinct from user reports; (3) tests; (4) config gate, off by default.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
