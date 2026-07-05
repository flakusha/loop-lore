# Actor Data Model

## Overview

The `actors` table is the unified participant model — every entity that sends messages
or participates in chats has an actor entry. This document extends the core schema
to cover all **common actor data**: welcome messages, character card imports (multiple formats),
memories, notes, lorebooks, and inventory items.

Design goals:

1. **Single source of truth** — all participant-related data hangs off the actor
2. **Import-friendly** — SillyTavern V1 and V2 character cards map cleanly
3. **Extensible** — each concern (memories, notes, lore, items) gets its own table
4. **Composable** — actors can own lorebooks, items, memories independently of chat

---

## Source Files

| File                            | Covers                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/db/migrations/001_init.ts` | DDL for all actor tables — columns, constraints, defaults, indexes                             |
| `src/db/schema-core.ts`         | `Actors`, `ActorKeys` type interfaces                                                          |
| `src/db/schema-story.ts`        | `ActorMemories`, `ActorLoreEntries`, `WorldLoreEntries`, `Items`, `WorldItems` type interfaces |

Actor-specific child tables (`actor_notes`, `actor_items`) are also defined in `schema-story.ts`.
The `actors` table itself lives in `schema-core.ts`.

---

## Data Versioning

Every actor record carries a `data_version` integer that tracks which iteration
of the internal schema was used to create it. This enables **forward-compatible
evolution**: old records continue working when new columns are added, and new
records are stamped with the latest version.

### Version Table

| Version | Meaning                                                   |
| ------- | --------------------------------------------------------- |
| 0       | Active development — all current records. Schema in flux. |
| 1+      | Reserved for post-stabilisation bumps (see below).        |

During active development **everything is v0**. When the actor data model
stabilises and backwards compatibility matters, the version numbers become
meaningful:

| Version | Meaning                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0       | Pre-stabilisation — schema in flux. All current records.                                                                                                                                      |
| 1       | Card fields: `welcome_message`, `personality`, `scenario`, `mes_example`, `alternate_greetings`, `post_history_instructions`, `creator_notes`, `creator`, `character_version`, `import_spec`. |
| 2       | Memories: `actor_memories` table available.                                                                                                                                                   |
| 3       | Lorebooks: `actor_lore_entries` and `world_lore_entries` tables available.                                                                                                                    |
| 4       | Items/inventory: `actor_items` table available.                                                                                                                                               |

These versions are **sequential** — each adds features but never removes or
breaks existing ones. The current version is always the latest.

### How It Works (post-stabilisation)

During active development, every actor is `data_version = 0`. Once stabilised, version progression follows this timeline:

1. **Record created** — Timestamp `record.created_at` marks the starting point
2. **`data_version = 0`** (pre-versioning) — Only basic fields present: `description`, `system_prompt`. New columns are `NULL` — application handles gracefully (no welcome message, no personality snippet)
3. **`data_version = 1`** (card fields) — `welcome_message`, `personality`, `scenario`, `import_spec="v2"` columns populated. No memories/lore/items yet
4. **`data_version = 4`** (everything) — All fields present: `welcome_message`, `personality`, `scenario`, `import_spec="v2"`, `items=[...]`, `lore=[...]`, `memories=[...]`

**Backward compatibility:** Old records with missing columns render `NULL` defaults gracefully. New records under full schema contain everything.

### Backward Compatibility Contract

1. **Never remove columns.** New fields are always additive. Code reads old
   records fine — missing columns read as NULL/default.
2. **Never repurpose columns.** A column's semantics are locked at introduction.
   New features get new columns (or new child tables).
3. **Default values fill gaps.** If the application needs a value for a missing
   column on an old record, it applies a sensible default (empty string, empty
   array, base prompt, etc.) rather than crashing.
4. **Migrate on write, not just on read.** When an old record is updated by the
   user, bump its `data_version` to current. This spreads the migration cost
   across edits rather than requiring a one-time backfill.

### Versioning vs Versions ("Swipes")

These are three distinct concepts that should not be confused:

| Concept                       | What it tracks                                | Example                                                                | Stored where                                                        |
| ----------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Data version**              | Internal schema iteration of the record       | `data_version = 3`                                                     | `actors.data_version`                                               |
| **Card spec version**         | External import/export format                 | `import_spec = 'chara_card_v2'` + `settings.importSpecVersion = '2.0'` | `actors.import_spec` + `settings` JSON                              |
| **Content versions (swipes)** | Multiple alternate messages for the same slot | `alternate_greetings[0]`, `alternate_greetings[1]`                     | `actors.alternate_greetings` (JSON array) or `message_swipes` table |

- **Data version** is about the _shape of the record_ in the database — purely
  internal, invisible to users.
- **Card spec version** is about _compatibility with external tools_ — which
  format was used on import, which format to use on export.
- **Swipes** are a _UI feature_: the user presses a button to cycle through
  alternate content (greetings, or response candidates). Each swipe is a
  different _value_ at the same _schema version_.

Example to make it concrete:

```
Actor "Lyra" was imported from a SillyTavern V2 card:
  data_version = 1     (card fields available, no memories/lore/items yet)
  import_spec  = 'chara_card_v2'
  settings.importSpecVersion = '2.0'
  character_version = '1.3'             ← creator's own versioning
  alternate_greetings = [
    "Hello there!",                      ← swipe 0
    "Well met, traveller!",              ← swipe 1
    "Fancy meeting you here..."          ← swipe 2
  ]
```

After a conversation, the system extracts memories and the user adds lore:
`data_version → 3` (bumped on write — lorebook entries exist)

After the user adds an item to her inventory:
`data_version → 4` (bumped on write — items table populated)

The three swipes in `alternate_greetings` are all at `data_version = 4` —
versioning didn't change, only the content did.

### Backfill Strategy

A version-aware backfill script iterates over actors below `CURRENT_VERSION`. Most bumps require no data transformation — they just acknowledge schema compatibility:

1. **If `data_version < 1`** (v0 → v1): No backfill needed. New columns default to `NULL`, read-time defaults apply
2. **If `data_version < 2`** (v1 → v2): Optionally pre-seed memories from chat history using message extraction (expensive, opt-in)
3. **If `data_version < 3`** (v2 → v3): Lore entries exist only if imported — nothing to backfill
4. **If `data_version < 4`** (v3 → v4): Items are user-authored — nothing to backfill
5. **Set `data_version = CURRENT_VERSION`**

Most version bumps require **no data transformation** — they just acknowledge
that the record is compatible with a newer schema. The heavy transformations
(memory extraction from chat history) are opt-in and separate.

---

## Actor Table — Additional Columns

Beyond the core columns defined in `src/db/schema-core.ts`, the `actors` table
includes character-card support columns (all in `001_init.ts`):

- **Card fields**: `welcome_message`, `personality`, `scenario`, `mes_example`,
  `alternate_greetings` (JSON array), `post_history_instructions`,
  `creator_notes`, `creator`, `character_version`, `import_spec`

These map directly from SillyTavern V1/V2 character card fields (see V2 mapping below).
Frequently-accessed fields get dedicated columns; rarely-used metadata lives in the
`settings` JSON blob (`settings.tags`, `settings.extensions`,
`settings.importSpecVersion`, `settings.modelPreferences`, etc.).

### V2 Spec Field Mapping

| V2 Field                    | Storage                      | Notes                                    |
| --------------------------- | ---------------------------- | ---------------------------------------- |
| `spec`                      | `import_spec`                | Always `'chara_card_v2'` after V2 import |
| `spec_version`              | `settings.importSpecVersion` |                                          |
| `name`                      | `display_name`               |                                          |
| `description`               | `description`                |                                          |
| `personality`               | `personality`                |                                          |
| `scenario`                  | `scenario`                   |                                          |
| `first_mes`                 | `welcome_message`            |                                          |
| `mes_example`               | `mes_example`                |                                          |
| `creator_notes`             | `creator_notes`              |                                          |
| `system_prompt`             | `system_prompt`              |                                          |
| `post_history_instructions` | `post_history_instructions`  |                                          |
| `alternate_greetings`       | `alternate_greetings`        | JSON array                               |
| `character_book`            | `actor_lore_entries`         | See lorebook section below               |
| `tags`                      | `settings.tags`              | JSON array                               |
| `creator`                   | `creator`                    |                                          |
| `character_version`         | `character_version`          |                                          |
| `extensions`                | `settings.extensions`        | Namespaced key-value store               |

---

## Memories

Actor memories are accumulated facts learned across conversations. Unlike lore
(which is static, authored content), memories grow organically.

Table: `actor_memories` — defined in `src/db/schema-story.ts` and `001_init.ts`.

**Design rationale:**

- `source_chat_id` tracks provenance so users can jump to where a memory was formed
- `confidence` + `importance` allow the memory system to prioritize under context budget
- `expires_at` supports temporal memories ("the innkeeper said the festival is next week")
- `memory_type` supports different memory subsystems (summary, fact extraction, relationships)

### Memory Lifecycle

```
1. A conversation happens
2. Post-generation hook (LLM idle) extracts facts → creates memory entries
3. Background cron periodically re-processes chats to improve injection quality
4. Redundant or superseded memories get consolidated (confidence drops, new entry replaces)
5. Under token pressure, low-importance memories are dropped first
6. Expired memories are pruned on read
```

- **Hook trigger**: after LLM response, if generation pipeline has capacity
- **Cron trigger**: periodic sweep (configurable interval), re-processes recent chats

---

## Notes

Freeform notes attached to an actor. Unlike memories (machine-generated), notes are
user-authored reference material.

Table: `actor_notes` — defined in `src/db/schema-story.ts` and `001_init.ts`.

- Fields: `id`, `actor_id`, `title`, `content` (Markdown), `category`, `pinned`, `sort_order`
- Categories: `general`, `backstory`, `relationships`, `plot`, `mechanics`, `custom`
- Pinned notes always visible; others ordered by `sort_order`

---

## Lorebooks (World Info)

Lorebooks are keyword-triggered knowledge entries. Two scopes:

1. **Actor lorebook** (`actor_lore_entries`) — lore embedded in a character card, travels with the character
2. **World lorebook** (`world_lore_entries`) — global lore not tied to any single character

Both tables share the same structure (see `src/db/schema-story.ts` and `001_init.ts`):

- Trigger keywords (`keys`, `secondary_keys`), matching mode (`selective`, `case_sensitive`)
- Insertion control: `position` (`before_char` / `after_char`), `insertion_order`, `priority`
- Budget control: `constant` (always included), `enabled` (toggle), `priority` (discard order)
- V2 `character_book` entries map directly to `actor_lore_entries` rows

### Worlds Table — Extension

Two columns on the `worlds` table configure lorebook behavior (already in `001_init.ts`):

| Column         | Type    | Default | Notes                                                  |
| -------------- | ------- | ------- | ------------------------------------------------------ |
| `scan_depth`   | INTEGER | `100`   | How many recent messages to scan for keyword triggers  |
| `token_budget` | INTEGER | `2000`  | Max tokens lore entries can consume in a single prompt |

### Lore Injection Flow

```
1. When generating a response, the system collects:
   a. World lorebooks linked to the current chat (via asset_links where entity_type='world')
   b. Character lorebooks for each participant actor with agent_type='ai'
2. For each lorebook, scan recent N messages (scan_depth) for keyword matches
3. Sort matching entries by insertion_order (lower first)
4. Deduplicate by id
5. Fill up to token_budget from highest-priority entries
6. Inject matched entries at specified position relative to character defs
```

---

## Items / Inventory

Items that belong to an actor — equipment, possessions, quest items, etc.

Table: `actor_items` — defined in `src/db/schema-story.ts` and `001_init.ts`.

- Fields: `id`, `actor_id`, `name`, `description`, `item_type`, `quantity`, `value`, `weight`, `tags`, `metadata`, `equipped`, `sort_order`
- Item types: `weapon`, `armor`, `consumable`, `key_item`, `currency`, `container`, `tool`, `misc`
- `metadata` JSON holds arbitrary properties (damage, defense, charges, etc.)
- `equipped` boolean marks currently wielded/worn items

### Asset Linking

Items can have associated images (item icons, weapon sprites) via the existing
`asset_links` table:

```
asset_links { asset_id, entity_type='actor_item', entity_id=<item-uuid>, label='icon' }
```

---

## Import / Export

### SillyTavern V1 Import

Raw V1 cards (JSON or PNG-embedded) map:

- `name` → `display_name`
- `description` → `description`
- `personality` → `personality`
- `scenario` → `scenario`
- `first_mes` → `welcome_message`
- `mes_example` → `mes_example`
- PNG image → asset + link as `avatar_asset_id`

### SillyTavern V2 Import

V2 cards (wrapped in `{ spec, spec_version, data: {...} }`) map:

- All V1 fields, plus:
- `system_prompt` → `system_prompt`
- `post_history_instructions` → `post_history_instructions`
- `alternate_greetings` → `alternate_greetings`
- `tags` → `settings.tags`
- `creator` → `creator`
- `creator_notes` → `creator_notes`
- `character_version` → `character_version`
- `extensions` → `settings.extensions`
- `character_book` → `actor_lore_entries` (one row per entry)
- PNG/APNG image → asset + link as `avatar_asset_id`

### SillyTavern World Info / Lorebook Import

Standalone world info JSON maps:

- Outer book fields → `worlds` table (new row) + `scan_depth`, `token_budget`
- Each entry → `world_lore_entries`

### Export

Export always produces V2 format for maximum compatibility. The exporter:

1. Reads all mapped actor columns
2. Collects `actor_lore_entries` into `data.character_book`
3. Wraps in V2 envelope
4. Embeds in PNG (if avatar asset exists) or exports as `.json`

---

## Character Visibility & Sharing

Characters (actors with `actor_type='character'`) have a **state machine** controlling sharing:

| State     | Meaning                                     |
| --------- | ------------------------------------------- |
| `private` | Only creator (`owner_id`) can use in chats  |
| `public`  | Any user can discover and use the character |

**Transitions:** `private` ↔ `public` (toggle, always allowed).

**Flow:**

```
1. User creates character → visibility='private', owner_id=user.id
2. User edits character → toggles visibility to 'public'
3. Other users can browse/search public characters
4. Other users select the character for their chats
5. Using a character = setting chat.impersonate_id to the character's actor_id
```

**Default persona:** When a user starts a new chat, their own characters (where `owner_id = user.id` and `actor_type = 'character'`) are suggested as the default persona. If the user has a default persona set (`personas.is_default = 1`), that takes precedence.

**State machine:** `ActorVisibility` in `src/db/enums-core.ts`, exposed via `actorVisibilityMachine`.

---

## Prompt Assembly

When constructing the LLM prompt for an actor, these fields are injected in order:

1. `[Actor - {{display_name}}]` — actor identity header
2. `Description: {{description}}` — character description
3. `Personality: {{personality}}` — character personality
4. `Scenario: {{scenario}}` — current scenario context
5. `[System Prompt]` — `{{system_prompt}}` section header + value
6. `[Lorebook (before char)]` — activated actor lore entries (`position='before_char'`) and activated world lore entries from linked worlds
7. `[Example Messages]` — `{{mes_example}}` few-shot examples
8. `[Chat History]` — conversation history
9. `[Lorebook (after char)]` — actor lore (`position='after_char'`) and world lore positioned after character
10. `[Memories]` — actor memories ordered by importance DESC, within token budget
11. `[Post-History Instructions]` — `{{post_history_instructions}}`

The `welcome_message` is NOT injected into prompts — it's used only when starting a new chat as the character's first message.
