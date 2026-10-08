<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Consolidate duplicated token estimation

**Status:** Not Started
**Priority:** low
**Epic:** epic-chat-context-optimization
**Effort:** Medium

**Summary:**

**Problem.** Token estimation is duplicated across seven production callsites using **two different ratios** that disagree by ~25% (`length / 4` = 0.25 vs `length * 0.3` = 0.30). A shared helper already exists and is simply not used. Because the two ratios land in different subsystems, context accounting disagrees with itself depending on which path measured the message.

**Evidence.** Re-derived from source; **7 callsites across 6 files**, two ratios.
`length / 4` (3 sites):
- `src/generation/context-window-config.ts:67` — `Math.ceil(text.length / 4)`
- `src/frontend/alpine/memory-panel/transform.ts:23` — `Math.ceil(content.length / 4)`
- `src/frontend/pages/new-chat/helpers.ts:10` — `Math.ceil(content.length / 4)`

`length * 0.3` (4 sites):
- `src/chat/pruning/prune.ts:31`, `:40`, `:121` — three callsites in one file, same ratio inline
- `src/generation/context-compactor.ts:24` — `Math.ceil(text.length * 0.3)`
- `src/routes/messages/scene-transition-context-cut.ts:79` — `Math.ceil((m.content ?? "").length * 0.3)`

The shared helper that already exists: `src/chat/token-utils.ts:23` `estimateTokens(text)`, using `CHARS_PER_TOKEN = 4` (`:12`) — i.e. the `length / 4` family. Its doc comment (`:17-19`) already states the rationale and warns that message overhead must be added at the call site. It is not imported by any of the seven.

**Impact.** Pruning decisions (`prune.ts`), compaction (`context-compactor.ts`), and context-window configuration measure the same text with different constants, so the pruning target in one module is not the budget enforced in another. The drift is invisible because each site is internally consistent.

**Fix direction.** Backend sites (`prune.ts`, `context-compactor.ts`, `scene-transition-context-cut.ts`, `context-window-config.ts`) can import `src/chat/token-utils.ts:23` directly — pick the ratio deliberately first (`length / 4` matches the documented English heuristic; `0.3` has no stated rationale and may have been tuned against observed counts, so check which is empirically closer before flipping it), then collapse. `prune.ts`'s three inline copies should become one local call. The two frontend sites `cannot` import backend code; give them a shared module or, failing that, an explicit comment at each site stating that it is a deliberately different estimator — silence is what made this drift.

**Verification.** `grep -rn 'length / 4' src/ --include=*.ts` and `grep -rn 'length \* 0.3' src/ --include=*.ts` (excluding tests and `src/native/`) return hits only in the one shared module plus documented frontend copies.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
