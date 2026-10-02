<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant-GM handoff

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-assistant-gm-flows
**Summary:** The story-triggered creation-chat handoff that reroutes in-story entity generation into a private guided chat. (The message-routing half — `routeAssistantMessage` precedence — already shipped under `TASK-gm-chat-assistant-gm-handoff-via-intent-to-workflow-routing.md`; this ticket covers ONLY the creation-chat handoff.)
**Context:** The handoff lives in `src/assistant/entity-spec/handoff.ts` (`handoffToEntityCreationChat`), served by `src/routes/chats/generate-entity.ts`. This ticket pins the handoff contract so entity generation stays private, seeded, and user-gated.
**Depends on:** `TASK-gm-chat-assistant-gm-handoff-via-intent-to-workflow-routing.md` (shipped routing rule)
**Related:** `FEAT-in-story-character-generation-via-assistant-chat-handoff.md` (Not Started hub for the full in-story generation flow)
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** `f4fd21e`

## Scope

- `src/assistant/entity-spec/handoff.ts` — `handoffToEntityCreationChat`
- `src/routes/chats/generate-entity.ts` — handoff endpoint (validation + access gate)

## Acceptance Criteria

- [ ] Handoff creates a private requester-owned creation chat seeded with story context and starts its workflow session (memory + DB write-through)
- [ ] Unknown kind and unloaded workflow template return error codes (`unknown_kind` / `unknown_workflow`), never throw
- [ ] Tests cover: handoff chat seeding + session start, both error codes
- [ ] `bun run check` green.

## Related Files

- `src/assistant/entity-spec/handoff.ts` — creation-chat handoff
- `src/assistant/entity-spec/entity-spec-kinds.ts` — kind → workflow wiring
- `.plan/epics/epic-assistant-gm-flows.md` — parent epic
