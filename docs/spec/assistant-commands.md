<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Assistant Commands Specification

## Command Parser

Location: src/assistant/command-parser.ts

```typescript
export interface ParsedCommand {
  command: string;
  args: string[];
  raw: string;
}

export function parseCommand(input: string,): ParsedCommand | null;
```

## Built-in Commands

### Text Improvement

/improve [text]

- Reviews, checks, parses, fixes, improves current text
- LLM returns improved version with suggestions

### Dice Rolling

/dice `<notation>`

- /dice 2d6+3 -> rolls 2d6, adds 3
- Returns result with individual rolls

### Stats Display

/stats [actor_id]

- Shows character sheet
- Includes derived stats, equipment

### Image Generation

/image <prompt> [--style <style>]

- Triggers image generation
- Styles: anime, photorealistic, sketch, etc.

### Quest Management

/quest create <name> - create quest
/quest update <quest_id> <progress> - update progress
/quest list - list active quests

### Combat

/attack <target> [weapon] - attack action
/damage <amount> <target> - apply damage
/heal <amount> <target> - heal target

### Entity Modification & Addition

```
/apply <world|location|item|character> <id> <key=value>...
/modify <world|location|item|character> <id> <request...>
/add <location|item> <name> [world] [key=value]...
/clone <location|item> <source-id> [key=value]...
/import character <asset-id|file>
```

- `/apply` applies a direct field-level patch (no LLM)
- `/modify` asks the model for updated fields, then runs the quality gates
  (schema validation is a hard reject, duplicate and consistency are warnings)
- `/add` creates a new location/item in an existing world
- `/clone` copies an entity and applies `key=value` overrides to the copy
- `/import` imports a character card (PNG/YAML/TOML/JSON/CHARX) from an asset

All five are preview-only: the request is parsed and checked, and the user
confirms the preview before the real HTTP route is called. The ownership
checks are the routes' own guards (`requireWorldOwner`, `checkWorldOwnership`,
`checkActorOwnership`) - there is no separate access layer.

Source: `src/assistant/commands/{apply,modify,import,clone}.ts`,
`entity-patch.ts` (patch grammar), `entity-patch-spec.ts` (per-kind fields).

## Command Access Tiers

Commands have access tiers based on world rules:

| Command  | Default Tier | GM Override         |
| -------- | ------------ | ------------------- |
| /improve | all          | whitelist/blacklist |
| /dice    | all          | whitelist/blacklist |
| /stats   | all          | whitelist/blacklist |
| /attack  | member       | whitelist/blacklist |
| /damage  | gm           | whitelist/blacklist |
| /heal    | gm           | whitelist/blacklist |
| /quest   | gm           | whitelist/blacklist |
| /image   | member       | configurable cost   |

## Command Registration

Commands registered via `registerCommand(name, handler)` in src/assistant/commands/

Handlers receive:

- context: { chatId, actorId, userId, worldId }
- args: string[]
- respond: (text) => void

## UI Integration

- Slash triggers autocomplete dropdown
- Arrow keys navigate suggestions
- Enter executes command
- Shift+Enter for multi-line commands
