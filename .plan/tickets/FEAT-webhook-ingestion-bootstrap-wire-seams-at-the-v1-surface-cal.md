<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Webhook ingestion bootstrap: wire seams at the v1 surface call site

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-integrations-core

**Summary:**

`integrationsSurface` is mounted with ONE argument at `src/routes/v1/index.ts:64`:

```
.use(integrationsSurface(opts,),)
```

The second parameter `seams` defaults to `{}` (`src/routes/v1/integrations-surface.ts:234`), so `deps.adapterSecrets` is always `{}` (`:238`). Every POST to `/api/v1/integrations/webhooks/:adapter` therefore hits the default-deny path: `secretRef === undefined` returns `unknown_adapter` (`:143-145`), which `toErrorResponse` maps to 404 (`:205-206`). The inbound webhook endpoint is unreachable in production for every adapter.

**Context:**

This is DOCUMENTED INTENT, not a regression. The JSDoc at `src/routes/v1/integrations-surface.ts:226-227` states the seams "carry the ingestion dependencies until the integrations bootstrap wires config" — the mount site was deliberately left incomplete. Commit `6dfd4d7dc` ("feat(integrations): core seams, config, secrets, health, webhooks") added the 2 lines to `src/routes/v1/index.ts` with the single-arg call; it was never wired correctly, so no behaviour regressed.

There is also NO CONFIG SOURCE to wire from. `IntegrationsConfig` (`src/config/sections/integrations.ts`, `src/config/schema/integrations.ts`) covers exactly email, matrix, xmpp, telegram, discord, irc, nostr — there is no webhook section anywhere under `src/config/`. The bootstrap must decide where adapter secrets come from (new config section vs. reusing the `src/integrations/secrets.ts` credential envelopes) before the second argument can be non-empty.

**THE IMPORTANT PART — test/production divergence:**

`src/routes/v1/integrations-surface.test.ts` builds `deps` inline at `:91-96`:

```
return new Elysia().use(
  integrationsSurface(registerOpts, {
    bridge: recordingBridge(calls, dispatched,),
    adapterSecrets: { [ADAPTER]: SECRET, },
    limiter,
    ...surfaceOpts,
  },),
);
```

It constructs its own bare Elysia and calls the surface DIRECTLY, bypassing `v1Routes` entirely. The production call site at `index.ts:64` is never executed by any test. Consequence: the suite stays green while the feature is 100% unreachable, and a future refactor could "fix" `index.ts:64` without a single test failing. The 404-everything behaviour is currently invisible to CI.

**Acceptance Criteria:**

- [ ] An integration test exercises the REAL call path — a request through `v1Routes(opts,)` / `buildApp(...)`, not a hand-built `new Elysia().use(integrationsSurface(...))`. The divergence at `integrations-surface.test.ts:91-96` must be closed or explicitly justified.
- [ ] The production mount at `src/routes/v1/index.ts:64` passes a non-empty `seams`. The assertion is a signed webhook request through the real router returning 202, not 404.
- [ ] A regression guard FAILS if `integrationsSurface` is called with fewer than 2 arguments at the mount site (type-level: make `seams` a required parameter, or a test that reads the mount).
- [ ] Documented decision on the config source: which config surface supplies `adapterSecrets` (new `webhooks` section under `IntegrationsConfig`, or `src/integrations/secrets.ts` envelopes). Record it in the JSDoc at `integrations-surface.ts:226-227`, which currently defers to this bootstrap.
- [ ] Rate limiter and `MessageBridge` injected through the same seams path — not left to defaults.
- [ ] Default-deny preserved: an adapter with no configured secret still 404s.
- [ ] Tests passing
- [ ] Documentation updated

