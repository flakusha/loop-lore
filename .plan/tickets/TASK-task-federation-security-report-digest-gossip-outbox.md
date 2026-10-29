<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-federation-security-report-digest-gossip-outbox

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing

**Summary:**

Owner epic: `.plan/epics/epic-mesh-federation-content-sharing.md`

## Background

Content/workload federation exists, but there is no federated security-intel plane (grep `SecurityReport|threat.?intel` in `src/` = no hits). Reusable primitives already in tree:

- Gossip trust tiers: `src/federation/gossip.ts:12-16` (`trusted` = explicit config peers, `pending` = seeds + gossip-learned); caps `MAX_PAYLOAD_PEERS=128` (`gossip.ts:33`), `MAX_TABLE_SIZE=1024` (`gossip.ts:35`).
- HMAC proof pattern: `src/federation/mesh-proof.ts:29-54` (canonical-JSON HMAC-SHA256; timing-safe verify at `:63-72`).
- Retry outbox: `src/federation/outbox.ts:25-29` (`OUTBOX_MAX_ATTEMPTS=8`, `BASE_BACKOFF_MS=60_000`, `BATCH=25`); `queueOutboxRetry()` upsert on `(target_origin, content_id)` at `:43-68`.
- Inbound trust chain: `src/federation/peer-work-auth.ts:1-44` (6-layer fail-closed). Template for the new endpoint auth.

Established solutions: Mastodon `DomainBlock + appeal` (local override wins, federation advisory only) - https://docs.joinmastodon.org/admin/moderation/ ; gozzip trust-weighted gossip digests over the existing poll loop - https://gozzip.org/docs/design/moderation . Full MISP/STIX/TAXII stack DEFERRED (interop tax, zero peers speaking it today).

## Change

1. Schema `src/federation/security-report.ts` - `SecurityReport` + hashed/metric-only `Evidence` (`redactedSnippet <= 80 chars`); `verifySecurityReport()` reusing `mesh-proof.ts` canonical-HMAC + `telemetry-id-hashes.ts` formats.
2. Ingest `POST /api/federation/security-report` - peer-work-auth-style layers, per-origin sliding-window limit via `RateLimitStore`, dedup on `(reporterOrigin, reportId)`, store to `pending` signals table via migration.
3. Propagation - gossip-pull digests piggybacked on `GossipService` poll; `critical`-only targeted push via `queueOutboxRetry()`; amplification guard (re-broadcast counts against `reporterOrigin` quota, no re-signing).
4. Corroboration - actionable iff >=2 independent `trusted` reports on same `(subjectHash, category)` in TTL window OR 1 `critical >= 0.95` OR local classifier hit; else risk-score signal only.
5. Dispute/appeal - `POST /api/federation/dispute`, moderator queue, `disputed` terminal flag stops blocklist influence; both directions rate-limited + audit-logged.

## Acceptance

- No raw prompt/user text persisted in report or audit tables (grep + test with canary strings).
- Duplicate delivery idempotent; forged HMAC rejected; over-quota origin 429s.
- `pending`-peer reports stored but never actioned; `trusted`-only action path covered by test.
- Dispute marks entry `disputed` and removes blocklist influence; audit trail has receive-verify-corroborate-action-dispute chain.

**Caveats:** TOCTOU: corroboration count and action run in one transaction; re-check `disputed` at action time. Security: never persist raw content, hashed metrics only, redacted before validation. Authorization: ingest peer-authenticated, dispute resolution moderator-only. Partial failure: gossip fan-out best-effort, never blocks ingest. Rollback: migration adds tables only. Idempotency: `(reporterOrigin, reportId)` unique, replays no-ops. Observability: audit-log every transition.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
