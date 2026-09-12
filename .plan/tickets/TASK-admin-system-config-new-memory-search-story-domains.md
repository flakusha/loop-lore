<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin system-config: new memory/search/story domains

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

No config domain exists for memory, search, story quality. Sources: memory/budget.ts DEFAULT_MAX_TOKENS 1024 + minConfidence 0.3; search/config.ts DEFAULT_GLOBAL_CAP, convenience.ts DEFAULT_SEARCH_CAPS/timeCaps, search/quarantine.ts CAPTCHA 15min + RATELIMIT 30s; story/story-types.ts DEFAULT_QUALITY_THRESHOLDS/WEIGHTS. Acceptance: new schema sections (memory/search/story) with sections/ defaults + meta; seedDefaults seeds keys; admin UI sections; no behavior change at defaults.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
