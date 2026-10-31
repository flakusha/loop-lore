<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: NSFW write routes authorize actor but not target

**Status:** Done
**Priority:** critical
**Effort:** Medium
**Epic:** epic-nsfw-capabilities
**Tags:** security, nsfw, authorization
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

NSFW write routes authorize the ACTOR but never the TARGET, and they take
the target straight from an unvalidated request body. A user who owns actor
A can name another user's actor B as `targetActorId` (or `targetId`, or in
`participants`) and write intimacy score and trauma `status_effect` rows
against B. The request body decides whose characters get mutated.

Three routes share the defect, and every one of them also reads its body
with an unchecked `ctx.body as Record<string, unknown>` cast. No NSFW
route in `src/routes/nsfw/` declares a `body:` schema today, so shape,
format and required-field checks happen nowhere on the request path — the
twin route gets exactly the validation the first route got, which is none.

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
- `POST /api/v1/nsfw/seduction/attempt` (`src/routes/nsfw/seduction.ts:153`)
  has the identical shape: `targetId` from the body, only `actorId`
  authorized. `attemptSeduction` (`src/rpg/seduction/service/attempt.ts:56`)
  then reads the TARGET's desire profile, arousal, fantasies and pheromone
  effects (`:61`, `:125`, `:131-132`) and settles arousal/intimacy deltas
  against it — another user's character state is read and mutated.
- `POST /api/v1/nsfw/encounters` (`src/routes/nsfw/encounters.ts:29-68`)
  authorizes only `actorId`, then passes
  `participants: body.participants as string[]` (`src/routes/nsfw/encounters.ts:64`)
  — the entire participant list is client-supplied and unauthorized — into
  `encounterService.createEncounter` -> `applyParticipantLegs`
  (`src/rpg/encounters/service/participant-legs.ts:43-51`), which writes
  intimacy rows for each participant.

Input handling, same three routes: each reads `ctx.body as Record<string, unknown>`
and casts fields one by one (`intimacy.ts:79`, `seduction.ts:155`,
`encounters.ts:34`). The repo already has the machinery to do this
properly — per-resource TypeBox DTOs under `src/validation/schemas/`
(`chat.ts`, `settings.ts`, `actors.ts`), exported through the
`src/validation/schemas/index.ts` barrel, wired onto Elysia routes as the
`body` validator, with the app-level `onValidationError`
(`src/validation/middleware.ts:50-51`) answering 422. The NSFW write
routes are simply not wired into it.

Impact: cross-user state mutation. Any authenticated user can attach
another user's character to an intimacy action, a seduction attempt or an
encounter and have their intimacy score and trauma status changed by
someone they do not own or collaborate with.

## What to Implement

### 1. A shared NSFW body-schema module (the substrate)

Create `src/validation/schemas/nsfw.ts` — hand-authored per-resource
request DTOs, re-exported from the `src/validation/schemas/index.ts`
barrel, following the convention of the existing modules.

Reuse the generated enum schemas from `../db-schemas`
(`NsfwEncounterTypeSchema`, `ContentIntensitySchema`,
`NarrativeStyleSchema`, `SeductionSkillCategorySchema`,
`IntimacyActionTypeSchema` — all already generated from
`src/db/enums-character/nsfw.ts`) and the primitives (`Id` = uuid format,
`NullableId`) from `./primitives`. Do not hand-copy enum values.

One DTO per resource — not one shared/global validator:

- `NsfwIntimacyActionBody` — `chatId: Id`, `actorId: Id`, `targetActorId: Id`,
  `worldId?: NullableId`, `actionId` (bounded), `actionName` (bounded), and
  the remaining action fields the service needs, each bounded.
- `NsfwSeductionAttemptBody` — `chatId: Id`, `actorId: Id`, `targetId: Id`,
  `skillCategory: SeductionSkillCategorySchema`, `approach` (bounded),
  `worldId?: NullableId`, `reputationTier?`.
- `NsfwEncounterCreateBody` — `chatId: Id`, `actorId: Id`,
  `worldId?: NullableId`, `locationId?: NullableId`,
  `encounterType: NsfwEncounterTypeSchema`,
  `intensity: ContentIntensitySchema`,
  `narrativeStyle: NarrativeStyleSchema`,
  `participants: t.Array(Id, { minItems: 1, maxItems: 16 })`,
  `contentTags?: t.Array(bounded string, { maxItems: 32 })`.

Wire each DTO onto its route as the Elysia `body` validator. Elysia then
validates at the boundary and `onValidationError` answers **422 before the
handler runs** — before any query, before any side effect. Replace the
`ctx.body as Record<string, unknown>` casts in the three routes with the
validated `ctx.body`.

### 2. One shared authorization guard for every actor id a request names

Extend `src/routes/nsfw/shared.ts` — the existing reuse point behind
`requireNsfwActorAccess` — with a guard that takes the validated actor-id
set and authorizes EVERY id in it. The routes must not re-implement the
check inline.

The target actor is not necessarily caller-owned — in group-chat roleplay
the legitimate target is another participant's character — so the check is
"owned by the caller OR a participant of the chat the request scopes to",
not "owned by the caller":

- actors whose `owner_id` is the caller (reuse `checkActorOwnership`,
  `src/routes/actor-auth.ts:84`), plus
- the characters of the other participants of the scoped chat.

Apply it to:

- `NsfwIntimacyActionBody.targetActorId`
- `NsfwSeductionAttemptBody.targetId`
- every entry of `NsfwEncounterCreateBody.participants` — reject the whole
  request if any participant is unauthorized; do not silently drop the
  offending entry, which would hide the attempt.

The check must run BEFORE the service call, so no intimacy row and no
`status_effect` row is written for an unauthorized target.

Where a request names no chat, fall back to ownership-only. (With the DTOs
above, the chat-scoped routes always carry `chatId`; the fallback covers a
future per-actor route.)

### 3. No bypass path

All three chat-scoped NSFW write routes use the module above. A new NSFW
write route must not be added with an ad-hoc body cast — the DTO module is
where its schema goes, and `src/routes/nsfw/shared.ts` is where its
authorization goes. No inline `if (typeof body.x !== "string")` checks
anywhere in `src/routes/nsfw/`.

## Acceptance Criteria

- [ ] `src/validation/schemas/nsfw.ts` exists, is exported from `src/validation/schemas/index.ts`, and defines `NsfwIntimacyActionBody`, `NsfwSeductionAttemptBody`, `NsfwEncounterCreateBody`
- [ ] Each of the three routes declares its DTO as the Elysia `body` validator; no `ctx.body as Record<string, unknown>` cast remains in `src/routes/nsfw/intimacy.ts`, `src/routes/nsfw/seduction.ts`, `src/routes/nsfw/encounters.ts`
- [ ] A malformed body (missing `targetActorId`, non-uuid actor id, `participants` containing a non-uuid entry) is rejected with 422 and the handler never runs — assert no row is written
- [ ] `POST /api/v1/nsfw/intimacy/action` with a `targetActorId` the caller does not own and cannot reach via the chat returns 403, and writes no intimacy row and no `status_effect` row for that target
- [ ] The same request with a caller-owned target succeeds as before
- [ ] The same request with a target owned by another chat participant succeeds (legitimate group-chat roleplay is not broken)
- [ ] `POST /api/v1/nsfw/seduction/attempt` with an unauthorized `targetId` returns 403 and mutates no arousal, intimacy or desire state for that target
- [ ] `POST /api/v1/nsfw/encounters` with an unauthorized entry in `participants` returns 403 and creates no encounter and no intimacy rows
- [ ] The authorization check runs before any write — a rejected request leaves the database untouched (assert no rows were inserted)
- [ ] The target-authorization guard lives in `src/routes/nsfw/shared.ts` and is called by all three routes (no inline per-route copy)
- [ ] Route-level tests cover: malformed body 422, unauthorized target 403, caller-owned target OK, chat-participant target OK, unauthorized participant list 403, and the no-writes-on-rejection assertion

## Files

- `src/validation/schemas/nsfw.ts` (new — the shared body-schema module)
- `src/validation/schemas/index.ts` (barrel export)
- `src/routes/nsfw/shared.ts` (shared actor-id-set authorization guard)
- `src/routes/nsfw/intimacy.ts` (wire DTO + guard)
- `src/routes/nsfw/seduction.ts` (wire DTO + guard)
- `src/routes/nsfw/encounters.ts` (wire DTO + guard)
- `src/routes/actor-auth.ts` (reuse `checkActorOwnership`; extend only if a chat-participant lookup is missing)

## Related

- `epic-nsfw-capabilities.md` — the capability/gating layer owns "what is permitted" for NSFW writes; this is a gap in that gate
- `epic-nsfw-moderation-priority.md` — sibling moderation epic
- `TASK-nsfw-read-only-status-panel.md` — the read-only panel shipped 2026-10-30; it exposes intimacy/trauma state whose integrity this ticket protects
- `TASK-nsfw-consent-grant-route-missing.md` — the sibling backend gap: the consent ledger is enforced but never granted. Both are NSFW write-path gates and both must land before the NSFW write UI is usable.
- `TASK-nsfw-intimacy-interface.md` — the write UI that will call these routes once the authorization is correct
- `src/validation/schemas/chat.ts` — the DTO-module convention this follows

## Caveats

- TOCTOU: the participant set is read before the write. A participant removed between the check and the write could still be written to. Prefer checking inside the same transaction as the mutation if the write path allows it.
- Security: this is the primary defect — an authorization bypass that mutates another user's rows. The fix MUST cover all three routes (intimacy action, seduction attempt, encounters), not only `targetActorId`.
- Authorization: "owned by the caller OR participant of the scoped chat" — do NOT tighten to ownership-only; that would break legitimate group-chat roleplay, where the target is another participant's character.
- Validation: the guard MUST consume the DTO-validated ids. Re-deriving an id from the raw body inside a handler re-opens the bypass; the DTO is the only source of the id set.
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

**Resolved:** 2026-10-31 registry-driven close: git issue 5da1d4c (registry tip: ca517932f Konstantin Fedotov Auto-closed: appended .md marker marks BUG-NSFW-WRITE-ROUTES-AUTHORIZE-)
