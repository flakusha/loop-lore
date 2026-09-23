<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-046: Plugin Override System

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Plugin override hooks for service-level defaults; per-plugin config schema merge.
**Context:** Plugin extension-points layer; override pattern for registered services.
**Acceptance Criteria:** See ## Acceptance Criteria below.


**Status**: open
**Priority**: medium
**Labels**: plugins, security, rpg, override
**Epic**: epic-plugin-extension-points
**Assignee**:

## Summary

Defines the override layer for the plugin system: stored plugin configuration and per-plugin behavior overrides merge with manifest defaults via `mergePluginConfig` (FEAT-051), with `PluginConfigSchema.required` enforced at merge time. This is the extension-points slice of override work; the broader override engine (method/class/behavior override chains) is tracked separately under `epic-plugin-system.md`.

## Context

- Subsystem: `src/plugins/` (types, registry, loader, config-merge, event-bus, tool-executor, mount-points).
- Anchor call: `mergePluginConfig(defaults, stored, schema?)` in `src/plugins/config-merge.ts` deep-merges plain objects (arrays/scalars replaced) and validates `PluginConfigSchema.required` keys survive.
- Types: `PluginManifest`, `PluginConfigSchema`, `PluginContext` in `src/plugins/types.ts`.
- Persistence: `plugin_state` table read by `loadAllPlugins` (`src/plugins/loader.ts`) — overrides typically persist alongside plugin state.
- Upstream: relies on extension-points epic being wired (EventBus FEA-048, ToolExecutor FEA-049, mount-points FEA-050) so overrides can target each extension surface.

## Acceptance Criteria

- Stored plugin config merges over `manifest.defaults` via `mergePluginConfig` with `stored` winning per key, including nested plain-object keys (see `src/plugins/config-merge.ts`).
- `mergePluginConfig` throws when any key listed in `PluginConfigSchema.required` is absent from the merged result, matching current contract.
- Loader applies persisted override at startup: `plugin_state.status === "active"` enables, anything else disables (`src/plugins/loader.ts`, `registry.setEnabled`).
- Per-extension-point overrides can target routes, tools, agent roles, UI components, event handlers, and migrations via `PluginRegistry` (`src/plugins/registry.ts`).
- Placeholder unit tests in `src/plugins/placeholders.test.ts` exercise override precedence for at least one extension point family.

## Related Files

- `src/plugins/config-merge.ts` *(existing)* — `mergePluginConfig` deep-merge + required-key enforcement.
- `src/plugins/types.ts` *(existing)* — `PluginConfigSchema.required` and manifest defaults.
- `src/plugins/registry.ts` *(existing — verified 2026-09-23)* — override-aware `addRoutes`/`addTools`/etc. + `setEnabled` + `getEnabledRoutes`.
- `src/plugins/loader.ts` *(existing — verified 2026-09-23)* — `loadAllPlugins` applies persisted `plugin_state.status === "active"` via `registry.setEnabled`.

## Test Coverage

- `src/plugins/placeholders.test.ts` (existing — extended 2026-09-23) now includes the **routes extension-point family** override-precedence tests:
  - "disabled plugin's routes are excluded; enabled plugin's routes win" — uses `registry.addRoutes`, `registry.setEnabled`, `registry.getEnabledRoutes` to assert that disabling a plugin removes its routes from the dispatch list.
  - "config merge feeds plugin_state.config into the routes family override" — verifies the `mergePluginConfig` flow (stored overrides win over manifest defaults) into `setEnabled`.

## Notes

- All four "Related Files" entries are existing — speculative markers removed 2026-09-23 after verifying against `src/plugins/`.
- Sibling epic `epic-plugin-system.md` owns the full override engine (method/class/behavior chains); this ticket scopes the extension-points layer.
- Per-extension-point override ordering (priority, last-wins, first-wins) is still TBD — defer until extension-points epic lands.
