<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Consent TOCTOU: revoking a chat consent during a fan-out round still exports once

**Status:** Done
**Priority:** low
**Effort:** Small
**Tags:** federation
**Status Note:** [2026-10-26] fixed — the earlier Wontfix verdict was overturned: `fanOutContent` now re-checks `authorizeChatExport` between `requestReservation` and `pushEnvelope` (src/federation/fan-out.ts:230-239), and a mid-window denial is classified non-retryable so no outbox row is queued; a deterministic regression test revokes consent inside the reserve handler and asserts no push and no retry (3699bccda).

**Summary:**

authorizeChatExport (src/federation/clearance.ts:83-96) reads consent once; the fan-out sequence (gate -> requestReservation -> push, src/federation/fan-out.ts) can complete even if federation_consented_at flips back to NULL mid-round, so a revoke landing between check and push still exports once. Fix: re-check consent after reservation and before push, or snapshot consentedAt in the mesh_dek_exports audit row and alert on mismatch.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Resolution

Not a live defect, and the proposed fix point is wrong. `fanOutContent`
(`src/federation/fan-out.ts:143`) has zero production callers — the only
references are `src/federation/clearance.test.ts`, `src/federation/sharing.test.ts`,
and `docs/review/federation-local-multi-instance-review.md:63`. No production
path reaches the fan-out sequence, so no mid-round revoke window exists.

Re-checking consent before `pushEnvelope` (the ticket's fix) sits *after*
`requestReservation` (`src/federation/fan-out.ts:179`). A denial there would
leak the receiver-side reservation until TTL, because there is no sender-side
release route (`src/federation/fan-out.ts:9-11`). It would also land inside the
catch at `:205-211`, which queues a retry for ANY failure after the gate —
contradicting the comment at `:202-203` that a consent denial is not retryable.
The existing gate position (before reservation, `:168-175`) is correct.

Wontfix rather than Done: the defect as described does not exist, so there is
nothing to implement and no code change was made. If a sender trigger is ever
wired, the correct treatment is to move the gate earlier, not later.
