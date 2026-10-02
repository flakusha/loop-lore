<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Perspective gate bypass — narrator-mode input

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Summary:** Narrator-mode (`Perspective = narrator`) user input bypasses the actor-state gate entirely. Narrator-mode is director input, not an actor claim — it cannot contradict actor state because it makes no actor claim. The gate must detect narrator-mode and skip actor-state checks; all other gates (NSFW, send, etc.) are unaffected.

**Context:** `matrix-story-coherence.md` SC1. Design agreed: narrator-mode bypasses the gate. `epic-perspective-narration-voice.md` defines the `Perspective = first | third | narrator` contract. `epic-immersion-consistency-gate.md` implements the gate engine. SC3 (beat-state interlock) shipped independently in `TASK-turn-skip-gate-interlock.md` — this is a separate seam.

**Acceptance Criteria:**

- [ ] Narrator-mode (`Perspective = narrator`) messages never run deterministic rule checks (skill ownership, inventory membership, captive-flag, pending failed-check consequences).
- [ ] Narrator-mode messages pass through the gate with verdict `allow` regardless of actor state snapshot.
- [ ] Non-narrator messages (first/third-person) continue to gate normally — no regression in existing gate behavior.
- [ ] The gate receives `Perspective` as input; no circular dependency (perspective is set before gate runs).
- [ ] Unit tests: narrator bypass branch, first-person block branch, third-person block branch.
- [ ] `bun run check` green.

**Epic:** epic-immersion-consistency-gate
**Tags:** perspective, gate, narrator, bypass, actor-state, integration
**Related:** epic-perspective-narration-voice.md, epic-narration-actor-separation.md, matrix-story-coherence.md:27, TASK-sc2-narrator-mode-kind-stamp, TASK-sc7-gate-separation-kind-semantics

git issue: df1193e
