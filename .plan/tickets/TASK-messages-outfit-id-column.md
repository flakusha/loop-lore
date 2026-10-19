<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: `messages.outfit_id` column

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Caveats:** Migration ordering: `065` is the next free number — highest present is `src/db/migrations/064_vn_choice_selections.ts`; re-check at write time in case a sibling lands first. Nullability: the column is nullable and stays nullable forever; `null` means "no outfit was ever inferred for this message" and must render exactly as today. Backfill: none — no historical message gains an outfit by retro-fitting. TOCTOU: two writers racing on one row's appearance fields; last write wins, which is acceptable and must be pinned. Security: none — the value is an internal wardrobe-item id, not user input. Authorization: the outfit id written must belong to an actor in the chat. Rollback: drop the column; nothing else depends on it. Stale state: a message may name an outfit deleted afterwards — resolution must treat that as a ladder miss, not an error. Idempotency: re-storing the same message is a no-op. Observability: none.

**Summary:**

A nullable `messages.outfit_id` column plus a write beside every existing
`messages.emotion` write — the cheapest architectural decision in this epic,
and the one that makes appearance rendering read-side and symmetric.

**Context:**

`messages.emotion` is the working precedent, end to end:

- Column: `src/db/schema-core.ts:778` — `emotion: string | null`
- Manifest: `src/db/schema-manifest.ts:2207` — `emotion: col("text")`
- Writers (verified by grep — there are **exactly two** production writers in the
  auto-generation paths, plus one manual-chat write):
  - `src/generation/auto-gen/store-message.ts:161` — `emotion: dominantEmotion ?? null`
  - `src/generation/auto-gen/story-store.ts:170` — `emotion: dominantEmotion`
  - `src/chat/service/write.ts:148` — `emotion: message.emotion` (variant path;
    carried through, not computed)
- Reader: `avatarForMessage` (`src/frontend/alpine/mood/avatars.ts:155-168`)

The value is fed by `runContentHooks`, which extracts `dominantEmotion` from the
hook chain's `emotion_change` event
(`src/generation/auto-gen/content-hooks.ts:230-232`) and returns it
(`:246`). `messages.outfit_id` mirrors that shape exactly: the hook chain gains
an outfit event, `runContentHooks` returns the resolved outfit id alongside
`dominantEmotion`, and both writers persist it.

The write happens inside the same insert `values({...})` block in both writers —
`src/generation/auto-gen/store-message.ts:142-163` inside a
`retryBounded` transaction, `src/generation/auto-gen/story-store.ts:154-171`
directly.

`chat_wardrobe_overrides` (chat-scoped, resolved by
`src/characters/services/wardrobe/resolve.ts:164-173`) is **not** the same
thing: this column records what the *narrator said happened*, per message. The
override remains the top resolution rung; the column is a per-message hint the
resolver can consume.

**Acceptance Criteria:**

- [ ] Forward migration `065` adds `messages.outfit_id` as nullable text; schema
      types and manifest regenerated via `bun run db:sync-types` and
      `bun run db:sync-manifest`, and `bun run schemas:check` passes
- [ ] `src/generation/auto-gen/store-message.ts` writes `outfit_id` in the same
      `values` block as `emotion` (`:161`)
- [ ] `src/generation/auto-gen/story-store.ts` does the same (`:170`)
- [ ] `src/chat/service/write.ts` carries the field through for the variant
      path, matching how `emotion` is carried (`:148`)
- [ ] A migration test asserts the column exists and is nullable after
      migration, and that a message written without an outfit stores `null`
- [ ] `bun run db:sync-types`, `bun run db:sync-manifest`, `bun run
      schemas:check`, `bun run typecheck`, and `bun run lint` all pass
- [ ] No existing migration file is edited

**Notes / Evidence:**

- Column precedent: `src/db/schema-core.ts:778`; manifest entry
  `src/db/schema-manifest.ts:2207`
- Writer 1: `src/generation/auto-gen/store-message.ts:161` (inside the
  transaction opened at `:124`, values block `:142-163`)
- Writer 2: `src/generation/auto-gen/story-store.ts:170` (values block `:154-171`)
- Manual/variant path: `src/chat/service/write.ts:148`
- How the value reaches the writers:
  `src/generation/auto-gen/content-hooks.ts:230-232` and `:246`
- Next free migration: `src/db/migrations/064_vn_choice_selections.ts` is the
  highest present
- Distinct from the chat override: `src/characters/services/wardrobe/resolve.ts:164-173`
- Test helper that will need the new field:
  `src/test-utils/insert-helpers.ts:2425` (message insert opts already carry
  `emotion?: string | null`)