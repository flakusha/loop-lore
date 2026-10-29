<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: account hard-delete orchestrator (erasure end-to-end)

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-security-sandboxing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Compliance erasure proposal 1. deleteAccountData transaction: owned chats (hardDeleteChat) to characters to assets/links to keys/e2e + key destruction to memories/sessions/prefs to FTS; audit rows soft-only; federated revocation (AP rotation, consent cleared, outbox dead-letter); pre-erasure summary; 30d backup-purge window + explicit immediate-purge opt-in (purge-cron pattern).

Owner: epic-security-sandboxing.md (Not Started, no GDPR content; no sandbox). Verified: hardDeleteChat visibility.ts:63-72 + routes; message hard=true routes/messages/update.ts:69-72; moderation deleteUserData data.ts:130-132 + route (audit-preserving, pinned data.test.ts:103-209); DELETE /api/admin/users/:id 204/403 (users.test.ts:134-146). Absent: no account orchestrator, no backup-purge window, no retention table. Federation: DEK rewrap clearance-bound, tier refusal, plaintext never crosses.

Refs: Nextcloud subject rights https://docs.nextcloud.com/server/stable/admin_manual/gdpr/subject_rights.html (adapt CLI+UI per-right pairing + pre-erasure metadata summary); Nextcloud retention https://docs.nextcloud.com/server/latest/admin_manual/gdpr/data_retention.html (adapt windows + backup-purge SLA); Nextcloud RoPA https://docs.nextcloud.com//server/stable/admin_manual/gdpr/personal_data.html (adapt per-table inventory as erasure checklist); Mastodon move https://docs.joinmastodon.org/user/moving (adapt export-then-delete ordering + tombstone); EDPB rights https://www.edpb.europa.eu/sme-data-protection-guide/respect-individuals-rights_en (adopt as Art.17/20/7 checklist).

Acceptance: no user rows remain except tombstoned audit; export-then-delete fixture; no decryptable DEK on peers; per-test user + owned rows (uid), isolated mesh_outbox/audit, afterEach close, no shared admin fixture, concurrent-delete proves idempotent second call. Blocking: must NOT hard-delete moderation audit (provenance pin); must clear consent + dead-letter outbox + rotate AP keys.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
