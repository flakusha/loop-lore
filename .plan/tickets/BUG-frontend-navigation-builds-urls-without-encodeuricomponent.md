<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Frontend navigation builds URLs without encodeURIComponent

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Three navigation call sites interpolate an id straight into a URL path or query string.

- src/frontend/pages/characters.ts:176 — location.assign(`/character/${id}/edit`)
- src/frontend/pages/characters.ts:242 — location.assign(`/api/v1/actors/${characterId}/export?format=${format}`); format comes from an unchecked checkbox and can be the string 'undefined'.
- src/frontend/pages/worlds.ts:59 — location.assign(`/worlds/${data.id}/edit`)

Source: .tmp/longcat/review-assets-db-frontend.md N20, N21, N22.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
