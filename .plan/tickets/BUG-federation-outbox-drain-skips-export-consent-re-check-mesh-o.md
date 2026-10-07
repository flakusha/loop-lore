<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Federation outbox drain skips export-consent re-check (mesh_outbox has no chat_id)

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Evidence (approved finding 5, P2; .tmp/concern-dev-2026-10-07.md, .tmp/concern-federation.md): src/federation/outbox.ts:166-175 — runMeshOutboxPass re-pushes stored envelopes with no clearance re-check, and mesh_outbox (migration 038) stores no chat_id/world_id, so authorizeChatExport cannot be re-applied from the row at all. The per-chat gate (authorizeChatExport, default-deny, issue 41f4f83) is enforced only up-front per target in fan-out (src/federation/fan-out.ts:166-175) before the initial reserve/push. Executed evidence (.tmp/review/repro-consent.ts): consented chat fan-out with a failing push queues a row; revokeChatFederationConsent then authorizeChatExport DENIES (no-consent); the drain pass still returns {checked:1, delivered:1} with reserve+deliver POSTs and flips the row to done. Impact: consent revoked (or tier changed away from standard) after a failed push leaves pending rows that keep delivering that chat's sealed content on the backoff schedule (~2.1h across 8 attempts, 2-min cron); the duplication-policy target list is not re-checked either (a peer removed from policy still receives pending rows) — violates 'Mesh membership alone MUST NOT imply clearance' (clearance.ts header). Fix: record chat_id (nullable) on mesh_outbox; in the drain, re-run authorizeChatExport for rows with a chat id and dead-letter (or drop) rows whose gate now denies; optionally re-resolve duplication targets too.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
