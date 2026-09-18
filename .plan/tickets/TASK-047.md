<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-047: Plugin API System

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Public plugin API surface — tool executor, event bus, UI component mount points.
**Context:** Stabilizes the plugin↔core contract via existing API surfaces.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: plugins, rpg, api
**Epic**: epic-plugin-extension-points
**Assignee**:

## Summary

Defines the API surface plugins consume to interact with extension points: route registration via `RouteDefinition`, tool execution via `executePluginTool` (FEAT-049), event dispatch via `emitPluginEvent` (FEAT-048), and UI component resolution via `getComponentsForMountPoint` (FEAT-050). Scopes the TypeScript API only; REST/WebSocket/CLI gateway variants are tracked under the parent `epic-plugin-system.md`.

## Context

- Subsystem: `src/plugins/` — barrel `index.ts` re-exports every public entrypoint.
- Types: `RouteDefinition`, `ToolDefinition`, `AgentRoleDefinition`, `UIComponentDefinition`, `EventHandlerDefinition`, `MigrationDefinition`, `PluginConfigSchema` (`src/plugins/types.ts`).
- Executor: `executePluginTool(tool, params, ctx?)` in `src/plugins/tool-executor.ts` races the handler against `DEFAULT_TOOL_TIMEOUT_MS` (30s) and surfaces errors as `{ isError: true }`.
- EventBus: `emitPluginEvent(handlers, event, data?, opts?)` in `src/plugins/event-bus.ts` invokes matching handlers in registration order with per-handler error isolation.
- Mount points: `KNOWN_MOUNT_POINTS` + `getComponentsForMountPoint` in `src/plugins/mount-points.ts` resolve UI components per location (`chat.header`, `chat.sidebar`, `chat.composer`, `admin.dashboard`).
- Loader wires these into startup in `src/plugins/loader.ts` via `registry.addRoutes/...` calls.

## Acceptance Criteria

- `PluginRegistry.addRoutes/addTools/addAgentRoles/addUIComponents/addEventHandlers/addMigrations` accept plugin-scoped definitions and key them by `pluginName` (`src/plugins/registry.ts`).
- `executePluginTool` returns `{ isError: true, content: <json> }` for both handler throws and `tool.timeoutMs` races (`src/plugins/tool-executor.ts`).
- `emitPluginEvent` continues iterating after a throwing handler and reports via `opts.onError`; returning handler count matches `registry.getAllEventHandlers().filter(h => h.event === event).length`.
- `getComponentsForMountPoint` returns components in registration order for the requested `MountPointLocation` (`src/plugins/mount-points.ts`).
- `mergePluginConfig` remains the single merge entrypoint; plugin API consumers receive merged config via `PluginContext.config`.

## Related Files

- `src/plugins/types.ts` *(existing)* — API contract types.
- `src/plugins/tool-executor.ts` *(existing)* — `executePluginTool` + `DEFAULT_TOOL_TIMEOUT_MS`.
- `src/plugins/event-bus.ts` *(existing)* — `emitPluginEvent` + `EmitOptions`.
- `src/plugins/registry.ts` *(speculative)* — typed getters for routes, tools, agent roles, UI components.

## Notes

- Speculative items are marked; verify against current `src/plugins/` before implementation.
- REST/WebSocket/CLI gateway surfaces are deferred to `epic-plugin-system.md`.
- API versioning scheme and per-plugin rate limits are TBD — coordinate with `TASK-046` (override) and `TASK-048` (security/sandboxing) before designing.
