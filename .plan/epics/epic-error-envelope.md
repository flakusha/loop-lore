<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Error Envelope

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Standard response envelope for all API errors. Synchronizes backend error production with frontend error consumption so every route returns the same shape and every client can decode errors with one helper.

**Context:** The 2026-08-15 federation review (`epic-federation-swarm-sync.md`) noted that error envelopes must carry stable `error_code` strings (never localized messages) so peer instances can route on them. The current state is per-route bespoke error responses, breaking federation's contract. The full shape lives in `docs/spec/error-envelope.md` and is the basis for the `ErrorEnvelope` TypeBox schema in `src/validation/error-envelope.ts`.

## Scope

### Shape

```typescript
interface ErrorEnvelope {
  error_code: string;          // stable, namespaced, machine-readable (e.g. "auth.invalid_token")
  message: string;             // human-readable, may be localized, NOT a contract
  details?: Record<string, unknown>;  // structured context, optional
  request_id: string;          // for log correlation
  retry_after_ms?: number;     // when retry is appropriate
}
```

### Behaviour

- All API routes return this shape on 4xx / 5xx; 2xx continue to return success payloads.
- Backend error factories (`src/api/errors.ts`) emit `ErrorEnvelope`; route handlers wrap known error types via a single `errorHandler` middleware.
- Frontend `fetchClient` (`src/frontend/api/fetch-client.ts`) decodes `ErrorEnvelope` and surfaces a typed `ApiError` to UI code; one toast helper handles the generic case.
- `error_code` strings are namespaced (`auth.*`, `validation.*`, `chat.*`, `content.*`, `federation.*`, etc.) and registered in `src/api/error-codes.ts` so they're grep-able and exhaustively tested.
- Wire-format documentation lives in OpenAPI under `x-error-envelope: true` per route.

### Out of scope

- Localized message translations (the `message` field is intentionally not a contract; i18n is `epic-i18n.md`'s job).
- Server-side stack-trace exposure (handled by `epic-logging.md` + `epic-security-sandboxing.md`).

## Acceptance Criteria

- [ ] `ErrorEnvelope` TypeBox schema in `src/validation/error-envelope.ts`; tests cover the schema.
- [ ] `errorHandler` middleware in `src/api/error-handler.ts` wraps every route; per-route bespoke errors removed.
- [ ] Frontend `fetchClient` decodes `ErrorEnvelope` into a typed `ApiError`.
- [ ] `src/api/error-codes.ts` registry with all current codes; CI lint rejects unregistered codes.
- [ ] OpenAPI schema for at least 5 representative routes tagged `x-error-envelope: true`.
- [ ] Federation routes emit codes parseable by peer instances (contract test).

## Related Epics

- `docs/spec/error-envelope.md`
- `epic-federation-swarm-sync.md` — relies on stable error_code for peer routing
- `epic-i18n.md` — owns message localization
- `epic-api-validation-guardrails.md` — input validation errors feed into this envelope

## Tickets

