<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Error Envelope

## Implemented

- Helpers in `src/routes/http-utils/index.ts` (`jsonError`, `jsonValidationError`, `unauthorizedResponse`, …) produce the standard envelopes.
- **Success**: `{ ...data }` (200) / `{ id }` (201) / `{ data, pagination }` (200, `data` always an array) / empty (204).
- **Error**: `{ error, code, details? }` — `error` human-readable, `code` machine-readable (required in production), `details` = `[{ field, message }]` for 422.
- Error codes: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `TOO_MANY_REQUESTS` (429), `SERVER_ERROR` (500), `NOT_IMPLEMENTED` (501); enum also defines `CONFLICT`, `SERVICE_UNAVAILABLE`.
- Propagation: pipeline errors (auth, rate limit) return from middleware before controllers; service typed errors (NotFound/Forbidden/Validation) map to 404/403/422 in controllers; unexpected `throw` hits the `errorBoundary` → 500. 500 messages may carry context (LLM/step name) but never stack traces, secrets, or PII.
- Frontend: htmx `hx-target-error` → toast; fetch calls dispatch on `code`; 3-tier error display (immersion = regenerate only / balanced = short reason + code / nerd = full panel) — see `docs/frontend/chat/generation.md`.

## Per-status semantics (compressed)

- 400 malformed body/params (field-level issues use 422). 401 → redirect `/login`, no retry. 403/404 no retry. 422 render `details` inline. 429 countdown/wait. 501 route reserved during development (avoids silent 404s).

## Epics

- `.plan/epics/epic-error-envelope.md`

## See also

`docs/spec/api-routes.md`, `docs/spec/auth-middleware.md`, `src/routes/http-utils/index.ts`.
