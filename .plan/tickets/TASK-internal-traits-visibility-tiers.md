<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Internal Traits Visibility Tiers

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** high
**Effort:** Medium

## Summary

Implement author vs player visibility model for character internal traits. Backend: toPublicCard() redaction function strips hidden traits for player view. API: role-based access control returns only visible/hinted traits for players. Frontend: two view tiers - player view shows only visible traits, author/GM view shows all with visibility toggle.

## Acceptance Criteria

- [x] Visibility config on traits + prompt-section honoring it (backend)
- [ ] `toPublicCard()` redaction for player view
- [ ] Role-based API access (players get visible/hinted only)
- [ ] Frontend view tiers + visibility toggle
- [ ] Tests passing
- [ ] Documentation updated
