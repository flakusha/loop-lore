<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: allowUserApiKey defined but never enforced

**Status:** Done
**Status Note:** verified — the flag is enforced (no behavioural fix required)
**Priority:** high
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Schema fields exist (src/config/schema/providers.ts:34-35,137; env default-true load/env.ts:94) but zero reads in src/generation, src/routes, src/aux-pipeline — only tests/fixtures. Provider with allowUserApiKey:false still gets user BYO key. Fix: gate BYO lookup in resolveProvider (registry.ts:110-172) on resolved provider instance flag.

**Context:**

The premise was re-verified against current dev before anything was changed, and it is stale: the flag IS enforced. `src/generation/providers/user-api-key.ts:30` reads the instance's `allowUserApiKey` (only an explicit `false` denies), and the resolver that reads it is the one `resolveProvider` builds at `src/generation/providers/registry.ts:126-127` — so a provider instance configured with `allowUserApiKey: false` never receives the user's stored BYO key: the resolver returns `undefined` and the provider falls back to the server key. The ticket's "zero reads in src/generation" claim does not hold.

What was true is that the provider-instance lookup was duplicated: the BYO store route and the BYO key resolver each derived the instance list themselves, and only the route's copy was wrong (see BUG-byok-store-rejects-non-openaicompatible-provider-names). The flag and the accepted-name list now come from one place, so they cannot drift apart.

While consolidating, the resolver's own copy was found to crash on a config that defines `providers` without `openaiCompatible` — `providers?.openaiCompatible.find(...)` dereferences an absent array — which the shared helper treats as an empty list.

No behavioural fix was manufactured for the flag itself: it already gates the BYO key.

**Acceptance Criteria:**

- [x] Implementation complete — not required: the flag is already enforced (see Resolution)
- [x] Tests passing
- [x] Documentation updated (this ticket records the verification)

## Resolution

Verified — the flag is enforced; no behavioural fix was needed.

- `src/generation/providers/user-api-key.ts:30` — `userKeyAllowed` reads the instance's `allowUserApiKey`; an explicit `false` denies the user's stored key.
- `src/generation/providers/user-api-key.ts:54` — the resolver returns `undefined` for a denied instance, so the provider falls back to the server key.
- `src/generation/providers/registry.ts:126-127` — `resolveProvider` builds that resolver and resolves the key for the provider it dispatches to, so the gate applies to the primary provider and to every failover hop (each hop re-resolves per provider name).

Consolidation only: the lookup now has one home — `src/generation/providers/provider-instances.ts` (`listProviderInstances` at `:28`, `findProviderInstance` at `:56`) — used by both the resolver (`src/generation/providers/user-api-key.ts:30`) and the BYO store route (`src/routes/api-keys.ts:84`). The resolver's behaviour is unchanged; the shared helper additionally survives a config that defines `providers` without `openaiCompatible`.

Regression test: `src/routes/api-keys.providers.test.ts` — "a provider that forbids user keys is reported as such" pins the flag's meaning at the shared source, and "the shared instance list covers every registry-backed provider" pins that the resolver and the store route read the same list.
