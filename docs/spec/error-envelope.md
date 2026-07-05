# Error Envelope

## Overview

Standard response envelope for all API errors. Synchronizes backend error production with frontend error consumption.

Two envelope types:

- **Success**: `{ ...data }` or `{ data, pagination }`
- **Error**: `{ error, code?, details? }`

This spec defines the error envelope only. See [API Route Contract](./api-routes.md) for full route listings.

---

## Error Envelope Shape

```typescript
interface ApiError {
  /** Human-readable error message. Never empty. */
  error: string;
  /** Machine-readable error code. Always present in production errors. */
  code?: ErrorCode;
  /** Additional context: validation errors, retry info, etc. */
  details?: unknown;
}

interface ValidationErrorDetail {
  field: string;
  message: string;
}
```

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

```json
{
  "error": "Invalid chat_id format",
  "code": "BAD_REQUEST"
}
```

Cause: malformed JSON, missing required fields, invalid UUID format, query param type mismatch. Not for field-level validation (use 422).

### 401 Unauthorized

```json
{
  "error": "Missing or invalid Authorization header",
  "code": "UNAUTHORIZED"
}
```

Cause: no Bearer token, invalid token, expired session, session deleted server-side. Frontend redirects to `/login` on any 401. No retry.

### 403 Forbidden

```json
{
  "error": "Forbidden",
  "code": "FORBIDDEN"
}
```

Cause: authenticated user lacks permission for the action (wrong role, not owner of resource). No retry.

### 404 Not Found

```json
{
  "error": "Chat not found: abc-123",
  "code": "NOT_FOUND"
}
```

Cause: entity doesn't exist, already deleted, wrong ID. No retry.

### 422 Validation Error

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "username", "message": "Must be 3-32 characters" },
    { "field": "password", "message": "Must be at least 8 characters" }
  ]
}
```

`details` is an array of `{ field, message }` objects. Frontend renders these inline below the corresponding input field. Always use `jsonValidationError()` helper.

### 429 Too Many Requests

```json
{
  "error": "Too many login attempts. Try again in 45 seconds.",
  "code": "TOO_MANY_REQUESTS"
}
```

Rate limit exceeded. Frontend shows countdown timer or "try again later" message. See [Auth Middleware](./auth-middleware.md#rate-limiting-mvp) for rate limit config.

### 500 Internal Server Error

```json
{
  "error": "Failed to generate response: upstream LLM timeout",
  "code": "SERVER_ERROR"
}
```

Unhandled exception or unexpected failure. Error message may contain context (LLM name, step name) but must NOT expose stack traces, config secrets, or PII. Frontend shows retry suggestion.

### 501 Not Implemented

```json
{
  "error": "Admin panel not implemented",
  "code": "NOT_IMPLEMENTED"
}
```

Route exists in routing table but handler hasn't been built. Used during development to avoid silent 404s.

---

## Success Envelopes

### Plain Response (200)

```json
{
  "id": "uuid",
  "name": "My Chat",
  ...
}
```

Direct entity representation. Top-level keys are the entity fields.

### Created (201)

```json
{
  "id": "uuid"
}
```

Only `id` returned on creation. Full entity fetched via subsequent GET.

### Paginated (200)

```json
{
  "data": [
    { "id": "uuid", "name": "Chat 1" },
    { "id": "uuid", "name": "Chat 2" }
  ],
  "pagination": {
    "total": 142,
    "page": 1,
    "pageSize": 50,
    "totalPages": 3
  }
}
```

`data` is always an array (empty array for empty results, never null). `pagination` always included.

### No Content (204)

Empty body. Used for DELETE and logout.

---

## Server Implementation

### ErrorCode Enum

```typescript
export const ErrorCode = {
  BadRequest: "BAD_REQUEST",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  ValidationError: "VALIDATION_ERROR",
  TooManyRequests: "TOO_MANY_REQUESTS",
  ServerError: "SERVER_ERROR",
  NotImplemented: "NOT_IMPLEMENTED",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

### Typed Service Errors

Service layer should throw typed errors. Controllers catch and map to responses:

```typescript
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(msg = "Forbidden") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  details: ValidationErrorDetail[];
  constructor(details: ValidationErrorDetail[], msg = "Validation failed") {
    super(msg);
    this.name = "ValidationError";
    this.details = details;
  }
}
```

### Controller Pattern

```typescript
async function handleGetChat(req: Request, ctx: RequestContext): Promise<Response> {
  try {
    const chat = await chatService.getById(params.id);
    return jsonResponse(chat);
  } catch (e) {
    if (e instanceof NotFoundError) {
      return jsonError(e.message, HttpStatus.NotFound, ErrorCode.NotFound);
    }
    throw e; // caught by error boundary → 500
  }
}
```

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

```typescript
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body: ApiError = await res.json().catch(() => ({ error: "Network error" }));
    dispatchError(res.status, body);
    throw body;
  }
  return res.status === 204 ? undefined : res.json();
}

function dispatchError(status: number, body: ApiError): void {
  switch (body.code) {
    case "UNAUTHORIZED":
      window.location.href = "/login";
      break;
    case "VALIDATION_ERROR":
      renderFieldErrors(body.details as ValidationErrorDetail[]);
      break;
    case "TOO_MANY_REQUESTS":
      showToast(body.error, "warning");
      break;
    default:
      showToast(body.error, "error");
  }
}
```

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
