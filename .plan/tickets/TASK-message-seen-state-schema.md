<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message Seen-State Schema & Enum

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Labels:** messages, schema, seen
**Epic:** epic-message-seen-state

## Summary

Add the `message_seen` table and the `MessageSeenState` state machine. This is the storage foundation for the seen/unseen + AI-processing viewership ledger.

## Current State

- `message_reactions` (`src/db/migrations/009_reactions_pins.ts`) is the closest analog: `message_id`, `user_id`, `emoji`, `created_at`, with `UNIQUE(message_id, user_id, emoji)` and `onDelete("cascade")`. It keys on `user_id` (humans only).
- `chat_participants` (`src/db/migrations/parts/004_chats_actors.ts`) carries `actor_id` — the participant identity that spans both human users and AI characters.
- `src/db/enums-core/flags.ts` defines `NotificationStatus` (`unread`/`read`/`archived`) via `createMachine` + `StateDef` — the exact pattern to mirror.

## Change

New migration (e.g. `NNN_message_seen.ts`):

```ts
createTable("message_seen")
  .addColumn("id", "text", col => col.primaryKey())
  .addColumn("message_id", "text", col => col.notNull().references("messages.id").onDelete("cascade"))
  .addColumn("actor_id", "text", col => col.notNull().references("actors.id").onDelete("cascade"))
  .addColumn("state", "text", col => col.notNull().defaultTo("unseen"))
  .addColumn("seen_at", "text") // set when state first reaches "seen"/"processing"
  .addColumn("created_at", "text", col => col.notNull().defaultTo(sql`(datetime('now'))`))
  .execute();

// UNIQUE(message_id, actor_id) — one ledger row per actor per message
createIndex("idx_seen_message").on("message_seen").column("message_id").execute();
createIndex("idx_seen_actor").on("message_seen").column("actor_id").execute();
```

Add to `src/db/enums-core/flags.ts` (mirror `NotificationStatus`):

```ts
export const MessageSeenState = {
  Unseen: "unseen",
  Processing: "processing", // AI actor admitted to process (rate-limit/batch)
  Seen: "seen",
} as const;
export type MessageSeenState = (typeof MessageSeenState)[keyof typeof MessageSeenState];

const messageSeenStateDef: StateDef<MessageSeenState> = {
  values: ["unseen", "processing", "seen"] as const,
  initial: "unseen",
  transitions: {
    unseen: ["processing", "seen"],
    processing: ["seen", "unseen"],
    seen: ["unseen"], // reset
  },
  terminal: [],
};
export const messageSeenStateMachine = createMachine(messageSeenStateDef);
```

## Acceptance Criteria

- [ ] Migration creates `message_seen` with `UNIQUE(message_id, actor_id)`, FKs to `messages.id` and `actors.id` (cascade), and both indexes.
- [ ] `MessageSeenState` + `messageSeenStateMachine` added to `src/db/enums-core/flags.ts` with the transitions above.
- [ ] `bun run db:sync-types && bun run db:sync-manifest` regenerates `src/db/schema-*.ts`, `src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`, `src/validation/db-schemas.ts`.
- [ ] `bun run schemas:check` passes green.
- [ ] Unit test asserting the state machine transitions (unseen→processing→seen, unseen→seen, seen→unseen reset).
