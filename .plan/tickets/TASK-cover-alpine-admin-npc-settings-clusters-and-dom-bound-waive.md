<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Cover alpine admin/npc/settings clusters and DOM-bound waiver track

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-core-testing-frameworks

## Summary

Follow-up from the frontend coverage review. The alpine admin, npc, and settings clusters and DOM-bound helpers (dom.ts, ui.ts) remain under-covered because they need a browser or richer DOM stub. Proposal: Playwright-driven DOM coverage with a waiver floor for DOM-glue files, per the review's waiver-track suggestion. Deferred by user for now: no additional coverage work until re-enabled.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
