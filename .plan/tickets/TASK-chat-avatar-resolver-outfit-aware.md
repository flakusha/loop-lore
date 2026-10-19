<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat avatar resolver outfit-aware (fix the dead read path)

**Status:** In Progress
**Priority:** critical
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** TOCTOU: the resolver runs at render over rows another turn may be writing — it must tolerate a missing variant and fall back. Security: none new. Authorization: an avatar must belong to the message's actor; never resolve another actor's asset. Parallelism: two renders resolving the same message must be deterministic. Lock/unlock lifecycle: none. Partial failure: every ladder miss degrades down the chain, never throws. Rollback: revert to the emotion-only resolver. Stale state: a message's `outfit_id` may name an outfit deleted after the fact — treat as a ladder miss. Data races: none beyond miss tolerance. Resolution is deterministic and idempotent; catalog materialization may write wardrobe_items once per (actor, catalog id), guarded against concurrent insert. Observability: none needed.

**Summary:**

The wardrobe ladder shipped but **never reaches the render path**. Give
`avatarForMessage` an outfit input, or move resolution server-side via
`selectAvatar`.

**This is P0: without it, every other ticket in this epic is invisible.**

**Context:**

The dead read path, in three verified pieces:

1. **`avatarForMessage` has no outfit input at all.**
   `src/frontend/alpine/mood/avatars.ts:155-168`. The signature is
   `avatarForMessage(msg: { role?: string; emotion?: string | null })`. It
   resolves over a flat `_emotionAvatars` list: exact emotion → `neutral` →
   first element → `currentCharacter.avatar_asset_id`. `outfit_id` is not in the
   parameter type, and the narrowed interface in
   `src/frontend/alpine/chat-types/mood-state.ts:33` repeats the same shape.
2. **`selectAvatar` — the only place the outfit ladder runs — has no frontend
   caller.** The ladder is at
   `src/characters/services/avatar-service/selection.ts:138-153`
   (`wardrobeInPlay` → `resolveSelectionOutfit` → `runOutfitLadder`, then a
   filter to outfitless variants on a miss). Grepping `src/frontend` for
   `selectAvatar` returns no matches.
3. **`POST /api/actors/:actorId/outfit-resolve` has zero client consumers.** The
   route exists at `src/routes/wardrobe-avatars.ts:109-159` and does resolve the
   full context through `avatars.selectAvatar` (`:123-133`), but grepping
   `outfit-resolve` across `src/frontend` returns nothing.

**Consequence:** the chat-header outfit switcher writes an override
(`src/frontend/alpine/chat-outfit-switcher.ts:109-118`) that
`src/characters/services/wardrobe/resolve.ts:160-189` can read, but nothing
joins resolution to render. The user switches outfit in the header and the
avatar does not change. Even a perfect narrative extractor would change nothing
visible.

**Two viable designs — pick one, do not do both:**

- **A (client-side):** thread `msg.outfit_id` into `avatarForMessage` and walk
  the same ladder locally. Cheapest; duplicates ladder logic in the client, so
  the two copies must be pinned by an equivalence test or they will drift.
- **B (server-side):** resolve in the message-read path via `selectAvatar` and
  hand the client a resolved asset id. One ladder, one owner of the ordering;
  costs a route/DTO change and a per-message lookup.

**Recommendation: B.** The predecessor epic's own acceptance criterion is
"Selection is deterministic + documented ladder; unit tests pin precedence"
(`epic-wardrobe-avatar-variants.md:137`). Two implementations of that ladder is
a drift generator; one is not. If A is chosen for scope reasons, the duplicate
ladder needs its own equivalence test against `runOutfitLadder`.

Existing ladder order to preserve, verbatim from the module header of
`src/characters/services/wardrobe/selection-ladder.ts:9-17`: (outfit, emotion) →
(outfit, neutral) → (default outfit, emotion) → (base/outfitless, emotion) →
base portrait. On a miss, only outfitless variants remain eligible
(`src/characters/services/avatar-service/selection.ts:150-152`).

**Acceptance Criteria:**

- [ ] AC1: Given a message whose actor has an active outfit for the chat — resolved as chat override > location rule > equipped loadout > character default outfit — the rendered avatar_asset_id is the (outfit, emotion) variant. With no override and no location rule, the actor's default outfit applies.
- [ ] AC2: Changing the chat-scene outfit override visibly changes the avatar rendered for subsequent messages in that chat.
- [ ] AC3: Ladder order matches `src/characters/services/wardrobe/selection-ladder.ts:9-17` exactly, pinned by unit tests covering each rung and each miss.
- [ ] AC4: Given an actor with NO resolvable outfit — no chat override, no location rule, no default outfit — the message renders identically to today: avatar_asset_id is left absent and the client's emotion-only walk owns the render.
- [ ] AC5: A message naming an outfit with no matching variant degrades to the outfitless / base rung — it never throws and never renders another outfit's variants.
- [ ] AC6: `avatarForMessage`'s message parameter carries the outfit input, or the asset id arrives pre-resolved — either way the flat exact → neutral → first walk is no longer the whole resolver.
- [ ] AC7: The existing pinned behaviour at `src/frontend/alpine/mood.test.ts:64-77` (purity — the resolver does not mutate `_currentEmotionAvatar`) still passes.
- [ ] AC8: An outfit_id naming a deleted outfit is a ladder miss, not an error: resolution degrades down the chain and never throws.
- [ ] AC9: Pending TASK-messages-outfit-id-column: once messages.outfit_id lands, per-message outfit takes precedence over the chat-scoped context, and resolveMessageAvatar is the single seam for that change.

**Notes / Evidence:**

- The dead resolver: `src/frontend/alpine/mood/avatars.ts:155-168`
- Its narrowed interface: `src/frontend/alpine/chat-types/mood-state.ts:33`
- Purity pin: `src/frontend/alpine/mood.test.ts:64-77`
- The ladder, unreachable from the client:
  `src/characters/services/avatar-service/selection.ts:138-153`; the
  wardrobe-in-play guard at `:134-136`
- The unreachable route: `src/routes/wardrobe-avatars.ts:109-159`
- The override that goes nowhere: `src/frontend/alpine/chat-outfit-switcher.ts:109-118`
  (write side) vs `src/characters/services/wardrobe/resolve.ts:160-189`
  (read side)
- Ladder precedence the resolver must match:
  `src/characters/services/wardrobe/selection-ladder.ts:5-19`
  (chat override > location rule > equipped loadout > default), implemented at
  `src/characters/services/wardrobe/resolve.ts:164-188`
- The epic's own determinism criterion: `epic-wardrobe-avatar-variants.md:137`

## Implementation Notes

- `src/characters/services/wardrobe/message-avatar.ts` is the server-side resolver; `resolveMessageAvatar` is the seam for the pending `messages.outfit_id` column.
- The location rung resolves per-section (`messages.section_id` → `chat_sections.location_id`), falling back to the chat's current location.
- The wardrobe ladder is delegated wholesale to `selectAvatar`, so ordering cannot drift from the selection ladder.
- A per-message outfit can change the rendered avatar for actors with a non-null `default_outfit` (rung 3) where the base portrait rendered before — intentional, and it belongs in release notes.
- Not covered: no browser-level E2E for the header-switcher → DOM path.