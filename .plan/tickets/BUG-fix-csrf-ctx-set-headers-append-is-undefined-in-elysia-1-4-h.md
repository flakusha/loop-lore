# BUG: fix(csrf): ctx.set.headers.append is undefined in Elysia 1.4 HTTPHeaders

**Status:** Done (commit `771e8b34`)
**Priority:** Medium
**Effort:** Small

## Summary

`ctx.set.headers.append("set-cookie", ...)` from the original CSRF wiring was
silently a no-op in Elysia 1.4 — `ctx.set.headers` is a plain object, not a
`Headers` instance, so the call returned without throwing and without writing
the cookie. Browsers never picked up the `csrf_token`, and the next request
couldn't carry the token back, breaking the double-submit defense.

**Fix:** assign directly: `ctx.set.headers["set-cookie"] = cookieHeader;`.
The CSRF middleware is the sole writer of `csrf_token`, so single-value
assignment is safe. Comment in `src/elysia-app.ts` flags the array form if a
future middleware also writes Set-Cookie on the same response.

## Acceptance Criteria

- [x] Implementation complete (`771e8b34`)
- [x] Tests passing (integration test `src/middleware/csrf.integration.test.ts`,
      `30564f14`)
- [x] Documentation updated (inline comment in `src/elysia-app.ts`)
