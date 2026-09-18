<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Plan-format migration: bold-keyword sections + SPDX + orphan ref cleanup across legacy tickets/epics

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

giwt plan validate still fails 3 gates repo-wide: format (~8200 files missing bold-keyword Status/Priority/Effort/Summary/Context/Acceptance-Criteria lines), spdx (thousands of legacy .md missing SPDX headers), links (~3350 orphan inline TASK-* refs to deleted tickets across .plan/epics, .plan/backlog, .plan/immediate.md). Requires a dedicated migration branch touching ~2100 files with per-file editorial decisions (invent Context content, delete dead refs). Mechanical gate repairs (dprint, md-lint, code-map, naming, linkage, epics-doc, tickets-sync) already landed in bug-tickets-batch-2 e9c6ba046. Until this lands, finalize runs need --skip-gates 'plan - validate'.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
