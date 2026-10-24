<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: BYOK store rejects non-openaiCompatible provider names

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

POST /api/user-api-keys validates only against openaiCompatible names (src/routes/api-keys.ts:82-86) — 400 Unknown provider for native anthropic/ollamaNative even though resolveProvider would accept. Fix: validate against union of openaiCompatible + anthropic + ollamaNative names.

**Context:**

The accepted-name list was duplicated in two places — the BYO store route and the BYO key resolver — and each copy knew a different set of provider names. The route checked `config.generation.providers.openaiCompatible` only, so a user could not store a BYO key for the native `anthropic` or `ollamaNative` instances even though the provider registry dispatches to them and `resolveProvider` resolves them.

Fix shape: one shared function that derives the configured provider instances, used by every caller that needs "which provider names exist". The set is deliberately the registry-backed instances — the openai-compatible entries, the native `anthropic` instance and the native `ollamaNative` instance — because those are the instances the provider registry can dispatch to. The configured `bedrock` instance has no provider implementation yet, so it stays out of the store's accepted set.

Constraints: no new config knob; the accepted-name list must not drift from the registry's own set of instances.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (no user-facing surface changed — the route already answered `400 Unknown provider`; it now accepts the names the registry supports)

## Resolution

- `src/generation/providers/provider-instances.ts:28` — new `listProviderInstances(config)` returns every registry-backed configured instance (openai-compatible entries, `anthropic`, `ollamaNative`) with its `allowUserApiKey` flag; `findProviderInstance(config, name)` (`:56`) resolves one by name.
- `src/routes/api-keys.ts:84` — the BYO store now validates against that full set instead of `openaiCompatible` only, so `anthropic` and `ollamaNative` names are accepted and an unknown name still answers `400`.

Regression test: `src/routes/api-keys.providers.test.ts` — "a native anthropic provider name is accepted" and "a native ollama provider name is accepted" (both fail before the fix with `400`), "a config without openai-compatible providers still resolves the native ones" (fails before the fix with `500` — the old route dereferenced an absent `openaiCompatible` array), "an unknown provider is still rejected" (`400` kept), "the shared instance list covers every registry-backed provider", "a provider that forbids user keys is reported as such".
