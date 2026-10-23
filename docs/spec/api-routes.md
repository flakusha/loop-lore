<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# API Route Contract

## Implemented

- URL structure `/api/v1/{resource}`, `/api/v1/{resource}/:id` (unversioned `/api/{resource}` legacy paths 308-redirect to `/api/v1/...`; `/api/views/*` stays unversioned); UUID v4 ids, ISO 8601 UTC timestamps.
- Envelopes per `docs/spec/error-envelope.md`: success `{ ...data }` / `{ id }` (201) / `{ data, pagination }`; error `{ error, code, details? }`. Responses carry `meta.api_version`; when `API_V1_DEPRECATED=1`, v1 responses also carry `Sunset`/`Deprecation`/`Link: </api/v2>; rel="successor-version"` headers (planned-new successor — `src/routes/v2/` does not exist yet, so the Link names a future version, not a live route).
- Pagination `?page=1&pageSize=50` (max 200).
- Auth: `ll_token` HttpOnly session cookie (no user Bearer tokens; Bearer `Authorization` appears only on federation peer-workload routes); middleware populates `RequestContext { userId, userRole, sessionId }`. Asset downloads use HMAC signed URLs (`src/assets/signed-url.ts`).
- Validation via Elysia TypeBox (`t`) schemas in `src/validation/schemas/` per route group; 422 with field details (a `src/schemas/` Zod layer does not exist).
- Route groups live in `src/routes/` (100+ files) composed into versioned surfaces in `src/routes/v1/` (`baseSurface`, `chatsSurface`, `actorsSurface`, `adminSurface`, …) and mounted in `src/elysia-app.ts`; generic CRUD factory `src/routes/entity-routes.ts`.

### Route map (essence; full tables remain in the epic)

- Age gate: `/api/v1/age-gate/{status,accept}`; admin config `/api/v1/admin/age-gate` 🔒.
- Generation: `/api/v1/generation/{generate,cancel,status/:chatId,stream/:chatId,active,retry,continue,regenerate,image,caption,audio/ambient,prompt,test-connection}`.
- Auth: `/api/v1/auth/{login,register,logout,me}`, `/api/v1/demo-login` — web-first, form-encoded, set `ll_token` + `HX-Redirect`; registration gated on `auth.registrationOpen`.
- Sessions: `/api/v1/sessions` (list), `/api/v1/sessions/:id` (get/delete), `/api/v1/sessions/:id/switch` — force-logout and session switching (admin or self).
- Users, chats (+ participants, activity, location), messages (immutable content; variants/swipes, visibility, status), actors (+ ST v2 card, import, memories), worlds (+ locations, `initialize-states`), assets (+ links, shares, signed URLs) — full request/response tables: see `.plan/epics/epic-api-routes.md`.
- View routes (static, not API): `/`, `/chat`, `/settings`, `/gallery` from `dist/public/`; dynamic htmx partials under `/dynamic/*` and `/views/*`.

## Not implemented / aspirational

- `/api/v2` successor version: planned-new, not yet built (`src/routes/v2/` absent; the `Link: </api/v2>; rel="successor-version"` deprecation header names the future version, not a live route). See `docs/spec/api-versioning.md`.
- Content encoding/encryption is transparent to the API layer (handled at storage layer).
- Idempotency keys accepted on message create; server-side dedup verification untested.

## Epics

- `.plan/epics/epic-api-routes.md`
- `.plan/epics/epic-api-first-foundation.md`
