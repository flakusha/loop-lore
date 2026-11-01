<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Provider Connection Wizard (L1)

**Overview:** First-run provider connection flow (auto-setup research round 3 candidate C5, `.tmp/research/AutoSetup-Approaches.md` §7 C5): pick provider → API key (sealed) → test via rescan → default model roles. Skippable and re-enterable; ≤2 screens. Depends on the setup-state endpoint ticket; absorbs giwt ticket `4293058`.

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** setup, wizard, providers, onboarding, frontend, byok, config-import
**Depends on:** TASK-setup-state-endpoint-get-api-v1-setup-state-checks-id-ok-hin (`205978b`, GET /api/v1/setup/state)
**Related Epics:** epic-first-run-auto-setup.md (owns the setup-state endpoint ticket and the shared checks module), epic-byok-api-keys.md, epic-frontend-admin.md

## Summary

Boot never fails without providers (warn only, `start.ts:95-99`) and features degrade uniformly at use time, so an L1 wizard is a pure consumer of existing pieces: admin provider routes + rescan (`src/routes/admin/index.ts:37-41`, `src/routes/admin/providers.ts:33-64`), sealed secret storage via `setConfig` (seal at `src/admin/config.ts:102`), and model roles (`src/admin/model-roles.ts`). Fresh installs currently reach a booted server with zero providers and no guided path to a first successful chat; ticket `4293058` (Frontend setup wizard: import system_config from YAML/TOML, Not Started, high) already targets a fresh-DB importable-in-under-5-clicks flow and folds into this epic rather than shipping two competing wizards.

## Scope

- Wizard core ticket below: provider pick → key entry (sealed via `setConfig`) → connection test via existing rescan → default model roles; skippable + re-enterable from settings; ≤2 screens; what-is-missing preview from the setup-state endpoint.
- Absorbed scope: `4293058` 3-step import wizard (upload → preview with masked secret rows → apply via `importConfigFromText`, `src/admin/config.ts:227-254`).
- Import/export adjacency: export origin `e92f904` (system_config export, Done) and the import endpoint ticket `a8cda49` (Not Started) stay the standalone import surface — the wizard composes them but must not own or break them.

## Tickets

- `bf6c766` — TASK-provider-connection-wizard-core-first-run-provider-connectio: wizard core with deps-on-C2 noted (priority: high)
- `4293058` — TASK-frontend-setup-wizard-import-system-config-from-yaml-toml: frontend setup wizard import (priority: high) — ABSORBED by this epic; its import-wizard scope lands inside the wizard core ticket rather than as an independent parallel wizard.

## Boundaries / Related Epics

- **epic-first-run-auto-setup.md** — L0 comes first: the wizard consumes `GET /api/v1/setup/state` (`205978b`, filed under that epic) for its preview; it does not re-implement checks.
- **Import path stays standalone-functional:** `a8cda49` (import endpoint) and `e92f904` (export, Done) remain independent admin surfaces; acceptance requires the YAML/TOML import path to keep working without the wizard.
- **No auth/age-gate onboarding here** — wizard surface is exactly one provider step (P3: only ownership and the core object are wizard-mandatory; provider connection is not).

## Anti-goal

No Jellyfin-length multi-screen funnel: two screens max. Skippable at every point; re-enterable from admin settings; boot and chat never block on wizard completion.

## Open Questions

1. **Wizard entry point on fresh installs:** auto-open on first admin visit vs a settings-page banner only (setup-state `ok:false` checks make either triggerable; decide at implementation).
2. **Model-role defaults step:** fully automated best-guess roles after the connection test vs a confirmation screen — must stay within the 2-screen budget.
3. **`4293058` disposition:** close it as absorbed when the wizard core lands, or keep it open tracking only the standalone import polish (decide at merge time; until then this epic is its canonical home).
