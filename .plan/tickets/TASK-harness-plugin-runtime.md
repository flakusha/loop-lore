<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness plugin runtime field (polyglot adapters)

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** `runtime` field on PluginManifest (default bun) + `RuntimeAdapter` switch in `loadSinglePlugin`; node via worker threads, py via subprocess+JSON-RPC. Manifest + origin-capability gate are reuse; adapters are new.
**Context:** Plugin system (`plugins/loader.ts`, `registry.ts`, `types.ts`, `registry-policy.ts`): startup-only dynamic `import()` from `plugins/{core,community,local}/`, 6-capability taxonomy gated per origin, no hot-reload/IPC. Only non-test `bun:` import is `bun:ffi`; server/adapter surface is Bun-only (`BunAdapter`, `bun:ffi` dlopen, `Bun.spawnSync`, `Bun.file`, `import.meta.dir`). Core ships 5 plugins, community 2.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `PluginManifest.runtime?: 'bun' | 'node' | 'py'` (default `"bun"`); `loadSinglePlugin()` (`loader.ts:122`) switches on it; unknown runtime → null-fallback (same cached-module-with-null pattern as `src/native/loader.ts`).
- [ ] `RuntimeAdapter { load, isAvailable }`; `BunAdapter` wraps current dynamic import; node adapter via worker threads, py adapter via spawned subprocess + JSON-RPC. Zero subprocess/worker primitives exist in plugins/assistant/generation-tools today — adapters are the new code.
- [ ] Origin-capability map (`registry-policy.ts:7-11`) applies unchanged to non-bun runtimes; no hot-reload, no plugin-to-plugin IPC (still out).
- [ ] Unit tests: manifest default, adapter fallback when runtime missing, capability gate on non-bun plugin.

## Related Files

- `src/plugins/types.ts`, `loader.ts:29-33,86,122`, `registry.ts`, `registry-policy.ts`, `src/native/loader.ts` (pattern)
- `epic-plugin-system.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 49ae132
