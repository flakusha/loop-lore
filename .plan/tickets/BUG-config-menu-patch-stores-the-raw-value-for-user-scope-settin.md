<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Config-menu PATCH stores the raw value for user-scope settings and leaks admin key names

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Two defects in the config-menu PATCH handler.

1. The coerced value is computed and then discarded for user-scope keys. src/routes/config-menu.ts:115 computes const coerced = coerceValue(body?.value, field.type), but only the admin branch at :117-118 writes it. The user branch at :128 persists { ...current, [key]: body?.value } with the raw request value. For array and object fields the stored shape can therefore diverge from what coerceValue and the read path assume, producing type drift between what the UI sent and what settings holds.

2. Field lookup runs against the admin catalog for non-admins. src/routes/config-menu.ts:104 evaluates findField(adminSections, key) before findField(userSections, key) regardless of role, so an admin-scoped key resolves to a field and produces 403 at :107-109, while a key in neither catalog produces 400 Unknown config key. The status-code difference is an oracle that tells any authenticated user which config keys are admin-scoped, before the permission check runs.

Fix: write the coerced variable on both branches (the user branch at :128 must persist coerced, not body?.value), and resolve the field from the caller's own catalog first (or return 404 uniformly) so the forbidden set is not distinguishable. Note the lookup key is a flat snake_case field key, not a dotted section path: findField (src/routes/config-menu.ts:34-41) compares fld.key against the raw body key across every section, so one flat key namespace is shared by both catalogs and that shared namespace is what makes the 403-vs-400 split observable.

Source: .tmp/cat-jam/review-routes-config.md P1 findings 1 and 3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
