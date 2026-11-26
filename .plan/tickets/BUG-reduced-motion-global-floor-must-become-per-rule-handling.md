<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Reduced-motion global floor must become per-rule handling

**Status:** Done
**Priority:** High
**Effort:** Small
**Epic:** epic-frontend
**Caveats:** accessibility, partial failure, stale state, observability

**Context:**

A global animation-duration floor is not the correct reduced-motion implementation; handle motion per rule.

**Summary:**

A global animation-duration floor is not the correct reduced-motion implementation. Current Chrome guidance expressly warns against globally applying `animation-duration: 0.01ms`.

**Evidence:**

- `https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/motion`
- `https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions`
- `https://www.w3.org/WAI/WCAG22/Techniques/css/C39`
- Repository global handling cited in `.tmp/research/tomorrow-followups-2026-11-21.md`.

**Scope:**

- Replace the global floor with per-rule reduced-motion handling.
- Preserve animation-event behavior where events must still fire.
- Treat this as AAA-level motion handling, not an AA requirement.

**Acceptance Criteria:**


git issue: 735a0ce

- [ ] No global animation-duration floor remains.
- [ ] Motion is disabled or adjusted per rule under reduced-motion handling.
- [ ] Required animation-event behavior still works.
- [ ] Accessibility-relevant checks pass.
