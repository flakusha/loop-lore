<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: provider-connection-wizard core: first-run provider connection flow

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-provider-connection-wizard
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## What

Provider-connection-wizard core (research round 3 candidate C5 first ticket, L1; effort M; depends on the setup-state endpoint ticket GET /api/v1/setup/state): first-run provider connection flow — pick provider -> enter API key (stored sealed via setConfig, seal at src/admin/config.ts:102) -> test connection via the existing rescan (src/routes/admin/providers.ts:33-64) -> set default model roles (src/admin/model-roles.ts).

Absorbs the 3-step import wizard ticket 4293058 (Frontend setup wizard: import system_config from YAML/TOML, Not Started, high) into this epic rather than running two wizards.

Skippable and re-enterable (P3 — only ownership and the core object are wizard-mandatory; provider connection is NOT mandatory since boot degrades gracefully without providers). Two screens max — do NOT build a multi-screen onboarding funnel.

Consumes the setup-state endpoint for the what-is-missing preview. The import path (YAML/TOML upload via importConfigFromText, src/admin/config.ts:227-254; import endpoint ticket a8cda49; export origin e92f904 Done) must keep working standalone.

## Why

Fresh installs currently reach a booted server with zero providers and no guided path to a first successful chat; 4293058 already targets a fresh-DB importable-in-under-5-clicks flow and folds naturally into the same wizard surface instead of shipping two competing wizards.

## Scope

- frontend wizard steps (Alpine, reusing existing admin provider routes + rescan; no new backend routes beyond setup-state)
- sealed key storage via existing setConfig (secret:v1: envelope)
- absorption of 4293058 scope into the wizard (upload / preview / apply of YAML/TOML import)
- skip + re-enter affordances in admin settings

## Do NOT touch

- Do NOT add auth onboarding, age-gate onboarding, or model bundling (anti-candidates; BYO-provider is architecture)
- Do NOT extend beyond two screens
- Do NOT break the standalone import path (a8cda49) or the existing admin provider routes

## Acceptance Criteria

- [ ] fresh instance reaches first successful chat without touching a config file
- [ ] entered key is stored sealed (secret:v1: envelope via setConfig), never plaintext in system_config
- [ ] wizard is skippable and re-enterable from settings
- [ ] wizard test step uses the existing provider rescan and reflects ok:false -> ok:true from setup-state checks
- [ ] import path (YAML/TOML upload) still works standalone (4293058 scope absorbed, not dropped)

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
