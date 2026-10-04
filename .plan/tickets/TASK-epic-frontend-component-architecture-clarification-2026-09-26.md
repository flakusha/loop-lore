<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-epic-frontend-component-architecture-clarification-2026-09-26: clarify epic-frontend-component-architecture.md direction

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** `epic-frontend-component-architecture.md` (29 lines, last touched 2026-07-28, only 3 commits) is a placeholder with no Summary, no Tasks, no Acceptance Criteria. Three sibling epics overlap (`epic-frontend-overview.md`, `epic-frontend-components.md`, `epic-frontend-component-architecture.md`). The 2026-09-19 audit (`epic-docs-vs-plan-gap-audit-2026-09-19.md`) flagged overlapping frontend scoping.
**Context:** This ticket asks the owner to choose ONE of three dispositions before any work starts: ship-as-is, deprecate (merge into a sibling epic), or split into smaller concrete tickets. Source row: 2026-09-26 epic audit under `.plan/epics/epic-frontend-component-architecture.md`.

**Decision required:** pick ONE of the following:

1. **Ship-as-is** — flesh out the epic with concrete tasks + acceptance criteria (estimate: 2–4h of writing). Choose this only if the epic covers a distinct concern the siblings don't.
2. **Deprecate** — fold this epic into `epic-frontend-overview.md` (the natural umbrella). Delete the file; re-route any future tickets to the umbrella epic.
3. **Split** — break the placeholder into 3–5 smaller epics, each with a clear domain (e.g. `epic-frontend-design-system.md`, `epic-frontend-state-management.md`, `epic-frontend-routing-shell.md`).

**Open questions:**
- Does this epic describe *architectural patterns* (design system, state management) or *individual components* (cards, modals, dropdowns)? The title says architecture; the parent epics already own components.
- Which sibling (overview vs components) is the natural merge target?
- Is there any committed work-in-progress referencing this epic, or is it pure forward planning?

**Acceptance Criteria:**
- [ ] One of the three dispositions is documented in the epic's `## Summary` section, with rationale
- [ ] If deprecate: file is deleted, sibling epic carries the cross-reference, related tickets re-tagged
- [ ] If split: new epic files created with full Task + Acceptance Criteria sections, this file deleted
- [ ] If ship-as-is: epic now has `## Tasks`, `## Acceptance Criteria`, `## Related Epics` sections, no `_TBD_` placeholders
- [ ] Owner signs off in epic changelog

**Tags:** meta, epic-audit, frontend, clarification
**Related:** .plan/epics/epic-frontend-component-architecture.md, .plan/epics/epic-frontend-overview.md, .plan/epics/epic-frontend-components.md, .plan/epics/epic-docs-vs-plan-gap-audit-2026-09-19.md


git issue: 41bb3e2
