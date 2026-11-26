<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP — VN custom-typeable choices (typed answers and typed actions)

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-visual-novel-mode
**Tags:** visual-novel, free-text, custom-choices, release-1-0-0
**Related:** TASK-epic-release-1-0-0 (Required scope line: "VN mode: VN mode + story generation with limited/custom-typeable choices"), TASK-vn-qa-mode, TASK-vn-branching-choices

**Summary:**

The 1.0.0 Required scope names "limited/custom-typeable choices" for VN mode. The limited leg shipped with the branching-choice cards (TASK-vn-branching-choices); the custom-typeable leg was missing entirely: the answer endpoint accepted only `optionId`, a question persisted with zero options rendered a dead card, and the choice cards offered no way to act outside the generated options.

**Context:**

Filed 2026-11-11 from the operator-approved 1.0.0 scope; implemented the same day on branch `vn-free-text-choices`. Design notes: the free-text cap (2000 chars) deliberately mirrors the RPG `FREE_TEXT_MAX_LENGTH` precedent; provenance lives in the stored data (`provenance: "custom"` option field, `custom-` id prefix, `"provenance": "custom"` inside custom-choice consequences) so generation prompts can distinguish picked-vs-typed without a schema migration.

**Acceptance Criteria:**

- [x] `POST /api/chats/:id/vn-questions/:questionId/answer` accepts `{ freeText }`; exactly one of optionId/freeText required (both/neither → 400) (`src/routes/chats/vn-questions.ts`)
- [x] Typed answers take the identical downstream route as option picks — persisted as a synthesized `provenance: "custom"` option on the question's options JSON, selected through the same single-shot flip, impacts folded from the question's own maps, identical response contract (`src/chat/service/vn-questions.ts`, `src/chat/service/vn-free-text.ts`)
- [x] Free-text contract enforced: non-empty trimmed string, at most 2000 characters, C0 control characters stripped; markup stored verbatim because rendering escapes via `textContent` (`src/chat/service/vn-free-text.ts`)
- [x] `POST /api/chats/:id/vn-choices/custom` accepts `{ freeText, sceneIndex }`, authors a `vn_choices` row (label = typed action, `custom-` id prefix, `"provenance": "custom"` in consequences) and selects it through the standard single-shot path — selection history, impact application and the VN decision gate behave exactly as for a generated card (`src/chat/service/vn-choices-custom.ts`, `src/routes/chats/vn-choices.ts`)
- [x] Question cards render a type-in affordance (labelled input + send, native form so Enter submits, 44px coarse-pointer targets) next to their options; zero-option questions render free-text-first (`vn-question-card-freeform`) instead of dead cards (`src/frontend/vn/question-cards-render.ts`, `src/frontend/vn/freeform-input.ts`, `src/public/css/vn.css`)
- [x] Choice cards render an "or type your own" affordance while a decision is open (`src/frontend/vn/choice-cards-render.ts`)
- [x] Picked-vs-typed is machine-readable end-to-end: options parse the `provenance` field (`src/chat/service/vn-question-parse.ts`), answer responses surface the synthesized option, custom choices mark their consequences
- [x] Tests: schema/service/route validation (empty, both-channels, over-cap, control characters, markup verbatim, zero-option), custom-choice happy + error paths, frontend affordance render + submission (`*.test.ts` colocated beside every touched module)

**Caveats:** Security: typed text is stored verbatim by design — every renderer must keep `textContent` (the innerHTML XSS gate enforces the render side); the control-character strip is not an HTML escape. Authorization: both custom endpoints sit behind the same `checkChatAccess` guard as their siblings; the gate is chat-scoped. Parallelism: none — one decision row per submit. Partial failure: custom-choice creation and selection are separate calls; a creation without selection leaves an available card the player can pick or skip. Observability: none added (service errors return typed 400s; no new logging surface).


git issue: 6f48dd7
**Resolved:** 2026-11-18T00:28:28.895Z Ticket .md is Done; closing the issue created by sync import.
