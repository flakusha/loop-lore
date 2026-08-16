<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Creating & Managing Characters

## Quick Start

1. **Characters** (`/characters`) → **Create Character**
2. Fill: Name (required), Avatar, Description, Personality, Greeting
3. Click **Save**

## Importing

Go to **Characters** → **Import**. Select file: `.json`, `.yaml`, `.yml`, `.toml`, `.png`, `.charx`. Auto-detected and parsed.

| Format                 | Source                                  | What gets imported                    |
| ---------------------- | --------------------------------------- | ------------------------------------- |
| PNG with embedded JSON | SillyTavern, Chub.ai                    | All fields + avatar image             |
| `.json` (V2/V3)        | SillyTavern, RisuAI, Chub               | All fields + lorebook                 |
| `.json` (Character.AI) | Character.AI export                     | Name, description, greeting, examples |
| `.yaml`                | Hand-authored, Character Card Converter | All fields                            |
| `.toml`                | Hand-authored                           | All fields                            |
| `.charx`               | RisuAI V3 bundles                       | All fields + bundled assets           |

Lorebook entries embedded in character cards auto-import.

### Import from URL

**Characters** → **Import from URL** → paste URL pointing to character file or Chub.ai page.

### Bulk Import

```bash
loop-lore import ./my-characters/
```

Or select multiple files in import dialog.

## Exporting

Open character → **More** → **Export**. Choose format:

| Format | Best for             | Readable | Editable | Compatible                          |
| ------ | -------------------- | -------- | -------- | ----------------------------------- |
| PNG    | Sharing, other tools | No       | No       | SillyTavern, Chub, RisuAI           |
| JSON   | Tool interop, APIs   | Moderate | Yes      | All platforms                       |
| YAML   | Hand-editing, VCS    | Yes      | Yes      | loop-lore, Character Card Converter |
| TOML   | Config workflows     | Yes      | Yes      | loop-lore                           |

## Hand-authored Characters

### Field Reference

| Field                       | Required | Description                              |
| --------------------------- | -------- | ---------------------------------------- |
| `name`                      | Yes      | Character display name                   |
| `description`               | Yes      | Full character description/backstory     |
| `personality`               | No       | Short personality summary                |
| `scenario`                  | No       | RP setting/context                       |
| `system_prompt`             | No       | Override default system prompt           |
| `welcome_message`           | No       | First message the character sends        |
| `mes_example`               | No       | Example dialogue showing character voice |
| `post_history_instructions` | No       | Instructions appended after chat history |
| `alternate_greetings`       | No       | Array of alternate first messages        |
| `tags`                      | No       | Array of categorization labels           |
| `creator`                   | No       | Your name/credit                         |
| `creator_notes`             | No       | Notes about the character                |
| `character_version`         | No       | Version string                           |

## Personas

Your identity in chats. **Settings** → **Personas** → **New Persona**. Set name, avatar, description. Select when starting new chat.

## Impersonation

Temporarily **become** any character. AI sees their name, avatar, personality in the "user" slot.

1. Open chat → click character name in header
2. Select **Impersonate** → choose character
3. Stop via header → **Stop Impersonating**

## Character vs Persona

|                     | Character                              | Persona                 |
| ------------------- | -------------------------------------- | ----------------------- |
| **Who controls it** | AI generates responses                 | You type the messages   |
| **Stored as**       | `actor_type='character'`               | User identity on a chat |
| **Has AI fields**   | Yes (personality, system prompt, etc.) | No (just identity)      |
| **Can be shared**   | Yes (export/import)                    | No (per-user)           |
| **Used in**         | Any chat                               | Only your chats         |

## Lorebook Entries

Character-specific keyword-triggered knowledge injected into prompt.

### Add

Open character → **Lorebook** → **Add Entry**. Fields: Keywords (comma-separated), Content, Position (before/after/in character definition), Constant (always insert).

### Settings

- **Scan Depth**: how many recent messages to check (default: 100)
- **Token Budget**: max tokens for lore entries (default: 2000)
- **Selective**: require both primary AND secondary keywords

## Example Dialogue (mes_example)

Format with `<START>` separators, `{{user}}` and `{{char}}` macros. 2-3 examples sufficient. Actions in `*asterisks*`.

## Tags

Comma-separated in character editor. Filter on characters list. Suggested: `fantasy`, `scifi`, `romance`, `horror`, `comedy`, `slice-of-life`, `adventure`, `mystery`, `mentor`, `villain`, `companion`, `narrator`.

## Migrating from Other Platforms

| Platform     | Method                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| SillyTavern  | Export PNG/JSON → loop-lore Import                                     |
| Character.AI | Export JSON → loop-lore Import; `definition` merged into `description` |
| Chub.ai      | Download PNG/JSON → Import (fully compatible)                          |
| RisuAI       | Export V3 JSON/CHARX → Import                                          |
| Batch        | `loop-lore import ./exported-characters/`                              |

## Troubleshooting

- **"Import failed — unknown format"**: file corrupted or unsupported format
- **"Missing required field 'name'"**: add `name` field and re-import
- **"PNG contains no character data"**: file is a regular image, not an embedded card
- **Character looks different after import**: fields may have been normalized; open editor to adjust
- **Impersonation not working**: ensure you selected a character to impersonate, not a persona

## See Also

- `docs/spec/character-spec.md` — Technical spec
- `docs/spec/actors.md` — DB schema and field mapping
- `docs/frontend/characters.md` — Character list and edit page
- `docs/frontend/chat/overview.md` — Chat types
- `docs/spec/memory-system.md` — Character memories
- `docs/spec/assets.md` — Avatar and media management
