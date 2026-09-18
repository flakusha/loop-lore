<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-048: Plugin Security & Sandboxing

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Plugin permission boundaries and resource quotas.
**Context:** Extension-points layer; deeper sandbox deferred to epic-plugin-system.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: plugins, security
**Epic**: epic-plugin-extension-points
**Assignee**:

## Summary

Locks down the plugin extension-points surface so untrusted plugin code cannot exceed its declared scope. Covers plugin-state gating (`plugin_state.status` ↔ `registry.setEnabled`), handler timeout enforcement (`executePluginTool` + `DEFAULT_TOOL_TIMEOUT_MS`), event-handler error isolation (`emitPluginEvent` per-handler try/catch), and route/tool registration provenance checks. The deeper isolation story (WASM/`vm`-module sandbox, per-plugin resource caps, audit log) is tracked under `epic-plugin-system.md`.

## Context

- Subsystem: `src/plugins/` (loader, registry, tool-executor, event-bus).
- State gate: `loadAllPlugins` reads `plugin_state` rows; rows with `status !== "active"` call `registry.setEnabled(name, false)` (`src/plugins/loader.ts`).
- Tool timeout: `executePluginTool` races `tool.handler(params, ctx)` against `tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS` (30s) and folds both throws and timeouts into `{ isError: true }` (`src/plugins/tool-executor.ts`).
- Event isolation: `emitPluginEvent` wraps each handler in try/catch and routes failures through `opts.onError` without breaking dispatch (`src/plugins/event-bus.ts`).
- Mount-point trust: `getComponentsForMountPoint` returns raw `UIComponentDefinition[]`; trust is delegated to the views layer.
- Upstream: depends on `TASK-046` (override) for scope decisions and `TASK-047` (API) for the entrypoint contracts.

## Acceptance Criteria

- `registry.setEnabled(name, false)` causes subsequent `dispatchPluginRoute` / tool lookups to skip the plugin (verify via `loader-dispatch.test.ts`).
- A plugin tool handler that throws synchronously still yields `{ isError: true, content: <json-with-error> }`; never rejects the caller (`src/plugins/tool-executor.ts`).
- A handler exceeding `tool.timeoutMs` is rejected with `Tool "<name>" timed out after <ms>ms` and folded into the same `isError` shape.
- A throwing `EventHandlerDefinition.handler` does not prevent later matching handlers from running; `opts.onError` is invoked for each failure (`src/plugins/event-bus.ts`).
- Plugin manifest provenance (`PluginOrigin = "core" | "community" | "local"`) is the gate for which extension points the plugin may register (placeholder until overrides/spec schema lands).

## Related Files

- `src/plugins/loader.ts` *(existing)* — persisted `plugin_state` → enabled-map.
- `src/plugins/tool-executor.ts` *(existing)* — timeout race + isError contract.
- `src/plugins/event-bus.ts` *(existing)* — `EmitOptions.onError` error isolation.
- `src/plugins/types.ts` *(speculative)* — eventual `PluginPermission` / `ResourceLimits` shape.

## Notes

- Speculative items are marked; verify against current `src/plugins/` before implementation.
- Full sandbox (`vm`, WASM), resource limits, and audit log live under `epic-plugin-system.md` — defer here.
- Cross-plugin interference prevention currently relies on registration-order semantics in `PluginRegistry`; explicit isolation is not yet implemented.
