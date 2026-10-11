<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Group Chat

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** `src/group-chat/` ships `mention-parser.ts`, `turn-selector.ts`, and `index.ts`; the `[PASS]` filter lives in `src/generation/auto-gen/pass-filter.ts` and the cascade in `src/generation/auto-gen/group-cascade.ts`. Mention routing and turn orchestration are Done (talkativity surfaced via the group-talkativity prompt section, silence-pass via `detectPassToken` + `filterPassedActors`, context-mention boost in `turn-selector.ts`). Open: group-chat frontend viewer (ticketed).
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** group-chat, multi-character, mention, turn-orchestration, talkativity

## Overview

Group chat lets multiple characters participate in one conversation. The runtime
pieces (`mention-parser.ts`, `turn-selector.ts`) are implemented but were never
owned by a feature epic — only bug tickets existed. This epic consolidates the
feature surface and closes the open defects.

## Scope

In scope:

- @mention parsing and routing to the correct actor (prefix-collision safe)
- Turn orchestration: talkativity weighting, silence-pass, context-mention boost
- Pause/resume of auto-generation
- Group-chat frontend viewer (mention UI, turn indicators) — tracked under frontend epics

Out of scope:

- World/channel invites (covered by `epic-world-chat-channels-invites.md`)
- Lifecycle/moderation transitions (covered by `epic-chat-lifecycle-moderation.md`)

## Task List

| Ticket | Type | Status |
| --- | --- | --- |
| TASK-group-chat-mention-routing | TASK | Done — `src/group-chat/mention-parser.ts` |
| TASK-group-chat-turn-orchestration | TASK | Done — talkativity prompt section, silence-pass filtering, context-mention boost all verified in `src/group-chat/turn-selector.ts` |
| TASK-group-chat-frontend-viewer | TASK | Not Started — mention UI + turn indicators |
| BUG-group-chat-mention-prefix-collision | BUG | Done — ambiguous prefix returns null, disambiguation prompt |
| BUG-group-chat-talkativity-not-surfaced-in-prompt | BUG | Done — group-talkativity prompt section |
| BUG-group-chat-silence-pass-not-implemented | BUG | Done — `detectPassToken` (`src/group-chat/mention-parser.ts`) + `filterPassedActors` (`src/generation/auto-gen/pass-filter.ts`) |
| BUG-group-cascade-max-turns-off-by-one | BUG | Done |

## Current State

| Piece | Status | Where |
| --- | --- | --- |
| Mention parsing (prefix-collision safe) | Shipped | `src/group-chat/mention-parser.ts` |
| `[PASS]` opt-out token | Shipped | `src/group-chat/mention-parser.ts` (`detectPassToken`) |
| Pass filtering in the cascade | Shipped | `src/generation/auto-gen/pass-filter.ts` (`filterPassedActors`) |
| Turn selection (talkativity weighting) | Shipped | `src/group-chat/turn-selector.ts` |
| Cascade orchestration | Shipped | `src/generation/auto-gen/group-cascade.ts` |
| Turn orchestration ticket closure | Done | `TASK-group-chat-turn-orchestration.md` |
| Frontend viewer (mention UI, turn indicators) | Not Started | `TASK-group-chat-frontend-viewer.md` |

## Integration Points

| System | Relationship |
| --- | --- |
| `epic-world-chat-channels-invites.md` | Group membership inside a world/channel; invites and channel routing are owned there |
| `epic-chat-lifecycle-moderation.md` | Pause/resume and auto-generation lifecycle transitions |
| `epic-impersonation.md` | User-vs-actor turn attribution inside a multi-actor conversation |

## Dependencies

- `src/generation/auto-gen/group-cascade.ts` — the orchestration entry point
- `src/group-chat/` — mention parsing and turn selection

## Related Epics

- `epic-world-chat-channels-invites.md` — world/channel invites (out of scope here)
- `epic-chat-lifecycle-moderation.md` — lifecycle/moderation (out of scope here)
- `epic-impersonation.md` — turn attribution when a user speaks as an actor
- `epic-frontend-chat-commands.md` — frontend command surface

## Unticketed Gaps

None — the frontend group-chat viewer is ticketed as `TASK-group-chat-frontend-viewer.md`.

## Linked Tasks

- `TASK-group-chat-mention-routing.md` (Done)
- `TASK-group-chat-turn-orchestration.md` (Done)
- `TASK-group-chat-frontend-viewer.md` (Not Started)
- `BUG-group-chat-mention-prefix-collision.md` (Done)
- `BUG-group-chat-talkativity-not-surfaced-in-prompt.md` (Done)
- `BUG-group-chat-silence-pass-not-implemented.md` (Done)
- `BUG-group-cascade-max-turns-off-by-one.md` (Done)
