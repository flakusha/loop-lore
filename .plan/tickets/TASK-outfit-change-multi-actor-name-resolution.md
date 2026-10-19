<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Multi-actor member-set name resolution

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** This is the documented-limitation ticket: it makes attribution **correct by rejecting**, not correct by guessing. Security: an extracted actor name drives a wardrobe write; an unresolved name must never fall back to the speaker, because that silently rewrites another character's appearance. Authorization: the resolved actor must belong to the chat, and the wardrobe item written must be visible to that actor. Rollback: with resolution disabled, the hook applies changes only when the subject is the speaker. Stale state: a chat participant removed after the fact will not resolve. Idempotency: pure name → actor lookup. Observability: log unresolved names at debug, never content. Partial failure: an unresolved entry is dropped, not fatal to the turn.

**Summary:**

Resolve an extracted `actorName` to an actor id by member-set validation,
rejecting rather than guessing. This is the user's decision 4 (option B) and it
is what makes the feature correct in group chat.

**Context:**

Three existing attribution mechanisms are each individually insufficient.
Verified:

1. **`HookContext.actorId` is the speaker, not the subject.**
   `src/generation/hooks/types.ts:27` — the context carries `actorId`, threaded
   from `src/generation/auto-gen/auto-generation.ts:226` as **the single
   generating character**. In group chat the pipeline runs actors one at a time
   (`src/generation/auto-gen/post-store.ts`), so at hook time the speaker is
   unambiguous and the subject of a third-person clause is not.
2. **`extractTarget` can never produce an actor.** `src/regex/action-parser.ts:161`
   hardcodes `kind: "item"`, though `kind: "actor"` exists in the type
   (`src/regex/action-parser.ts:33`) and in the stage-2 validator
   (`src/regex/stage2-llm.ts:189`).
3. **`resolveActorIdFromEvents` overrides the caller.**
   `src/generation/auto-gen/content-hooks.ts:244` returns whatever a hook stamps
   into `data.actorId`, and `src/generation/auto-gen/auto-generation.ts:265`
   feeds that value onward as the message's actor. A hook that stamps the wrong
   actor silently rewrites who the message belongs to — worse than not
   stamping at all.

The fix is the member-set pattern already in production: `resolveChatKnownEntityNames`
(`src/generation/auto-gen/resolve-known-names.ts:36-68`) returns chat
participants' display names plus the current location name, and swallows DB
errors into an empty array. Combined with the case-insensitive member-set check
at `src/regex/stage2-llm.ts:197-202`, this gives:

- exact case-insensitive match → that actor
- multiple actors sharing a display name → **drop the entry** (do not pick the
  first)
- no match → **drop the entry** (do not fall back to the speaker)

**The change-gate data model has no recipient field.** `OutfitChangeRequest`
(`src/characters/services/wardrobe/change-gate.ts:30-39`) carries a singular
`actorId` and `chatId`; the user's "character A hands item to B" story cannot be
expressed. This ticket does **not** extend the request shape — it makes
single-target attribution correct, and the multi-target case stays out of scope
until the gate grows a recipient field.

**Acceptance Criteria:**

- [ ] An extracted `actorName` is resolved against the chat's member set by
      case-insensitive comparison, reusing `resolveChatKnownEntityNames`
      (`src/generation/auto-gen/resolve-known-names.ts:36-68`)
- [ ] A name that matches no participant is dropped, and the hook does **not**
      fall back to `HookContext.actorId` for it
- [ ] A name matching more than one participant is dropped, not resolved to
      the first
- [ ] The hook emits no `data.actorId` unless resolution succeeded, so
      `resolveActorIdFromEvents` (`src/generation/auto-gen/content-hooks.ts:244`)
      cannot rewrite the message's actor from this hook
- [ ] A resolved actor that is not a participant in the chat is rejected before
      any wardrobe write
- [ ] The wardrobe item written is visible to the resolved actor (same scope
      check `bindWardrobeItemInstance` performs at
      `src/characters/services/wardrobe/bindings.ts:27`)
- [ ] Unit tests cover: exact match, case-differing match, unknown name,
      duplicate name, non-participant actor, empty member set
- [ ] `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- `HookContext.actorId` is the speaker: `src/generation/hooks/types.ts:27`;
  threaded at `src/generation/auto-gen/auto-generation.ts:226`
- The override hazard: `src/generation/auto-gen/content-hooks.ts:244` and
  `src/generation/auto-gen/auto-generation.ts:265`
- `extractTarget` hardcodes item kind: `src/regex/action-parser.ts:161`;
  `kind: "actor"` exists at `src/regex/action-parser.ts:33` and is accepted at
  `src/regex/stage2-llm.ts:189`
- Member-set validation pattern: `src/regex/stage2-llm.ts:197-202`
- The member-set source: `src/generation/auto-gen/resolve-known-names.ts:36-68`
  (participants via `loadChatParticipants` plus the current location name; errors
  swallowed to `[]` at `:65-67`)
- Existing use of that resolver:
  `src/generation/auto-gen/post-store.ts:127` and
  `src/generation/auto-gen/story-mode.ts:139`
- The gate's single-target shape: `src/characters/services/wardrobe/change-gate.ts:30-39`
- Scope check precedent: `src/characters/services/wardrobe/bindings.ts:27-37`