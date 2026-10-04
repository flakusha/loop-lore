<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-auth-channel-ac12: Settle WAC4 — per-role minimum-factor-count policy (static config vs DB table)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** Close `matrix-authentication-channels.md` open decision `[WAC4]`: should the per-role minimum factor count live in `config.toml` (`[auth].minimum_factors_by_role`) or in a `factor_policy` DB table that admins can edit at runtime? Pick one and ship the consumer.
**Context:** AC12 (provisioning × admin/config) is doc-resolved except for `[WAC4]`. The matrix recommends the DB-table shape ("per-role minimum count policy shape (static config vs DB policy table)") but leaves the call to the human planner. Both have UX tradeoffs: config = reproducible across instances, table = admin-tweakable without redeploy.

## Current state

- `config.toml` `[auth]` section is consumed at boot.
- `auth_factors` table exists per state; no policy table.
- Admin panel can edit per-user state but no per-role policy.

**Acceptance Criteria:**

- [ ] Decision recorded in `epic-auth-channel-provisioning.md` and `schemas/loop-lore-config.schema.json` regeneration marker placed (or skipped for DB-only path).
- [ ] Whichever path is picked, the ladder consults it on each `login`/`stepup` invocation; missing policy = ladder default (don't lock users out by omission).
- [ ] If DB path: `factor_policy(role, min_count)` table; admin route to edit it; row-level audit.
- [ ] If config path: TypeBox schema in `[auth].minimum_factors_by_role` with `role: number` map; admin must redeploy to change.
- [ ] Tests pin: at-or-above minimum succeeds, below minimum steps up.
- [ ] `bun run check` green.

**Tags:** auth, 2fa, policy, config, admin, WAC4, AC12
**Related:** src/auth/, src/admin/, config.toml, .plan/matrix-authentication-channels.md (AC12 row, [WAC4]), epic-auth-channel-provisioning.md

git issue: 4e68abe
