# Creating & Managing Characters

This guide walks you through creating, importing, exporting, and managing
characters in loop-lore — including playing as characters (impersonation).

---

## Quick Start: Create Your First Character

1. Go to **Characters** (`/characters`)
2. Click **"Create Character"**
3. Fill in:
   - **Name** — your character's display name (required)
   - **Avatar** — drag and drop an image (optional)
   - **Description** — who is this character? backstory, appearance, motivations
   - **Personality** — traits, speech patterns, mannerisms
   - **Greeting** — the first message the character sends when a chat starts
4. Click **Save**

Your character is ready. Click on it to start chatting.

---

## Importing Characters

loop-lore can import characters from any major AI roleplay platform.

### From a File

1. Go to **Characters** → **Import**
2. Select a file: `.json`, `.yaml`, `.yml`, `.toml`, `.png`, or `.charx`
3. The file is auto-detected and parsed
4. Review the imported fields
5. Click **Save**

**Supported formats:**

| Format                 | Source                                  | What gets imported                    |
| ---------------------- | --------------------------------------- | ------------------------------------- |
| PNG with embedded JSON | SillyTavern, Chub.ai                    | All fields + avatar image             |
| `.json` (V2/V3)        | SillyTavern, RisuAI, Chub               | All fields + lorebook                 |
| `.json` (Character.AI) | Character.AI export                     | Name, description, greeting, examples |
| `.yaml`                | Hand-authored, Character Card Converter | All fields                            |
| `.toml`                | Hand-authored                           | All fields                            |
| `.charx`               | RisuAI V3 bundles                       | All fields + bundled assets           |

**Lorebook entries** (World Info) embedded in character cards are automatically
imported into the character's lorebook.

### From a URL

1. Go to **Characters** → **Import from URL**
2. Paste a URL pointing to a character file or Chub.ai character page
3. The character is fetched and imported

### Bulk Import

Place multiple character files in a folder and use the API:

```bash
# Import all files from a directory
loop-lore import ./my-characters/
```

Or via the web UI: select multiple files in the import dialog.

---

## Exporting Characters

Export your characters for use in other tools or for backup.

### Export as PNG (Recommended for Sharing)

PNG export embeds the character data in the image metadata. Other tools
(SillyTavern, Chub.ai, RisuAI) can read the character directly from the image.

1. Open character → **More** → **Export**
2. Choose **PNG** (default)
3. The file downloads with the character's avatar as the image

### Export as JSON

For tool interop or programmatic use:

1. Export → choose **JSON**
2. Downloads a `.json` file in V2 format (universally compatible)

### Export as YAML

For hand-editing or version control:

1. Export → choose **YAML**
2. Downloads a human-readable `.yaml` file

### Export as TOML

For config-style workflows:

1. Export → choose **TOML**
2. Downloads a `.toml` file

### Export Formats Comparison

| Format | Best for             | Readable    | Editable | Compatible                          |
| ------ | -------------------- | ----------- | -------- | ----------------------------------- |
| PNG    | Sharing, other tools | No (binary) | No       | SillyTavern, Chub, RisuAI           |
| JSON   | Tool interop, APIs   | Moderate    | Yes      | All platforms                       |
| YAML   | Hand-editing, VCS    | Yes         | Yes      | loop-lore, Character Card Converter |
| TOML   | Config workflows     | Yes         | Yes      | loop-lore                           |

---

## Writing Characters by Hand (YAML/TOML)

If you prefer writing character definitions in a text editor, use YAML or
TOML. These are loop-lore native formats — keys match the internal fields
exactly.

### YAML Example

```yaml
name: Lyra
description: |
  A mysterious elf sorceress who has lived for over three centuries.
  She speaks in measured tones and rarely shows emotion, but her
  eyes betray deep wisdom and hidden sorrow.
personality: Wise, patient, slightly aloof
scenario: Fantasy world, exploring ancient ruins together
welcome_message: |
  *The elf woman looks up from the ancient tome.*

  "Ah... a visitor. It has been some time since anyone found their
  way to these ruins."
mes_example: |
  <START>
  {{user}}: Who are you?
  {{char}}: *She closes the book carefully* I am Lyra.

  <START>
  {{user}}: Can you teach me magic?
  {{char}}: *A faint smile* Magic is not taught. It is earned.
tags:
  - fantasy
  - elf
  - sorceress
creator: YourName
character_version: "1.0"
```

Save as `lyra.yaml` and import via the web UI.

### TOML Example

```toml
[character]
name = "Lyra"
description = "A mysterious elf sorceress..."
personality = "Wise, patient, slightly aloof"
scenario = "Fantasy world, exploring ancient ruins"
welcome_message = "Ah... a visitor. Welcome to these ruins."

[character.metadata]
tags = ["fantasy", "elf", "sorceress"]
creator = "YourName"
character_version = "1.0"
```

Save as `lyra.toml` and import.

### Field Reference

| Field                       | Required | Description                              |
| --------------------------- | -------- | ---------------------------------------- |
| `name`                      | Yes      | Character display name                   |
| `description`               | Yes      | Full character description/backstory     |
| `personality`               | No       | Short personality summary                |
| `scenario`                  | No       | RP setting/context                       |
| `system_prompt`             | No       | Override the default system prompt       |
| `welcome_message`           | No       | First message the character sends        |
| `mes_example`               | No       | Example dialogue showing character voice |
| `post_history_instructions` | No       | Instructions appended after chat history |
| `alternate_greetings`       | No       | Array of alternate first messages        |
| `tags`                      | No       | Array of categorization labels           |
| `creator`                   | No       | Your name/credit                         |
| `creator_notes`             | No       | Notes about the character                |
| `character_version`         | No       | Version string                           |

---

## Personas: Playing as Yourself

A persona is your identity in chats. By default, you chat as yourself — but
you can create multiple personas for different characters or roles.

### Create a Persona

1. Go to **Settings** → **Personas**
2. Click **"New Persona"**
3. Fill in:
   - **Name** — how you appear in chats
   - **Avatar** — your profile picture
   - **Description** — your character's traits (optional)
4. Save

### Use a Persona

When starting a new chat, select which persona to use from the dropdown.
Your selected persona determines:

- The name the AI sees for you
- Your avatar in the chat
- Any description/personality injected into the prompt

### Default Persona

Set one persona as your default — it auto-selects for all new chats.

---

## Impersonation: Playing as a Character

Impersonation lets you temporarily **become** any character. When you
impersonate a character, your messages are sent as if you were them — the
AI sees their name, avatar, and personality in the "user" slot of the prompt.

### How to Impersonate

1. Start or open a chat with any character
2. Click the **character name** in the chat header
3. Select **"Impersonate"**
4. Choose which character to impersonate
5. The chat switches to impersonation mode

### What Changes

| Before                             | During Impersonation                        |
| ---------------------------------- | ------------------------------------------- |
| AI sees you as `{{user}}`          | AI sees you as the impersonated character   |
| Your messages use your name/avatar | Your messages use their name/avatar         |
| AI responds to you as the user     | AI responds to both characters in-character |

### When to Use Impersonation

- **Self-play**: You created a character and want to test how they interact
- **Writing**: You're co-writing a story and want to voice multiple characters
- **Crossover**: Two characters from different stories meet
- **Testing**: Playtest a character's greeting and personality

### Stop Impersonating

Click the character name in the header → **"Stop Impersonating"**.
The chat returns to your normal persona.

---

## Character ↔ Persona: The Difference

|                     | Character                              | Persona                 |
| ------------------- | -------------------------------------- | ----------------------- |
| **Who controls it** | AI generates responses                 | You type the messages   |
| **Stored as**       | `actor_type='character'`               | User identity on a chat |
| **Has AI fields**   | Yes (personality, system prompt, etc.) | No (just identity)      |
| **Can be shared**   | Yes (export/import)                    | No (per-user)           |
| **Used in**         | Any chat                               | Only your chats         |

**Key distinction:** A character is what the AI plays. A persona is what you
play. Impersonation blurs this line — you temporarily play a character.

---

## Lorebook Entries (World Info)

Characters can carry their own lorebook — keyword-triggered knowledge entries
that get injected into the prompt when relevant keywords appear in chat.

### Add Lore Entries

1. Open character → **Lorebook** tab
2. Click **"Add Entry"**
3. Fill in:
   - **Keywords** — trigger words (comma-separated)
   - **Content** — text injected when triggered
   - **Position** — before or after character definition
   - **Constant** — always insert (within token budget)
4. Save

### How It Works

When you chat, the system scans recent messages for your lorebook keywords.
Matching entries are injected into the prompt, giving the AI relevant context
without cluttering the main character definition.

**Example:**

- Keywords: `dragon, scale, wyrm`
- Content: `Dragon scales are nearly impervious to conventional weapons.
Only dragonfire or enchanted blades can cut them.`
- When you mention "dragon" in chat → this entry activates → AI knows about
  dragon scales

### Lorebook Settings

- **Scan Depth**: How many recent messages to check (default: 100)
- **Token Budget**: Max tokens for lore entries (default: 2000)
- **Selective**: Require both primary AND secondary keywords to trigger

---

## Example Dialogue (mes_example)

Example dialogue teaches the AI how your character speaks. Format:

```
<START>
{{user}}: Hello!
{{char}}: *waves* Hey there! How's it going?

<START>
{{user}}: What do you think about magic?
{{char}}: *eyes light up* Oh, magic! It's absolutely fascinating...
```

**Tips:**

- Use `<START>` to separate example conversations
- Include `{{user}}` and `{{char}}` macros
- Show, don't tell — demonstrate personality through dialogue
- 2-3 examples is usually enough
- Include actions/emotions in `*asterisks*`

---

## Tags & Organization

Tags help you find and filter characters.

### Add Tags

In the character editor, type tags in the tags field (comma-separated).
Tags convert to removable chips.

### Filter by Tags

On the characters list, use the filter chips to show only characters with
specific tags.

### Suggested Tags

`fantasy`, `scifi`, `romance`, `horror`, `comedy`, `slice-of-life`,
`adventure`, `mystery`, `mentor`, `villain`, `companion`, `narrator`

---

## Migrating from Other Platforms

### SillyTavern → loop-lore

1. In SillyTavern: open character → **More** → **Export** → PNG or JSON
2. In loop-lore: **Characters** → **Import** → select the exported file
3. Everything transfers: name, description, personality, greeting, examples,
   system prompt, lorebook, avatar
4. If you have world info files, import them separately via **Worlds** → **Import**

### Character.AI → loop-lore

1. Export your character data from Character.AI
2. In loop-lore: **Import** → paste JSON or upload file
3. Review: Character.AI's `definition` field is merged into `description`
4. Adjust macro syntax if needed (`{{char}}` and `{{user}}` work the same)

### Chub.ai → loop-lore

1. Download character as PNG or JSON from Chub.ai
2. Import as above — format is fully compatible

### RisuAI → loop-lore

1. Export as V3 JSON or CHARX
2. Import — V3 fields and assets are fully supported

### Batch Migration

If you're migrating many characters at once:

1. Export all characters from the source platform
2. Place files in a single folder
3. Use the API or CLI to batch-import:

```bash
loop-lore import ./exported-characters/
```

1. Review imported characters in the web UI

---

## Troubleshooting

### "Import failed — unknown format"

The file couldn't be parsed. Check:

- Is the file corrupted? Try re-downloading
- Is it a format we don't support? Check the supported formats table
- For YAML/TOML: ensure proper indentation (YAML uses spaces, not tabs)

### "Missing required field 'name'"

Your character definition is missing the `name` field. Add it and re-import.

### "PNG contains no character data"

The PNG file doesn't have embedded character data. It may be a regular
image. Create a character manually and upload the image as an avatar.

### Character looks different after import

Some fields may have been normalized. Open the character editor to review
and adjust. All original data is preserved in the import metadata.

### Impersonation not working

Ensure you've selected a character to impersonate (not just a persona).
The chat header should show the impersonated character's name and avatar.

---

## See Also

- [Character Setup Spec](../spec/character-setup.md) — Full technical specification
- [Actor Data Model](../spec/actors.md) — Database schema and field mapping
- [Character List UI](../frontend/characters.md) — Character list and edit page
- [Chat Overview](../frontend/chat/overview.md) — Chat types and data model
- [Memory System](../spec/memory-system.md) — How character memories work
- [Asset System](../spec/assets.md) — Avatar and media management
