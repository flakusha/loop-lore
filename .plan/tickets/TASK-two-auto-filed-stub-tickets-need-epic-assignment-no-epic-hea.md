<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: two auto-filed stub tickets need epic assignment — no Epic header, Summary: (none captured)

**Status:** Not Started
**Priority:** medium
**Effort:** Trivial
**Tags:** plan-hygiene

**Summary:**

Two auto-filed stub tickets from the 2026-10-07 review pass carry `**Summary:** (none captured)` and have no `**Epic:**` header. Both require a product call to assign an epic. This ticket covers both.

## Affected tickets

| Ticket file | Title (partial) | Status | Priority |
|------------|-----------------|--------|----------|
| `BUG-federation-fan-out-queues-outbox-retries-only-for-push-failu.md` | Federation fan-out queues outbox retries only for push failures | Not Started | high |
| `BUG-federation-outbox-drain-skips-export-consent-re-check-mesh-o.md` | Federation outbox drain skips export-consent re-check | Not Started | high |

Both are from commit `3fc6f6e20` (chore: Chore review tickets 2026 10 07) and were auto-filed from a review pass.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

## Options

**Option A:** Assign both to `epic-federation-swarm-sync.md`.

**Option B:** Assign fan-out retry issue to `epic-mesh-federation-content-sharing.md` and consent re-check to `epic-federation-swarm-sync.md`.

**Option C:** The epic owner decides the correct assignment.

**Acceptance Criteria:**

- [ ] Epic assigned to both tickets
- [ ] `**Epic:**` header added to both `.md` files
- [ ] `index.json` epic fields updated
- [ ] `plan:validate` passes
