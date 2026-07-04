# Database Migration Strategy

## Rationale

The current migration chain (5 files across 001–004 with a split 003) scatters
columns for the same table across multiple files via `ALTER TABLE ADD COLUMN`.
For example, `generation_attempts` starts in 003, then gets `parent_attempt_id`,
`continuation_count`, `partial_content`, `step_index`, and `total_steps` bolted
on in 004. Messages get `parent_id`, `is_continuation`, `continuation_index`,
and `partial` added via the same late migration.

Since we have zero production data, we can break this chain and rebuild every
table fully in one place.

## Design Principles

1. **Each table is fully created in exactly one migration file.** No `ALTER TABLE
ADD COLUMN` for new columns on a table created in a previous migration.

2. **Multiple files, logically grouped.** Groups reflect dependency order: files
   are numbered so alphabetical sort respects FK dependencies.

3. **Typed schema as the single source of truth.** `src/db/schema.ts` defines
   every column. Migration code mirrors the interface it implements.

4. **No splitting of domains across files.**

## Migration Groups

| #   | File                  | Tables                                                                                                       | FK dependencies                    |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 001 | `001_core.ts`         | `users`, `worlds`                                                                                            | None                               |
| 002 | `002_identity.ts`     | `sessions`, `assets`, `locations`                                                                            | → users, worlds                    |
| 003 | `003_participants.ts` | `actors`, `characters`                                                                                       | → users, assets                    |
| 004 | `004_comms.ts`        | `chats`, `chat_participants`, `messages`                                                                     | → users, worlds, actors            |
| 005 | `005_generation.ts`   | `generation_attempts`                                                                                        | → chats, messages, actors          |
| 006 | `006_story.ts`        | `story_turns`, `quests`, `quest_progress`, `world_states`, `npc_states`, `location_states`, `synthetic_data` | → chats, actors, worlds, locations |
| 007 | `007_actors_ext.ts`   | `actor_memories`, `actor_notes`, `actor_lore_entries`, `world_lore_entries`                                  | → actors, worlds                   |
| 008 | `008_items.ts`        | `items`, `world_items`                                                                                       | → worlds, locations, actors        |

Each migration produces tables that exactly match the interfaces in
`src/db/schema.ts`. Each table's full column set (including continuation
columns, actor extension columns, etc.) is created in its owning file — no
late ALTER TABLE additions.
