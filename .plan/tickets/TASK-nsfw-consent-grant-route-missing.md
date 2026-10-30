<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: NSFW consent-grant route missing

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-nsfw-ui
**Tags:** nsfw, consent, gate
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

The NSFW consent ledger exists and the gate enforces it, but nothing in
production ever grants consent: `recordNsfwConsent` has zero non-test
callers, so every NSFW write route denies with `consent_required`. There
is no consent-grant route, which makes the entire write half of
`epic-nsfw-ui.md` unreachable.

A second, sharper defect sits on the same seam: because the chat id is
read from an unchecked body cast, a client that omits it skips the consent
stage entirely. Consent is a per-(user, chat) concept, so the chat id
belongs to the validated request contract — not to an optional field a
client may drop.

## Context

Verified on dev 2026-10-30:

- `recordNsfwConsent` (`src/middleware/nsfw-gate/consent-ledger.ts:106`)
  writes to `nsfw_consent_state` (migration 069). Its only callers are
  tests (`src/generation/auto-gen/check-nsfw-eligibility.test.ts`,
  `src/generation/auto-gen/content-hooks-nsfw-gate.test.ts`,
  `src/middleware/nsfw-gate/consent.test.ts`) plus the barrel re-export at
  `src/middleware/nsfw-gate/index.ts:17`. Zero production callers.
- `config.nsfw.consentRequired` defaults to `true`
  (`src/config/sections/nsfw.ts:10`).
- `resolveRequestContext` (`src/middleware/nsfw-gate/request-context.ts:149-161`)
  reads the ledger when `consentRequired` is true and denies with
  `consent_required` (no row) or `consent_revoked` (a revoked row).
- `requireNsfwRouteAccess` (`src/routes/nsfw/shared.ts:93`) calls
  `checkNsfwWithConsent` only when BOTH `chatId` and `actorId` are
  supplied, and denies via `nsfwAccessErrorResponse` -> 403.
- `POST /api/v1/nsfw/intimacy/action` (`src/routes/nsfw/intimacy.ts:74`)
  and `POST /api/v1/nsfw/encounters` (`src/routes/nsfw/encounters.ts:29`)
  both pass `{ chatId, actorId }` taken from the request body, cast out of
  `ctx.body as Record<string, unknown>` (`intimacy.ts:79`,
  `encounters.ts:34`).

So with a `chatId` in the body — the normal path from a chat UI — the write
is refused with 403 `consent_required`, and no route exists that can grant
the consent it wants. The gate fails closed, which is the safe direction,
but it means the NSFW write UI (action selection, consent dialog) can never
work.

Second, sharper defect on the same seam: because `requireNsfwRouteAccess`
skips the consent stage when `chatId` is null, a client that omits
`chatId` skips the consent ledger entirely. The current behaviour is
"consent enforced when you pass a chat id, ignored when you don't" —
neither a working grant flow nor a consistent gate. Both halves belong in
one fix, and both belong at the boundary rather than in each handler.

No NSFW route in `src/routes/nsfw/` declares a `body:` schema today. The
repo already has the machinery to do this properly — per-resource TypeBox
DTOs under `src/validation/schemas/` (`chat.ts`, `settings.ts`,
`actors.ts`), exported through the `src/validation/schemas/index.ts`
barrel, wired onto Elysia routes as the `body` validator, with the
app-level `onValidationError` (`src/validation/middleware.ts:50-51`)
answering 422 before the handler runs. The NSFW write routes are simply
not wired into it.

## What to Implement

### 1. The consent DTO — per-resource, no client-supplied user id

Extend the shared NSFW body-schema module `src/validation/schemas/nsfw.ts`
(created by `BUG-nsfw-write-routes-authorize-actor-but-not-target`) with:

- `NsfwConsentBody` — `chatId: Id` (required), `action: t.UnionEnum(["given", "revoked"])`,
  `scope?: bounded string`, `reason?: bounded string (maxLength 500, matching
  the ledger's own `REASON_MAX_CHARS`)`, with `additionalProperties: false`
  — the `settings.ts` / `telemetry.ts` precedent — so a client-supplied
  `userId` is structurally impossible. The user id comes from the session.

If that module has not landed yet, create it here with the same shape and
the DTOs this ticket needs. Do not fork the contract — one DTO per
resource, one module.

### 2. Make `chatId` required on the chat-scoped write DTOs

`chatId` is currently optional on every NSFW write body, which is exactly
how the consent stage gets skipped. Make `chatId` REQUIRED (`Id`, not
optional) on the chat-scoped write DTOs (`NsfwIntimacyActionBody`,
`NsfwSeductionAttemptBody`, `NsfwEncounterCreateBody`). A request without a
chat id is then rejected with 422 at the boundary, before the handler and
before any query — the bypass closes at the boundary instead of being
re-checked in each handler.

Per-actor NSFW routes (desire profile, seduction skills, the fantasy
routes) keep their own DTOs: consent is a per-(user, chat) concept and
those routes act on the caller's own actor, which `requireNsfwActorAccess`
already authorizes. They still take a validated DTO — no ad-hoc body casts
anywhere in `src/routes/nsfw/`.

### 3. The grant/revoke route

`POST /api/v1/nsfw/consent` (and its revoke twin), mounted from
`src/routes/nsfw/index.ts`:

- body: `NsfwConsentBody`, validated by the framework;
- the user id comes from the session (`requireUserId`), never from the body;
- the caller must participate in the target chat — reuse the existing chat
  access helper, so a consent row cannot be planted for a chat the caller
  does not belong to;
- the handler calls `recordNsfwConsent` (already transactional) with the
  session user id.

The UI affordance (consent dialog) belongs to
`TASK-nsfw-intimacy-interface.md`; this ticket is the backend route only.

## Acceptance Criteria

- [ ] `NsfwConsentBody` exists in `src/validation/schemas/nsfw.ts`, is exported from the barrel, and declares `additionalProperties: false`
- [ ] `POST /api/v1/nsfw/consent` persists a `given` row for (authenticated user, chat), and `recordNsfwConsent` gains its first production caller
- [ ] A revoke action persists a `revoked` row, and the next gated write is denied with `consent_revoked`
- [ ] A body carrying `userId` is rejected with 422 — the field is not in the DTO and `additionalProperties` is false, so the user id can only come from the session
- [ ] The route rejects a `chatId` the caller does not participate in (403)
- [ ] `POST /api/v1/nsfw/intimacy/action` and `POST /api/v1/nsfw/encounters` succeed for a chat where consent was granted
- [ ] The same routes still deny with `consent_required` where consent was never granted
- [ ] A chat-scoped NSFW write request without a `chatId` is rejected with 422 at the boundary — the consent stage is no longer skippable by omission
- [ ] Route-level tests cover: grant, revoke, client-supplied userId 422, wrong-chat 403, missing-consent 403, granted-consent success, chatless write 422

## Files

- `src/validation/schemas/nsfw.ts` (`NsfwConsentBody` + `chatId` required on the chat-scoped write DTOs)
- `src/validation/schemas/index.ts` (barrel export)
- `src/routes/nsfw/consent.ts` (new — grant/revoke route)
- `src/routes/nsfw/index.ts` (mount the new route)
- `src/routes/nsfw/shared.ts` (only if the chatId-required rule lands here rather than in the DTO)

## Related

- `epic-nsfw-ui.md`
- `TASK-nsfw-read-only-status-panel.md` — the read-only panel shipped 2026-10-30; this is the write-side blocker that panel deliberately avoids
- `TASK-nsfw-intimacy-interface.md` — the consent dialog UI that consumes this route
- `BUG-nsfw-consent-auto-granted-in-memory-for-any-logged-in-user-n.md` — the in-memory consent the ledger replaced
- `BUG-nsfw-write-routes-authorize-actor-but-not-target.md` — the sibling backend gap, and the owner of the shared DTO module this ticket extends
- `src/validation/schemas/settings.ts` — the `additionalProperties: false` precedent

## Caveats

- TOCTOU: the grant route reads the caller's chat participation and then writes a consent row; a concurrent chat removal between the two leaves a consent row for a chat the user has just left. Acceptable — consent is revocable and re-checked per write — but a re-read of participation at write time closes it.
- Security: the user id MUST come from the authenticated session. A client-supplied user id would let any caller plant a consent row for another user and unlock their NSFW writes. `additionalProperties: false` makes that structurally impossible rather than merely ignored.
- Authorization: the caller must be a participant of the target chat. Without that check the route becomes a consent-row writer for arbitrary chats.
- Validation: `chatId` must be REQUIRED in the DTO, not checked in the handler. A handler-level `if (!chatId) skip consent` check is the bug being fixed, not the fix.
- Parallelism: `recordNsfwConsent` already wraps its INSERT + UPDATE in a transaction (BUG-nsfw-recordnsfwconsent), so two concurrent grants cannot revoke each other. Do not bypass that wrapper.
- Lock/unlock lifecycle: N/A — no locks; the ledger is append-only.
- Partial failure: a failed grant must not leave a half-written ledger row; the transaction in `recordNsfwConsent` covers it, but a route-level failure after the write (e.g. a failed response) still leaves a valid grant.
- Rollback: removing the route reverts the feature; the ledger table and the gate stay, so the gate reverts to "always denied" — the safe direction.
- Stale state: the gate reads the LATEST row per (user, chat), so a revoke after a grant is authoritative. A route that caches consent server-side would break that — do not cache.
- Data races: N/A — the ledger transaction serialises concurrent writes for the same (user, chat).
- Idempotency: a repeated grant inserts another `given` row and stamps `revoked_at` on the prior open one, so the latest-row invariant holds. A repeated revoke is likewise idempotent in effect.
- Observability: log the grant/revoke with (user id, chat id, action) at the route boundary so an audit trail exists; the ledger row itself is the durable record.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
