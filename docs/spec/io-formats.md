# IO Formats — Import/Export Specifications

**Epic 14: Import/Export & Data Portability**

This document defines all supported IO formats for character cards, chat histories, and bulk data operations in loop-lore.

---

## 1. Character Card Formats

### 1.1 Character Card V2 (CCv2) — SillyTavern/Chub Standard

**Source**: [character-card-spec-v2](https://github.com/malfoyslastname/character-card-spec-v2)

The most widely supported format across AI chat platforms.

```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "Lyra",
    "description": "A mysterious elf sorceress...",
    "personality": "Wise, patient, slightly aloof",
    "scenario": "Fantasy world, exploring ancient ruins together",
    "first_mes": "*The elf woman looks up from the ancient tome...*",
    "mes_example": "<START>\n{{user}}: Who are you?\n{{char}}: I am Lyra.",
    "system_prompt": "You are Lyra, an elf sorceress.",
    "post_history_instructions": "Always respond in character.",
    "alternate_greetings": ["Greetings, traveler."],
    "tags": ["fantasy", "elf", "sorceress"],
    "creator": "SomeAuthor",
    "character_version": "1.3",
    "extensions": {
      "risu": {
        "expressions": {
          "happy": "https://example.com/happy.png",
          "sad": "https://example.com/sad.png"
        }
      }
    },
    "character_book": {
      "name": "Lyra's World",
      "description": "World lore for Lyra's setting",
      "scan_depth": 50,
      "token_budget": 500,
      "recursive_scanning": true,
      "extensions": {},
      "entries": [
        {
          "keys": ["ruins", "temple", "ancient"],
          "content": "The ruins are remnants of an elven civilization.",
          "extensions": {},
          "enabled": true,
          "insertion_order": 0,
          "case_sensitive": false,
          "name": "Ruins Lore",
          "priority": 10,
          "id": 0,
          "comment": "Basic ruins description",
          "selective": false,
          "constant": false,
          "position": "before_char"
        }
      ]
    }
  }
}
```

**Field Mapping to Canonical:**

| CCv2 Field                       | Canonical Field             | Notes                  |
| -------------------------------- | --------------------------- | ---------------------- |
| `data.name`                      | `name`                      |                        |
| `data.description`               | `description`               |                        |
| `data.personality`               | `personality`               |                        |
| `data.scenario`                  | `scenario`                  |                        |
| `data.first_mes`                 | `welcome_message`           | Renamed for clarity    |
| `data.mes_example`               | `mes_example`               |                        |
| `data.system_prompt`             | `system_prompt`             |                        |
| `data.post_history_instructions` | `post_history_instructions` |                        |
| `data.alternate_greetings`       | `alternate_greetings`       | Array of strings       |
| `data.tags`                      | `tags`                      | Array of strings       |
| `data.creator`                   | `creator`                   |                        |
| `data.character_version`         | `character_version`         |                        |
| `data.character_book`            | `lorebook`                  | Renamed for clarity    |
| `data.extensions`                | `extensions`                | Platform-specific data |

---

### 1.2 Character Card V3 (CCv3) — RisuAI Standard

**Source**: [character-card-spec-v3](https://github.com/kwaroran/character-card-spec-v3)

Extends V2 with assets, multilingual support, and enhanced lorebooks.

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "data": {
    "name": "Lyra",
    "description": "A mysterious elf sorceress...",
    "personality": "Wise, patient, slightly aloof",
    "scenario": "Fantasy world, exploring ancient ruins together",
    "first_mes": "*The elf woman looks up from the ancient tome...*",
    "mes_example": "<START>\n{{user}}: Who are you?\n{{char}}: I am Lyra.",
    "system_prompt": "You are Lyra, an elf sorceress.",
    "post_history_instructions": "Always respond in character.",
    "alternate_greetings": ["Greetings, traveler."],
    "tags": ["fantasy", "elf", "sorceress"],
    "creator": "SomeAuthor",
    "character_version": "1.3",
    "nickname": "Lyra the Wise",
    "assets": [
      {
        "type": "icon",
        "name": "main",
        "uri": "embeded://assets/icon/images/main.png",
        "ext": "png"
      },
      {
        "type": "background",
        "name": "forest",
        "uri": "embeded://assets/background/images/forest.jpg",
        "ext": "jpg"
      }
    ],
    "creation_date": 1690000000000,
    "modification_date": 1690000000000,
    "character_book": {
      "name": "Lyra's World",
      "description": "World lore for Lyra's setting",
      "scan_depth": 50,
      "token_budget": 500,
      "recursive_scanning": true,
      "extensions": {},
      "entries": [
        {
          "keys": ["ruins", "temple", "ancient"],
          "content": "The ruins are remnants of an elven civilization.",
          "extensions": {},
          "enabled": true,
          "insertion_order": 0,
          "case_sensitive": false,
          "name": "Ruins Lore",
          "priority": 10,
          "id": 0,
          "comment": "Basic ruins description",
          "selective": false,
          "constant": false,
          "position": "before_char",
          "use_regex": false
        }
      ]
    }
  }
}
```

**V3 Additions over V2:**

| Field                                | Type    | Description                               |
| ------------------------------------ | ------- | ----------------------------------------- |
| `nickname`                           | string  | Alternative display name                  |
| `assets`                             | array   | Embedded assets (images, audio)           |
| `creation_date`                      | number  | Unix timestamp (ms)                       |
| `modification_date`                  | number  | Unix timestamp (ms)                       |
| `character_book.entries[].use_regex` | boolean | Regex trigger keys                        |
| Decorator system                     | -       | `@@depth N`, `@@role "system"` in content |

---

### 1.3 Character.AI Export Format

Character.AI exports use a different structure:

```json
{
  "name": "Lyra",
  "description": "A mysterious elf sorceress...",
  "greeting": "*The elf woman looks up from the ancient tome...*",
  "definition": "{{char}}=description={A mysterious elf sorceress...}",
  "examples_of_dialogue": "<START>\n{{user}}: Who are you?\n{{char}}: I am Lyra.",
  "tags": ["fantasy", "elf"],
  "visibility": "public"
}
```

**Field Mapping:**

| Character.AI Field     | Canonical Field   | Notes                               |
| ---------------------- | ----------------- | ----------------------------------- |
| `name`                 | `name`            |                                     |
| `description`          | `description`     |                                     |
| `greeting`             | `welcome_message` |                                     |
| `definition`           | `description`     | Append to description, parse macros |
| `examples_of_dialogue` | `mes_example`     |                                     |
| `tags`                 | `tags`            |                                     |

**Macro Parsing:** Character.AI uses `{{char}}` and `{{user}}` macros in `definition` field. These are preserved as-is in canonical format.

---

### 1.4 PNG-Embedded Cards (SillyTavern)

Character data embedded in PNG tEXt metadata chunks.

**PNG Chunk Keywords:**

| Spec | Chunk Keyword | Encoding              |
| ---- | ------------- | --------------------- |
| V1   | `Chara`       | `base64(JSON)`        |
| V2   | `chara`       | `base64(UTF-8(JSON))` |
| V3   | `ccv3`        | `base64(UTF-8(JSON))` |

**Reading Algorithm:**

```
1. Read PNG file
2. Parse tEXt chunks
3. Check for 'ccv3' chunk first (V3)
4. Fall back to 'chara' chunk (V2)
5. Fall back to 'Chara' chunk (V1)
6. Base64 decode → JSON parse → normalize to canonical
```

**Writing Algorithm:**

```
1. Start with canonical character data
2. Convert to V2 format for 'chara' chunk
3. Convert to V3 format for 'ccv3' chunk
4. Base64 encode both
5. Write tEXt chunks to PNG
6. Preserve original image data
```

**Compatibility:** Always write both `chara` (V2) and `ccv3` (V3) chunks for maximum compatibility with SillyTavern, RisuAI, and other frontends.

---

### 1.5 CHARX Format (ZIP Bundle)

V3 native format. A `.charx` file is a ZIP archive:

```
character.charx
├── card.json           # V3 character card JSON
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

**Structure:**

| Path                                | Content           | Notes    |
| ----------------------------------- | ----------------- | -------- |
| `card.json`                         | V3 character card | Required |
| `assets/`                           | Embedded assets   | Optional |
| `assets/<type>/images/<name>.<ext>` | Image assets      |          |
| `assets/<type>/audio/<name>.<ext>`  | Audio assets      |          |

**Asset References in card.json:**

```json
{
  "assets": [
    {
      "type": "icon",
      "name": "main",
      "uri": "embeded://assets/icon/images/main.png",
      "ext": "png"
    }
  ]
}
```

**Import Process:**

1. Extract `card.json` from ZIP
2. Parse JSON → normalize to canonical
3. Extract all assets from `assets/` directory
4. Upload each asset to asset system
5. Link assets to character via `asset_links`
6. Store character with `asset_links` references

**Export Process:**

1. Export canonical character to V3 JSON
2. Fetch all linked assets from asset system
3. Create ZIP archive with `card.json` + `assets/` structure
4. Set `uri` references in card to `embeded://` scheme
5. Return `.charx` file

---

### 1.6 YAML Format (Loop-lore Native)

Human-readable format for hand-authoring characters.

```yaml
# Character: Lyra
name: Lyra
description: |
  A mysterious elf sorceress who has lived for over three centuries.
  She speaks in measured tones and rarely shows emotion.
personality: Wise, patient, slightly aloof. Speaks in measured tones.
scenario: Fantasy world, exploring ancient ruins together.
system_prompt: |
  You are Lyra, an elf sorceress. Stay in character at all times.
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

**Mapping:** YAML keys match canonical field names directly. No conversion needed.

**Advantages:**

- Readable in any text editor
- Diffable in version control
- No JSON escaping needed for long text
- Comments supported (`#`)
- Natural for hand-authoring

---

### 1.7 TOML Format (Loop-lore Native)

Config-style format for programmatic generation.

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
  "Well met! I didn't expect company down here.",
]
```

**Mapping:** `[character]` section fields map directly. Subsections map to appropriate canonical fields.

**Advantages:**

- Familiar to developers (Cargo.toml, pyproject.toml)
- Strong typing (strings, integers, floats, booleans, arrays, tables)
- No ambiguity in nested structures
- Good for programmatic generation

---

## 2. Chat Export Formats

### 2.1 JSON Export (Structured)

Full-fidelity export preserving all metadata.

```json
{
  "version": "1.0",
  "exported_at": "2026-07-19T04:30:00Z",
  "chat": {
    "id": "chat-uuid",
    "name": "Chat with Lyra",
    "created_at": "2026-07-01T10:00:00Z",
    "world": {
      "id": "world-uuid",
      "name": "Fantasy World"
    },
    "participants": [
      {
        "id": "user-uuid",
        "name": "Player",
        "type": "user"
      },
      {
        "id": "character-uuid",
        "name": "Lyra",
        "type": "character"
      }
    ]
  },
  "messages": [
    {
      "id": "msg-uuid-1",
      "role": "user",
      "content": "Hello, who are you?",
      "timestamp": "2026-07-01T10:00:00Z",
      "edited": false,
      "attachments": []
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "*The elf woman looks up* I am Lyra.",
      "timestamp": "2026-07-01T10:00:05Z",
      "edited": false,
      "attachments": [],
      "metadata": {
        "model": "gpt-4",
        "tokens_used": 150
      }
    }
  ],
  "metadata": {
    "total_messages": 2,
    "participants_count": 2,
    "has_attachments": false,
    "has_world": true
  }
}
```

**Use Cases:**

- Backup and restore
- Data migration between platforms
- Programmatic analysis
- API responses

---

### 2.2 Markdown Export (Readable)

Human-readable format optimized for reading and sharing.

```markdown
# Chat with Lyra

**World:** Fantasy World
**Participants:** Player, Lyra
**Exported:** 2026-07-19

---

## Messages

**Player** (2026-07-01 10:00)

Hello, who are you?

---

**Lyra** (2026-07-01 10:00)

_The elf woman looks up_ I am Lyra.

---

## Metadata

- Total messages: 2
- Has attachments: No
- Has world: Yes
```

**Use Cases:**

- Sharing conversations
- Reading on mobile devices
- Documentation
- Printing

---

### 2.3 HTML Export (Styled)

Styled format for web viewing and archival.

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Chat with Lyra</title>
    <style>
    /* Embedded CSS for self-contained file */
    body {
      font-family: sans-serif;
      max-width: 800px;
      margin: 0 auto;
    }
    .message {
      padding: 10px;
      margin: 10px 0;
      border-radius: 8px;
    }
    .user {
      background: #e3f2fd;
    }
    .assistant {
      background: #f3e5f5;
    }
    .metadata {
      color: #666;
      font-size: 0.9em;
    }
    </style>
  </head>
  <body>
    <h1>Chat with Lyra</h1>
    <div class="info">
      <p><strong>World:</strong> Fantasy World</p>
      <p><strong>Participants:</strong> Player, Lyra</p>
    </div>
    <div class="messages">
      <div class="message user">
        <div class="sender">Player</div>
        <div class="time">2026-07-01 10:00</div>
        <div class="content">Hello, who are you?</div>
      </div>
      <div class="message assistant">
        <div class="sender">Lyra</div>
        <div class="time">2026-07-01 10:00</div>
        <div class="content"><em>The elf woman looks up</em> I am Lyra.</div>
      </div>
    </div>
  </body>
</html>
```

**Use Cases:**

- Web archival
- Sharing via email
- Printing with formatting
- Browser viewing

---

### 2.4 Plain Text Export (Minimal)

Minimal format for maximum compatibility.

```
Chat with Lyra
World: Fantasy World
Participants: Player, Lyra
Exported: 2026-07-19

---

[Player] (2026-07-01 10:00)

Hello, who are you?

[Lyra] (2026-07-01 10:00)

The elf woman looks up I am Lyra.
```

**Use Cases:**

- Minimal file size
- Maximum compatibility
- Terminal viewing
- Text processing

---

## 3. Bulk Data Export

### 3.1 ZIP Archive Structure

```
loop-lore-export-2026-07-19.zip
├── manifest.json           # Export metadata
├── characters/
│   ├── lyra.json          # Character card (JSON)
│   ├── lyra.png           # Character avatar (if available)
│   └── ...
├── chats/
│   ├── chat-1.json        # Chat history
│   ├── chat-2.json
│   └── ...
├── worlds/
│   ├── world.json         # World definition
│   └── ...
├── assets/
│   ├── asset-1.png        # Asset files
│   └── ...
└── metadata/
    ├── export-info.json   # Export details
    └── schema-version.json
```

### 3.2 Manifest Structure

```json
{
  "version": "1.0",
  "exported_at": "2026-07-19T04:30:00Z",
  "exported_by": "user-uuid",
  "contents": {
    "characters": 5,
    "chats": 12,
    "worlds": 2,
    "assets": 45
  },
  "format_version": "1.0",
  "checksums": {
    "characters/lyra.json": "sha256:abc123...",
    "chats/chat-1.json": "sha256:def456..."
  }
}
```

---

## 4. Import Detection Algorithm

### 4.1 Auto-Detection Flow

```typescript
async function detectFormat(input: Buffer | string): Promise<Format> {
  // 1. Check magic bytes
  if (isPngMagic(input)) {
    return detectPngFormat(input);
  }
  if (isZipMagic(input)) {
    return "charx";
  }

  // 2. Try JSON parse
  try {
    const json = JSON.parse(input.toString());
    if (json.spec === "chara_card_v2") return "ccv2";
    if (json.spec === "chara_card_v3") return "ccv3";
    if (json.definition || json.greeting) return "character-ai";
    return "json-flat";
  } catch {}

  // 3. Try TOML parse
  try {
    const toml = parse(input.toString());
    if (toml.character) return "toml";
  } catch {}

  // 4. Try YAML parse
  try {
    const yaml = load(input.toString());
    if (yaml.name || yaml.description) return "yaml";
  } catch {}

  throw new ImportError("Unable to detect format");
}
```

### 4.2 Format Detection Priority

| Priority | Format       | Detection Method                  |
| -------- | ------------ | --------------------------------- |
| 1        | PNG (V3)     | Magic bytes + `ccv3` chunk        |
| 2        | PNG (V2)     | Magic bytes + `chara` chunk       |
| 3        | PNG (V1)     | Magic bytes + `Chara` chunk       |
| 4        | CHARX        | Magic bytes `PK` (ZIP)            |
| 5        | CCv3         | JSON with `spec: "chara_card_v3"` |
| 6        | CCv2         | JSON with `spec: "chara_card_v2"` |
| 7        | Character.AI | JSON with `definition` field      |
| 8        | JSON Flat    | JSON without spec field           |
| 9        | TOML         | Key=value with `[sections]`       |
| 10       | YAML         | Successful YAML parse             |

---

## 5. Normalizer Interface

All formats normalize to a single canonical representation:

```typescript
interface CanonicalCharacter {
  name: string;
  description: string;
  personality?: string;
  scenario?: string;
  welcome_message?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  creator_notes?: string;
  character_version?: string;
  nickname?: string;
  extensions?: Record<string, unknown>;
  lorebook?: {
    name?: string;
    description?: string;
    scan_depth?: number;
    token_budget?: number;
    recursive_scanning?: boolean;
    entries: LorebookEntry[];
  };
  assets?: CharacterAsset[];
}

interface LorebookEntry {
  keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  name: string;
  priority: number;
  id: number;
  comment?: string;
  selective: boolean;
  constant: boolean;
  position: "before_char" | "after_char";
  use_regex?: boolean;
  extensions?: Record<string, unknown>;
}

interface CharacterAsset {
  type: string;
  name: string;
  uri: string;
  ext: string;
}
```

---

## 6. API Endpoints

### 6.1 Character Import

```typescript
// POST /api/characters/import
// Content-Type: multipart/form-data
// Body: file (binary), format? (auto-detect if omitted)

// Response: 201
{
  "id": "character-uuid",
  "name": "Lyra",
  "format_detected": "ccv2",
  "warnings": ["V2 card upgraded to V3 on import"],
  "assets_imported": 2
}
```

### 6.2 Character Import from URL

```typescript
// POST /api/characters/import/url
// Content-Type: application/json
// Body: { "url": "https://example.com/character.png" }

// Response: 201
{
  "id": "character-uuid",
  "name": "Lyra",
  "source_url": "https://example.com/character.png",
  "format_detected": "ccv3"
}
```

### 6.3 Character Export

```typescript
// GET /api/characters/:id/export?format=png
// Query params: format (png|json|yaml|toml|charx)

// Response: 200
// Content-Type: image/png (for format=png)
// Content-Type: application/json (for format=json)
// etc.
```

### 6.4 Chat Export

```typescript
// GET /api/chats/:id/export?format=json
// Query params: format (json|markdown|html|text)

// Response: 200
// Content-Type: varies by format
```

### 6.5 Bulk Export

```typescript
// POST /api/export
// Content-Type: application/json
// Body: {
//   "include": ["characters", "chats", "worlds", "assets"],
//   "format": "zip",
//   "chat_ids": ["optional-filter"]
// }

// Response: 200
// Content-Type: application/zip
// Body: ZIP archive
```

---

## 7. Error Handling

### 7.1 Import Errors

```typescript
interface ImportError {
  code: "FORMAT_NOT_DETECTED" | "PARSE_ERROR" | "VALIDATION_ERROR" | "UNSUPPORTED_VERSION";
  message: string;
  details?: {
    line?: number;
    column?: number;
    field?: string;
    expected?: string;
    actual?: string;
  };
  suggestion?: string;
}
```

**Example Errors:**

| Error                 | Message                         | Suggestion                                                   |
| --------------------- | ------------------------------- | ------------------------------------------------------------ |
| `FORMAT_NOT_DETECTED` | "Unable to detect file format"  | "Ensure file is JSON, YAML, TOML, or PNG with embedded data" |
| `PARSE_ERROR`         | "YAML parse error at line 15"   | "Use spaces, not tabs for indentation"                       |
| `VALIDATION_ERROR`    | "Missing required field 'name'" | "Add 'name' field to your character definition"              |
| `UNSUPPORTED_VERSION` | "V2 card missing 'spec' field"  | "Wrap data in `{ spec, spec_version, data }` envelope"       |

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Test File                                         | Coverage                                   |
| ------------------------------------------------- | ------------------------------------------ |
| `src/characters/parser.test.ts`                   | Auto-detection for all formats             |
| `src/characters/normalizers/ccv2.test.ts`         | V2 normalization                           |
| `src/characters/normalizers/ccv3.test.ts`         | V3 normalization                           |
| `src/characters/normalizers/character-ai.test.ts` | Character.AI normalization                 |
| `src/characters/normalizers/png.test.ts`          | PNG chunk parsing                          |
| `src/characters/normalizers/charx.test.ts`        | CHARX extraction                           |
| `src/characters/normalizers/yaml.test.ts`         | YAML parsing                               |
| `src/characters/normalizers/toml.test.ts`         | TOML parsing                               |
| `src/characters/exporter.test.ts`                 | Round-trip: canonical → format → canonical |

### 8.2 Integration Tests

| Test File                                      | Coverage                             |
| ---------------------------------------------- | ------------------------------------ |
| `src/characters/import.integration.test.ts`    | Full import pipeline                 |
| `src/characters/export.integration.test.ts`    | Full export pipeline                 |
| `src/characters/roundtrip.integration.test.ts` | Import → Export → Import consistency |

### 8.3 Test Data

| File                                          | Content             |
| --------------------------------------------- | ------------------- |
| `tests/fixtures/characters/ccv2.json`         | Valid V2 card       |
| `tests/fixtures/characters/ccv3.json`         | Valid V3 card       |
| `tests/fixtures/characters/character-ai.json` | Character.AI export |
| `tests/fixtures/characters/v2-png.png`        | PNG with V2 data    |
| `tests/fixtures/characters/v3-png.png`        | PNG with V3 data    |
| `tests/fixtures/characters/sample.charx`      | CHARX bundle        |
| `tests/fixtures/characters/sample.yaml`       | YAML character      |
| `tests/fixtures/characters/sample.toml`       | TOML character      |

---

## 9. Dependencies

### Already in package.json

- `js-yaml` — YAML parsing
- `smol-toml` — TOML parsing

### New Dependencies

None required — PNG metadata parsing and ZIP extraction use native Node.js/Bun APIs:

- `Bun.readableStreamToBlob()` — for PNG chunk reading
- `Bun.zip()` / `jszip` — for CHARX extraction (if needed)

---

## 10. Implementation Priority

### Phase 1: Core Import (Week 1)

- Auto-detection algorithm
- CCv2 normalizer
- JSON flat normalizer
- Basic import endpoint

### Phase 2: PNG Support (Week 1-2)

- PNG chunk reader/writer
- V2/V3 PNG import
- V2+V3 PNG export (dual chunks)

### Phase 3: Extended Formats (Week 2)

- CCv3 normalizer
- Character.AI normalizer
- YAML normalizer
- TOML normalizer

### Phase 4: CHARX Support (Week 2-3)

- ZIP extraction
- Asset import from CHARX
- CHARX export with assets

### Phase 5: Export (Week 3)

- JSON export
- YAML export
- TOML export
- PNG export (dual chunks)
- CHARX export

### Phase 6: Chat Export (Week 3-4)

- JSON chat export
- Markdown chat export
- HTML chat export
- Plain text chat export

### Phase 7: Bulk Export (Week 4)

- ZIP archive generation
- Manifest creation
- Checksum verification

---

## References

| Spec              | URL                                                     | Notes                   |
| ----------------- | ------------------------------------------------------- | ----------------------- |
| CCv2              | github.com/malfoyslastname/character-card-spec-v2       | Community standard      |
| CCv3              | github.com/kwaroran/character-card-spec-v3              | V3 with assets          |
| Unified Spec      | github.com/BasedInn/Unified-CharacterCard-Specification | Consolidated reference  |
| Char Card Reader  | github.com/lenml/char-card-reader                       | V1/V2/V3 parser library |
| Character Foundry | github.com/character-foundry/character-foundry          | CHARX format author     |

---

## Related Documents

| Document                       | Covers                                                |
| ------------------------------ | ----------------------------------------------------- |
| `docs/spec/character-setup.md` | Character system, import/export, persona relationship |
| `docs/spec/assets.md`          | Asset upload and linking pipeline                     |
| `docs/spec/actors.md`          | Actor data model, import field mapping                |
| `docs/frontend/characters.md`  | Character list and edit UI                            |
| `docs/frontend/gallery.md`     | Asset gallery UI                                      |
