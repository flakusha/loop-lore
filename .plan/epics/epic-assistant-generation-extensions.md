# EPIC: Assistant Generation Extensions (SD, Intent, Scenario Source)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Issue:** `29d4e8c`
**Type:** Feature Epic
**Tags:** assistant, stable-diffusion, intent-detection, tool-execution, scenario-source

## Overview

Extends the Assistant/GM generation surface (see `epic-assistant-gm-flows.md`)
with three capabilities not covered there:

1. **Stable Diffusion integration** — generate images/assets alongside text
   entities (items, locations, worlds, characters).
2. **Intent detection** — decide whether a user request should be routed to
   generation, to a directly-approved tool execution, or to an external API call.
3. **Scenario source** — creative LLMs generate new worlds/ideas that become
   reusable assistant scenario sources for future generation of scenarios.

This epic assumes the confirmation/quality gating flow from
`epic-assistant-gm-flows.md` still applies; it adds the _routing_ and _media_
layers on top.

## Stable Diffusion Integration

### Generation Targets

| Entity    | Asset kind     |
| --------- | -------------- |
| Character | Portrait       |
| Item      | Icon / render  |
| Location  | Scene art      |
| World     | Map / mood art |

```typescript
interface SDRequest {
  prompt: string;
  negative_prompt?: string;
  entity_ref: EntityRef;
  size: [number, number,];
  seed?: number;
}
```

## Intent Detection

### Routing Decision

| Intent                | Route                     | Approval               |
| --------------------- | ------------------------- | ---------------------- |
| Generate content      | Generation pipeline       | Quality + user confirm |
| Direct tool execution | Approved tool bus         | Pre-approved allowlist |
| External API call     | API integration framework | Per-call policy        |

```typescript
type AssistantIntent = "generate" | "tool_exec" | "api_call";

interface IntentResult {
  intent: AssistantIntent;
  confidence: number;
  target: string; // tool id or api id or generation template
  requires_approval: boolean;
}
```

## Scenario Source

Creative generation can emit reusable scenario seeds (new worlds/ideas) that the
assistant later consumes when building scenarios. Bridges into `epic-blog-system.md`
(`generated_world_seed`) and `epic-world-locations.md`.

```typescript
interface ScenarioSource {
  id: string;
  origin: "creative_llm" | "blog_seed" | "manual";
  world_sketch: string;
  reusable: boolean;
}
```

## Tasks

- [ ] Stable Diffusion request/response adapter
- [ ] Entity→asset mapping for characters/items/locations/worlds
- [ ] Intent detection model + routing table
- [ ] Approved tool-execution allowlist + policy
- [ ] External API call policy gate
- [ ] Scenario source store + reuse in generation
- [ ] Bridge scenario source ↔ blog world seed

## Files

- `src/assistant/sd.ts` — Stable Diffusion adapter (TODO: create)
- `src/assistant/intent.ts` — intent detection + routing (TODO: create)
- `src/assistant/tools.ts` — approved tool execution (TODO: create)
- `src/assistant/scenario-source.ts` — scenario store (shared w/ blog) (TODO: create)
- `src/assistant/commands/generate.ts` — extends existing generation commands (TODO: create)

## Current Implementation Status

The command system is partially built:

| Command        | Status         | File                                             |
| -------------- | -------------- | ------------------------------------------------ |
| `/improve`     | ✅ Basic impl  | `src/assistant/commands/improve.ts`              |
| `/image`       | ❌ Not started | `src/assistant/commands/image.ts` (to create)    |
| `/quest`       | ❌ Not started | `src/assistant/commands/quest.ts` (to create)    |
| `/video`       | ❌ Not started | `src/assistant/commands/video.ts` (to create)    |
| `/sfx`         | ❌ Not started | `src/assistant/commands/sfx.ts` (to create)      |
| `/sound`       | ❌ Not started | `src/assistant/commands/sfx.ts` (alias for /sfx) |
| `/music`       | ❌ Not started | `src/assistant/commands/music.ts` (to create)    |
| `/caption`     | ❌ Not started | `src/assistant/commands/caption.ts` (to create)  |
| `/roll`        | ✅ Complete    | `src/assistant/commands/dice.ts`                 |
| `/summarize`   | ✅ Complete    | `src/assistant/commands/summarize.ts`            |
| `/impersonate` | ✅ Complete    | `src/assistant/commands/impersonate.ts`          |
| `/narrate`     | ✅ Complete    | `src/assistant/commands/narrate.ts`              |
| `/ooc`         | ✅ Complete    | `src/assistant/commands/ooc.ts`                  |
| `/help`        | ✅ Complete    | `src/assistant/commands/help.ts`                 |

### `/improve` Command (Existing)

```typescript
// src/assistant/commands/improve.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("improve", (args,): CommandResult => {
  const text = args.join(" ",).trim();
  if (!text) {
    return {
      systemMessage: "Usage: /improve <text> — rewrite text for better quality.\n" +
        "You can also reply to a message with /improve to improve it.",
      handled: true,
    };
  }
  const improved = improveText(text,);
  return {
    systemMessage: `**Improved:**\n\n${improved}`,
    handled: true,
  };
},);

// NOTE: Current implementation is a placeholder. The real implementation
// should call the generation pipeline with a "rewrite" prompt.
```

### `/image` Command (To Create)

```typescript
// src/assistant/commands/image.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("image", async (args, ctx,): Promise<CommandResult> => {
  const prompt = args.join(" ",).trim();
  if (!prompt) {
    return {
      systemMessage: "Usage: /image <prompt> — generate an image from text.",
      handled: true,
    };
  }
  // TODO: Call Stable Diffusion adapter (src/assistant/sd.ts)
  // TODO: Return image asset link in response
  return {
    systemMessage: `**Image generation queued:** ${prompt}`,
    handled: true,
  };
},);
```

### `/quest` Command (To Create)

```typescript
// src/assistant/commands/quest.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("quest", async (args, ctx,): Promise<CommandResult> => {
  const action = args[0]?.toLowerCase() || "list";
  switch (action) {
    case "list":
      // TODO: List active quests for current chat/world
      return { systemMessage: "**Active Quests:** (none)", handled: true, };
    case "create":
      // TODO: Create quest from args
      return { systemMessage: "**Quest created**", handled: true, };
    default:
      return {
        systemMessage: "Usage: /quest [list|create|status] [args...]",
        handled: true,
      };
  }
},);
```

### `/video` Command (To Create)

```typescript
// src/assistant/commands/video.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("video", async (args,): Promise<CommandResult> => {
  const prompt = args.join(" ",).trim();
  if (!prompt) {
    return { systemMessage: "Usage: /video <prompt> — generate a video from text.", handled: true, };
  }
  // TODO: Call video generation provider (ComfyUI, Runway, etc.)
  return { systemMessage: `**Video generation queued:** ${prompt}`, handled: true, };
},);
```

### `/sfx` & `/sound` Commands (To Create)

```typescript
// src/assistant/commands/sfx.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("sfx", async (args,): Promise<CommandResult> => {
  const prompt = args.join(" ",).trim();
  if (!prompt) {
    return { systemMessage: "Usage: /sfx <prompt> — generate a sound effect.", handled: true, };
  }
  // TODO: Call audio generation provider
  return { systemMessage: `**Sound effect queued:** ${prompt}`, handled: true, };
},);

// Alias
registerCommand("sound", async (args,): Promise<CommandResult> => {
  const handler = (await import("./sfx")).getCommand("sfx",);
  return handler ? handler(args, undefined as never,) : { systemMessage: "Error", handled: true, };
},);
```

### `/music` Command (To Create)

```typescript
// src/assistant/commands/music.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("music", async (args,): Promise<CommandResult> => {
  const prompt = args.join(" ",).trim();
  if (!prompt) {
    return {
      systemMessage: "Usage: /music <prompt> — generate music or link external source.\n" +
        "External: /music https://youtube.com/watch?v=...",
      handled: true,
    };
  }
  // If URL: store link, browser handles playback
  // If prompt: generate audio, store asset
  return { systemMessage: `**Music queued:** ${prompt}`, handled: true, };
},);
```

### `/caption` Command (To Create)

```typescript
// src/assistant/commands/caption.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("caption", async (args, ctx,): Promise<CommandResult> => {
  // Caption the last image in context, or specified image
  const target = args[0] || "last";
  return {
    systemMessage: `**Caption generation queued for:** ${target}`,
    handled: true,
  };
},);
```

## UI Button Integration (UI/UX Improvements)

Commands should be accessible via button clicks, not just slash commands.
See `docs/frontend/chat/input.md` for input area specification.

### Button Mapping

| Button     | Command    | Epic(s) |
| ---------- | ---------- | ------- |
| 🎨 Image   | `/image`   | 23, 42  |
| 🎬 Video   | `/video`   | 42      |
| 🔊 SFX     | `/sfx`     | 42      |
| 🎵 Music   | `/music`   | 42, 36  |
| 🏷️ Caption  | `/caption` | 42      |
| ✨ Improve | `/improve` | 23, 30  |
| 📜 Quest   | `/quest`   | 23      |
| 🎲 Roll    | `/roll`    | 22      |

### Button UI Component

```html
<!-- src/components/chat/command-buttons.html -->
<div class="command-buttons" role="toolbar" aria-label="Assistant commands">
  <button @click="runCommand('image')" title="Generate image" data-testid="btn-image">🎨</button>
  <button @click="runCommand('sfx')" title="Generate sound effect" data-testid="btn-sfx">🔊</button>
  <button @click="runCommand('music')" title="Generate or link music" data-testid="btn-music">🎵</button>
  <button @click="runCommand('improve')" title="Improve last message" data-testid="btn-improve">✨</button>
  <button @click="runCommand('roll')" title="Roll dice" data-testid="btn-roll">🎲</button>
</div>
```

### Frontend Integration

```typescript
// src/frontend/alpine/command-buttons.ts
export function useCommandButtons() {
  return {
    runCommand(cmd: string,) {
      const input = document.querySelector<HTMLTextAreaElement>("#message-input",);
      if (input) {
        input.value = `/${cmd} `;
        input.focus();
        // Trigger input event for Alpine reactivity
        input.dispatchEvent(new Event("input", { bubbles: true, },),);
      }
    },
  };
}
```

## Assistant Mode: Entity Creation & Review

### Toolset for Creating Characters, Locations, Worlds

| Command         | Description                         | Epic(s) |
| --------------- | ----------------------------------- | ------- |
| `/create char`  | Create a character from description | 22, 42  |
| `/create loc`   | Create a location from description  | 38, 44  |
| `/create world` | Create a world from description     | 31, 44  |
| `/create item`  | Create an item from description     | 39, 42  |

```typescript
// src/assistant/commands/create.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("create", async (args, ctx,): Promise<CommandResult> => {
  const entityType = args[0]?.toLowerCase();
  const description = args.slice(1,).join(" ",).trim();

  if (!entityType || !description) {
    return {
      systemMessage: "Usage: /create <char|loc|world|item> <description>",
      handled: true,
    };
  }

  // TODO: Call generation pipeline with entity-specific prompt
  // TODO: Store result in appropriate table (actors, locations, worlds, items)
  return {
    systemMessage: `**Created ${entityType}:** ${description}`,
    handled: true,
  };
},);
```

### Review of Already Input Information

Complementary to `/improve` — reviews existing character/world/location data for completeness and consistency.

```typescript
// src/assistant/commands/review.ts
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("review", async (args, ctx,): Promise<CommandResult> => {
  const target = args[0] || "character";
  // TODO: Fetch existing entity data
  // TODO: Run consistency checks, identify missing fields
  // TODO: Suggest improvements
  return {
    systemMessage: `**Review complete for ${target}** — no issues found.`,
    handled: true,
  };
},);
```

### Improve Important Note — Result Storage Concern

The `/improve` command currently returns a system message but does not store the improved result. For important notes, the improved output should be stored as a character memory or world lore entry.

```typescript
// Enhancement: store improved result
registerCommand("improve", async (args, ctx,): Promise<CommandResult> => {
  const text = args.join(" ",).trim();
  if (!text) { return { systemMessage: "Usage: /improve <text>", handled: true, }; }

  const improved = improveText(text,);
  // TODO: Store improved text as memory/lore if ctx.db available
  // await ctx.db.insertInto("actor_memories").values({...}).execute();

  return {
    systemMessage: `**Improved:**\n\n${improved}`,
    handled: true,
  };
},);
```

## Story Mode Commands (Solo & Group)

### Inventory Management

| Command      | Description                      | Epic(s) |
| ------------ | -------------------------------- | ------- |
| `/inventory` | List character/world inventory   | 22, 39  |
| `/take`      | Take an item from location/world | 22, 39  |
| `/drop`      | Drop an item                     | 22, 39  |
| `/equip`     | Equip an item                    | 22, 39  |
| `/use`       | Use an item                      | 22, 39  |

### Trade System

| Command  | Description                       | Epic(s) |
| -------- | --------------------------------- | ------- |
| `/trade` | Initiate trade with another actor | 22, 39  |
| `/shop`  | Browse shop inventory             | 22, 39  |
| `/buy`   | Buy an item from shop             | 22, 39  |
| `/sell`  | Sell an item to shop              | 22, 39  |

### Navigation

| Command   | Description                    | Epic(s) |
| --------- | ------------------------------ | ------- |
| `/go`     | Move to a location             | 22, 38  |
| `/travel` | Travel between world locations | 22, 38  |
| `/map`    | Show current location map      | 22, 38  |
| `/where`  | Show current location info     | 22, 38  |

## Help & Support Commands

### `/help` Command (Existing)

```typescript
// src/assistant/commands/help.ts
import { listCommands, registerCommand, } from "./registry";

registerCommand("help", () => {
  const cmds = listCommands();
  const lines = [
    "**Available Commands:**",
    "",
    ...cmds.map((cmd,) => `- /${cmd}`),
    "",
    "Use `/help <command>` for details on a specific command.",
  ];
  return { systemMessage: lines.join("\n",), handled: true, };
},);
```

### Additional Support Commands

| Command     | Description                            | Epic(s) |
| ----------- | -------------------------------------- | ------- |
| `/stats`    | Show chat/character statistics         | 22, 36  |
| `/clear`    | Clear chat history (with confirmation) | 36      |
| `/settings` | Show chat/world settings               | 11, 36  |
| `/time`     | Show current world time/date           | 31, 38  |
| `/weather`  | Show current weather at location       | 38, 92  |
| `/who`      | List participants in chat              | 36      |
| `/rules`    | Show world rules for current context   | 22, 38  |

## Content Creation Concerns

### Additional Functionality for Content Creation

| Command      | Description                                | Epic(s) |
| ------------ | ------------------------------------------ | ------- |
| `/describe`  | Generate description for existing entity   | 42, 44  |
| `/expand`    | Expand short description into full content | 42, 44  |
| `/rewrite`   | Rewrite content in different style/tone    | 42, 44  |
| `/summarize` | Summarize long content (alias exists)      | 22, 42  |
| `/extract`   | Extract structured data from text          | 42, 44  |
| `/validate`  | Validate entity data against schema        | 22, 34  |
| `/export`    | Export entity as character card/JSON       | 14, 42  |

### Content Creation Pipeline

```
User prompt → Intent detection → Entity type routing → Generation pipeline → Quality check → Schema validation → Storage
```

### Quality Gates for Generated Content

| Gate              | Check                  | Action               |
| ----------------- | ---------------------- | -------------------- |
| Schema validation | Valid data structure   | Reject if invalid    |
| Consistency check | Matches world/setting  | Warn if inconsistent |
| Duplicate check   | No existing duplicates | Warn if duplicate    |
| User confirmation | Explicit approval      | Require approval     |
| Content safety    | No prohibited content  | Filter/block         |

### Storage Concerns

- Generated content must be stored in appropriate tables (actors, locations, worlds, items)
- Important notes from `/improve` should be stored as memories or lore entries
- Generated assets (images, audio) linked via asset system
- Version tracking for regenerated content
- Ownership tracking (who generated what)

## Linked Tasks

- TASK-assistant-generation-extensions.md
