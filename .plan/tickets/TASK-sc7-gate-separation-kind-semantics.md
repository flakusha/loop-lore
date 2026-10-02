<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gate output kind semantics — `soft-refuse` → `narration`, `hard-block` → `system`

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Summary:** Gate refusal output is stamped by kind, not author. A `soft-refuse` verdict produces an in-fiction obstacle narration (obstacle beat) — stamped `kind: narration`. A `hard-block` verdict produces an OOC system notice — stamped `kind: system`. Stamping must be deterministic and source-based (gate verdict level), not inferred from content.

**Context:** `matrix-story-coherence.md` SC7. Design agreed: `epic-immersion-consistency-gate.md` emits the gate verdicts. `epic-narration-actor-separation.md` owns `MessageKind`. The interlock (`TASK-turn-skip-gate-interlock.md`, shipped) already handles skip/escape-hatch flow — this ticket covers kind assignment on the output messages themselves.

**Acceptance Criteria:**

- [ ] `soft-refuse` verdict output is stamped `kind: 'narration'` — obstacle beat written as narration.
- [ ] `hard-block` verdict output is stamped `kind: 'system'` — OOC notice, not a narration or actor action.
- [ ] `allow` and `annotate` pass through without gate output — no new message, no kind assignment needed.
- [ ] Stamping is deterministic from the verdict severity — not content-guessed.
- [ ] Integration with `TASK-sc2-narrator-mode-kind-stamp` if `MessageKind` schema is not yet shipped.
- [ ] Unit tests: soft-refuse → narration kind, hard-block → system kind.
- [ ] `bun run check` green.

**Epic:** epic-narration-actor-separation
**Tags:** gate, refusal, kind, soft-refuse, hard-block, narration, system, integration
**Related:** epic-immersion-consistency-gate.md, epic-narration-actor-separation.md, matrix-story-coherence.md:33, TASK-turn-skip-gate-interlock, TASK-sc1-perspective-gate-bypass, TASK-sc2-narrator-mode-kind-stamp

**Git Issue:** 51313c4
