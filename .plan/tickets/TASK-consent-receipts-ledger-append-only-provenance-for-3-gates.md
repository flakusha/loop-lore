<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: consent receipts ledger (append-only provenance for 3 gates)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-security-sandboxing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Compliance consent proposal 3. consent_receipts table (user, purpose, granted/withdrawn, provenance, policy version) fed by 3 existing gates unchanged (federation_consent + AP-mint gate, chats.federation_consented_at + authorizeChatExport + fan-out/outbox re-checks, NSFW nsfw_consent_state + nsfw.consent vocab); user ledger + withdrawal calling existing revoke paths; in export bundle. Receipt writes server-side from enforced gates only (client consent=true claim never trusted); withdrawal calls existing revoke paths with same caller checks; ledger read scoped to owner/admin.

Owner: epic-security-sandboxing.md (Not Started). Verified: federation_consent default 0 001_init.ts:1487; service federation-consent.ts (false not equal revocation :82-84); AP-mint gate activitypub-keys.ts:50-53 + webfinger :62-63; federation_consented_at 037:18-20 + clearance.ts:64-107 + re-checks; NSFW state + nsfw.consent.* vocab chat/types/nsfw.ts:85-88. No consent_receipts table (negative). Distinct from TASK-consent-schema.md (shared TypeBox schemas, Done) and TASK-add-consent-route-and-ui (chat federation grant/revoke UI): this ticket owns the append-only receipt ledger fed by those gates.

Acceptance: every consent change writes receipt; withdrawal same-request via existing revoke paths; export round-trips; per-test user + purpose, receipt ordering by unique timestamps/ids, no shared ledger table state.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
