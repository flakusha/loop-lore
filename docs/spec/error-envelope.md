# Error Envelope

## Overview

Standard response envelope for all API errors. Synchronizes backend error production with frontend error consumption.

Two envelope types:

- **Success**: `{ ...data }` or `{ data, pagination }`
- **Error**: `{ error, code?, details? }`

This spec defines the error envelope only. See [API Route Contract](./api-routes.md) for full route listings.

---

## Error Envelope Shape

---

## Error Codes

Centralized enum, single source of truth:

| Code                | HTTP | Meaning                         | Frontend Handler                           |
| ------------------- | ---- | ------------------------------- | ------------------------------------------ |
| `BAD_REQUEST`       | 400  | Malformed request body/query    | Toast: generic                             |
| `UNAUTHORIZED`      | 401  | Missing/invalid/expired token   | Redirect to `/login`                       |
| `FORBIDDEN`         | 403  | Authenticated but not permitted | Inline: "Not authorized"                   |
| `NOT_FOUND`         | 404  | Entity doesn't exist            | Inline: "Not found"                        |
| `VALIDATION_ERROR`  | 422  | Field-level validation failed   | Inline field errors                        |
| `TOO_MANY_REQUESTS` | 429  | Rate limit exceeded             | Toast: "Too many attempts, wait N seconds" |
| `SERVER_ERROR`      | 500  | Unhandled server exception      | Toast: "Server error, try again"           |
| `NOT_IMPLEMENTED`   | 501  | Feature not yet built           | Toast: "Not available"                     |

Every error response MUST include the `code` field in production. The `error` (human) + `code` (machine) pair lets frontend dispatch the correct UX per detail level.

---

## Error by Status Code

### 400 Bad Request

Cause: malformed JSON, missing required fields, invalid UUID format, query param type mismatch. Not for field-level validation (use 422).

### 401 Unauthorized

Cause: no Bearer token, invalid token, expired session, session deleted server-side. Frontend redirects to `/login` on any 401. No retry.

### 403 Forbidden

Cause: authenticated user lacks permission for the action (wrong role, not owner of resource). No retry.

### 404 Not Found

Cause: entity doesn't exist, already deleted, wrong ID. No retry.

### 422 Validation Error

`details` is an array of `{ field, message }` objects. Frontend renders these inline below the corresponding input field. Always use `jsonValidationError()` helper.

### 429 Too Many Requests

Rate limit exceeded. Frontend shows countdown timer or "try again later" message. See [Auth Middleware](./auth-middleware.md#rate-limiting-mvp) for rate limit config.

### 500 Internal Server Error

Unhandled exception or unexpected failure. Error message may contain context (LLM name, step name) but must NOT expose stack traces, config secrets, or PII. Frontend shows retry suggestion.

### 501 Not Implemented

Route exists in routing table but handler hasn't been built. Used during development to avoid silent 404s.

---

## Success Envelopes

### Plain Response (200)

Direct entity representation. Top-level keys are the entity fields.

### Created (201)

Only `id` returned on creation. Full entity fetched via subsequent GET.

### Paginated (200)

`data` is always an array (empty array for empty results, never null). `pagination` always included.

### No Content (204)

Empty body. Used for DELETE and logout.

---

## Server Implementation

### ErrorCode Enum

### Typed Service Errors

Service layer should throw typed errors. Controllers catch and map to responses:

### Controller Pattern

### Error Propagation Map

| Service throws          | Controller responds       |
| ----------------------- | ------------------------- |
| `NotFoundError`         | 404 + `NOT_FOUND`         |
| `ForbiddenError`        | 403 + `FORBIDDEN`         |
| `ValidationError`       | 422 + `VALIDATION_ERROR`  |
| Rate limit (pipeline)   | 429 + `TOO_MANY_REQUESTS` |
| Auth failure (pipeline) | 401 + `UNAUTHORIZED`      |
| `Error` (unexpected)    | 500 + `SERVER_ERROR`      |

Pipeline errors (auth, rate limit) are handled before the controller — they return directly from middleware. Service errors are caught in the controller and mapped. Remaining `throw`s hit the `errorBoundary` middleware which returns 500.

---

## Frontend Integration

### Fetch Wrapper (htmx)

All API calls use htmx with `hx-target-error` pointing to a toast container. For JavaScript fetch calls:

### 3-Tier Error Mode Mapping

The backend sends the same `{ error, code, details }` envelope regardless of the user's error feedback mode. The frontend detail mode controls how much of this is displayed:

| Detail Level  | Display                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| 1 — Immersion | Regenerate button only. Error message + code hidden.                            |
| 2 — Balanced  | Short reason (first sentence of `error`). "Details" link shows `code`.          |
| 3 — Nerd      | Full panel: `error`, `code`, `details`, HTTP status, provider, model, duration. |

---

## See Also

- [API Route Contract](./api-routes.md) — route-specific error handling
- [Auth Middleware](./auth-middleware.md) — 401/429 handling
- [Chat: Generation & Error Handling](../frontend/chat/generation.md) — 3-tier error display
- `src/routes/http-utils.ts` — response helper implementation
