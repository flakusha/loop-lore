<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: giwt migration open items (docs/giwt-scripts-map.md)

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Summary:** Close the three open decisions in the giwt migration try-log: gpg-unlock wrapping, legacy scripts/worktree CLI deletion, giwt-report schema-drift revisit
**Context:** Found 2026-09-19 docs-gap sweep; source docs/giwt-scripts-map.md try-log open items; no .plan artifact tracks them
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Tags:** tooling, process, giwt

## Summary

docs/giwt-scripts-map.md's migration log leaves three items open with no tracking artifact:

1. `gpg-unlock` wrapping decision (how/whether giwt wraps the unlock flow for cold agents).
2. Legacy `scripts/worktree` CLI deletion — shims over giwt are superseded; decide deletion timing vs compat shims.
3. `giwt-report` schema-drift revisit — report consumers need a stability decision.

Each needs a decision recorded in the map (or an upstream follow-up filed); this ticket is the tracking stub so they stop being docs-only folklore.

## Acceptance Criteria

- [ ] Three decisions recorded in docs/giwt-scripts-map.md (decision + date + rationale, or upstream link)
- [ ] If legacy-CLI deletion is approved: removal executed in its own worktree with gates run
- [ ] `bun run plan:validate` green
