# TASK: Unify backend 401/Unauthorized guard helpers

**Status:** 🟢 Done (2026-08-06) — remaining raw-401 route sites migrated in `c99704c1`; only deliberate exclusions remain (separate module families, handler-funneled files)
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-code-quality
**Related:** `TASK-code-quality.md`, commits `8620744a` (requireCtxUser added), `4e875094`

## Summary

The codebase has **three competing "require user" helper families** and ~5 divergent
401-construction idioms across **26 route files**. The fork predates recent work:
`src/routes/http-utils.ts` already ships `requireUserId(ctx) -> string | Response`,
and a parallel `requireCtxUser(ctx) -> string | Response` was added in
`src/routes/actor-auth.ts` (commit `8620744a`) without noticing the existing helper.
Unify backend logic into one canonical, localizing guard; frontend needs no change
(it keys on `status === 401` only — verified, see Notes).

## Acceptance Criteria

- [x] Exactly one `requireUser`-style helper survives (`requireUserId` in `http-utils.ts`), localized via `ctx.t?.("errors.unauthorized") ?? "Unauthorized"`
- [x] `actor-auth.requireCtxUser` deleted; availability + mood migrated onto the canonical helper
- [x] The 38 uniform multiline `jsonError({ message: ctx.t?... })` sites (Variant A) migrated (avatars, emotions, io, licensing, relationships, characters, admin-overrides, export, export-sse) — done in prior commits
- [x] `blog.ts` inline-401 `extractAuth` sites (7) migrated to `requireUserId` (2026-08-05)
- [x] All migrated responses: `status: 401`, body `{ error, code }`, message localized — **behavior-preserving** vs the pre-existing inline guard
- [x] Full routes suite green; typecheck clean
- [x] Variant B/C/D/E + raw `jsonError("Unauthorized")/ctx.userId` sites migrated to canonical factories (`requireUserId` / `unauthorizedResponse`) in `c99704c1` — admin-nsfw(3), admin-templates(7), character-emotion-avatars(6), character-traits GET /traits(1), vn-generate(2), model-comparisons(3, Variant E), import/chat-context helper guards(2).
- [ ] **Deliberately excluded (separate module families):** `validation/middleware.auth` `code: "UNAUTHORIZED"`, `personas/controller.ts` (6), `characters/errors.ts` mapping. Also `quests.ts`/`story-items.ts`/`story-states.ts` still extract `ctx.userId as string | null` and funnel into handler helpers that raise 401 themselves (no inline divergent jsonError) — non-urgent follow-up.
- [ ] **Known anomaly:** `requireUserId` breaks `request.json()` body read in `model-comparisons`' Elysia `.derive()`+`request.json()` test setup (400 "Body already used"); model-comparisons therefore uses inline `unauthorizedResponse()` on the same guard. Isolated to that file/test pattern — worth diagnosing if more `request.json()`-after-auth routes appear.

## Step Plan

1. **Fold into one helper** — `http-utils.requireUserId` becomes the canonical guard; make `unauthorizedResponse()` localize via `t`; delete `actor-auth.requireCtxUser`; migrate availability(3) + mood(6).
2. **Extend to Variant A** (pure win, same message already localized) — 38 sites across 9 files become `const userId = requireUserId(ctx); if (typeof userId !== "string") return userId;`.
3. **Variant B/C/D/E** — separate reviewed commit (behavior delta: localized vs raw message; `validation/middleware` `"UNAUTHORIZED"` code is a different module family). Hold for sign-off.

## Test Coverage

- `src/routes/actor-auth.test.ts` covers `requireCtxUser` — must be repointed at `requireUserId` (or extended).
- Availability has no dedicated test file; mood has 12 tests. Add/adapt coverage for the canonical helper.

## Notes

**Frontend de-risking (verified)**: `src/frontend/fe-fetch.ts` redirects/logs-out on
`result.status === 401` only; the 31 frontend `.error`/`.code` reads are toast display
of `err.error` — **zero consumers of the `code` field**. So unifying body shape
(keeps `status: 401` + `error` string) is frontend-safe; message text is display-only.

**Inventive inventory (Aug 2026)**:

| Variant | Shape                                                                                                     | Localizes | Files (sites)                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A       | `jsonError({ message: ctx.t?... ?? "Unauthorized", status: HttpStatus.Unauthorized })` multiline, no code | yes       | avatars(10), emotions(6), io(4), licensing(3), relationships(6), characters(3), admin-overrides(4), export(1), export-sse(1) = **38** |
| B       | `unauthorized(ctx.t?... ?? "Unauthorized")` pre-localized                                                 | yes       | activity, chat-export, chat-pins(3), i18n, key-management(4), message-reactions(3), messages(~11), notifications(8), sessions(3)      |
| C       | `jsonError({ message: "errors.unauthorized", status, t })` raw key + `t` param                            | yes       | blog(7), traits(17)                                                                                                                   |
| D       | `jsonError({ message: ctx.t?... ?? "Unauthorized", status: 401 })` numeric single-line                    | yes       | analytics(2)                                                                                                                          |
| E       | `(ctx as any).t?...` or explicit `code: ErrorCode.Unauthorized`                                           | yes       | activity-stream, activity, sessions                                                                                                   |
| —       | `unauthorizedResponse()` / `unauthorized()` no-arg                                                        | **no**    | requireUserId callers: assets(2), api-keys(3), settings(3), users(6); chats(~15), gm-notes, vn-choices, chat-search                   |
| —       | `validation/middleware.unauthorized()` → `Response.json({ error, code: "UNAUTHORIZED" })`                 | no        | middleware family (separate module)                                                                                                   |
