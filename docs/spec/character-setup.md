# Character & Persona Setup

## Overview

This document specifies the complete character and persona system for loop-lore:
how characters are defined, imported, exported, and used — including multi-format
support (JSON, YAML, TOML, PNG-embedded), the character ↔ persona relationship,
and the impersonation feature.

Characters are **genre-agnostic**. The same system supports:

- **Fantasy** — elves, wizards, dragons, enchanted items
- **Sci-Fi** — AI entities, starship captains, alien species, cybernetic agents
- **Modern** — detectives, journalists, secret agents, everyday people
- **Historical** — knights, pharaohs, revolutionaries, Victorian scholars
- **Horror** — investigators, cultists, eldritch entities, survivors
- **Superhero** — masked vigilantes, mutants, alien heroes
- **Slice of Life** — neighbors, coworkers, family members, pets
- **Assistant/Agent** — specialized AI personas for research, coding, analysis

Design goals:

1. **Universal acceptance** — import from any major AI roleplay platform
2. **Format agnostic** — JSON, YAML, TOML, PNG-embedded; detect automatically
3. **Character ↔ Persona** — characters can be played by users (impersonation)
4. **Migration-first** — zero-friction import from SillyTavern, Character.AI, RisuAI, Chub, etc.
5. **Human-readable** — YAML/TOML for hand-authored characters; JSON for tool interop
6. **Genre-flexible** — stats, items, and lore adapt to genre via plugin bundles

---

## Concepts

### Character

A **character** is an AI-controlled entity stored as an actor with
`actor_type='character'`. Characters carry:

- Identity (name, avatar, description, nickname)
- Voice (personality, speech patterns, example dialogue)
- Context (scenario, system prompt, greeting)
- Knowledge (lorebook entries, memories, notes)
- Inventory (items, equipment)

Characters travel between chats. The same character can appear in multiple
conversations with different users or worlds.

**Genre flexibility:** Character fields are genre-agnostic. A fantasy mage's
"spellbook" is stored the same way as a sci-fi engineer's "toolkit" or a
detective's "case file" — as items in the inventory. Lorebook entries serve
equally well for "dragon lore" (fantasy), "ship schematics" (sci-fi), or
"cold case notes" (modern).

### Persona

A **persona** is a user-authored identity that the user adopts during a chat.
Personas define how the user presents themselves to the AI: name, appearance,
personality, backstory.

Personas are separate from characters — they live on the `users` table (or a
dedicated `personas` table) and are selected per-chat.

### Impersonation

**Impersonation** allows a user to play as any character — their own or
someone else's. When impersonating, the user's messages are sent as if they
were that character. The AI sees the impersonated character's identity in the
prompt context.

Use cases:

- **Self-play**: user creates a character and plays as it in a story
- **Crossover**: user temporarily assumes another character's role
- **Writing**: author voices multiple characters in a collaborative story
- **Testing**: creator playtests their character by playing the user role

---

## Character ↔ Persona Relationship

### Data Model

```
Users ──1:N── Personas (user-authored identities)
Users ──1:N── Actors (as actor_type='user')
Users ──1:N── Characters (as owner)

Personas ──M:N── Chats (which identity is active in this chat)
Characters ──M:N── Chats (via chat_participants)
```

### Persona Table

| Column       | Type    | Constraints               | Notes                            |
| ------------ | ------- | ------------------------- | -------------------------------- |
| id           | TEXT    | PK, UUID                  |                                  |
| user_id      | TEXT    | FK → users.id, NOT NULL   | Owner                            |
| name         | TEXT    | NOT NULL                  | Display name in this persona     |
| avatar_asset_id | TEXT | FK → assets.id           | Profile picture                  |
| description  | TEXT    |                           | Physical/mental traits, backstory|
| title        | TEXT    |                           | Optional title (display only)    |
| is_default   | INTEGER | DEFAULT 0                 | Boolean: auto-selected for new chats |
| created_at   | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                  |
| updated_at   | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                  |

**Index**: `(user_id)` for user's persona list, `(user_id, is_default)` for default lookup.

### Chat ↔ Persona Binding

When a chat is created, the user selects which persona to use. The chat stores
the active persona:

| Chat Column     | Type   | Constraints            | Notes                        |
| --------------- | ------ | ---------------------- | ---------------------------- |
| persona_id      | TEXT   | FK → personas.id       | Active user persona          |
| impersonate_id  | TEXT   | FK → actors.id         | Character being impersonated |

**Impersonation flow:**

1. User selects "Impersonate" on a character
2. `chat.impersonate_id` is set to that character's actor ID
3. In prompt assembly, the impersonated character's fields replace the user's
   identity fields
4. Messages from the user are attributed to `chat.impersonate_id` in the
   prompt (but stored with the user's `actor_id` for permissions)
5. The UI shows the impersonated character's avatar and name for user messages

**Impersonation vs Persona lock:**

| Feature          | Persona                     | Impersonation                    |
| ---------------- | --------------------------- | -------------------------------- |
| What it does     | Sets user's identity        | User plays as a character        |
| Stored in        | `chat.persona_id`           | `chat.impersonate_id`            |
| Prompt injection | User's persona fields       | Character's fields in user slot  |
| Message author   | User's actor_id             | User's actor_id (permissions)    |
| UI display       | Persona name/avatar         | Character name/avatar            |
| Can be changed   | Anytime (affects future msgs) | Anytime (affects future msgs)  |

### Macro System

Macros resolve differently depending on context:

| Macro        | In Character Card         | In Persona                  | Meaning                    |
| ------------ | ------------------------- | --------------------------- | -------------------------- |
| `{{char}}`   | Character's display_name  | Chat partner's display_name | The "other" participant    |
| `{{user}}`   | User's display_name       | This persona's display_name | The "self" participant     |
| `<BOT>`      | Same as `{{char}}`        | Same as `{{char}}`          | Alias                      |
| `<USER>`     | Same as `{{user}}`        | Same as `{{user}}`          | Alias                      |

When impersonating, `{{user}}` resolves to the impersonated character's name
in the prompt context, giving the AI the correct identity frame.

---

## Multi-Format Support

### Supported Formats

loop-lore accepts character definitions in five formats:

| Format        | Extension(s)       | Detection                        | Use Case                      |
| ------------- | ------------------ | -------------------------------- | ----------------------------- |
| JSON          | `.json`            | Content starts with `{`          | Tool interop, API import      |
| YAML          | `.yaml`, `.yml`    | Content doesn't start with `{`   | Hand-authored, readable       |
| TOML          | `.toml`            | Key=value with `[sections]`      | Config-style character defs   |
| PNG-embedded  | `.png`             | Magic bytes `‰PNG`               | SillyTavern cards, sharing    |
| CHARX (ZIP)   | `.charx`           | Magic bytes `PK`                 | V3 bundles with assets        |

**Auto-detection algorithm:**

```
1. Read first 4 bytes
2. If matches PNG magic (‰PNG): parse tEXt chunks → base64 decode → JSON
   - Check for 'ccv3' chunk first (V3), fall back to 'chara' (V2)
3. If matches ZIP magic (PK): extract card.json from archive
4. Try JSON.parse(content)
   - If succeeds: treat as JSON
5. Try TOML parse (smol-toml)
   - If succeeds with [sections]: treat as TOML
6. Try YAML parse (js-yaml)
   - If succeeds: treat as YAML
7. If all fail: return error with format hint
```

### Canonical Internal Format

All imported formats normalize to a single internal representation before
storage. This is the **Canonical Character Card** — a superset of CCv2/V3:

```typescript
interface CanonicalCharacterCard {
  // Identity
  name: string;
  avatar?: AssetRef;           // PNG/image reference

  // Prompt fields
  description: string;         // Full character description/backstory
  personality: string;         // Short personality summary
  scenario: string;            // RP setting/context
  system_prompt: string;       // System prompt override
  post_history_instructions: string;  // UJB/jailbreak equivalent
  welcome_message: string;     // First message (first_mes)
  mes_example: string;         // Example dialogue

  // Alternate content
  alternate_greetings: string[];  // Swipe options for first message
  group_only_greetings: string[]; // Greetings for group chats (V3)

  // Metadata
  tags: string[];
  creator: string;
  creator_notes: string;
  character_version: string;
  nickname?: string;           // {{char}} alias (V3)

  // Assets
  assets?: CharacterAsset[];   // V3 structured assets

  // Lorebook
  character_book?: CharacterBook;

  // Extensions (platform-specific data preserved)
  extensions?: Record<string, unknown>;

  // Import provenance
  import_spec: 'chara_card_v1' | 'chara_card_v2' | 'chara_card_v3'
            | 'character_ai' | 'raw_json' | 'raw_yaml' | 'raw_toml';
  import_spec_version?: string;
}
```

---

### Format: Character Card V1 (SillyTavern)

The oldest format. Flat JSON:

```json
{
  "name": "Lyra",
  "description": "A mysterious elf sorceress...",
  "personality": "Wise, patient, slightly aloof",
  "scenario": "Fantasy world, ancient ruins",
  "first_mes": "Hello there, traveler.",
  "mes_example": "<START>\n{{user}}: Who are you?\n{{char}}: I am Lyra..."
}
```

**Field mapping:**

| V1 Field      | Canonical Field       |
| ------------- | --------------------- |
| `name`        | `name`                |
| `description` | `description`         |
| `personality` | `personality`         |
| `scenario`    | `scenario`            |
| `first_mes`   | `welcome_message`     |
| `mes_example` | `mes_example`         |

---

### Format: Character Card V2 (SillyTavern / Chub / SpicyChat)

Wrapped in `{ spec, spec_version, data }` envelope:

```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "Lyra",
    "description": "A mysterious elf sorceress...",
    "personality": "Wise, patient, slightly aloof",
    "scenario": "Fantasy world, ancient ruins",
    "first_mes": "Hello there, traveler.",
    "mes_example": "<START>\n{{user}}: Who are you?\n{{char}}: I am Lyra...",
    "system_prompt": "You are Lyra...",
    "post_history_instructions": "Always respond in character.",
    "alternate_greetings": ["Greetings, traveler.", "Well met!"],
    "tags": ["fantasy", "elf", "sorceress"],
    "creator": "SomeAuthor",
    "creator_notes": "My first character!",
    "character_version": "1.3",
    "character_book": { ... },
    "extensions": {}
  }
}
```

**Field mapping:** All V2 fields map directly to canonical fields (see
`docs/actors.md` V2 Spec Field Mapping table for complete mapping).

---

### Format: Character Card V3 (RisuAI)

Superset of V2 with assets and multilingual support:

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "data": {
    "...all V2 fields...",
    "nickname": "Lyra",
    "assets": [
      { "type": "icon", "uri": "embeded://assets/icon.png", "name": "main", "ext": "png" },
      { "type": "background", "uri": "https://example.com/bg.jpg", "name": "forest", "ext": "jpg" }
    ],
    "creator_notes_multilingual": { "en": "...", "ja": "..." },
    "source": ["https://chub.ai/characters/..."],
    "group_only_greetings": ["Party time!"],
    "creation_date": 1700000000,
    "modification_date": 1700100000
  }
}
```

**V3 lorebook additions:**

- `entries[].use_regex: boolean` — regex trigger keys
- Decorator system in `content` field (`@@depth N`, `@@role "system"`, etc.)

---

### Format: Character.AI Export

Character.AI exports as JSON with a different structure:

```json
{
  "name": "Lyra",
  "title": "Lyra the Sorceress",
  "description": "...",
  "greeting": "Hello there!",
  "definition": "{{char}}=description={Name:\"Lyra\", Gender:\"Female\"}\n...",
  "examples_of_dialogue": "<START>\n...",
  "tags": ["fantasy"],
  "visibility": "private"
}
```

**Field mapping:**

| Character.AI Field          | Canonical Field               |
| --------------------------- | ----------------------------- |
| `name`                      | `name`                        |
| `description`               | `description`                 |
| `greeting`                  | `welcome_message`             |
| `definition`                | `description` (appended)      |
| `examples_of_dialogue`      | `mes_example`                 |
| `tags`                      | `tags`                        |
| `visibility`                | `settings.visibility`         |

The `definition` field uses Character.AI's nested macro syntax
(`{{char}}=description={...}`). This is parsed and merged into `description`.

---

### Format: YAML

loop-lore supports YAML as a human-readable alternative. No official community
standard exists — this is a loop-lore native format designed for readability.

```yaml
# Character: Lyra
name: Lyra
description: |
  A mysterious elf sorceress who has lived for over three centuries.
  She speaks in measured tones and rarely shows emotion, but her
  eyes betray deep wisdom and hidden sorrow.
personality: Wise, patient, slightly aloof. Speaks in measured tones.
scenario: Fantasy world, exploring ancient ruins together.
system_prompt: |
  You are Lyra, an elf sorceress. Stay in character at all times.
  Use fantasy-appropriate language. Never break the fourth wall.
welcome_message: |
  *The elf woman looks up from the ancient tome, her silver eyes
  catching the torchlight.*
  
  "Ah... a visitor. It has been some time since anyone found their
  way to these ruins."
mes_example: |
  <START>
  {{user}}: Who are you?
  {{char}}: *She closes the book carefully* I am Lyra. And you are
  either very brave or very lost to be wandering these halls.
  
  <START>
  {{user}}: Can you teach me magic?
  {{char}}: *A faint smile crosses her lips* Magic is not taught.
  It is earned. Through years of study, failure, and persistence.
  But... I suppose I could start with the basics.
alternate_greetings:
  - "Greetings, traveler. These ruins hold many secrets."
  - "Well met! I didn't expect company down here."
post_history_instructions: Always respond in character. Never break the fourth wall.
tags:
  - fantasy
  - elf
  - sorceress
  - mentor
creator: SomeAuthor
creator_notes: My first character! Feedback welcome.
character_version: "1.3"
```

**YAML → Canonical mapping:** Keys match canonical field names directly. YAML
sequences map to arrays. Block scalars (`|`, `>`) map to multi-line strings.

**Advantages of YAML:**

- Readable in any text editor
- Diffable in version control
- No JSON escaping needed for long text
- Comments supported (`#`)
- Natural for hand-authoring

---

### Format: TOML

TOML support for config-style character definitions. Useful for characters
defined alongside application configuration.

```toml
# Character: Lyra
[character]
name = "Lyra"
description = """
A mysterious elf sorceress who has lived for over three centuries.
She speaks in measured tones and rarely shows emotion.
"""
personality = "Wise, patient, slightly aloof"
scenario = "Fantasy world, exploring ancient ruins together"
welcome_message = """
The elf woman looks up from the ancient tome.
"Ah... a visitor. It has been some time."
"""

[character.metadata]
tags = ["fantasy", "elf", "sorceress"]
creator = "SomeAuthor"
character_version = "1.3"
creator_notes = "My first character!"

[character.prompts]
system_prompt = "You are Lyra, an elf sorceress."
post_history_instructions = "Always respond in character."

[character.greetings]
alternate = [
  "Greetings, traveler. These ruins hold many secrets.",
  "Well met! I didn't expect company down here."
]
```

**TOML → Canonical mapping:** `[character]` section fields map directly.
`[character.metadata]`, `[character.prompts]`, `[character.greetings]`
are subsections that map to the appropriate canonical fields.

**Advantages of TOML:**

- Familiar to developers (Cargo.toml, pyproject.toml)
- Strong typing (strings, integers, floats, booleans, arrays, tables)
- No ambiguity in nested structures
- Good for programmatic generation

---

### Format: PNG-Embedded Cards

Character data embedded in PNG tEXt metadata chunks. Used by SillyTavern
and the broader character sharing community.

**PNG chunk keywords:**

| Spec   | Chunk Keyword | Encoding                      |
| ------ | ------------- | ----------------------------- |
| V1     | `Chara`       | `base64(JSON)`                |
| V2     | `chara`       | `base64(UTF-8(JSON))`         |
| V3     | `ccv3`        | `base64(UTF-8(JSON))`         |

**Reading order:** Check for `ccv3` first (V3), fall back to `chara` (V2),
then `Chara` (V1). Decode base64 → parse JSON → normalize to canonical.

**Writing:** Always write both `chara` (V2) and `ccv3` (V3) chunks for
maximum compatibility.

---

### Format: CHARX (ZIP Bundle)

V3 native format. ZIP archive containing:

```
character.zip (renamed to .charx)
├── card.json              # V3 character card JSON
└── assets/
    ├── icon/
    │   └── images/
    │       └── main.png
    ├── background/
    │   └── images/
    │       └── forest.jpg
    └── audio/
        └── bgm/
            └── theme.mp3
```

Assets referenced in `card.json` use the `embeded://` URI scheme:

```json
{
  "assets": [
    { "type": "icon", "uri": "embeded://assets/icon/images/main.png", "name": "main", "ext": "png" }
  ]
}
```

On import, assets are extracted, uploaded to the asset system, and linked
via `asset_links` with `entity_type='character'`.

---

## Import Pipeline

### Detection & Parsing Flow

```
File uploaded / pasted / URL fetched
  │
  ├─ Magic bytes: PNG? → parse tEXt → base64 decode → JSON → normalize
  ├─ Magic bytes: ZIP/PK? → extract card.json → parse → normalize
  │
  ├─ JSON.parse() succeeds?
  │   ├─ Has `spec: "chara_card_v2"` → V2 normalizer
  │   ├─ Has `spec: "chara_card_v3"` → V3 normalizer
  │   ├─ Has Character.AI fields (`definition`, `greeting`) → CAI normalizer
  │   └─ Otherwise → flat JSON normalizer (assume V1-like)
  │
  ├─ TOML parse succeeds?
  │   └─ TOML normalizer (key=value sections → canonical)
  │
  └─ YAML parse succeeds?
      └─ YAML normalizer (keys match canonical directly)
```

### Normalizer Interface

```typescript
interface FormatNormalizer {
  /** Detect if this parser can handle the input */
  canParse(input: string | Buffer): boolean;
  
  /** Parse and normalize to canonical format */
  parse(input: string | Buffer): CanonicalCharacterCard;
  
  /** Format name for import_spec tracking */
  formatName: string;
}

// Registered normalizers (order matters for auto-detection)
const normalizers: FormatNormalizer[] = [
  new PngCardNormalizer(),     // PNG-embedded
  new CharxNormalizer(),       // ZIP/CHARX
  new CharaCardV3Normalizer(), // CCv3 JSON
  new CharaCardV2Normalizer(), // CCv2 JSON
  new CharacterAiNormalizer(), // Character.AI
  new TomlNormalizer(),        // TOML
  new YamlNormalizer(),        // YAML
  new RawJsonNormalizer(),     // Fallback JSON
];
```

### Error Handling

Import errors produce structured feedback:

```typescript
interface ImportError {
  format: string;           // Detected format name
  field?: string;           // Field that failed validation
  message: string;          // Human-readable error
  suggestion?: string;      // Fix suggestion
  line?: number;            // For YAML/TOML parse errors
}
```

Example errors:

- `"YAML parse error at line 15: unexpected tab character"` → use spaces
- `"Missing required field 'name'"` → add name to your file
- `"V2 card missing 'spec' field"` → wrap data in `{ spec, spec_version, data }`
- `"PNG contains no character data chunks"` → file may be a regular image

---

## Export Pipeline

### Export Format Selection

| Target               | Format             | Notes                              |
| -------------------- | ------------------ | ---------------------------------- |
| SillyTavern import   | PNG with V2+V3    | Maximum compatibility              |
| Chub.ai upload       | PNG with V2+V3    | Same as SillyTavern                |
| Download (default)   | PNG with V2+V3    | Best for sharing                   |
| Download (JSON)      | JSON (V2)         | For tools that parse JSON          |
| Download (YAML)      | YAML              | For hand-editing                   |
| Download (TOML)      | TOML              | For config-style workflows         |
| API response         | JSON (V2)         | Standardized API format            |

### Export Process

1. Read actor record + all extension tables (lore, memories, notes, items)
2. Map canonical fields to target format
3. Collect `actor_lore_entries` → `data.character_book.entries`
4. Collect linked assets → `data.assets` (V3) or embed in PNG
5. If PNG: embed JSON as base64 in tEXt chunks (write both `chara` + `ccv3`)
6. If CHARX: create ZIP with card.json + extracted asset files
7. If YAML/TOML: serialize canonical fields with human-readable formatting

### V2 → V3 Auto-Upgrade on Export

When exporting, loop-lore always produces V3 (with V2 fallback chunk):

- V2 fields → nested under `data`
- V3 additions: `nickname` (from `settings.nickname`), `assets` (from
  `asset_links`), `creation_date`/`modification_date` (from `created_at`/`updated_at`)
- Both `chara` and `ccv3` tEXt chunks written to PNG

---

## Character Creation Paths

### Path 1: Import from File

Upload a character file (JSON/YAML/TOML/PNG/CHARX). Auto-detected, parsed,
and stored. User can review and edit before saving.

### Path 2: Import from URL

Fetch a character from a URL. Supports:

- Direct file URLs (`.json`, `.yaml`, `.toml`, `.png`)
- Chub.ai character pages (scrape character data)
- SillyTavern character URLs

### Path 3: Create from Scratch (Web UI)

Fill in the character creation form (`/characters/new`). Fields map directly
to canonical character card fields. See `docs/frontend/characters.md`.

### Path 4: Create from Template (YAML/TOML)

Write a YAML or TOML file manually. Use the template below as a starting point.
Upload via the web UI or place in the characters directory.

### Path 5: Clone from Existing

Duplicate an existing character as a starting point. The clone gets a new ID
and the user can modify freely.

### Path 6: Convert from Persona

Convert a persona into a character (SillyTavern-style "Convert to Persona"
in reverse). Copies name + description, creates a new character actor.

---

## Template Files

### YAML Template

```yaml
# Character Card — loop-lore YAML format
# Upload this file or paste into the character editor.
# Fields marked [optional] can be omitted.

name: ""                              # Required: character display name
description: ""                       # Required: full character description/backstory
personality: ""                       # [optional] short personality summary
scenario: ""                          # [optional] RP setting/context
system_prompt: ""                     # [optional] system prompt override
welcome_message: ""                   # [optional] first message to user
mes_example: ""                       # [optional] example dialogue
post_history_instructions: ""         # [optional] instructions after chat history

# [optional] alternate welcome messages (swipes)
alternate_greetings: []
#  - "Alternative greeting 1"
#  - "Alternative greeting 2"

# [optional] metadata
tags: []
creator: ""
creator_notes: ""
character_version: "1.0"
```

### TOML Template

```toml
# Character Card — loop-lore TOML format
# Upload this file or paste into the character editor.

[character]
name = ""               # Required
description = ""        # Required
personality = ""        # Optional
scenario = ""           # Optional
welcome_message = ""    # Optional
mes_example = ""        # Optional

[character.prompts]
system_prompt = ""
post_history_instructions = ""

[character.metadata]
tags = []
creator = ""
creator_notes = ""
character_version = "1.0"

# [optional] alternate greetings
# alternate_greetings = [
#   "Alternative greeting 1",
#   "Alternative greeting 2"
# ]
```

---

## Migration Guides

### From SillyTavern

1. Export character as PNG or JSON from SillyTavern
2. In loop-lore: `/characters` → "Import" → select file
3. Auto-detected as V1/V2/V3 → normalized → stored
4. Lorebook entries imported into `actor_lore_entries`
5. Avatar uploaded as asset, linked via `asset_links`
6. Review: all fields preserved, editable in the character form

**Bulk import:** Place multiple PNG/JSON files in a directory. Use the CLI
or API to batch-import:

```bash
loop-lore import --format sillytavern ./my-characters/
```

### From Character.AI

1. Export character data (JSON or text format)
2. In loop-lore: "Import" → select file or paste JSON
3. Auto-detected as Character.AI format → normalized
4. `definition` field merged into `description`
5. Review and adjust: Character.AI's macro syntax is converted to loop-lore macros

### From RisuAI

1. Export as V3 JSON or CHARX
2. In loop-lore: "Import" → select file
3. V3 fields fully supported, including assets and multilingual notes
4. CHARX bundles: assets extracted and uploaded automatically

### From Chub.ai

1. Download character as PNG or JSON
2. Import as above (Chub uses standard CCv2 format)
3. No conversion needed — direct field mapping

### From YAML/TOML (Hand-authored)

1. Write character definition using template (see above)
2. Upload via web UI or API
3. No conversion needed — keys match canonical fields directly

---

## Prompt Assembly with Personas

When constructing the LLM prompt, persona and impersonation affect how
identity fields are injected:

### Standard Chat (No Impersonation)

```
[System]
You are {{char}}. {{system_prompt}}

[Character Card — {{char}}]
Description: {{character.description}}
Personality: {{character.personality}}
Scenario: {{character.scenario}}

[User Persona — {{user}}]
Description: {{persona.description}}

[Chat History]
{{user}}: ...
{{char}}: ...

[Post-History Instructions]
{{post_history_instructions}}
```

### Impersonation Chat

```
[System]
You are {{char}}. {{system_prompt}}

[Character Card — {{char}}]
Description: {{character.description}}
Personality: {{character.personality}}
Scenario: {{character.scenario}}

[User Persona — {{user}}]
Name: {{impersonated_character.display_name}}
Description: {{impersonated_character.description}}
Personality: {{impersonated_character.personality}}

[Chat History]
{{impersonated_character}}: ...    ← user messages shown as character
{{char}}: ...

[Post-History Instructions]
{{post_history_instructions}}
```

The AI sees the impersonated character as the "user" identity, enabling
in-character responses from both sides.

---

## API Endpoints

### Characters

| Method | Endpoint                     | Description                          |
| ------ | ---------------------------- | ------------------------------------ |
| GET    | `/api/characters`            | List user's characters               |
| POST   | `/api/characters`            | Create character (JSON body)         |
| GET    | `/api/characters/:id`        | Get character details                |
| PUT    | `/api/characters/:id`        | Update character                     |
| DELETE | `/api/characters/:id`        | Delete character                     |
| POST   | `/api/characters/import`     | Import from file (multipart upload)  |
| POST   | `/api/characters/import/url` | Import from URL (JSON body: {url})   |
| GET    | `/api/characters/:id/export` | Export as file (query: format=png\|json\|yaml\|toml) |

### Personas

| Method | Endpoint                  | Description                    |
| ------ | ------------------------- | ------------------------------ |
| GET    | `/api/personas`           | List user's personas           |
| POST   | `/api/personas`           | Create persona                 |
| PUT    | `/api/personas/:id`       | Update persona                 |
| DELETE | `/api/personas/:id`       | Delete persona                 |
| POST   | `/api/personas/:id/convert-to-character` | Convert persona to character |

### Chat Impersonation

| Method | Endpoint                          | Description                  |
| ------ | --------------------------------- | ---------------------------- |
| PUT    | `/api/chats/:id/persona`          | Set active persona           |
| PUT    | `/api/chats/:id/impersonate`      | Set impersonated character   |
| DELETE | `/api/chats/:id/impersonate`      | Stop impersonating           |

---

## Implementation Notes

### New Files Required

| File                          | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `src/characters/parser.ts`    | Auto-detection + format dispatch           |
| `src/characters/normalizers/` | One file per format (png, charx, v2, v3, cai, yaml, toml) |
| `src/characters/exporter.ts`  | Canonical → target format conversion       |
| `src/characters/template.ts`  | YAML/TOML template generation              |
| `src/personas/service.ts`     | Persona CRUD                              |
| `src/personas/controller.ts`  | Persona HTTP handlers                     |
| `src/routes/personas.ts`      | Persona route definitions                 |
| `src/routes/characters.ts`    | Character import/export routes             |

### Dependencies

Already in `package.json`:

- `js-yaml` — YAML parsing (used by config system)
- `smol-toml` — TOML parsing (used by config system)

New dependencies:

- None required — PNG metadata parsing and ZIP extraction are native Node.js/Bun APIs

### Testing Strategy

| Test File                            | Coverage                                    |
| ------------------------------------ | ------------------------------------------- |
| `src/characters/parser.test.ts`      | Auto-detection for all formats              |
| `src/characters/normalizers/*.test.ts`| Each format's normalization logic          |
| `src/characters/exporter.test.ts`    | Round-trip: canonical → format → canonical  |
| `src/personas/service.test.ts`       | Persona CRUD + default logic               |
| `src/characters/integration.test.ts` | Full import → store → export pipeline      |

---

## RPG Mechanics and Stats (Genre-Flexible)

Stats are **optional and genre-defined**. A character in a fantasy world might
use STR/DEX/INT/CON/WIS/CHA; a sci-fi character might use
TECH/PILOT/COMBAT/CHARISMA/LOGIC; a slice-of-life character might use
SOCIAL/WORK/HEALTH/CREATIVITY. The stat system adapts via plugin bundles
(see `docs/spec/rpg-mechanics.md` → Plugin Bundle Presets).

### Default Stat Block (D&D-style)

The default stat template follows the six-attribute model, but this is one
**bundle choice** among many:

| Field          | RPG Role (Fantasy)         | Sci-Fi Role                | Modern Role                |
| -------------- | -------------------------- | -------------------------- | -------------------------- |
| `strength`     | Melee damage, carry weight  | Melee, cybernetic force    | Physical labor, combat     |
| `dexterity`    | Evasion, ranged attacks     | Piloting, hacking speed    | Driving, athletics         |
| `intelligence` | Arcane power, knowledge     | Tech/computer skills       | Investigation, logic       |
| `charisma`     | Persuasion, leadership      | Negotiation, command       | Social, networking         |
| `hp`           | Hit points                  | Hull integrity             | Health/stamina             |
| `mp`           | Magic points                | Energy/battery             | Focus/stress               |

### Custom Stat System (Bundle-Defined)

When a plugin bundle is active, it defines its own stat block:

```typescript
interface StatBlock {
  [statName: string]: number;  // Fully flexible keys
}

// Example: Dungeons & Dragons bundle
// { str: 14, dex: 12, con: 15, int: 10, wis: 13, cha: 8 }

// Example: Cyberpunk bundle
// { cool: 12, tech: 15, reflexes: 14, luck: 7, body: 11, emp: 9 }

// Example: Slice-of-Life bundle
// { social: 14, work: 12, health: 10, creativity: 15, finance: 8 }
```

### Assistant-Generated Stat Drafts

The assistant can propose a stat block using the active bundle's template:

```json
// D&D bundle draft
{ "strength": 12, "dexterity": 14, "intelligence": 10, "charisma": 8,
  "hp": 80, "mp": 40, "skill_points": 5 }

// Cyberpunk bundle draft
{ "cool": 10, "tech": 14, "reflexes": 12, "luck": 8, "body": 11, "emp": 9 }

// Sci-Fi bundle draft
{ "combat": 13, "pilot": 15, "tech": 10, "charisma": 9, "hull": 60, "energy": 35 }
```

User may accept, edit, or reject. Assistant explains how stats map to
the chosen genre's mechanics.

### Dynamic Stat Updates

During a session, stats may change due to:

- **Level-up** — increase primary stats, gain points
- **Equipment** — modify stats temporarily (weapon bonuses, armor penalties)
- **Status effects** — alter stats per effect duration (poisoned -2 STR, EMP -4 INT)
- **World rules** — location-specific modifiers (no-gravity zone, toxic atmosphere)

All changes are recorded in the character's `stats` extension and persisted
to the DB. Effective stats are computed at use time (base + equipment + effects).

### Genre-Agnostic Character Fields

The following character fields work across all genres without modification:

| Field | Fantasy Use | Sci-Fi Use | Modern Use |
| ----- | ----------- | ---------- | ---------- |
| `description` | Elven sorceress backstory | AI consciousness origin | Detective's case files |
| `personality` | Wise, aloof | Analytical, curious | Cynical, sharp |
| `scenario` | Ancient ruins exploration | Space station investigation | Crime scene investigation |
| `mes_example` | Fantasy dialogue | Sci-fi bridge comms | Interrogation transcripts |
| `alternate_greetings` | "Greetings, traveler" | "Identify yourself" | "You're late" |
| `system_prompt` | Fantasy RP behavior | Sci-fi RP behavior | Modern RP behavior |
| `tags` | `fantasy, elf, mage` | `sci-fi, android, pilot` | `modern, detective, noir` |

## Reference

### External Specifications

| Spec | URL | Notes |
| ---- | --- | ----- |
| CCv2 | github.com/malfoyslastname/character-card-spec-v2 | Community standard |
| CCv3 | github.com/kwaroran/character-card-spec-v3 | V3 with assets |
| Unified Spec | github.com/BasedInn/Unified-CharacterCard-Specification | Consolidated reference |

### Related Documents

| Document | Covers |
| -------- | ------ |
| `docs/actors.md` | Actor data model, import field mapping, lorebooks |
| `docs/schema.md` | Database schema, all tables |
| `docs/frontend/characters.md` | Character list and edit UI |
| `docs/frontend/chat/overview.md` | Chat types, data model |
| `docs/memory-system.md` | Memory lifecycle, three-tier system |
| `docs/assets.md` | Asset upload and linking pipeline |
| `docs/spec/rpg-mechanics.md` | RPG stat system, rules, plugin bundles |
| `docs/spec/plugin-system.md` | Plugin architecture, tool definitions |
