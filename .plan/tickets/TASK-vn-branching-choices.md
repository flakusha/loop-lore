<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Visual Novel Mode — Branching Choices & Relationship Impact

**Effort:** Medium
**Summary:** Branching choice cards for VN scenes — LLM-generated options stored
in `vn_choices`, rendered as clickable cards, with relationship/mood impacts on
the row. Backend is done; the cards are never mounted and the impacts never
reach their target systems.
**Context:** Extends the VN UX spec (`docs/frontend/chat/visual-novel-mode.md`)
and the Character Core System's relationship and mood systems. See
`## Description`, `## How It Extends Existing Work`, and
`## Reconciliation` for the full evidence.
**Acceptance Criteria:** The list in `## Acceptance Criteria` — every box
re-checked against `src/` on 2026-10-09; six were `[x]` and are now `[ ]`.
**Effort:** Medium
**Priority:** Medium
**Status:** In Progress
**Status Note:** (2026-08-23) "Backend, routes, frontend cards, accumulated impacts, split/reunite detection all live". Reconciled 2026-10-09: the backend half is genuinely done, but `initChoiceCards` has no production caller and choice impacts are never applied — downgraded from Done. The closed git issue is left as-is; re-opening it is out of scope here.
**Epic:** epic-visual-novel-mode
**Tags:** visual-novel, branching, choices, relationships, immersion

## Description

Extend the Visual Novel Mode spec with branching choices and relationship impact — choices made during VN scenes affect character relationships, world state, and future scene availability. Adds narrative depth to the visual novel experience.

## How It Extends Existing Work

Builds on the Visual Novel Mode UX spec (`docs/frontend/chat/visual-novel-mode.md`) and the Character Core System's relationship and mood systems. Adds choice-driven narrative branching on top of the existing VN layout.

## Acceptance Criteria

- [x] `POST /api/chats/:id/vn-choices/:choiceId/select` — submit a choice (`src/routes/chats/vn-choices.ts:37`, mounted `src/routes/chats/index.ts:57`)
- [x] `GET /api/chats/:id/vn-choices?sceneIndex=N` — list available choices (`src/routes/chats/vn-choices.ts:32`)
- [x] Choice card DOM rendering with label, optional description, and `aria-selected` on the selected card (`src/frontend/vn/choice-cards-render.ts`)
- [x] Selection triggers location change, chat split, and chat reunite consequences (`src/frontend/vn/choice-cards.ts:170-222`)
- [ ] Branching choice UI reaches the DOM — `render-scene.ts:218-222`
      creates the `.vn-choices-container` div, but nothing calls
      `initChoiceCards`, so the container is empty at runtime
- [ ] Choice consequences tracked per scene and surfaced in the UI —
      `getAccumulatedImpacts()` exists but has no production consumer
- [ ] Relationship impact reaches the relationship system —
      `relationship_impact` is stored on the row and parsed by the service;
      nothing writes it to the relationship service
- [ ] Mood/state changes reach the mood system — same gap as relationship
- [ ] Scene unlock/lock based on previous choices — `unlock_conditions` is
      stored and parsed but never evaluated
- [ ] Choice history panel — the `vn_choice_selections` table named by the
      original AC was never created; selection state lives on the
      `vn_choices.status` / `selected_at` columns
- [ ] Multiple endings based on choice accumulation — no endings logic
      exists in `src/`

## Technical Notes

- Choices stored as structured events in the chat message stream
- Choice consequences reference existing relationship and mood APIs
- Scene unlock/lock uses the existing world/location state system
- Integrates with Chat Lifecycle & Moderation epic for choice validation


## Reconciliation (2026-10-09)

Re-checked every AC against `src/` on `dev`.

**Holds:**

- `src/routes/chats/vn-choices.ts:32-40` — both routes exist and are mounted
  from `src/routes/chats/index.ts:57`. Covered by `vn-choices.test.ts`
  (list 200, select, participant 404 on non-participant).
- `vn_choices` table with `consequences`, `relationship_impact`,
  `mood_impact`, `unlock_conditions`, `status`, `selected_at` —
  `src/db/schema-manifest.ts:1018-1030`, migration `001_init.ts:1958-1970`.
- `choice-cards-render.ts` builds `.vn-choice-list` / `.vn-choice-card` with
  `aria-selected` and a `--selected` modifier class.
- `choice-cards.ts:170-222` applies location change, `POST /split`, and
  `POST /reunite` for matching consequences.

**Does not hold (was checked `[x]`):**

- `initChoiceCards` is called only from `choice-cards*.test.ts`. The single
  production import, `scene-renderer/controller.ts:4`, imports
  `destroyChoiceCards` and calls it in `destroyVnRenderer()` — nothing
  constructs the component. `render-scene.ts:218-222` creates the
  `.vn-choices-container` div and leaves it empty.
- `getAccumulatedImpacts()` (`choice-cards.ts:233`) has no production
  consumer — only test assertions.
- Nothing writes `relationship_impact` or `mood_impact` to the relationship or
  mood services; grep for those field names across `src/` returns the column
  declaration, the service mapper, `carry-pins.ts`, and tests.
- `unlock_conditions` is parsed by the service and never evaluated.
- `vn_choice_selections` does not exist. The AC named a table that was never
  migrated. Selection state is `vn_choices.status = 'selected'` plus
  `selected_at`.
- No endings/branching-resolution logic exists.

Consequence: status moved Done → In Progress. The backend half is finished;
the frontend half is dead code until `initChoiceCards` is called on the
container the renderer already creates.
