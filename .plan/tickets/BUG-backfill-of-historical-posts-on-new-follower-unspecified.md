# BUG: Backfill of historical posts on new follower unspecified

**Status:** [OK] Done - closed per user approval, no implementation required (2026-09-16)
**Priority:** low
**Effort:** Medium

## Summary

FEAT-activitypub-federation does not specify paginated outbox backfill when a world gains a follower. Gap. Fix: add backfill AC mirroring Mastodon or Lemmy outbox pagination.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Assessment (2026-09-16, fix-batch-20260916 - closed, no implementation)

No outbox exists to backfill from. `src/routes/federation.ts` is a
nodeinfo/capabilities stub; the only AP surface is signing keys
(`src/crypto/activitypub-keys.ts`) + consent gate
(`src/characters/services/federation-consent.ts`). No `outbox` table,
route, or pagination anywhere in `src/`. Per user approval 2026-09-16:
closed with no implementation. Reopen when an outbox ships, or fold into
FEAT-activitypub-federation as an acceptance criterion.
