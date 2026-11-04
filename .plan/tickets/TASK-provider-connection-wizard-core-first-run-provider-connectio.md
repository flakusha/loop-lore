<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: provider-connection-wizard core: first-run provider connection flow

**Status:** In Progress
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

The backend half of this ticket shipped in the `provider-wizard-backend` lane.
The frontend half of the wizard lands in a separate lane, so the acceptance
criteria below stay unticked until both halves are in.

**Backend contract shipped**

- `src/generation/providers/server-provider-store.ts` — the store.
  `serverProviderDescriptorKey(name)` → `provider.<name>.config`,
  `serverProviderSecretKey(name)` → `provider.<name>.apiKey`,
  `listServerProviders(db)`, `saveServerProvider(db, input)`,
  `deleteServerProvider(db, name)`, `materializeServerProviders(db, config)`,
  `applyStoredServerDefaults(db, config)`.
- Admin routes (`src/routes/admin/setup-providers.ts`, mounted on the `/api/v1`
  admin surface, permission `admin.system`):
  `GET /api/v1/admin/setup/providers` → `{ providers: [...] }` (never a key),
  `POST /api/v1/admin/setup/providers` → `{ ok: true, provider }`,
  `DELETE /api/v1/admin/setup/providers/:name` → 204.
- The API key is written through `setConfig`, so the row is sealed with the
  `secret:v1:` envelope (`SECRET_KEY_PATTERN` matches `provider.<name>.apiKey`);
  the descriptor row `provider.<name>.config` is plain JSON.
- `materializeServerProviders` runs at boot (`src/server/start.ts`, next to
  `applyStoredNsfwConfig`) so a wizard-created provider exists before
  `ready = true` and survives a restart.

**DECISION — the "no new backend routes beyond setup-state" constraint had to be relaxed**

The Scope section says "no new backend routes beyond setup-state". That
constraint could not hold: there is NO existing route that creates a provider
instance or stores a provider key. `src/routes/admin/providers.ts` exposes only
`GET /providers`, `GET /admin/providers`, `GET /admin/providers/:name/models`
and `POST /admin/providers/rescan` — read/inspect surfaces over the registry.
The registry is filled from the config file at boot (`initializeProviders`,
`src/generation/providers/registry.ts`); nothing persists a provider instance or
its key. The wizard needs new backend routes, and this ticket ships them.

**PRECONDITION — remote provider hosts were impossible before this change**

`BaseProvider` validated the base URL with an EMPTY allowlist
(`src/generation/providers/base.ts` → `validateProviderUrl(baseUrl)`;
`packages/core/src/utils/url-validation.ts` → `allowlist = options.allowlist ?? []`),
so every remote hostname was rejected ("Remote host \"x\" not in allowlist").
A remote provider in the config file also crashed boot, because
`initializeProviders` is called unguarded in `src/server/start.ts`.
`ProviderInstanceConfig` now carries an optional `allowedHosts` list — the
operator's explicit host approval — and `BaseProvider` passes it to the
validator. The default behaviour is unchanged: with no `allowedHosts` a remote
host is still rejected.

**Follow-up (not implemented here)**

Only openai-compatible instances are materialized (that covers OpenAI,
OpenRouter, Groq, Together, LM Studio, Ollama's OpenAI mode, llama.cpp and
vLLM). Anthropic-native and ollama-native instances are NOT materialized — a
follow-up ticket should extend `materializeServerProviders` for them.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
