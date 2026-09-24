<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Backfill of historical posts on new follower unspecified

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** done
**Priority:** low
**Effort:** Medium

## Summary

FEAT-activitypub-federation does not specify paginated outbox backfill when a world gains a follower. Gap. Fix: add backfill AC mirroring Mastodon or Lemmy outbox pagination.

## Acceptance Criteria

- [ ] Runtime backfill implemented (lands with `FEAT-activitypub-federation` — no outbox exists yet)
- [x] Documentation updated
- [x] Tests passing (no runtime surface to test; existing suites unaffected)

## Assessment (2026-09-16, fix-batch-20260916 - closed, no implementation)

No outbox exists to backfill from. `src/routes/federation.ts` is a
nodeinfo/capabilities stub; the only AP surface is signing keys
(`src/crypto/activitypub-keys.ts`) + consent gate
(`src/characters/services/federation-consent.ts`). No `outbox` table,
route, or pagination anywhere in `src/`. Per user approval 2026-09-16:
closed with no implementation. Reopen when an outbox ships, or fold into
FEAT-activitypub-federation as an acceptance criterion.

## Verification (2026-09-24)

Re-verified the assessment against current `src/`: still no outbox table,
route, or pagination — `blog_follows` is a local user→author edge, not a
federated actor. Took the ticket's own "fold into FEAT" path:

- `FEAT-activitypub-federation.md` AC now specifies the backfill explicitly:
  newest-first Mastodon/Lemmy-style `OrderedCollection` pages over a recent
  history window, capped by count and age.
- `matrix-federation-decisions.md` C9 (Backfill policy) records the decision
  as decided with the same bounds.

Runtime behavior remains owned by `FEAT-activitypub-federation`; reopen this
ticket only if that ticket ships without the backfill AC.
