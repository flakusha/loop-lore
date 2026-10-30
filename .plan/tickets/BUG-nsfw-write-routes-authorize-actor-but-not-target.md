<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: NSFW write routes authorize actor but not target

**Status:** Not Started
**Priority:** critical
**Effort:** Medium
**Epic:** epic-nsfw-capabilities
**Tags:** security, nsfw, authorization
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

NSFW write routes authorize the ACTOR but never the TARGET. A user who owns
actor A can name another user's actor B as `targetActorId` (or in
`participants`) and write intimacy score and trauma `status_effect` rows
against B. The request body decides whose characters get mutated.

## Context

Verified on dev 2026-10-30:

- `POST /api/v1/nsfw/intimacy/action` (`src/routes/nsfw/intimacy.ts:74-95`)
  reads `actorId` and `targetActorId` from the body. Only `actorId` is
  authorized, via `requireNsfwActorAccess` ->
  `checkActorOwnership` (`src/routes/actor-auth.ts:84-98`:
  `actor.owner_id === userId || can(userRole, "admin.character")`).
  `targetActorId` (`src/routes/nsfw/intimacy.ts:83`) is never checked.

- `targetActorId` flows straight into `intimacyService.applyAction` ->
  `src/rpg/intimacy/service/actions.ts`, where it reaches
  `assertNsfwCapability({ actorId, targetActorId, ... })` and, on the denial
  path, `new TraumaService(database).escalateViolation(targetActorId ?? actorId, chatId)`
  (`src/rpg/intimacy/service/actions.ts:78-80`).

- `escalateViolation` (`src/rpg/trauma.ts:153-158`) -> `applyTrauma`
  (`src/rpg/trauma.ts:94-124`) INSERTs into `status_effect` with
  `actor_id = targetActorId` and `category = "trauma"`. So the write lands
  on the unauthorized target, not on the caller's own actor.

- Same class on the encounters route: `POST /api/v1/nsfw/encounters`
  (`src/routes/nsfw/encounters.ts:29-68`) authorizes only `actorId`, then
  passes `participants: body.participants as string[]`
  (`src/routes/nsfw/encounters.ts:64`) — the entire participant list is
  client-supplied and unauthorized — into `encounterService.createEncounter`
  -> `applyParticipantLegs`
  (`src/rpg/encounters/service/participant-legs.ts:43-51`), which writes
  intimacy rows for each participant.

Impact: cross-user state mutation. Any authenticated user can attach
another user's character to an intimacy action or an encounter and have
their intimacy score and trauma status changed by someone they do not
own or collaborate with.

## What to Implement

Authorize EVERY actor id the request names, not just the primary one. The
target actor is not necessarily caller-owned — in group-chat roleplay the
legitimate target is another participant's character — so the check is
"owned by the caller OR a participant of the chat the request scopes to",
not "owned by the caller":

1. Add a shared helper that resolves the set of actor ids a caller may act
   on for a given chat: actors whose `owner_id` is the caller, plus the
   characters of other participants in that chat. Reuse
   `checkActorOwnership` (`src/routes/actor-auth.ts:84`) for the ownership
   half rather than re-deriving it.

2. `POST /api/v1/nsfw/intimacy/action`: validate `targetActorId` against
   that set; reject with 403 when it is outside it. The check must run
   BEFORE `applyAction`, so no intimacy row and no trauma row is written
   for an unauthorized target.

3. `POST /api/v1/nsfw/encounters`: validate every entry of `participants`
   the same way. Reject the whole request if any participant is
   unauthorized — do not silently drop the offending entry, which would
   hide the attempt.

4. When the request names no chat (`chatId` absent), fall back to
   ownership-only: the target must be owned by the caller.

## Acceptance Criteria

- [ ] `POST /api/v1/nsfw/intimacy/action` with a `targetActorId` the caller does not own and cannot reach via the chat returns 403, and writes no intimacy row and no `status_effect` row for that target
- [ ] The same request with a caller-owned target succeeds as before
- [ ] The same request with a target owned by another chat participant succeeds (legitimate group-chat roleplay is not broken)
- [ ] `POST /api/v1/nsfw/encounters` with an unauthorized entry in `participants` returns 403 and creates no encounter and no intimacy rows
- [ ] The authorization check runs before any write — a rejected request leaves the database untouched (assert no rows were inserted)
- [ ] With no `chatId` in the body, a target owned by another user returns 403
- [ ] Route-level tests cover: unauthorized target 403, caller-owned target OK, chat-participant target OK, unauthorized participant list 403, and the no-writes-on-rejection assertion

## Files

- `src/routes/nsfw/shared.ts` (shared target-authorization helper)
- `src/routes/nsfw/intimacy.ts` (validate `targetActorId`)
- `src/routes/nsfw/encounters.ts` (validate `participants`)
- `src/routes/actor-auth.ts` (reuse `checkActorOwnership`; extend only if a chat-participant lookup is missing)

## Related

- `epic-nsfw-capabilities.md` — the capability/gating layer owns "what is permitted" for NSFW writes; this is a gap in that gate
- `epic-nsfw-moderation-priority.md` — sibling moderation epic
- `TASK-nsfw-read-only-status-panel.md` — the read-only panel shipped 2026-10-30; it exposes intimacy/trauma state whose integrity this ticket protects
- `TASK-nsfw-consent-grant-route-missing.md` — the sibling backend gap: the consent ledger is enforced but never granted. Both are NSFW write-path gates and both must land before the NSFW write UI is usable.
- `TASK-nsfw-intimacy-interface.md` — the write UI that will call these routes once the authorization is correct

## Caveats

- TOCTOU: the participant set is read before the write. A participant removed between the check and the write could still be written to. Prefer checking inside the same transaction as the mutation if the write path allows it.
- Security: this is the primary defect — an authorization bypass that mutates another user's rows. The fix MUST cover the encounters `participants` list too, not only `targetActorId`.
- Authorization: "owned by the caller OR participant of the scoped chat" — do NOT tighten to ownership-only; that would break legitimate group-chat roleplay, where the target is another participant's character.
- Parallelism: the participant list may change between the check and the write; re-reading inside the mutation transaction closes the window.
- Lock/unlock lifecycle: N/A — no locks held across the check and the write.
- Partial failure: an encounter that creates the encounter row and then fails on a participant must not leave a partially-created encounter with an unauthorized participant.
- Rollback: reverting the check restores the bypass — treat this as a security hotfix; do not ship the routes before it.
- Stale state: the cached chat participant list, if any, must not be used for this check; read the live membership.
- Data races: two concurrent requests, one granting and one removing chat participation, can interleave; the transaction-scoped re-read resolves it.
- Idempotency: N/A — the authorization check is a pure gate; it has no effect on request semantics.
- Observability: log rejected unauthorized-target attempts with (user id, actor id, target actor id) so the attempt is visible in security review.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
