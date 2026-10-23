<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: model native locale config

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** output-control-transforms
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Make the LLM's native locale a first-class, panel-editable attribute of
each LLM integration, working for server API and BYOK alike. Decided
direction — the research hybrid (option c, operator default + DB
override, mirroring the `model_role_overrides` precedent):

- **Config default (operator)**: `locale?: string` on
  `ProviderInstanceConfig` (`src/config/schema/providers.ts:19-40`) and
  the Bedrock twin (`:119-140`); `LLM_PROVIDER_LOCALE` wired in
  `applyProviderEnvVars` (`src/config/load/env.ts:79-107`). Validated
  against `isLocale()` / `LOCALE_REGISTRY`
  (`src/i18n/locale-registry.ts:12-23,39-41`).
- **DB override (panel)**: `native_locale TEXT` (nullable) on
  `model_capabilities`, delivered as a column in the final form via the
  **DB Migration Compaction (Path B)** (`epic-db-migration-compaction.md`);
  documented fallback if compaction has not landed when implementation
  starts: an append-only migration per current policy (SQLite
  one-column-per-alter rule). Note: migration numbering is convention —
  parallel branches already claim `071` concurrently and the ordering
  gate enforces unique prefixes only at merge; do not anchor to "next
  free number". Then `bun run db:sync-types` /
  `db:sync-manifest`.
- **Rescan protection**: `native_locale` must stay OUT of both upsert
  update sets in `upsertModelCapabilities`
  (`src/admin/model-capabilities.ts:33-102` — user_override rows only
  bump `last_seen` :47-54, auto rows overwrite auto-detected fields
  :55-72) and out of the insert values (:73-95), so
  `scanAllProviders` never clobbers an admin-authored locale — the same
  pattern that protects existing override fields. Optional convenience:
  backfill NULLs from the instance config only while still NULL.
- **Admin surface**: extend the PATCH/DELETE
  `/api/admin/model-capabilities/:provider/:model` body + handler
  (`src/routes/admin/model-capabilities.ts:78-133` — PATCH body at
  :112-119, guard `admin.system`) and `setModelOverride`/
  `clearModelOverride`; capabilities card in `admin.html` (:1192-1214)
  and the Alpine `src/frontend/alpine/admin-models/capabilities.ts`
  form.
- **Precedence for the effective LLM locale**:
  `model_capabilities.native_locale` → provider config `locale` → chat
  `gm_config.contentLanguage` assumption → `en`.
- **BYOK**: inherits per-model locale with zero new code — BYOK stores
  only keys bound to server-declared instances
  (`userKeyAllowed`, `src/generation/providers/user-api-key.ts:28-36`),
  so server and BYOK requests resolve to the same
  `(provider_name, model)` identity and the model's locale is a
  property of the model, not of whose key pays.
- **Consumer**: `buildTranslateDeps` (`src/chat/auto-translate.ts`)
  and the eager-translation trigger read the effective locale;
  document that the response's presumed source locale = this value.

**Context:**

Nothing locale-like exists on providers or models today (research:
`src/config/schema/`, `src/admin/` — no `locale|language` hits). The
chat-first translation design (`FEAT-message-translations-chat-first`)
needs the model's presumed source locale as the eager-trigger
comparator; operator-declared defaults belong in provider config, while
per-model panel overrides need a live write path — which today exists
only as `model_capabilities` overrides and `model_role_overrides` rows
(config-file provider edits are restart-classified and instances cannot
be edited from the panel at all).

Open questions for the owner (do not resolve unilaterally):
- Should moderators (below `admin.system`) get a narrower write
  permission for locale edits specifically, or stay admin-only with
  read-only GET?
- Is a per-user locale override over BYOK keys ever needed? Deferred —
  if it ever is, `users.settings.llmLocale` JSON (no migration) is the
  shape; a `user_api_keys` column buys little (keys are per-provider,
  not per-model).

**Caveats:**

- **Rescan clobber risk**: `scanAllProviders` upserts every healthy
  provider's models on every rescan; a locale column that lands in the
  auto-update set is silently wiped. The stay-out-of-update-sets rule is
  the acceptance test.
- **Discovery gap**: `model_capabilities` rows only exist after a
  healthy rescan — locale cannot be set for a never-discovered model;
  the provider-config default covers that case.
- **Migration discipline**: pre-release edit window ratified — schema
  edits land in the compaction final form (`epic-db-migration-compaction.md`)
  while no signed tag exists; fallback is append-only per current policy.
  Every edit re-runs the regeneration chain + both migration test
  suites, and dev DBs are regenerated via `db:reinit` (auto-archived).
  Numbering collisions across branches resolve at finalize via the
  ordering gate (mechanical renumber).
- **Validation boundary**: reject unknown locale codes at the admin
  PATCH boundary with `isLocale()`; config values failing validation
  fail config load (loader throw convention), not silent acceptance.
- **TOCTOU/authz**: PATCH/DELETE keep the `requirePermissionUserId(ctx,
  "admin.system")` guard; moderator-read asserts stay covered by the
  existing route tests (`model-capabilities.test.ts`).
- **Rollback**: nullable additive column + additive config key; rollback
  = stop reading `native_locale`; no data rewrite.

**Acceptance Criteria:**

- [ ] `locale?: string` on `ProviderInstanceConfig` + Bedrock twin;
      `LLM_PROVIDER_LOCALE` wired; invalid values fail load with a
      named error
- [ ] `model_capabilities.native_locale` (nullable TEXT) present in the
      final-form schema (compaction path; append-only fallback per
      current policy); `db:sync-types` / `db:sync-manifest` /
      `schemas:check` pass; migration roundtrip test green
- [ ] `native_locale` absent from both upsert update sets and the insert
      values; rescan does not clobber an admin-set locale (test)
- [ ] PATCH/DELETE `/api/admin/model-capabilities/:provider/:model`
      accept + validate `nativeLocale` (`isLocale`), `admin.system`
      guard intact, moderator → 403 test unchanged; capabilities card +
      Alpine store editable
- [ ] Effective-locale resolution
      (`native_locale` → provider `locale` → chat contentLanguage →
      `en`) implemented in `buildTranslateDeps`; eager-translation
      trigger consumes it
