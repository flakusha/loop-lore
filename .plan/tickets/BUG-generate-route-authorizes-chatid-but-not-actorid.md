<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: generate route authorizes chatId but not actorId

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

checkChatAccess in src/generation/generate-route/validate.ts covers chatId only. actorId is type-checked as a non-empty string and then trusted, so an authenticated caller authorized for chat A can name any actor in the deployment as the generating actor. The actors lookup then misses, yielding null, which returns the full plugin tool list (gatePluginToolsByRole(null)). Fix: reject an actorId that is not a participant of the chat being generated, mirroring recordTurnSkip.

**Context:**

Distinct from BUG-plugin-tool-authorization-fails-open: that ticket lives in
the plugin tool GATE (`src/generation/generate-route/tool-execution.ts`). This
defect lives in ROUTE VALIDATION (`src/generation/generate-route/validate.ts`)
and exists whether or not any plugin is loaded — it also leaks the wrong
actor's context into the prompt and writes the message under that actor.

**Evidence (verified by driving the route, not by reading it).** Throwaway
reproduction against an in-memory DB with a spy LLM provider, calling
`handleGenerate` as user-a (participant of chat A, NOT of chat B):

```
[1] BENIGN  — actorId is a chat A participant, no agent_role
   HTTP status      : 200
   tools offered    : [["play_rps","play_card_battle"],"(no tools)"]
[2] ATTACK A — actorId is a chat B participant of ANOTHER user
   HTTP status      : 200
   tools offered    : [["play_card_battle"],"(no tools)"]
   last actor_id in chat A: 8b4dac98-... (the foreign character)
[3] ATTACK B — actorId is an actor row in NO chat, no agent_role
   HTTP status      : 200
   tools offered    : [["play_rps","play_card_battle"],"(no tools)"]
[4] ATTACK C — actorId is ANOTHER user's own actor row
   HTTP status      : 200
   tools offered    : [["play_rps","play_card_battle"],"(no tools)"]
   last actor_id in chat A: user-b
```

`play_rps` is a community-origin tool. Case 3 and 4 hand back the FULL plugin
tool list, and case 4 writes a message attributed to `user-b` into `user-a`'s
chat. Case 5 (`actorId` naming no actor row at all) returned 422 — caught by
prompt assembly downstream, not by validation.

Chain:

- `src/generation/controller.ts:72-81` passes the raw body to `handleGenerate`.
- `src/generation/generate-route/handler.ts:70` casts it unvalidated;
  `:72` calls `validateGenerateRequest`.
- `src/generation/generate-route/validate.ts:55-57` checks only
  `typeof actorId === "string"`.
- `validate.ts:68` runs `checkChatAccess(database, input.chatId, authUserId,
  userRole,)` — `chatId` ONLY.
- `src/generation/generate-route/provider-request.ts` then looks the actor up
  and hands `roleRow?.agent_role ?? null` to `gatePluginToolsByRole`, where
  `null` returns every registered tool.

`checkChatAccess` itself is not at fault: it is a chat-access helper and its
sibling `recordTurnSkip` (`src/chat/service/crud/turn-skip.ts:93-102`) already
performs the extra participant lookup for its TARGET actor. The generate route
never did.

**Caller sweep (why no legitimate non-participant actorId exists).** The only
production caller of `handleGenerate` is the HTTP route; every internal
generation path bypasses it and resolves the actor from `chat_participants`
already: `resolveActor` (`src/generation/auto-gen/resolve-actor.ts:75-91`),
`verifyCascadeActor` (`:108-137`), `group-cascade.ts`. Regenerate
(`src/generation/generation-routes/regenerate.ts:98`) reads `actorId` from the
parent message row in the same chat. Impersonation stores
`impersonate_actor_id` on the impersonating USER's own participant row and
excludes the impersonated character from generation
(`group-cascade.ts:168-181`), so the actorId stays a participant.

**Why option (a), not (b).** Resolving the actor server-side from the chat's
participant set is wrong for group chats: the caller legitimately picks which
cast member speaks. Authorizing the supplied `actorId` against the same
participant set is the codebase's existing convention and is strictly smaller.

**Constraint verified before shipping the participant check.** Every real chat
flow must already carry participant rows, or the fix would trade an
authorization hole for a functional outage:

- Chat creation: `src/chat/service/crud/create.ts:48-51` inserts the owner,
  `:54-65` inserts every `participantIds` entry. The route forwards
  `body.participantIds` (`src/routes/chats/create.ts:214`), and both UI
  callers always send it (`src/frontend/pages/new-chat/submit.ts:113`,
  `src/frontend/pages/characters.ts:196`).
- Branch/split chats: `src/chat/service/split-utils.ts:58-63`.
- Chat migration: `src/chat/service/transitions.ts:120-122` →
  `carryParticipants`. Guarded by `carry?.participants !== false`; no
  production caller passes `false`.
- Solo mode (`auth.required=false`): unaffected — it auto-authenticates as a
  super-user but creates chats through the same route and service, so the owner
  participant row is written.
- Historical chats: `chat_participants` is created in the INITIAL schema
  (`src/db/migrations/001_init.ts:1706`), alongside `chats`. No migration adds
  it to a pre-existing table, so no chat predates it and there is nothing to
  backfill.

**Fix shipped.** `validateGenerateRequest` now looks up `chat_participants` for
`(input.chatId, input.actorId)` and returns 404
`"Actor is not a participant of this chat"` when absent — membership, not
ownership, so admins, group casts, regenerate and impersonation are unaffected.
Ordering keeps `checkChatAccess` first, so an outsider cannot use the actor
probe as an existence oracle.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

Verification: `src/generation/generate-route/actor-authorization.test.ts` —
`describe("validateGenerateRequest — actorId authorization")`, seven tests
covering the benign participant case, cross-chat actorId, orphan actor, another
user's actor, non-existent actor, chat-access ordering, and the admin.chat
caller.
