<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Demo autosetup observability

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-first-run-auto-setup
**Depends on:** `TASK-config-init-close-pii-node-env-boot-gate-promote-defaults-to`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Log seeded demo credentials once at boot when demoAutoSetup=true (warn level). Add auth.demoAutoSetup to promoted config defaults. Depends on C1. Gap G13.

**Context:**

Three findings in the first-boot observability story — verified against the code:

(a) `auth.demoAutoSetup` is a DEAD KNOB. It exists in the auth config section
(packages/core/src/config/sections/auth.ts:15 default `true`, :43 field, :104-108
schema property, :148 in the schema `required` list) and is settable via
`DEMO_AUTO_SETUP` (packages/core/src/config/schema-class/env-map.ts:141), but
NOTHING in src/ reads it — `seedDefaultActors` (src/db/seed.ts:27) branches only
on `config?.auth.required` and always seeds the demo solo user in solo mode
(src/db/seed.ts:68-93) regardless of the flag. The demo user is announced only
as "Demo solo user created (admin-equivalent in solo mode)" at info level, so an
operator has no way to see that the instance is in demo mode.

(b) The demo user has NO PASSWORD. The seeded row sets no `secret_hash`
(src/db/seed.ts:78-90) and the lazily-created solo user does not either
(src/middleware/auth/solo-user.ts:56-64); demo login is a dedicated PASSWORDLESS
endpoint, `POST /api/demo-login` (src/routes/auth/index.ts:73-95, description
"Solo/demo mode login — no password required"). So there is no credential
secret to print — the usable credential IS the username plus that endpoint.
Note the demo session is admin-equivalent in solo mode (login.ts:180 creates the
session with `UserRole.Solo`), which is why this belongs at warn level.

(c) `auth.demoAutoSetup` is not visible in the promoted config file. The shipped
first-boot writer (`renderFirstBootYaml`,
packages/core/src/config/load/first-boot.ts:111-128) emits ONLY the three PII
secrets; the full defaults dump is the not-yet-shipped part (b) of the C1 ticket
(183003a). `AUTH_DEFAULTS.demoAutoSetup` is already `true`, so once C1 dumps
`createConfigSchema().defaults` the key appears for free — the work here is
pinning it as an acceptance criterion so a curated/filtered writer cannot drop
it, and so the user can see and toggle it.

Constraints:
- Log ONCE per boot, at WARN level (never info), gated on
  `auth.demoAutoSetup === true`. Warn is the point: `isDevEnv()`
  (packages/core/src/config/load/pii-safety.ts:19-22) treats an UNSET
  `NODE_ENV` as prod-like, so an info-level line is exactly what an operator on
  a fresh clone (no NODE_ENV) would not see.
- Log the username and the passwordless demo-login route; never print a
  password or hash (the demo user has none — do not invent one). Free-text string
  log messages are NOT censored (packages/core/src/logger/logger.ts:112-120 only
  censors object messages), so the string must contain nothing but the username
  and the route.
- Emit from the boot path, not from inside `seedDefaultActors`: that function
  also runs on factory reset (src/routes/admin/danger-zone.ts:176) and on DB
  reinit (src/db/reinit.ts:52), which are not boots.
- Reuse the C1 writer's single defaults source; no second defaults list.
- No new config key: the existing `auth.demoAutoSetup` flag is the only switch.

Out of scope (explicitly, to stop scope creep): this ticket makes the flag
VISIBLE and ANNOUNCED, not functional. It does NOT make `demoAutoSetup` gate
the demo-user seed or the sample-data seed (src/seeding/content.ts:55-66 reads
`seeding.enabled` and `auth.required`, not the flag) — changing seeding behavior
is a separate, larger decision.

Alternatives considered: printing a password in the log — rejected (no password
exists, and a secret must never reach log aggregation); an admin-settings page
entry — rejected (no second setup surface; the epic records the setup-state
endpoint as the machine-readable one); a separate demo-credentials file —
rejected (second secret store for a passwordless account).

**Acceptance Criteria:**

- [ ] booting with `auth.demoAutoSetup=true` emits exactly ONE warn-level log line naming the demo username and the passwordless demo-login route (`POST /api/demo-login`)
- [ ] booting with `auth.demoAutoSetup=false` emits no such line (the flag's effective default is `true`, so "unset" means the line IS emitted — pin that explicitly in the test)
- [ ] the log line contains no password, hash, or other secret value
- [ ] the log line is emitted from the boot path only — a factory reset (admin danger zone) and a DB reinit do NOT re-emit it
- [ ] the promoted config file written by the C1 defaults writer contains `auth.demoAutoSetup` with its effective default
- [ ] unit test covers: demoAutoSetup true emits exactly once; false emits none; a second seed call in the same process does not re-emit
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
