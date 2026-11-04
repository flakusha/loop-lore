<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: optional-dep packaging

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Optional dependency packaging for harness adapters via peerDependencies + dynamic-import capability probe mirroring src/native/loader.ts; in-repo optional modules with isAvailable probe; never bundle binaries. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

Optional-dep packaging for the external harness integration (epic-external-harness-acp §Packaging). Design decisions:

1. **The npm-dep framing is a no-op here — recorded, not implemented.** The epic says "optional deps via peerDependencies + dynamic-import capability probe", but the harness integration drives EXTERNAL binaries over hand-rolled ACP/JSON-RPC stdio; nothing under `src/integrations/harness/` dynamically imports an npm package, and no manifest in the repo carries `peerDependencies`/`optionalDependencies` at all. Adding such entries would be dead manifest weight with no import site, so the epic's packaging concern reduces to binary-presence probing for this codebase. "Never bundle harness binaries" holds by construction: the probe only ever spawns the admin-configured argv.
2. **Probe** (`src/integrations/harness/availability.ts`, mirroring `src/native/loader.ts`) — `probeHarnessCommand({command, envPath?, timeoutMs?, refresh?})` resolves `command[0]` (direct check when it carries a path separator, else a PATH scan) and then spawns `<binary> --version` under a hard timeout (default 2500 ms) to capture the first stdout line. Executability is deliberately not pre-checked: the spawn is the authority, and a found-but-not-runnable file surfaces as a typed `EACCES` reason. Verdict is a discriminated union `{available:true, version:string|null} | {available:false, reason}` — fail-soft, never throws, never spawns a full harness session, never downloads or auto-installs. `envPath` is a test seam so fixtures scope PATH per call without mutating `process.env`. TOCTOU (binary vanishing between scan and spawn) lands in the same typed `spawn failed:` reason.
3. **Cache/invalidation** — per-process `Map` keyed by (PATH scope, `command[0]`) serialized with `safeJsonStringify`; `refresh:true` bypasses and overwrites (surfaced to admins as `GET /api/v1/harness/settings?refresh=1`, so a reinstall does not need a server restart); `__resetHarnessAvailabilityCache()` is the test seam, mirroring `__resetNativeModuleCache`.
4. **Availability surface choice** — the EXISTING admin-gated settings listing (`GET`/`PUT /api/v1/harness/settings`), not a new route and not the models surface: availability is a per-profile static fact the admin reads while deciding whether to enable the integration, and it must answer even when the runtime is uncomposed (the models surface 503s there by design). The probed argv comes from the admin-owned file config (`getHarnessAdminFileConfig().profiles[].command`) — the same caller-input-never-becomes-spawn-argv invariant as the isolation gate. Probing stays OUT of `assertHarnessExecution` deliberately: that gate authorizes agent dispatches; a `--version` probe is an admin-surface read whose authorization is the route's `requirePermission("admin.system")`. Wire shape: `HarnessAvailabilitySchema` in `admin-harness-schema.ts`, so the panel can render it without importing server modules.
5. **Typed spawn-failure mapping verified, not refactored** — the real session path was already typed: `JsonRpcProcess` defers spawn failures to the first request (deferred `onExit` + `failAll`), `GenericAcpAdapter.toAcpError` maps the rejection to `HarnessAcpError` kind `"spawn"`, and all four flavor adapter tests already cover the missing-binary case; no change needed there. Regression surface untouched: unprobed runtime still reads 503 on models/permissions (models.test.ts "reads 503 when the runtime is not composed").

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing (11 new probe tests in availability.test.ts; 3 new route tests in index.test.ts; scoped harness+routes suites 242/242 green; typecheck - backend gate green; eslint 0 errors on touched files; dprint clean; bun run size green)
- [x] Documentation updated (ticket Context = design record; module header documents the npm-no-op reduction; epic checkbox ticked + Status Note updated)
