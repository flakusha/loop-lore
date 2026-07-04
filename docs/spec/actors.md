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

During active development, every actor is `data_version = 0`. Once stabilised,
version progression looks like this:

```
                                       record.created_at
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                data_version=0           data_version=1           data_version=4
                (pre-versioning)         (card fields)           (everything)
                    │                         │                         │
              description="..."         welcome_message="..."    welcome_message="..."
              system_prompt="..."       personality="..."        personality="..."
                                         scenario="..."          scenario="..."
                                         import_spec="v2"        import_spec="v2"
                                                                 items=[...]
                                                                 lore=[...]
                                                                 memories=[...]
```

- **Old record** (v0): `welcome_message` is NULL, `personality` is NULL — the
  application handles gracefully (no welcome, no personality snippet).
- **Mid record** (v1): Has card fields but no memories/lore/items tables populated.
- **New record** (v4): Has everything, created under the full schema.

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

A version-aware backfill script can be run at any time to upgrade old records:

```
for each actor where data_version < CURRENT_VERSION:
    if data_version < 1:
        # v0 → v1: no backfill needed — new columns are NULL,
        #           defaults apply at read time
    if data_version < 2:
        # v1 → v2: optionally pre-seed memories from chat history
        #          using message extraction (expensive, opt-in)
    if data_version < 3:
        # v2 → v3: lore entries exist only if imported — nothing to backfill
    if data_version < 4:
        # v3 → v4: items are user-authored — nothing to backfill

    set data_version = CURRENT_VERSION
```

Most version bumps require **no data transformation** — they just acknowledge
that the record is compatible with a newer schema. The heavy transformations
(memory extraction from chat history) are opt-in and separate.

---

## Actor Table — Column Additions

The existing `actors` table (defined in `docs/schema.md` and `src/db/schema.ts`)
gains these columns for character-card support. Columns that are rarely used in
queries (tags, extensions, import metadata) live in the `settings` JSON blob;
frequently-accessed fields get their own column.

### New Columns

| Column                      | Type    | Constraints         | Notes                                                                                                                                  |
| --------------------------- | ------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `data_version`              | INTEGER | NOT NULL, DEFAULT 0 | Tracks which iteration of the schema created this record (0 = pre-versioning, 1 = card fields, 2 = memories, 3 = lorebooks, 4 = items) |
| `welcome_message`           | TEXT    |                     | Character's first message / greeting (`first_mes`)                                                                                     |
| `personality`               | TEXT    |                     | Short personality summary (separate from `description`)                                                                                |
| `scenario`                  | TEXT    |                     | RP scenario / context / setting                                                                                                        |
| `mes_example`               | TEXT    |                     | Example conversation snippets                                                                                                          |
| `alternate_greetings`       | TEXT    | JSON array          | Alternate welcome messages — **content swipes**, not data versions                                                                     |
| `post_history_instructions` | TEXT    |                     | Instructions appended after chat history (V2 `post_history_instructions`)                                                              |
| `creator_notes`             | TEXT    |                     | Notes from creator — NOT used in prompts                                                                                               |
| `creator`                   | TEXT    |                     | Creator name/credit                                                                                                                    |
| `character_version`         | TEXT    |                     | Version string (creator's own versioning)                                                                                              |
| `import_spec`               | TEXT    | DEFAULT 'raw'       | 'chara_card_v1' \| 'chara_card_v2' \| 'raw'                                                                                            |

### settings JSON — Extended Keys

The existing `settings` JSON column stores remaining card metadata:

```typescript
interface ActorSettings {
  // Card metadata
  tags?: string[];
  extensions?: Record<string, unknown>; // V2 spec extensions (namespaced)

  // Import tracking
  importedAt?: string; // ISO 8601
  importedFrom?: string; // source filename or URL
  importSpecVersion?: string; // e.g. "2.0"

  // Actor preferences
  modelPreferences?: {
    preferredProvider?: string;
    preferredModel?: string;
    temperature?: number;
    maxTokens?: number;
  };

  // Display
  color?: string; // Accent color in UI
  nickname?: string; // User's local nickname for this actor
}
```

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

### Table: `actor_memories`

| Column         | Type    | Constraints               | Notes                                                     |
| -------------- | ------- | ------------------------- | --------------------------------------------------------- |
| id             | TEXT    | PK, UUID                  |                                                           |
| actor_id       | TEXT    | FK → actors.id, NOT NULL  | Owner of this memory                                      |
| source_chat_id | TEXT    | FK → chats.id             | Chat where memory was learned (nullable)                  |
| content        | TEXT    | NOT NULL                  | The memory text                                           |
| memory_type    | TEXT    | NOT NULL                  | 'summary', 'fact', 'experience', 'relationship', 'custom' |
| confidence     | REAL    | DEFAULT 1.0               | 0.0–1.0 — how reliable/settled                            |
| importance     | INTEGER | DEFAULT 1                 | 1–10 — priority for retention under token budget          |
| keywords       | TEXT    | JSON array                | Search keywords                                           |
| created_at     | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                           |
| updated_at     | TEXT    | DEFAULT CURRENT_TIMESTAMP | Last revision                                             |
| expires_at     | TEXT    |                           | TTL for ephemeral memories (null = permanent)             |

**Indexes:**

- `(actor_id)` — fetch all memories for an actor
- `(actor_id, memory_type)` — filter by type
- `(actor_id, importance DESC)` — for budget-based pruning

**Design rationale:**

- `source_chat_id` tracks provenance so users can jump to where a memory was formed
- `confidence` + `importance` allow the memory system to prioritize under context budget
- `expires_at` supports temporal memories ("the innkeeper said the festival is next week")
- `memory_type` supports different memory subsystems (summarization, fact extraction, etc.)

### Memory Lifecycle

```
1. A conversation happens
2. Post-processing extracts facts → creates memory entries
3. Redundant or superseded memories get consolidated (confidence drops, new entry replaces)
4. Under token pressure, low-importance memories are dropped first
5. Expired memories are pruned on read
```

---

## Notes

Freeform notes attached to an actor. Unlike memories (machine-generated), notes are
user-authored reference material.

### Table: `actor_notes`

| Column     | Type    | Constraints               | Notes                                                                  |
| ---------- | ------- | ------------------------- | ---------------------------------------------------------------------- |
| id         | TEXT    | PK, UUID                  |                                                                        |
| actor_id   | TEXT    | FK → actors.id, NOT NULL  |                                                                        |
| title      | TEXT    | NOT NULL                  | Note title                                                             |
| content    | TEXT    | NOT NULL                  | Note body (Markdown)                                                   |
| category   | TEXT    | DEFAULT 'general'         | 'general', 'backstory', 'relationships', 'plot', 'mechanics', 'custom' |
| pinned     | INTEGER | DEFAULT 0                 | Boolean: 1 = always visible                                            |
| sort_order | INTEGER | DEFAULT 0                 | Display ordering                                                       |
| created_at | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                                        |
| updated_at | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                                        |

**Indexes:**

- `(actor_id, category)` — notes grouped by category
- `(actor_id, pinned DESC, sort_order)` — display order

---

## Lorebooks (World Info)

Lorebooks are keyword-triggered knowledge entries. Two scopes:

1. **Actor lorebook** (character_book) — lore embedded in a character card, travels with the character
2. **World lorebook** — global lore not tied to any single character (the existing `worlds` table)

### Table: `actor_lore_entries`

Character-specific lorebook entries. Each entry is activated when its trigger
keywords appear in recent context.

| Column          | Type    | Constraints               | Notes                                                      |
| --------------- | ------- | ------------------------- | ---------------------------------------------------------- |
| id              | TEXT    | PK, UUID                  |                                                            |
| actor_id        | TEXT    | FK → actors.id, NOT NULL  | Which actor owns this entry                                |
| name            | TEXT    |                           | Entry name (not used in prompt, for UI)                    |
| content         | TEXT    | NOT NULL                  | Lore text injected on trigger                              |
| keys            | TEXT    | NOT NULL                  | JSON array of trigger keywords                             |
| secondary_keys  | TEXT    | JSON array                | Secondary keywords for `selective` mode                    |
| selective       | INTEGER | DEFAULT 0                 | Boolean: require key from both `keys` AND `secondary_keys` |
| case_sensitive  | INTEGER | DEFAULT 0                 | Boolean: keyword matching is case-sensitive                |
| enabled         | INTEGER | DEFAULT 1                 | Boolean: can be temporarily disabled                       |
| constant        | INTEGER | DEFAULT 0                 | Boolean: always inserted (within budget)                   |
| position        | TEXT    | DEFAULT 'before_char'     | 'before_char' \| 'after_char'                              |
| insertion_order | INTEGER | DEFAULT 100               | Lower = inserted higher/earlier                            |
| priority        | INTEGER | DEFAULT 100               | Lower = discarded first when over budget                   |
| comment         | TEXT    |                           | Editor note, not used in prompts                           |
| sort_order      | INTEGER | DEFAULT 0                 | UI display order                                           |
| created_at      | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                            |
| updated_at      | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                            |

**Indexes:**

- `(actor_id)` — fetch all entries for an actor's lorebook
- `(actor_id, enabled)` — only enabled entries

### World Lore Table

The existing `worlds` table stores world metadata. Lore entries for a world
use a separate table (mirroring the actor lorebook structure).

### Table: `world_lore_entries`

Same structure as `actor_lore_entries`, but scoped to a world instead of an actor.

| Column          | Type    | Constraints               | Notes                       |
| --------------- | ------- | ------------------------- | --------------------------- |
| id              | TEXT    | PK, UUID                  |                             |
| world_id        | TEXT    | FK → worlds.id, NOT NULL  | Which world owns this entry |
| name            | TEXT    |                           |                             |
| content         | TEXT    | NOT NULL                  |                             |
| keys            | TEXT    | NOT NULL                  | JSON array                  |
| secondary_keys  | TEXT    | JSON array                |                             |
| selective       | INTEGER | DEFAULT 0                 |                             |
| case_sensitive  | INTEGER | DEFAULT 0                 |                             |
| enabled         | INTEGER | DEFAULT 1                 |                             |
| constant        | INTEGER | DEFAULT 0                 |                             |
| position        | TEXT    | DEFAULT 'before_char'     |                             |
| insertion_order | INTEGER | DEFAULT 100               |                             |
| priority        | INTEGER | DEFAULT 100               |                             |
| comment         | TEXT    |                           |                             |
| sort_order      | INTEGER | DEFAULT 0                 |                             |
| created_at      | TEXT    | DEFAULT CURRENT_TIMESTAMP |                             |
| updated_at      | TEXT    | DEFAULT CURRENT_TIMESTAMP |                             |

**Indexes:**

- `(world_id)` — fetch all entries for a world lorebook
- `(world_id, enabled)` — active entries only

### Worlds Table — Extension

Add a column to the existing `worlds` table for lorebook config:

| New Column     | Type    | Notes                                                       |
| -------------- | ------- | ----------------------------------------------------------- |
| `scan_depth`   | INTEGER | DEFAULT 100 — how many recent messages to scan for keywords |
| `token_budget` | INTEGER | DEFAULT 2000 — max tokens lore entries can consume          |

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

### Table: `actor_items`

| Column      | Type    | Constraints               | Notes                                                                                |
| ----------- | ------- | ------------------------- | ------------------------------------------------------------------------------------ |
| id          | TEXT    | PK, UUID                  |                                                                                      |
| actor_id    | TEXT    | FK → actors.id, NOT NULL  | Owner                                                                                |
| name        | TEXT    | NOT NULL                  | Item display name                                                                    |
| description | TEXT    |                           | Item description / flavour text                                                      |
| item_type   | TEXT    | NOT NULL                  | 'weapon', 'armor', 'consumable', 'key_item', 'currency', 'container', 'tool', 'misc' |
| quantity    | INTEGER | DEFAULT 1                 | Stackable count                                                                      |
| value       | TEXT    |                           | Monetary value (string for flexibility: "5 gp")                                      |
| weight      | REAL    |                           | Encumbrance units                                                                    |
| tags        | TEXT    | JSON array                | Arbitrary tags for filtering                                                         |
| metadata    | TEXT    | JSON                      | Arbitrary properties (damage, defense, charges, etc.)                                |
| equipped    | INTEGER | DEFAULT 0                 | Boolean: currently equipped/wielded                                                  |
| sort_order  | INTEGER | DEFAULT 0                 | Display order                                                                        |
| created_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                                                      |
| updated_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                                                      |

**Indexes:**

- `(actor_id)` — fetch inventory for an actor
- `(actor_id, item_type)` — filter by type
- `(actor_id, equipped)` — currently equipped items

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

## Entity Relationships (Updated)

```
Users ──1:N── Sessions
Users ──1:N── Actors (as actor_type='user')
Users ──1:N── Characters (as owner)

Actors ──1:N── ActorMemories
Actors ──1:N── ActorNotes
Actors ──1:N── ActorItems
Actors ──1:N── ActorLoreEntries    (character_book)
Actors ──1:N── Messages            (single FK)
Actors ──M:N── Chats               (via chat_participants)
Actors ──1:N── Assets              (via asset_links, e.g. portrait, voice)

Worlds ──1:N── WorldLoreEntries
Worlds ──M:N── Chats               (via asset_links with entity_type='world')
Worlds ──1:N── Actors              (via asset_links with entity_type='world')
```

---

## Migration Plan

### Migration 002: Actor Extensions

During active development, `data_version` defaults to 0 on all records.
The column exists and the contract is documented — version numbers become
meaningful when stabilised.

```sql
ALTER TABLE actors ADD COLUMN data_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE actors ADD COLUMN welcome_message TEXT;
ALTER TABLE actors ADD COLUMN personality TEXT;
ALTER TABLE actors ADD COLUMN scenario TEXT;
ALTER TABLE actors ADD COLUMN mes_example TEXT;
ALTER TABLE actors ADD COLUMN alternate_greetings TEXT;  -- JSON array (swipes)
ALTER TABLE actors ADD COLUMN post_history_instructions TEXT;
ALTER TABLE actors ADD COLUMN creator_notes TEXT;
ALTER TABLE actors ADD COLUMN creator TEXT;
ALTER TABLE actors ADD COLUMN character_version TEXT;
ALTER TABLE actors ADD COLUMN import_spec TEXT DEFAULT 'raw';

CREATE TABLE actor_memories ( ... );
CREATE TABLE actor_notes ( ... );
CREATE TABLE actor_items ( ... );
CREATE TABLE actor_lore_entries ( ... );
CREATE TABLE world_lore_entries ( ... );

ALTER TABLE worlds ADD COLUMN scan_depth INTEGER DEFAULT 100;
ALTER TABLE worlds ADD COLUMN token_budget INTEGER DEFAULT 2000;

-- All existing records remain at data_version = 0 during active development.
-- When stabilised, bump via: UPDATE actors SET data_version = 1 WHERE data_version = 0;
```

### Data Migration (Legacy Characters)

The legacy `characters` table entries get migrated to `actors` with
`actor_type='character'`:

```
characters.id          → actors.id
characters.owner_id    → actors.owner_id
characters.name        → actors.display_name
characters.description → actors.description
characters.system_prompt → actors.system_prompt
characters.agent_type  → actors.agent_type
characters.settings    → actors.settings (merged)

# No first_mes/personality/etc. in legacy table — these default to empty
```

---

## Prompt Assembly

When constructing the LLM prompt for an actor, these fields are injected in order:

```
[Actor - {{display_name}}]
─────────────────────────
Description: {{description}}
Personality: {{personality}}
Scenario: {{scenario}}

[System Prompt]
{{system_prompt}}

[Lorebook (before char)]
{{actor_lore_entries where position='before_char', activated}}
{{world_lore_entries from linked worlds, activated}}

[Example Messages]
{{mes_example}}

[Chat History]
...

[Lorebook (after char)]
{{actor_lore_entries where position='after_char', activated}}
{{world_lore_entries from linked worlds, activated, positioned after char}}

[Memories]
{{actor_memories ordered by importance DESC, within token budget}}

[Post-History Instructions]
{{post_history_instructions}}
```

The `welcome_message` is NOT injected into prompts — it's used only when
starting a new chat as the character's first message.
