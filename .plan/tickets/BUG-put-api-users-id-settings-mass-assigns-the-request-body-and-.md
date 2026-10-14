<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: PUT /api/users/:id/settings mass-assigns the request body and reports success for a missing user

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

The handler accepts ctx.body as Record<string, unknown> with no route schema, merges the entire body into the target's settings, and never checks that the user exists.

Evidence read on dev:

- src/routes/users/manage.ts:126 — const body = (ctx as any).body as Record<string, unknown>;
- src/routes/users/manage.ts:132-139 — reads current settings, spreads the whole body over them, stringifies.
- src/routes/users/manage.ts:146-152 — updates by id with no existence check and returns 200 with the merged object regardless of affected rows.

Ownership is correctly enforced at :128 (self or admin.users), so this is mass assignment plus a silent no-op, not an IDOR. The contrast is src/routes/config-menu.ts:120-122, which gates user settings writes through SettingsUpdateAllowedKeys before persisting.

Fix: validate the body against the settings key allowlist (or a schema), and 404 when the target user does not exist.

Source: .tmp/cat-jam/review-routes-config.md P1 finding 2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
