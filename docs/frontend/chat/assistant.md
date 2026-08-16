<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Chat: Assistant (GM / Moderator)

> **Implementation status:** The assistant today is a **global rule-based responder**
> (`src/assistant/service.ts`, gated by `config.assistant.enabled`) that replies to every
> user message only when no LLM provider is configured. The per-chat assistant entity
> described below is **designed but not yet implemented**. The "assistant as GM" concept
> was discussed but never put in place.

## Overview

The assistant is a **first-class, per-chat configurable entity** — not merely a background
agent. Each chat may include zero or one assistant, configured at creation or added later
via participants. The assistant takes one of three roles:

| Role                           | Description                                                                                               | Influence over chat                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Pure Assistant**             | Helps the user: edits text, generates images, suggests ideas, troubleshoots.                              | None by default; acts only on explicit user request.            |
| **Game Master (GM)**           | Orchestrates the session: turn order, response evaluation, quest/world state, rule enforcement.           | Configurable — see permission tiers below.                      |
| **Moderator**                  | Enforces site policies: detects prohibited content and applies moderation actions.                        | Read + moderation actions (hide/flag); no narrative authorship. |
| **Agent (Business / Agentic)** | In `chat.mode = 'agentic'`, operates as an Agent Runtime: document management, deep research, web search. | Tool execution within sandbox; no narrative authorship.         |

These roles are **orthogonal** to the conversation participants. The assistant is added as a
chat participant (an assistant actor) or a chat-level config, and is distinct from
character/narrator actors.

## Assistant Roles in Detail

### Pure Assistant

- Operates on explicit user invocation (slash command, toolbar action, or `@assistant`).
- Capabilities: text editing, image generation, summarization, lore lookup, brainstorming.
- Does not post unsolicited messages and does not drive the story.

### Game Master (GM)

The GM is the assistant acting as session orchestrator. It may be:

- **LLM GM** — an LLM performs turn selection, quality evaluation, regeneration, and
  quest/world-state management.
- **Human GM** — a human user with GM powers (the chat master or a delegated user).
- **Hybrid** — LLM handles routine orchestration, escalates to a human GM on
  low-confidence decisions.

**Permission tiers (key design point):** a GM may be created **with or without permission
to influence the chat**. This was a deliberate decision — an operator should be able to run a
"watchdog" GM that only suggests, or a full GM that actively drives the story.

| Tier               | Selects turns / sets prompts | Writes / modifies messages | Edits world / quest state | Manages participants |
| ------------------ | ---------------------------- | -------------------------- | ------------------------- | -------------------- |
| **Observer GM**    | Yes (advisory)               | No                         | No                        | No                   |
| **Influencing GM** | Yes                          | Yes                        | Yes                       | Yes (configurable)   |

Permissions are stored per chat — on the assistant participant entry or in
`chats.gm_config` (column already exists: `src/db/schema-core.ts:75`).

#### RPG State Management

In RPG/story chats, an **Influencing GM** manages participant state on behalf of the game:

- **Stats** — character/actor attributes and derived values (see
  `docs/spec/rpg-mechanics.md`).
- **Levels / XP** — progression tracked per participant; the GM grants and records
  advancement.
- **Inventory** — items a participant possesses, backed by the existing `actor_items` /
  `story_items` tables and their routes (`src/routes/actor-items.ts`,
  `src/routes/story-items.ts`).
- **World & NPC state** — dynamic state in `story_states` / `npc_states`, mutated by story
  events.

These are GM-authored — the assistant writes them through its `influence` permissions, not
via free-form generation — so narrative and mechanics stay consistent. The rule-based / LLM
GM reads and updates them each turn.

### Moderator

- Uses an LLM (or the existing rule-based `src/profanity/` filter as a fallback) to detect
  content that violates site policies.
- On detection can: flag the message, hide it (`messages.visibility = hidden_by_moderator`),
  or notify admins.
- Operates silently in the background and does not author narrative content.
- A natural fit for the assistant entity, because it already has read access to all messages
  and a per-chat presence. This is the intended approach to implementing site-policy
  moderation via an LLM.

### Agent (Business / Agentic Mode)

When the chat is in `mode = 'agentic'` (see `docs/spec/use-case-agentic-workspace.md`),
the assistant operates as an **Agent Runtime** rather than a conversational helper. It gains
tool access for practical work:

- **Document management** — create, edit, convert, and organize documents/artifacts (code,
  reports, datasets) linked polymorphically via `assets`.
- **Deep research** — multi-step web research with citations, synthesized into a report.
- **Web search integration** — live retrieval grounded in sources.

In this mode the RPG "character" becomes an **agent** (researcher, coder, analyst, writer,
planner) and the chat becomes a **workspace**. The assistant is the orchestration/runtime
layer shared by both modes.

## Shared Functionality (RPG ↔ Business)

Both RPG and Business modes are the same application under different `chat.mode` values, and
they share a core set of assistant capabilities that cut across roleplay and agentic work:

- **Generation intent** — text, image, and video generation are requested through a common
  intent layer; the assistant resolves the right model/tool and streams the result.
- **Command execution & manual dumps** — run commands, accept pasted/manual dumps (logs,
  data, transcripts), and analyze them in place.
- **Analysis** — summarize, extract structured data, compare, and reason over content (chat
  history, documents, assets) regardless of domain.
- **Creative & instructive execution + text generation** — the same generation pipeline
  serves both immersive storytelling (creative) and instruction-following/agentic tasks
  (instructive).
- **Memory** — episodic / semantic / procedural memory feeds both roleplay continuity and
  agentic context.
- **Assets / artifacts** — polymorphic asset linking underpins both gallery images and
  generated documents/code.
- **Moderation & safety** — the Moderator role applies equally to RPG and Business chats.

See `docs/spec/use-case-agentic-workspace.md` ("Relationship to Existing Features") for the
full RPG ↔ Agentic entity mapping.

## Configuration (proposed)

Per-chat assistant config:

- `role`: `assistant` | `gm` | `moderator`
- `gmPermissions`: `observe` | `influence` (GM only)
- `enabled`: on/off toggle per chat
- Bound to the chat via `chat_participants` (an assistant actor) or a dedicated
  `chats.assistant_config` column.

## Relationship to Existing Code

- `src/assistant/service.ts` — current global rule-based responder (interim). Will be
  superseded/extended by the per-chat assistant.
- `src/story/game-master.ts` — GM logic target for the LLM GM role.
- `src/profanity/` — fallback moderation filter for the Moderator role.
- `src/db/schema-core.ts` `chats.gm_config` — existing column for GM configuration.

## See Also

- [group-chat.md](./group-chat.md) — talkativity and multi-participant turn order the GM
  orchestrates.
- [multi-llm-story.md](./multi-llm-story.md) — full multi-LLM story + GM orchestration spec.
- [overview.md](./overview.md) — chat types and chat-master permissions.
