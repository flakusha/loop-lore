<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN choice opt-in with pending-choice send block

**Summary:** Make VN choices opt-in per chat and make a pending choice block
the send button until it is resolved or dismissed.
**Context:** Choices today are unconditional and the turn send gate has no idea
choices exist. See `## Summary` for the intent; the five boxes in
`## Acceptance Criteria` are the deliverable.
**Acceptance Criteria:** The five boxes in `## Acceptance Criteria`.


**Status:** Done
**Priority:** medium
**Effort:** Medium
**Tags:** visual-novel, choices, opt-in, send-gate
**Epic:** epic-visual-novel-mode
**Git Issue:** ce429a2
**Status Note (2026-10-18):** Shipped against `dev`: the per-chat `vnChoicesEnabled` flag (default off, allowlisted on both the backend `src/chat/service/access.ts` and frontend `gm-config-presentation.ts` sides; `getVnSettings` never leaks it across chats) and the pending-decision send gate (`src/routes/messages/guards.ts` rejects free-text send with a 409 while an unresolved choice or question exists; `destroyChoiceCards`/`destroyQuestionCards` clear the pending flag). `render-scene.ts:245-252` gates card mounting + fetches on the flag, so an opt-out chat never shows choice UI. Open: consequence/next-scene application on resolution (shared with `TASK-vn-branching-choices.md`).

**Related:** `TASK-vn-branching-choices.md` (choice generation + the send path
this gate must intercept), `TASK-visual-novel-mode.md` (where a per-chat VN
flag would be persisted).

## Summary

VN branching choices exist (POST /api/chats/:id/vn/generate-choices, vn_choices table, choice-cards.ts) but are always-on: no opt-in flag, and send is never blocked by pending choices. Add per-chat opt-in for VN decision elements (ask-tool-like decision making, choice selection); while a choice is pending, the turn send gate blocks free-text send until the choice is resolved or dismissed; resolving a choice consumes the beat (records impacts/next scene, releases the slot).

## Acceptance Criteria

- [x] Per-chat opt-in flag for VN choice elements (default off) —
      `vnChoicesEnabled` in `gm_config` (`src/chat/types/config.ts`),
      allowlisted on both sides, default off (2026-10-18)
- [x] Pending choice blocks free send via the turn send gate until
      resolved/dismissed — `src/routes/messages/guards.ts` 409 path
      (2026-10-18)
- [ ] Choice resolution consumes the beat and applies consequences/next scene
      — impacts are stored/summed only; nothing writes them to the
      relationship/mood systems and no caller acts on `nextSceneId`
- [x] Opt-out chat never shows choice UI and never blocks on choices —
      `render-scene.ts` gates mounting and fetches on the flag; the gate
      only fires when a pending row exists (2026-10-18)
- [ ] Tests passing — dedicated suites exist (`gm-config.test.ts` flag
      round-trip + default off, `settings.test.ts` no-cross-chat-leak,
      `render-scene.test.ts` flag on/off mounting + fetches, messages guard
      tests); not re-run in this docs-only pass

**Resolved:** 2026-10-18 registry-driven close: git issue ce429a2 (registry tip: da80bd856 Konstantin Fedotov Close issue)
