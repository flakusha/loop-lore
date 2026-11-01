<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: config-init: close PII/NODE_ENV boot gate + promote defaults to config.local.yaml on first boot

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-first-run-auto-setup
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## What

Two coupled first-boot fixes in the config layer (research round 3 candidate C1, first ticket):

(a) Close the NODE_ENV/PII boot gate. Today a fresh clone plus plain bun run start with NO env vars fails at boot: package.json:11-12 scripts set no NODE_ENV; src/config/load/pii-safety.ts:16-22 treats unset/empty NODE_ENV as production-like; resolvePiiSecret throws before the dev fallback can apply (pii-safety.ts:46-60, called unconditionally at src/config/load/load.ts:158; empirically reproduced 2026-11-01). Fix by ONE of: generate >=32-char random secrets for the three PII sections and persist them into the promoted config/env file when no config file exists and NODE_ENV is prod-like; OR default NODE_ENV=development into the start/dev scripts (package.json:11-12) keeping the promoted-secret path for build:server deploys. Pick one, document the other.

(b) First-boot defaults promotion. Write the effective defaults (via createConfigSchema() *_DEFAULTS) to config.local.yaml on first boot, plus a bun run init CLI alias; guarded to skip when ANY config file already exists (config.yaml|yml|toml|config.local.*|env.yaml candidates per src/config/load/constants.ts). Generate >=32-char random dev secrets only for sections that validate them in prod (auth required=true path, PII prod), written as commented-out env-hints; never silently enable auth.required (solo defaults stay untouched, src/config/sections/auth.ts:6-22). Reuse *_DEFAULTS via createConfigSchema(); the promoted file uses a gitignored name and is chmod 0600 when it contains generated secrets. A user-config YAML serializer does not exist today (only codegen writes schemas) and must be added.

## Why

Research principles P1/P7: first boot should promote defaults into a real, user-editable config file and bun install && bun run start must just work. Defaults are currently memory-only, so users edit a file that does not exist; the PII/NODE_ENV gate is the single most concrete first-run bug found in round 3.

## Scope

- src/config/load/ — new first-boot writer next to loadConfig + skip-guard + randomBytes secret generation (new in config code)
- package.json start/dev scripts (only if the NODE_ENV default option is chosen)
- bun run init alias
- docs: install/first-run note describing the chosen option and the promoted file

## Do NOT touch

- Do NOT write config.yaml — the primary name stays reserved for user hand-edits (.gitignore:26-45)
- Do NOT enable auth.required or the age gate from setup code (solo defaults stay)
- Do NOT hot-rewrite user config edits (write-once promote + merge-on-upgrade; src/config/hot-reload.ts stays read-directional)

## Acceptance Criteria

- [ ] env -u NODE_ENV bun run start on a fresh clone (no config files, empty shell env) boots ready at :3000 — the exact case that fails today
- [ ] a readable config.local.yaml (or env.yaml) appears containing generated PII secrets and commented defaults
- [ ] re-run with any pre-existing config file leaves the file untouched (idempotence test)
- [ ] upgraded-schema boots merge new keys into an existing promoted file without dropping user values (merge, not rewrite)
- [ ] no secret appears in the promoted file in plaintext beyond the deliberately generated PII/env-mode values, which are chmod 0600 under gitignored names only
- [ ] works on Windows/Linux/macOS (pure Bun APIs, no OpenSSL dependency on the default path)

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
