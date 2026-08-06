# EPIC: Chat Lifecycle, Transitions & Moderation

**Status:** ✅ Complete (chat-lifecycle merge `cd833142` + moderation hardening `658f5469`)
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
- [ ] Chat room filters → TASK-chat-room-filters
- [ ] Chat message search → TASK-chat-message-search
- [ ] Chat external music linking → TASK-chat-external-music-linking

### Moderation (Low Priority — Postpone)

- [ ] NSFW enable/disable + mod events → TASK-nsfw-gate-moderation-events
- [ ] User block / ban / shadow → TASK-user-block-ban-shadow
- [ ] Internal + external flagging → TASK-internal-external-flagging
- [ ] Moderation privacy foundation → TASK-moderation-privacy-first-foundation
- [ ] AI Dungeon moderation lesson → TASK-ai-dungeon-moderation-lesson

## Files

- `src/chat/context-window.ts` — sliding window + promotion
- `src/chat/transitions.ts` — transition handling
- `src/generation/repetition.ts` — loop detection (existing)
- `src/chat/moderation.ts` — blocks, bans, shadowing, flags
- `src/middleware/nsfw-gate.ts` — NSFW toggle enforcement
- `src/db/schema.ts` — moderation_action, block, flag tables

## Linked Tasks

- TASK-chat-lifecycle-moderation.md
- TASK-gm-whitenotes.md
- TASK-gm-shadow-notes.md
