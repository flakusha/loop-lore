<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): gate traffic until plugins/seeds/assets are ready (or document the boot window)

**Status:** Done
**Status Note:** fixed on this branch — the HTTP(S) listeners now answer 503 "Server is starting" until the seeds, plugins and pre-compressed assets are ready, so a readiness probe can tell "booting" from "broken" (`src/server/start.ts:124-135`, `:238`). Regression test in src/server/start.test.ts ("gates traffic with 503 until the plugins are loaded").
**Priority:** medium
**Effort:** Medium
**Epic:** epic-server-lifecycle-hardening

**Summary:**

Sources: stream-a #8. Where: src/server/start.ts:126 (serve(...)) vs :150-204 (seedDefaults, loadAllPlugins, initAssetCompression, probes after serve). Gap: HTTP serves before admin seedDefaults, loadAllPlugins, and initAssetCompression finish, so early traffic in the boot window gets 404s from unloaded plugin routes or uncompressed assets, with no readiness distinction - and the liveness probes start last, so orchestrators cannot tell booting from broken. Acceptance: either serve starts after init completes, or a readiness probe fails until loadAllPlugins + seeds resolve (observable: probe status differs between booting and broken). Alternatively the boot window is documented as accepted behavior with its duration bounds. Priority: medium - boot-window 404s and undistinguishable readiness for orchestrated deploys.

**Context:**

`serve()` was called before `seedDefaultActors`/`seedConfiguredContent`, `loadAllPlugins` and `initAssetCompression`, so requests in the boot window hit 404s from unloaded plugin routes or unserved assets. Moving the listener after the init work would leave nothing listening during boot (and no readiness signal), so the listener stays open and the traffic is gated instead: a `ready` flag flips to true once the boot work finishes and the gated handler answers 503 with `Retry-After` until then. The gate lives in the request handler so the HTTP and the HTTPS listener share it. Alternative considered: per-route guards for the plugin routes — rejected, that is exactly the per-call-site guard the fix avoids.

**Acceptance Criteria:**

- [x] Requests during the boot window get 503 (not 404/500 from unloaded routes)
- [x] The gate opens only after the seeds, plugins and asset compression are ready
- [x] A readiness probe can distinguish "booting" from "broken" (503 vs a served response)
- [x] Regression test asserts the 503 during boot (fails before the fix, passes after)
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Root cause: `serve({ fetch: handleRequest })` was registered before the seed/plugin/asset init work, so early traffic reached a half-initialized app.
- Changed `src/server/start.ts:124-135` (readiness gate + 503 response), `:162`/`:173` (both listeners use the gated handler), `:238` (`ready = true` after the init work).
- Regression test: `src/server/start.test.ts` — "gates traffic with 503 until the plugins are loaded" (2 pass / 3 fail before the fix, 5 pass / 0 fail after).
