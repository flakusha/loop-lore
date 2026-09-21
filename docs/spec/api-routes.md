<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# API Route Contract

## Implemented

- URL structure `/api/{resource}`, `/api/{resource}/:id`; UUID v4 ids, ISO 8601 UTC timestamps.
- Envelopes per `docs/spec/error-envelope.md`: success `{ ...data }` / `{ id }` (201) / `{ data, pagination }`; error `{ error, code, details? }`.
- Pagination `?page=1&pageSize=50` (max 200).
- Auth: Bearer header or `ll_token` HttpOnly cookie; middleware populates `RequestContext { userId, userRole, sessionId }`. Asset downloads use HMAC signed URLs (`src/assets/controller/signed-url.ts`).
- Validation via Elysia TypeBox (`t`) schemas in `src/validation/schemas/` per route group; 422 with field details (a `src/schemas/` Zod layer does not exist).
- Route groups live in `src/routes/` (30+ files) mounted in `src/elysia-app.ts`; generic CRUD factory `src/routes/entity-routes.ts`.

### Route map (essence; full tables remain in the epic)

- Age gate: `/api/age-gate/{status,accept}`; admin config `/api/admin/age-gate` 🔒.
- Generation: `/api/generation/{cancel,status/:chatId,active,retry,continue,regenerate}`.
- Auth: `/api/auth/{login,register,logout,me}`, `/api/demo-login` — web-first, form-encoded, set `ll_token` + `HX-Redirect`; registration gated on `auth.registrationOpen`; no `/api/sessions` routes.
- Users, chats (+ participants, activity, location), messages (immutable content; variants/swipes, visibility, status), actors (+ ST v2 card, import, memories), worlds (+ locations, `initialize-states`), assets (+ links, shares, signed URLs) — full request/response tables: see `.plan/epics/epic-api-routes.md`.
- View routes (static, not API): `/`, `/chat`, `/settings`, `/gallery` from `dist/public/`.

## Not implemented / aspirational

- htmx partial view routes under `/views/chat/*`.
- Content encoding/encryption is transparent to the API layer (handled at storage layer).
- Idempotency keys accepted on message create; server-side dedup verification untested.

## Epics

- `.plan/epics/epic-api-routes.md`
- `.plan/epics/epic-api-first-foundation.md`
