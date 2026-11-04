<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: provider-connection-wizard core: first-run provider connection flow

**Status:** in_progress
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
- [x] entered key is stored sealed (secret:v1: envelope via setConfig), never plaintext in system_config
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
  `deleteServerProvider(db, { name, config, actor })`,
  `materializeServerProviders(db, config)`,
  `applyStoredServerDefaults(db, config)`.
  The listing entry carries `state` (`live` / `error`) and — when not live —
  the `error` reason.
- Admin routes (`src/routes/admin/setup-providers.ts`, mounted on the `/api/v1`
  admin surface, permission `admin.system`):
  `GET /api/v1/admin/setup/providers` → `{ providers: [...] }` (never a key),
  `POST /api/v1/admin/setup/providers` → `{ ok: true, provider }` (400 for a
  rejected payload, 502 when the payload was accepted but the instance could
  not be materialized — the reason is in the response body),
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

**FIXES applied in the review round (backend lane)**

- **SSRF semantics changed.** The host approval is no longer a rubber stamp:
  `allowedHosts` entries must be bare hostnames (no scheme, path, port or
  userinfo; `*` and bare-TLD wildcards like `*.com` are rejected), and a
  link-local / cloud-metadata target (`169.254.0.0/16`, `fe80::/10`,
  `100.100.100.200`, `fd00:ec2::254`, `metadata.google.internal`) is rejected
  with 400 — see `isMetadataTarget` in
  `packages/core/src/utils/url-validation.ts`. Loopback (`127.0.0.1`, `::1`)
  and the RFC1918 ranges stay allowed, so the shipped `localhost:11434` /
  `localhost:1234` presets keep working.
- **Materialization re-validates.** `materializeServerProviders` re-checks every
  stored descriptor at boot, so a `provider.<name>.config` row injected through
  the generic system-config path is skipped with a warning instead of being
  materialized unchecked. A descriptor row without its key row is skipped too.
- **One transaction.** The descriptor row and the sealed key row are written in
  one transaction — a partial write leaves neither.
- **Registry hijack closed.** A save whose name is already owned by another
  provider (registry entry or config-file instance) is rejected with 400;
  only the instance the store owns may be replaced.
- **Defaults no longer drift.** An update keeps the stored `setDefault` intent,
  and updating the current default refreshes the persisted `default_provider` /
  `default_model` rows.
- **Delete prunes everything.** The store now removes the config-file instance
  as well, so the route cannot forget it. A successful update resets the
  provider's circuit breaker. An explicit empty `apiKey` clears the stored key
  (documented in the route description and `docs/reference/api.md`).
- **Audit trail.** Every save/delete writes a `log_entries` row
  (`action = server-provider.saved` / `server-provider.deleted`). The repo has
  no shared `log_entries` writer helper — the row follows the inline convention
  of `src/routes/admin/system-config.ts`; no new audit subsystem was added.

**FIXES applied in the second review round (backend lane)**

- **Typecheck fix.** `src/server/start.test.ts` carried a duplicate
  `watchDomainConfigs` key in the `../config/hot-reload` mock (introduced by
  the rebase): TS1117 broke `bun run typecheck` and `bun run typecheck:bun`
  while ESLint and `bun test` stayed green (the second occurrence simply won).
  One key removed — no other mock changed.
- **A failed materialization is reported, not swallowed.** The POST path used
  to answer 400 with a generic "Provider could not be activated" wrapper, and
  the listing re-derived a proxy reason by re-running `resolveApprovedHosts`
  (so a provider that failed for another reason — a missing key row, a failed
  build — reported a misleading one). Now:
  - `POST /api/v1/admin/setup/providers` answers **502** when the payload was
    accepted but the instance could not be materialized. The response carries
    the real reason, nothing is stored and the instance is not live. 400 stays
    the answer for a rejected payload (invalid name, base URL, host approval,
    a name another provider owns).
  - The listing carries the real reason: `probeProvider`
    (`src/generation/providers/server-provider-materialize.ts`) runs the same
    checks as the boot path — host approval, then construction — so a missing
    key row, a rejected host and a failed build each report their own reason.
  - The boot path still skips a broken descriptor (boot must not crash) and
    logs the reason with the provider name.
- **Audit decision re-checked.** The repo still has NO shared `log_entries`
  writer helper — `src/routes/admin/system-config.ts`, `src/chat/moderation.ts`,
  `src/federation/storage-eviction.ts` and `src/gc/archive-expiration.ts` all
  insert into `log_entries` directly — so `server-provider-audit.ts` stays as
  the provider store's own small writer, following that inline convention. Its
  row carries name, base URL, model and approved hosts — never key material.

**Deliberately NOT changed**

- The descriptor key stays `provider.<name>.config`. It only collides with
  `SECRET_KEY_PATTERN` when the operator's provider NAME contains a
  secret-ish substring (`token`, `api-key`, …); renaming the suffix would not
  remove that class of collision, and the row is still read back correctly
  (sealed values are opened on read). Accepted as-is.
- Only openai-compatible instances are materialized (the anthropic / ollama-
  native follow-up below is untouched).

**Follow-up (not implemented here)**

Only openai-compatible instances are materialized (that covers OpenAI,
OpenRouter, Groq, Together, LM Studio, Ollama's OpenAI mode, llama.cpp and
vLLM). Anthropic-native and ollama-native instances are NOT materialized — a
follow-up ticket should extend `materializeServerProviders` for them.

**GATE-FIXING ROUND (backend lane)**

The branch shipped green on its own gates but was red on two repo gates and two
advisories. What changed:

- **Fuzz snapshot regenerated.** `bun run fuzz:gen` re-emitted
  `src/validation/schema-fuzz.generated.test.ts`; the four new admin schemas
  (`AdminServerProviderDescriptor`, `AdminSetupProviderBody`,
  `AdminSetupProviderResponse`, `AdminSetupProvidersResponse`) are now in the
  committed snapshot.
- **19 coverage gaps closed** (`scripts/check/test-gaps.mjs` → `newGaps: []`).
  Module-internal symbols that nothing outside their module imports lost the
  `export` keyword: `SERVER_PROVIDER_NAME_PATTERN`, `DESCRIPTOR_KEY_PREFIX`,
  `DESCRIPTOR_KEY_SUFFIX`, `assertValidAllowedHost` (plus the helpers it owns:
  `assertIpv6AllowedHost`, `assertDomainAllowedHost`, `isHostnameLabel`).
  The public surface got real regression tests instead:
  `server-provider-descriptor.test.ts` (name rules, host approval, key layout,
  stored-row parse), `server-provider-materialize.test.ts` (probe, prepare,
  activate, prune, stored listing, the materialization error),
  `server-provider-audit.test.ts` (the audit row, the failing-row warning, the
  shared log-entry envelope) and `src/validation/schemas/admin.test.ts` (the
  four setup-provider schemas). No new coverage debt was accepted.
- **jscpd ratchet back to baseline.** The audit writer inlined the whole
  `log_entries` row envelope, which cloned `src/routes/admin/danger-zone.ts`,
  `src/middleware/nsfw-gate/logging.ts` and `src/middleware/guest-rate-limit.ts`.
  The envelope now lives in one place — `src/db/log-entries.ts`
  (`logEntryEnvelope(level)`) — and the audit writer spreads it. The route
  body type is derived from the schema (`Static<typeof AdminSetupProviderBody>`)
  instead of a hand-copied inline type, which removes the clone with
  `src/routes/admin/setup-providers.ts`.
- **Plan index re-synced.** `bun run plan:sync:fix` (`giwt sync --fix`) ran in the
  worktree and reported "No status mismatches"; the gate
  `plan - ticket index (sync)` is green. giwt deliberately does not write
  `.plan/tickets/index.json` inside a linked worktree
  (`node_modules/giwt/src/tickets/sync-index-write.ts` — the write is deferred to
  the target branch at finalize time), so the index row for this ticket is
  regenerated when the branch lands.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
