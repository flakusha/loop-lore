<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: index.json records epic source paths under .plan/tickets/ for epic entries

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-tooling-improvement

**Summary:**

The EPIC-CLI-TOOLING-OPTIQUE entry in .plan/tickets/index.json carries "source": ".plan/tickets/epic-cli-tooling-optique.md", but the file actually lives at .plan/epics/epic-cli-tooling-optique.md. Neighbouring epic entries such as epic-assistant-step-planning.md and epic-db-growth-tiered-storage.md correctly use the .plan/epics/ prefix, so the two conventions coexist in one file. The same wrong prefix appears on epic-script-migration.md, epic-tooling-improvement.md and epic-code-quality.md. epics-index.md links to the correct .plan/epics/ path, so the index and the rendered docs disagree. Impact: any consumer that resolves an epic's source path from index.json (code-map generation, tooling that reads a plan document by its recorded path) looks in the wrong directory and finds nothing. The fix belongs in whatever derives the source prefix when the index is regenerated (giwt sync), not in a hand edit of index.json -- a hand edit is reverted the next time plan:sync runs. Verify by comparing the source prefix against the on-disk location of every epic entry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 8e81ae2 (registry tip: 0b24368d8 Konstantin Fedotov Close issue)
