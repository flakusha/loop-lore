<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: keynav stale unsubscribe deletes live handler set

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** registerKeynavHandler unsubscribe (src/frontend/alpine/shortcuts.ts:92-97) closes over its set; calling an old unsubscribe after the map entry was replaced deletes the NEW live set (map entry removed, registered handlers orphaned). Double-cleanup is the documented teardown pattern. Fix: guard with keynavHandlers.get(action) === set before delete. Verify: unit test registering, clearing, re-registering, then calling the first unsubscribe.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
