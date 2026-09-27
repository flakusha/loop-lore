<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: entity template position config unvalidated typos silently become after

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:** templates.ts entityTemplatePosition (src/config/templates.ts:74-75) is not validated; any typo resolves to the default 'after' silently. Fix: validate against the allowed literal set at config load and warn on unknown values. Verify: bun test src/config/ template loader tests.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
