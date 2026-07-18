# 08 — Plugins: Specifications, Hooks & Integration

## Current state (strong foundation)

`src/plugins/` already has a mature **manifest model**:

- `types.ts` — `PluginManifest` (name, version, onLoad/onUnload, `tools`,
  `agentRoles`, `apiRoutes`, `uiComponents`, `eventHandlers`, `migrations`,
  `configSchema`), `PluginContext` with `register*` functions, and all
  extension-point definitions.
- `loader.ts` — scans `plugins/core` → `community` → `local`, loads
  `plugin.ts`, calls `onLoad(context)`, persists `plugin_state`, reverse-order
  `unloadAllPlugins`.
- `registry.ts` — a `PluginRegistry` with per-extension-point `Map`s and
  public getters (`getAllRoutes()`, `getAllTools()`, …).
- `docs/spec/plugin-system.md` — extension points + security notes.

This is a good design on paper. **The problem is that most extension points
are declared but never invoked by core.**

## Gaps (critical)

### 1. No event bus → `eventHandlers` never fire
`registerEventHandler` populates `registry.eventHandlers`, but **nothing in
core calls `emit()`**. Plugins subscribe to events (`message.created`,
`generation.started`, …) that are never published. The extension point is
dead.

### 2. No tool executor → `tools` never run
`registerTool` populates `registry.tools`, but there is no
`ToolRegistry.execute(name, params)` that generation/assistant invoke. Tools
are declared, never called. (`generate-route.ts` has its own internal tool
handling, separate from the plugin registry.)

### 3. UI components never mounted
`UIComponentDefinition` (name/location/props) is registered but no view or
partial reads the registry to inject a component. There is no slot/endpoint
for a frontend to discover or render plugin UI.

### 4. `configSchema` never merged
`manifest.configSchema` is declared but not merged into the global `Config`
at load. Plugins can't extend configuration.

### 5. Plugin API routes bypass Elysia
`dispatchPluginRoute` linearly scans all plugin routes per request and runs
*after* Elysia routes via the catch-all — so plugin routes get **no** Elysia
auth/validation and pay an O(n) scan on every request.

### 6. Lifecycle & trust gaps
- No dependency ordering or version-compatibility check between plugins.
- `sandboxed` flag on `ToolDefinition` is declared but unused — no isolation
  is actually applied.
- No plugin test harness / fixture for authors.
- Trust model (local trusted, community untrusted) is undocumented at the
  loader level.

## Recommendations (in priority order)

1. **Add a core `EventBus`** (`src/plugins/events.ts`): typed `emit(event, payload)`
   + `on(event, handler)`. Define a canonical event catalog
   (`message.created`, `chat.created`, `generation.started`,
   `generation.completed`, `user.created`, …). Core services call `emit` at
   the natural seams. `registerEventHandler` subscribes via the bus.
2. **Add a `ToolRegistry` executor** (`src/plugins/tools.ts`):
   `execute(name, params)` resolves from `registry.tools`, honors
   `permissions` + `sandbox` (at minimum a documented trust gate), and returns
   `ToolResult`. Generation/assistant call `execute` for plugin tools.
3. **Mount UI components.** Add `GET /api/plugins/ui-components` returning the
   registered descriptors, and define named slots in `src/views`/`src/partials`
   (e.g. `<!-- plugin:chat-sidebar -->`) that the frontend hydrates from that
   endpoint. Document the slot names in `docs/spec/plugin-system.md`.
4. **Merge `configSchema` at load.** After `onLoad`, deep-merge each plugin's
   `configSchema` into a validated `PluginConfig` map exposed via
   `getPluginConfig(name)`.
5. **Register plugin routes into Elysia.** In `loader.ts` (post-load), push
   each `apiRoutes` entry through a `registerPluginRoutes(app)` that adds them
   as real Elysia routes (with auth/validation). Delete `dispatchPluginRoute`'s
   linear scan.
6. **Lifecycle hardening.** Add `manifest.peerDependencies` + a load-order
   resolver; validate `manifest.engine` (min loop-lore version) before load;
   document the trust model (local = full, community = sandboxed by default);
   implement the `sandboxed` gate or remove the flag.
7. **Author tooling.** Ship a `plugins/local/example/` plugin exercising every
   extension point + a unit test using the new event/tool buses, so the
   contract is locked by tests.

## Suggested steps

- Create `src/plugins/events.ts` (`EventBus`) + `src/plugins/tools.ts`
  (`ToolRegistry`); wire `emit` into core services (messages, generation,
  chats, users).
- Update `registry.ts` `registerEventHandler`/`addTools` to bind to the buses.
- Add `src/routes/plugins-ui.ts` (`GET /api/plugins/ui-components`) + view
  slots; update `docs/spec/plugin-system.md` slot list.
- Change `loader.ts`: after load, call `registerPluginRoutes(app)`; delete
  `dispatchPluginRoute`.
- Add `configSchema` merge in `loader.ts` → `getPluginConfig`.
- Add `plugins/local/example/` + `plugins/registry.test.ts` covering the buses.
