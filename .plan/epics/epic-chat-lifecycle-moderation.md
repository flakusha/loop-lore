<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Chat Lifecycle, Transitions & Moderation

**Status:** 🟡 Core Complete — lifecycle/context/transitions shipped (chat-lifecycle merge `cd833142` + moderation hardening `658f5469`); discovery + moderation remainder open (see task list)
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** chat, lifecycle, transitions, moderation, bans, reconciliation, context

## Overview

Covers the full chat lifecycle beyond raw message exchange: context management
(sliding window, related memories, events), chat transitions (location changes,
context cuts with memory promotion), reconciliation guards (LLM loop / hallucination
protections), and the moderation / self-moderation surface (NSFW toggles, user
blocks / bans, shadowing / collapsing of undesired messages, internal + external
flagging).

This epic does NOT cover group-chat turn orchestration (see social-interaction /
group-chat specs) or location generation mechanics (see world-locations epic) — it
focuses on lifecycle, safety, and context continuity.

## Moderation Wiring — Current State (2026-08-01 review)

Moderation infrastructure (DB services, flags, actions, NSFW gates) is solid;
**LLM moderation wiring is absent**:

| Component              | Status                                                                                                         | Location                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Moderation data model  | ✅ prefs, `moderation_actions`, `content_flags`, audit trail                                                   | `src/nsfw/moderation-service.ts`           |
| NSFW gate hook         | ✅ keyword-level detection + `recordAudit` + policy gating                                                     | `src/generation/hooks/nsfw-hook.ts`        |
| Moderation hook        | ⚠️ keyword-only (9 words), **no LLM**                                                                           | `src/generation/hooks/moderation-hook.ts`  |
| `ModelRole.Moderation` | 🔴 **dead role** — admin-configurable, never resolved                                                          | `src/admin/model-roles.ts:21`              |
| `ModelRole.Captioning` | 🔴 **dead role** — `caption-route.ts` resolves MAIN role                                                       | `src/generation/caption-route.ts:49`       |
| Suppression semantics  | 🔴 substring match (`"hate"` ⊂ `"hateful"`) → **entire response dropped**, no severity, no audit, no retention | `moderation-hook.ts:44`, `auto-gen.ts:431` |

### Moderation Action Items

1. **Wire or kill `ModelRole.Moderation`** (epic M1/M3): point the
   ModerationHook's content scan at the moderation role when configured
   (LLM hate/harassment classification with severity), else keep keyword
   fast-path. If no consumer lands, remove from `VALID_ROLES` + admin UI to
   stop surfacing a role that does nothing.
2. **Non-destructive suppression**: on flag, store the message with a
   `moderation_flag` status instead of discarding; write `recordAction` audit
   (parity with `nsfw-hook.ts`); suppress only presentation.
3. **Tokenized matching**: replace `includes()` substring checks with
   word-boundary matching; add severity scoring (severe/moderate → numeric).
4. **Captioning role**: `caption-route.ts` should resolve `captioning` role
   when configured, fall back to main.
5. **Telemetry**: record gate decisions (event type, level, allow/block,
   source) — current `recordAction` covers NSFW but not moderation flags.

## Chat Management

### Context Sliding Window

| Concern             | Description                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| Sliding window      | Trim old context to fit token budget; promote important turns to memory  |
| Related memories    | Inject character / world / assistant memories relevant to active context |
| Related events      | Surface active world/local events that should bias generation            |
| Local random events | Inject low-stakes stochastic events to keep chats alive                  |

```typescript
interface ContextWindow {
  max_tokens: number;
  retained: MessageRef[];
  promoted_to_memory: MessageRef[];
  injected_memories: MemoryRef[];
  injected_events: EventRef[];
}
```

### Chat Transitions

| Transition                  | Trigger                          | Side effects                                      |
| --------------------------- | -------------------------------- | ------------------------------------------------- |
| Message with description    | User/LLM narrates a scene change | Append transitional system message                |
| Context cut                 | Window overflow or explicit cut  | Promote retained context to memory                |
| Dynamic location generation | Movement into undefined space    | Generate location on demand (see world-locations) |

```typescript
interface ChatTransition {
  type: "description" | "context_cut" | "location_change";
  actor: ActorRef;
  narration?: string;
  promoted_memory_ids: string[];
  new_location_id?: string;
}
```

## Chat Reconciliations

### Loop / Hallucination Protection

| Guard                     | Mechanism                                                   |
| ------------------------- | ----------------------------------------------------------- |
| Repetition detection      | Flag n-gram loops in generation (see generation/repetition) |
| Hallucinated entity guard | Validate referenced entities exist in world state           |
| Consistency check         | Compare new claims against established facts                |

### NSFW Control

| Control                  | Scope                                   |
| ------------------------ | --------------------------------------- |
| Disablement / enablement | Per-chat, per-user, per-world toggle    |
| Moderation events        | Non-public audit of NSFW gate decisions |

### Moderation & Self-Moderation

| Capability             | Description                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Block users            | Prevent a user from contacting / chatting the blocker                              |
| Bans                   | Admin-level removal of participation                                               |
| Shadowing / collapsing | Undesired messages hidden or collapsed for other viewers (chat / blogs / comments) |
| Flagging               | Internal (mod queue) + external (reported) flag pathways                           |

```typescript
interface ModerationAction {
  type: "block" | "ban" | "shadow" | "collapse" | "flag";
  target_actor: ActorRef;
  scope: "chat" | "blog" | "comment" | "global";
  actor: ActorRef; // who applied
  reason?: string;
  internal: boolean; // true = mod queue, false = external report
}
```

## Tasks

### Core Context & Memory (High Priority)

- [x] Context sliding-window + memory-promotion → TASK-context-cut-memory-promotion
- [x] Related-memory / related-event injection hooks → TASK-related-memory-event-injection-hooks
- [x] Local random-event generator → TASK-local-random-event-generator
- [x] Repetition + hallucination guards → TASK-repetition-hallucination-guards
- [x] Context window monitor → TASK-context-window-monitor (✅ done)
- [x] Smart context pruning → TASK-smart-context-pruning (✅ done)
- [x] Memory promotion pipeline → TASK-memory-promotion-pipeline
- [x] Memory decay logic → TASK-memory-decay-logic
- [x] Memory provision wiring → TASK-memory-provision-wiring
- [x] Memory trust modifier wiring → TASK-memory-trust-modifier-wiring
- [x] Chat route extraction → TASK-chat-route-extraction
- [x] Character memory injection → TASK-character-memory-injection
- [x] Context feature permissions → TASK-chat-context-feature-permissions
- [x] Chat autorenaming → TASK-chat-autorenaming (✅ done)

### Chat Discovery (Medium Priority)

- [x] Chat room search & join → TASK-chat-room-search-join (✅ done)
- [ ] Chat room filters → TASK-chat-room-filters (🟡 partial — frontend `chat-filters.ts` shipped; server-side filter API pending)
- [x] Chat message search → TASK-chat-message-search (✅ done — FTS5 migration 034 + `routes/message-search/` + `alpine/message-search.ts` wired)
- [ ] Chat external music linking → TASK-chat-external-music-linking (⬜ not started)

### Moderation (Low Priority — Postpone)

- [ ] NSFW enable/disable + mod events → TASK-nsfw-gate-moderation-events
- [ ] User block / ban / shadow → TASK-user-block-ban-shadow
- [ ] Internal + external flagging → TASK-internal-external-flagging
- [ ] Moderation privacy foundation → TASK-moderation-privacy-first-foundation
- [ ] AI Dungeon moderation lesson → TASK-ai-dungeon-moderation-lesson

## Files

- `src/chat/context-window.ts` — sliding window + promotion
- `src/chat/context-stats.ts` — lightweight stats for API responses
- `src/chat/pruning/` — score-based pruning pipeline (prune, score, constants)
- `src/chat/random-events.ts` — ambient random event generator
- `src/chat/transitions.ts` — transition handling
- `src/generation/auto-gen/context-pruning.ts` — pruning integration in generation pipeline
- `src/generation/auto-gen/post-store.ts` — random event injection after message storage
- `src/generation/repetition.ts` — loop detection (existing)
- `src/chat/moderation.ts` — blocks, bans, shadowing, flags
- `src/middleware/nsfw-gate/` — NSFW toggle enforcement (barrel: `access.ts`, `consent.ts`, `logging.ts`, `constants.ts`)
- `src/db/schema.ts` — moderation_action, block, flag tables
- `src/components/chat/chat-header.html` — context window monitor widget
- `src/frontend/alpine/context-window.ts` — Alpine.js context monitor component
- `src/public/css/app.css` — context bar styles (green/yellow/orange/red)

## Linked Tasks

- TASK-chat-lifecycle-moderation.md
- TASK-gm-whitenotes.md
- TASK-gm-shadow-notes.md

---

## Merged from `.plan/epics/epic-chat-lifecycle-moderation.md`

# Chat Mode Reconciliation

**Status:** Design
**Created:** 2026-07-28
**Gap:** Three orthogonal axes (participant structure, behavioral mode, response style) conflated into one field

## Problem

The chat settings system has **three separate concepts** all fighting for the same `mode` field:

### Axis 1: Participant Structure (who's in the chat)

- `ChatType` enum already exists: `"direct"` | `"group"`
- This is correctly implemented and used

### Axis 2: Behavioral/Orchestration Mode (how the chat behaves)

- `ChatMode` enum exists but is corrupted: `"direct"` | `"group"` | `"story"`
- `"direct"` and `"group"` are **ChatType values leaking into ChatMode** — they don't belong here
- `"story"` is the only real behavioral mode
- Worlds-extension epic proposes: `"normal"` | `"battle"` | `"question"` | `"inventory"`
- These are **orthogonal to ChatType** — a direct chat CAN be in battle mode

### Axis 3: Response Style (how the LLM generates)

- overview.md calls them: Short / Default / Detailed
- TASK-response-length-control calls them: Short / Medium / Long / Custom
- Same feature, different naming, not implemented

### The Live Bug

`chat-settings-modal.html` offers `<option value="chat">` and `<option value="roleplay">` — **neither is a valid DB value**. The frontend sends `"chat"` or `"roleplay"` as `mode`, but the backend expects `"direct"`, `"group"`, or `"story"`. This is a silent data corruption bug.

## Reconciliation Design

### Three Separate Fields

```typescript
// Axis 1: Participant structure (already correct in DB)
type ChatType = "direct" | "group";

// Axis 2: Behavioral/orchestration mode (fix ChatMode)
type ChatMode = "story" | "battle" | "question" | "inventory";

// Axis 3: Response style (new field)
type ResponseStyle = "short" | "default" | "detailed" | "custom";
```

### Why This Separation

| Chat                      | ChatType | ChatMode    | ResponseStyle | Example                                         |
| ------------------------- | -------- | ----------- | ------------- | ----------------------------------------------- |
| 1:1 literary RP           | `direct` | `story`     | `detailed`    | Long literary exchanges with a single character |
| Quick DM combat           | `direct` | `battle`    | `short`       | Fast attack/defend with GM                      |
| Party dungeon crawl       | `group`  | `battle`    | `short`       | Quick tactical combat with party                |
| Group quest planning      | `group`  | `question`  | `default`     | Normal conversation with party                  |
| Solo inventory management | `direct` | `inventory` | `default`     | Browsing items, crafting                        |

### DB Migration

Extend `chats` table with one new column:

```sql
ALTER TABLE chats ADD COLUMN response_style TEXT DEFAULT 'default'
  CHECK (response_style IN ('short', 'default', 'detailed', 'custom'));
ALTER TABLE chats ADD COLUMN response_style_custom INTEGER DEFAULT NULL;
```

### ChatMode Enum Fix

```typescript
// BEFORE (broken)
export const ChatMode = {
  Direct: "direct", // ← belongs in ChatType
  Group: "group", // ← belongs in ChatType
  Story: "story",
} as const;

// AFTER (correct)
export const ChatMode = {
  Story: "story",
  Battle: "battle",
  Question: "question",
  Inventory: "inventory",
} as const;
```

**Migration note:** Any existing chats with `mode = 'direct'` or `mode = 'group'` should be migrated to `mode = 'story'` (the default behavioral mode). The `type` field already captures participant structure.

### UI Changes

#### Chat Settings Modal

Replace the single mode selector with three independent controls:

```html
<!-- Axis 1: Chat Type (read-only, set at creation) -->
<div class="form-group">
  <label class="form-label">Chat Type</label>
  <span x-text="currentChat?.type === 'group' ? 'Group' : 'Direct'" class="badge"></span>
  <small>Set when chat is created</small>
</div>

<!-- Axis 2: Behavioral Mode -->
<div class="form-group">
  <label class="form-label" for="settings-chat-mode">Mode</label>
  <select class="form-input" id="settings-chat-mode" x-model="_chatSettingsMode">
    <option value="story">Story (standard RP)</option>
    <option value="battle">Battle (fast tactical)</option>
    <option value="question">Question (Q&A focused)</option>
    <option value="inventory">Inventory (item management)</option>
  </select>
</div>

<!-- Axis 3: Response Style -->
<div class="form-group">
  <label class="form-label" for="settings-response-style">Response Style</label>
  <select class="form-input" id="settings-response-style" x-model="_responseStyle">
    <option value="short">Short (1-2 paragraphs)</option>
    <option value="default">Default (balanced)</option>
    <option value="detailed">Detailed (long-form)</option>
    <option value="custom">Custom</option>
  </select>
  <div x-show="_responseStyle === 'custom'" class="form-group">
    <label>Custom length: <span x-text="_responseStyleCustom"></span> tokens</label>
    <input type="range" min="50" max="2000" step="50" x-model.number="_responseStyleCustom" />
  </div>
</div>
```

### Prompt Assembly Integration

The `response_style` maps to generation instructions:

```typescript
const RESPONSE_STYLE_INSTRUCTIONS: Record<ResponseStyle, string> = {
  short: "Keep responses to 1-2 paragraphs. Focus on action and dialogue. Minimize description.",
  default: "Write balanced responses mixing description and dialogue. 1-5 paragraphs.",
  detailed: "Write rich, detailed responses with deep character immersion. Long-form narration.",
  custom: "", // Uses max_tokens from response_style_custom
};
```

These get appended to the system prompt, separate from ChatMode instructions.

### ChatMode Prompt Integration

Each mode adds behavioral instructions:

```typescript
const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  story: "", // Default — no special instructions
  battle:
    "This is a combat encounter. Keep descriptions tight. Prioritize action sequences. Use initiative-based turn order.",
  question: "This is a Q&A focused chat. Answer questions directly. Minimize narrative filler.",
  inventory: "This is an inventory/item management session. Describe items clearly. Focus on stats and effects.",
};
```

## Files to Modify

### Critical (Live Bug Fix)

- `src/db/enums-core.ts` — Fix ChatMode enum (remove "direct"/"group", add "battle"/"question"/"inventory")
- `src/components/chat/chat-settings-modal.html` — Fix mode options, add response style selector
- `src/frontend/alpine/chat-settings.ts` — Fix default mode, add response style state

### Schema

- `src/db/migrations/008_chat_features.ts` — Add `response_style` and `response_style_custom` columns (in-place)
- `src/db/schema-core.ts` — Add columns to chats table type
- `src/validation/schemas.ts` — Update ChatModeSchema, add ResponseStyleSchema

### Generation

- `src/assistant/prompt-assembler.ts` — Inject mode + style instructions into system prompt
- `src/generation/auto-gen.ts` — Pass resolved max_tokens from response_style_custom

### Documentation

- `docs/frontend/chat/overview.md` — Update Generation Style Presets section (use "response style" terminology)
- `docs/frontend/chat/group-chat.md` — Update mode descriptions
- `.plan/tickets/TASK-response-length-control.md` — Mark as superseded by this design

### Cleanup

- `.plan/epics/epic-worlds-extension.md` — Update ChatMode references to match new enum
- `.plan/tickets/TASK-response-length-control.md` — Superseded, point to this design

## Migration Strategy

1. **Phase 1: Fix the bug** — Update ChatMode enum, fix UI options, add migration for existing data
2. **Phase 2: Add response style** — New column, UI selector, prompt integration
3. **Phase 3: Wire modes** — Battle/question/inventory mode instructions in prompt assembler

## Open Questions

1. **Should ChatMode be per-chat or per-message?** — Current design is per-chat (changes affect future messages). Could be per-message for battle mode that only lasts one exchange.

2. **Mode transitions** — Can a chat switch from `story` to `battle` mid-conversation? Yes — the mode affects generation, not state. Switching is safe.

3. **Response style vs max_tokens** — Should `custom` style use `response_style_custom` as max_tokens, or should it be a multiplier? Recommendation: direct max_tokens for simplicity.
