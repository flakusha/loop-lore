# TASK: Add Response Validation Schemas to Remaining Route Files

**Status:** ⬜ Not Started
**Priority:** Medium
**Epic:** epic-openapi-reference

## Summary

Add Elysia `response:` validation schemas to all route handlers in `src/routes/` that are still missing them. 5 files are complete (sessions.ts, admin.ts, characters.ts, chats.ts, character-traits.ts). 22 files with 135 routes remain.

## Scope

### Files with missing response schemas

| File                           | Routes Missing                 |
| ------------------------------ | ------------------------------ |
| `blog.ts`                      | 15                             |
| `views.ts`                     | 58 (frontend, lower priority)  |
| `auth.ts`                      | 11 (complex form-based, skip?) |
| `notifications.ts`             | 4                              |
| `telemetry.ts`                 | 6                              |
| `character-emotion-avatars.ts` | 6                              |
| `story-turns.ts`               | 2                              |
| `key-management.ts`            | 2                              |
| `model-comparisons.ts`         | 3                              |
| `character-availability.ts`    | 3                              |
| `character-io.ts`              | 4                              |
| `character-licensing.ts`       | 3                              |
| `message-encryption.ts`        | 2                              |
| `message-reactions.ts`         | 1                              |
| `export.ts`                    | 1                              |
| `export-sse.ts`                | 1                              |
| `import.ts`                    | 1                              |
| `i18n.ts`                      | 1                              |
| `health.ts`                    | 1                              |
| `activity-stream.ts`           | 1                              |
| `activity.ts`                  | 1                              |
| `http-utils.ts`                | 0 (utility, not routes)        |

### Pattern

For each route handler missing `response:`, add to its options object:

```typescript
.get("/api/some/path", async (ctx: any,) => {
  // handler unchanged
}, {
  params: SomeParams,        // keep existing
  body: SomeBody,            // keep existing
  response: {                // ADD — after params/body/query, before detail
    200: SuccessResponse,
    401: ErrorResponse,
  },
  detail: { ... },           // keep existing
},)
```

### Rules

- Import `ErrorResponse`, `SuccessResponse` from `../validation/schemas` as needed
- Import `t` from `elysia` if not already imported
- `response:` goes AFTER params/body/query and BEFORE `detail:`
- Always include `401: ErrorResponse` for auth-checked routes
- Always include `404: ErrorResponse` for routes with entity lookup by ID
- Use `SuccessResponse` for simple `{ ok: true }` returns
- Use `t.Any()` for complex/varied response shapes
- Do NOT modify handler logic
- Skip `views.ts` and `http-utils.ts` (frontend/utility, not API routes)
- Skip `auth.ts` form-based routes (complex multi-step handlers)

## Acceptance Criteria

- [ ] All API route files have `response:` on every route handler
- [ ] `bun run check` passes (typecheck + lint + format)
- [ ] No handler logic changes — only options object additions

## Related

- `src/validation/schemas.ts` — ErrorResponse, SuccessResponse exports
- `epic-openapi-reference.md` — Phase 1 task: "Add OpenAPI metadata to routes"
- Completed files: sessions.ts, admin.ts, characters.ts, chats.ts, character-traits.ts

## Discoveries

- Analysis script false positives: brace counting breaks on nested objects and short-form options
- `views.ts` routes are frontend HTMX partials — not API endpoints, skip
- `http-utils.ts` has `.get(` calls that are internal helpers, not route registrations
- `auth.ts` uses complex form-data handlers — response schemas less useful there
