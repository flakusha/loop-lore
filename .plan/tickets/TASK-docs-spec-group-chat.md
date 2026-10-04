<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Docs spec — group-chat

**Summary:** Author `docs/spec/group-chat.md` as a shipped-vs-open spec grounded in `src/`.
**Context:** The group-chat runtime exists (`src/group-chat/`) but was never captured as a first-class epic (`epic-group-chat.md`); the lifecycle spec boundary pointer dangles here; harness IRC builds on group-chat turn selection.
**Acceptance Criteria:** (see below)

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-docs-reconciliation

## Scope

Write `docs/spec/group-chat.md` with an explicit shipped-vs-open split. Verify every shipped claim against `src/group-chat/mention-parser.ts` (regex extraction, prefix-match resolution via `resolveMention`), `src/group-chat/turn-selector.ts` (`selectNextGroupActor`: @mention override, skip-cooldown parity, mute exclusion), `src/group-chat/index.ts` barrel, and `src/turning/turn-strategies.ts` (`hybridSelect` group-mode mention override + context-mention boost). Out of scope stays out: world/channel invites (`epic-world-chat-channels-invites`) and lifecycle/moderation transitions (`epic-chat-lifecycle-moderation`) — the spec must include a boundary pointer section naming those owners. Note that harness IRC builds on this turn-selection surface.

## Acceptance Criteria

- [ ] `docs/spec/group-chat.md` exists with `## Shipped` / `## Open` sections; every shipped bullet cites a verified `src/` path above (no invented behavior)
- [ ] Shipped section covers: `parseMentions`/`extractMentionedActorIds`/`resolveMention` semantics, `selectNextGroupActor` gates (mention override, cooldown, mute), `hybridSelect` group-mode behavior in `src/turning/turn-strategies.ts`
- [ ] Boundary pointer section names `epic-world-chat-channels-invites` and `epic-chat-lifecycle-moderation` as owners of out-of-scope surfaces, plus the harness IRC dependency
- [ ] Open section tracks `TASK-group-chat-mention-routing` and `TASK-group-chat-turn-orchestration` (both Not Started per `epic-group-chat.md`)
- [ ] Spec wired into `docs/.vitepress/config.mts` sidebar (no dead link)

## Linked Epics

- `epic-group-chat.md`
- `epic-docs-reconciliation.md`
- `epic-chat-lifecycle-moderation.md` (boundary owner)


git issue: 05b8b7b
