# TASK: Moderator permission gating for read-only review surface

**Status:** ⬜ Not Started
**Priority:** high

**Tags:** moderation, admin, permissions, nsfw, rbac
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-nsfw-flagqueue-leaks-reporter-pii.md` (queue projection), `BUG-nsfw-modactions-performedby-from-body.md` (action authz), `TASK-user-seeding-role-expansion.md` (RBAC foundation), `src/users/permissions.ts:54-82` (matrix), `src/routes/nsfw-moderation/shared.ts:18-25` (`requireAdmin` checks `admin.system`), `src/users/permissions.test.ts:23-27` (moderator perm grants).

## Plan

1. Add `requireModerationReview` / `requireModerationAction` to `src/routes/nsfw-moderation/shared.ts`.
2. Swap `requireAdmin` → `requireModerationReview` in `flags.ts` GET and `audit.ts` (read paths).
3. Swap `requireAdmin` → `requireModerationAction` in `actions.ts` and `overrides.ts` (write paths).
4. Extend `src/routes/nsfw-moderation/flags.routes.test.ts` with moderator role coverage; add equivalent tests for `audit.ts`, `actions.ts`, `overrides.ts`.
5. Run `bun test src/routes/nsfw-moderation/ src/users/permissions.test.ts`.

## Out of scope (separate tickets)

- PII redaction in flag queue / mod-action audit — `BUG-nsfw-flagqueue-leaks-reporter-pii`, `BUG-nsfw-modactions-performedby-from-body`.
- Field allowlist for admin/audit — `BUG-admin-audit-selectAll-schema-mismatch-empty`.
- AUX telemetry hashing — `BUG-admin-auxtelemetry-leaks-userid-chatid`.
- Separate moderator UI view — `TASK-admin-content-review-queue` follow-up.
- Review queue pagination UI — `admin-review.ts` hardcodes `limit=50`; orthogonal to gating (future UX work).

## Summary

Fix permission bug: moderator role granted moderation.review + moderation.action perms but every review/action/audit endpoint hard-gates on admin.system. Endpoints under /api/nsfw/moderation/{flags,audit,actions,overrides} must honor the moderator-scoped permissions so moderator users can actually use the review surface.

Tasks:
- Add requireModerationReview and requireModerationAction helpers in src/routes/nsfw-moderation/shared.ts (accept moderator, admin, solo, tester; deny user/player/viewer/guest/bot/creator).
- Replace requireAdmin in src/routes/nsfw-moderation/flags.ts (GET path) and src/routes/nsfw-moderation/audit.ts with requireModerationReview.
- Replace requireAdmin in src/routes/nsfw-moderation/actions.ts and src/routes/nsfw-moderation/overrides.ts with requireModerationAction.
- Add tests asserting moderator passes each gated route; user/player/viewer denied; admin/solo/tester still pass.
- Document that moderator role now has functional read access to flag queue, audit log, and mod-action API.

Out of scope (separate tickets): redaction of PII in flag queue / mod-action audit (BUG-nsfw-flagqueue-leaks-reporter-pii, BUG-nsfw-modactions-performedby-from-body), field allowlist for admin/audit (BUG-admin-audit-selectAll-schema-mismatch-empty), AUX telemetry hashing (BUG-admin-auxtelemetry-leaks-userid-chatid), separate moderator UI view (TASK-admin-content-review-queue follow-up).

Acceptance:
- moderator role: GET /api/nsfw/moderation/flags returns 200 (not 403).
- moderator role: GET /api/nsfw/moderation/audit/:userId returns 200.
- moderator role: POST /api/nsfw/moderation/flags/{block,ban,shadow} returns 200.
- user role: same endpoints still return 403.
- admin/solo/tester: continue to pass.
- bun test src/routes/nsfw-moderation/ and src/users/permissions.test.ts green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
