<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin system-config: rpg/chat/caption/turn tunables

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

Expose gameplay + chat tunables. Sources: rpg/intimacy/service INTIMACY_THRESHOLDS/MAX_SCORE 100/MAX_HISTORY 50, skills/helpers PROFICIENCY_THRESHOLDS, seduction MAX_SKILL_LEVEL 100; chat/token-counter THRESHOLDS, context-window DEFAULT_THRESHOLDS, trim-suggestions THRESHOLD_PCT 80, random-events MAX_COOLDOWN 999; generation/caption-route MAX_CAPTION_BATCH 5/LENGTH 500; turn-manager/state PERSIST_RETRIES 3; middleware csrf MAX_AGE 86400, request-id LEN 128, handle-resolver ENTRIES 1000; notifications DEFAULT_PREFS. Acceptance: new [rpg] section (or extend existing), caption/chat keys seeded; admin UI grouped; defaults unchanged.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
