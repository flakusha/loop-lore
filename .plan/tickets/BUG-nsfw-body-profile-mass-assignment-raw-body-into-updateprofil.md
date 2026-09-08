# BUG: NSFW body profile mass assignment — raw body into updateProfile

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/nsfw/body.ts:37 — PUT passes raw ctx.body as Record<string,unknown> straight into updateProfile dispatch. Fix: whitelist fields via t.Object body. Related validation majors: key-management.ts:70 manual re-validation bypasses declared t.Object, unbounded name length; export.ts:44 request.json() cast with no size limit or schema; http-utils/parse.ts:38 str()/num() blind-cast body values (types lie at runtime); message-reactions.ts:146 emoji unconstrained (arbitrary length stored); users/me.ts — verify PATCH /me whitelists updatable fields vs raw spread.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: body.ts bodyUpdateSchema bounds/enums; Elysia 422s unknown keys.
