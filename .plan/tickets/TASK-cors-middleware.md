<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: CORS middleware for external origins

**Status:** ⬜ Open
**Priority:** medium
**Effort:** Medium
**Epic:** epic-headless-alternative-frontends
**Related:** `epic-headless-alternative-frontends.md` (line 220), `TASK-api-first-foundation.md`, `src/middleware/`

## Summary

The headless/alternative-frontends epic lists "Add CORS middleware for external
origins" as a required building block, but no `src/middleware/cors.ts` exists and
no ticket tracked it. External API consumers (headless mode, third-party
frontends, OpenAPI tooling) currently receive no `Access-Control-Allow-*`
headers, so browser-based cross-origin calls to `/api/*` will be blocked.

## Acceptance Criteria

- [ ] `src/middleware/cors.ts` implements a configurable CORS policy (allowed origins, methods, headers, credentials, max-age) sourced from `config`.
- [ ] Wired into the Elysia app (global `onRequest`/headers hook) for `/api/*` (and SSE where applicable).
- [ ] `OPTIONS` preflight handled.
- [ ] Headless-mode config can skip/limit CORS when frontend middleware is disabled.
- [ ] Unit tests for allowed-origin, disallowed-origin, preflight, and credentialed cases.
- [ ] `epic-headless-alternative-frontends.md` checklist item marked done.

## Notes

- Keep CORS config-driven (allowlist) — do not reflect arbitrary `Origin` blindly (security).
- Coordinate with `TASK-api-key-auth-middleware.md` (external consumers will need both CORS + API-key auth).
- Referenced previously (planned) in `TASK-api-first-foundation.md` and `docs/meta/code-practices-improvements/07-alternative-frontend-support.md`; those references should point here once created.
