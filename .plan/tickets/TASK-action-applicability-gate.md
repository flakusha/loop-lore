<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Action applicability gate — context-aware command gating (solo/group chat)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-immersion-consistency-gate

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

Additional layer over the command system (extends the `commands-interaction-extension` batch: TASK-interaction-service-foundation + fast-action tickets): **applicability of an action** — whether the verb can legally execute in the current chat/scene state — so players cannot randomly mutate chat state, especially in group chat. Distinct from existing gates:

- `requiredRole`/`satisfiesRole` (`src/assistant/commands/registry.ts`) gates **privilege**, not situation.
- `epic-immersion-consistency-gate` checks **prose** against world state pre-generation; this ticket applies the same severity ladder to **structured commands** at dispatch time, before any handler runs.

## Context (review findings)

- `CommandContext` exposes `chatId`, `roleInChat`, but no scene, location, participant-presence, battle, or turn state — dispatch cannot currently answer "is this action possible here?".
- Applicability pre-check precedent: generation hooks use `canHandle` = "is this hook applicable?" (`src/generation/hooks/moderation-hook.ts`, `nsfw-hook.ts`).
- Group-chat state to build on: `src/group-chat/turn-selector.ts` (`checkPaused` via `story_state.isPaused`, @mention turn selection, pass token `detectPassToken`), `epic-actor-turn-skip.md`, `epic-story-mode-ui.md` GM turn priority.
- Active battle state exists (`getActiveBattle`, `src/rpg/service/battles`) — battle verbs already exploit it; the gate generalizes this pattern.

## Scope

- **Applicability declaration on commands**: extend `CommandOptions` with declarative preconditions, e.g. `applicability: { chatModes: ["solo", "group"], requiresTurn: boolean, requiresTarget: "actor" | "present-actor" | "none", sceneStates: …, activeBattle: "required" | "forbidden" | "any", paused: "forbidden" | "allowed" }` — data-driven, defaults to permissive so existing commands are unaffected.
- **Dispatch-time evaluation** in `src/routes/messages/command.ts`: assemble an `ActionApplicabilityContext` (chat mode, storyState incl. paused, current-turn participant, active battle, resolved target's presence at the chat location) before handler invocation; reject with a friendly systemMessage naming the unmet condition (no throws — BUG-command-dispatch-async-handler-uncaught).
- **Presence resolution**: target actors must be present at the scene/location to be targeted by heavy verbs (`/pickpocket`, `/persuade`, `/toast`); presence derives from chat participants + location state, reused by the foundation ticket's `InteractionContext`.
- **Turn discipline (group chat)**: state-mutating heavy actions require the caller to hold the turn (or be mentioned/initiative-flagged, reusing turn-selector rules); observers/guests can never run mutating verbs regardless of applicability; flow-control fast actions (`/pass`, `/story`) are restricted to the eligible-turn holder or GM; utility/awareness fast actions (`/see`, `/stats`, `/lore`, `/draft`) are always applicable.
- **Verdict severity**: map gate failures onto the immersion-gate ladder (`allow` / `annotate` / `soft-refuse` — in-fiction obstacle narration / `hard-block` — OOC notice), configurable per chat; default for commands is `hard-block` (deterministic, no LLM cost).
- **FE surface**: `GET /api/commands` (listCommands) gains per-command applicability so the command palette can disable rather than hide inapplicable verbs, with a tooltip reason.
- Relationship to foundation ticket: this gate runs **before** `InteractionContext` creation; the foundation's material/skill checks remain inside the service (resource errors), applicability covers **situational** impossibility (wrong scene, absent target, not your turn, paused, mid-battle).

## Out of scope

- Prose-level consistency checking (epic-immersion-consistency-gate engines).
- NSFW/content moderation (independent layer, same lifecycle).
- New turn-selection logic — reuse turn-selector.

## Acceptance Criteria

- [ ] `CommandOptions.applicability` + `ActionApplicabilityContext` implemented; existing commands pass unchanged (no regression in battle.integration.test)
- [ ] Group chat: mutating heavy verb by non-turn holder → hard-block systemMessage naming the reason; utility fast actions unaffected
- [ ] Target-absent rejection: `/persuade @AbsentActor` fails applicability, not inside the handler
- [ ] Paused chat (`story_state.isPaused`) blocks mutating verbs; `/pass`-style flow commands respect turn-holder rules
- [ ] Verdict severity configurable per chat; `soft-refuse` path produces an in-fiction obstacle via narration
- [ ] `/api/commands` exposes applicability; palette disables inapplicable verbs with reason
- [ ] Tests: each precondition dimension (mode, turn, presence, paused, battle), severity ladder branches, solo-chat regressions

## Linked Epics / Tickets

- `epic-immersion-consistency-gate.md` (severity ladder, state ground truth)
- `epic-actor-turn-skip.md`, `epic-story-mode-ui.md` (turn ownership)
- `TASK-interaction-service-foundation.md`, `TASK-fast-action-prompt-pipeline.md`, `TASK-fast-action-utility-catalog.md` (same branch)
