<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW: wire seduction/encounter preconditions

**Status:** ✅ Done — commit `nsfw-consent-gate-wiring` (see `agent-commit`); wired 2026-09-09
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-nsfw-game-mechanics.md

## Summary

Gap N3 (verified): attemptSeduction never calls checkPrerequisites (src/nsfw/seduction-prerequisites.ts); createEncounter never calls isSuitableForEncounter (location-nsfw/service.ts). Wire both; failures return typed reasons, not rolls. Plan doc §3/T14. Epic: epic-nsfw-game-mechanics.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
