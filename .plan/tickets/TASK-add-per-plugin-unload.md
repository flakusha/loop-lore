<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add per-plugin unload

**Status:** Not Started
**Priority:** medium
**Epic:** epic-plugin-system
**Effort:** Medium

**Summary:**

**Problem.** `unloadAllPlugins` is the only unload path and the registry store's `clear()` wipes every collection at once. There is no way to unload, and therefore no way to reload, a single plugin. Per-plugin reload is the prerequisite for hot reload.

**Evidence.**
- `src/plugins/loader.ts:257-271` `unloadAllPlugins()` iterates `loadOrder.reverse()`, calls each `onUnload`, then calls `registry.unregisterAll()` (`:269`) and clears `loadOrder`. There is no single-plugin counterpart.
- `src/plugins/registry-store.ts:155-163` `clear()` clears `routes`, `tools`, `agentRoles`, `uiComponents`, `eventHandlers`, `migrations`, and `enabledMap` in one shot — no per-name variant.
- `src/plugins/registry.ts:184-186` `unregisterAll()` clears the plugin map then calls `store.clear()`. Same shape: all or nothing.
- `grep -n 'unregister|perPlugin|clear()' src/plugins/registry-store.ts` returns only the block above — no per-plugin removal exists.
- `src/plugins/loader.ts:174` `loadOrder.push(manifest.name)` gives the registry a per-name key; nothing consumes it for unload.

**Impact.** One plugin cannot be cycled without cycling the whole registry. Hot reload cannot be built on top of this, and so neither can a per-plugin disable, a safe retry after a failed load (filed separately), or targeted test teardown.

**Fix direction.** Add `unloadPlugin(name)` mirroring `loadSinglePlugin`: call that plugin's `onUnload` if present, remove its entries from each registry collection and its `enabledMap` entry, drop it from the plugin map, and remove it from `loadOrder` — then make `unloadAllPlugins` iterate that rather than reaching for `unregisterAll`, so there is one implementation. Add the per-name removal primitive to `registry-store.ts` alongside `clear()`; keep `clear()` for the shutdown path only.

**Verification.** Unloading one plugin leaves every other plugin's routes, tools, and roles intact and still dispatchable; a name not in `loadOrder` is a no-op rather than an error.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
