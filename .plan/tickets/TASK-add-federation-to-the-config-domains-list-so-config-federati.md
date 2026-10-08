<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add federation to the config DOMAINS list so config.federation.toml loads

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Register `federation` as a config DOMAIN so `configs/config.federation.toml` is actually loaded instead of silently ignored.

**Context:**

`DOMAINS` (`src/config/load/constants.ts:23-38`) lists 14 sections and `federation` is not among them. The domain loader walks that array to find `config.<domain>.*` files, so a `configs/config.federation.toml` is never read — no warning, no error, the section simply stays at its defaults. The result is a silent misconfiguration: an operator sets `enabled = true` in a domain file and federation stays off.

The section is wired everywhere *else*, which is what makes this the single missing link: `FEDERATION_DEFAULTS` exists (`src/config/schema-class/federation.ts:7-13`), the section is assembled into the config schema (`src/config/schema-class/index.ts:89,122`), `envMap` already maps `MESH_PSK` → `federation.meshPsk` (`src/config/schema-class/env-map.ts:122`), and the published JSON schema describes the whole section (`src/config/schema-class/json-schema/federation.ts`). Only the domain-file loader is missing.

**Direction:**

1. Add `"federation"` to `DOMAINS` in `src/config/load/constants.ts`, keeping the existing grouping order rather than inserting alphabetically.
2. Confirm no other change is needed — the loader treats DOMAINS generically. Verify by reading the merge path rather than assuming it.
3. Add a config-load test writing a `configs/config.federation.toml` with `enabled = true` and one peer entry, asserting `loadConfig` picks both up.
4. Assert layering still holds: an env override (`MESH_PSK`) beats the domain file.

**Acceptance Criteria:**

- [ ] A `configs/config.federation.toml` declaring `enabled = true` is loaded by `loadConfig`
- [ ] A peer entry in that file populates `config.federation.peers`
- [ ] `MESH_PSK` as an env var still overrides the value from the domain file
- [ ] With no `config.federation.*` file present, the section is unchanged from `FEDERATION_DEFAULTS`
- [ ] Existing config-layering tests stay green; `bun run check` green

**Dependencies:**

- None — this is a prerequisite for the rest of the epic, not a consumer of it

**Out of Scope:**

- Per-instance config file discovery or an env-var prefix (see review §3 blocker 3)
- Editing the `federation` JSON Schema itself
