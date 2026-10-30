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
callers, so every NSFW write route denies with `consent_required`. There is
no consent-grant route, which makes the entire write half of
`epic-nsfw-ui.md` unreachable.

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
  both pass `{ chatId, actorId }` taken from the request body.

So with a `chatId` in the body — the normal path from a chat UI — the write
is refused with 403 `consent_required`, and no route exists that can grant
the consent it wants. The gate fails closed, which is the safe direction,
but it means the NSFW write UI (action selection, consent dialog) can never
work.

Second, sharper defect on the same seam: because `requireNsfwRouteAccess`
skips the consent stage when `chatId` is null, a client that omits
`chatId` skips the consent ledger entirely. The current behaviour is
"consent enforced when you pass a chat id, ignored when you don't" —
neither a working grant flow nor a consistent gate. Adding only the grant
route would leave that bypass in place, so both belong here.

## What to Implement

1. A consent grant/revoke route pair (e.g. `POST /api/v1/nsfw/consent` and
   `POST /api/v1/nsfw/consent/revoke`) that calls `recordNsfwConsent` with
   the AUTHENTICATED user id — never a client-supplied user id — and a
   `chatId` the caller actually participates in.

2. Chat-participation authorization on that route, reusing the existing
   chat access helper, so a consent row cannot be planted for a chat the
   caller does not belong to.

3. Close the `chatId`-omission bypass: a write route that targets a chat
   must require `chatId` instead of skipping the consent stage when it is
   absent.

4. The UI affordance (consent dialog) belongs to
   `TASK-nsfw-intimacy-interface.md`; this ticket is the backend route
   only.

## Acceptance Criteria

- [ ] `POST /api/v1/nsfw/consent` persists a `given` row for (authenticated user, chat), and `recordNsfwConsent` gains its first production caller
- [ ] A revoke action persists a `revoked` row, and the next gated write is denied with `consent_revoked`
- [ ] The route rejects a `chatId` the caller does not participate in (403) and ignores any client-supplied user id (the user id comes from the session)
- [ ] `POST /api/v1/nsfw/intimacy/action` and `POST /api/v1/nsfw/encounters` succeed for a chat where consent was granted
- [ ] The same routes still deny with `consent_required` where consent was never granted
- [ ] A write route that omits `chatId` no longer skips the consent stage — the gate is applied consistently
- [ ] Route-level tests cover: grant, revoke, wrong-chat 403, missing-consent 403, granted-consent success

## Files

- `src/routes/nsfw/consent.ts` (new)
- `src/routes/nsfw/index.ts` (mount the new routes)
- `src/routes/nsfw/shared.ts` (if the chatId-required rule lands here)

## Related

- `epic-nsfw-ui.md`
- `TASK-nsfw-read-only-status-panel.md` — the read-only panel shipped 2026-10-30; this is the write-side blocker that panel deliberately avoids
- `TASK-nsfw-intimacy-interface.md` — the consent dialog UI that consumes this route
- `BUG-nsfw-consent-auto-granted-in-memory-for-any-logged-in-user-n.md` — the in-memory consent the ledger replaced

## Caveats

- TOCTOU: the grant route reads the caller's chat participation and then writes a consent row; a concurrent chat removal between the two leaves a consent row for a chat the user has just left. Acceptable — consent is revocable and re-checked per write — but a re-read of participation at write time closes it.
- Security: the user id MUST come from the authenticated session. A client-supplied user id would let any caller plant a consent row for another user and unlock their NSFW writes.
- Authorization: the caller must be a participant of the target chat. Without that check the route becomes a consent-row writer for arbitrary chats.
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
