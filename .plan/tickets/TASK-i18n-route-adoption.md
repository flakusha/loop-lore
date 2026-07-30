# TASK: i18n Route Adoption (Phase 2)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Epic:** epic-i18n

## Summary

Wire `ctx.t()` into route handlers to replace hardcoded English error messages and notifications. ~60+ route files affected.

## Scope

### Route Files to Update

All files in `src/routes/` that produce user-facing strings:

| Category   | Files                                     | Priority |
| ---------- | ----------------------------------------- | -------- |
| Auth       | `auth.ts`, `login.ts`                     | High     |
| Chat       | `chat.ts`, `messages.ts`, `generation.ts` | High     |
| Characters | `characters.ts`, `personas.ts`            | High     |
| Settings   | `settings.ts`, `admin.ts`                 | Medium   |
| Worlds     | `worlds.ts`, `locations.ts`               | Medium   |
| Gallery    | `gallery.ts`, `assets.ts`                 | Medium   |
| Other      | `blog.ts`, `export-sse.ts`, etc.          | Low      |

### Pattern

Before:

```ts
throw new Error("Chat not found",);
```

After:

```ts
throw new Error(t("errors.notFound",),);
```

### Key Mapping

Route errors map to `errors.*` keys in locale files:

- `errors.notFound` — 404
- `errors.unauthorized` — 401
- `errors.forbidden` — 403
- `errors.invalidInput` — 400
- `errors.serverError` — 500
- `errors.conflict` — 409
- `errors.rateLimited` — 429

## Approach

1. Audit all route files for hardcoded user-facing strings
2. Map strings to existing `en.json` keys (or add new keys if needed)
3. Update routes to use `ctx.t("key")` instead of hardcoded strings
4. Add new keys to `en.json` for strings not yet in the catalog
5. Verify with `bun run check`

## Acceptance Criteria

- [ ] All route error messages use `ctx.t()` instead of hardcoded English
- [ ] New keys added to `en.json` for any missing translations
- [ ] `bun run check` passes
- [ ] Existing tests still pass

## Dependencies

- Phase 1 (locale completion) — not blocking, but should be done first for full coverage
