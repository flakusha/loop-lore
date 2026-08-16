<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# 03 — Extensibility Code Patterns

## Current state

- **Route mounting is manual & dual-path.** `src/elysia-app.ts` registers
  ~30 migrated route modules via `app.use(...Routes(handleOpts))`, then a
  catch-all `app.all("/*")` delegates `/api/*` to `handleApiRequest`
  (legacy dispatch in `src/server.ts`) and everything else to
  `handleNonApiRequest` (views). Two dispatch surfaces = two code paths to
  keep in sync.
- **Plugin routes are a third dispatch path.** `dispatchPluginRoute`
  (`src/plugins/loader.ts`) linearly scans every registered plugin route per
  request and runs _after_ Elysia routes (via the catch-all).
- **Generation already models a pipeline.** Per `AGENTS.md`, `src/generation/`
  has a step-pipeline, cancellation, continuation. This pattern is the
  template the rest of the request layer should copy.
- **Plugin extension points are declared** (tools, agent roles, API routes,
  UI components, event handlers, migrations) but mostly **unwired** — see
  `08-plugins-hooks-integration.md`.

## Gaps

### 1. Dual dispatch is a maintenance trap

New endpoints must be added in _both_ the Elysia module **and** (if legacy)
`handleApiRequest`. Drift between the two is silent. The catch-all also
means plugin routes can never participate in Elysia's auth/validation
pipeline.

### 2. Handlers exceed safe complexity

`generate-route.ts#handleGenerate` (66), `image-gen-route.ts#handleImageGeneration`
(64), `auto-gen.ts#triggerAutoGeneration` (58) — see `02` for the full
list. These are exactly the functions that need to be extensible (hooks,
pluggable providers) but are too dense to safely modify.

### 3. No cross-cutting extension seams

There is no shared notion of "a request is about to generate" or "a message
was created" that features/plugins can hook. The generation pipeline is
internal; domain events are not emitted.

## Recommendations

1. **Collapse to one dispatch surface.** Finish migrating all routes into
   Elysia modules; delete `handleApiRequest`'s route knowledge (keep it only
   as a 404/error fallback). Register plugin routes _into_ Elysia at startup
   (see `08`).
2. **Extract a route registry.** Replace the 30 inline `app.use(...)` calls
   with an array `const routeModules = [...]` iterated once. Plugins append
   to the same registry at load → uniform mounting, no special-casing.
3. **Decompose handlers into pipeline steps.** Apply the generation
   step-pipeline shape to `generate-route`, `image-gen`, `messages` streaming,
   and `auto-gen`. Each step is a small pure-ish function; the orchestrator
   composes them. This is what makes hooks/plugins attachable later.
4. **Introduce domain events + a tool bus as first-class seams** (covered in
   `08`): `EventBus.emit("message.created", …)`, `ToolRegistry.execute(...)`.
   Core services call these; plugins subscribe. This is the extensibility
   primitive the manifest already promises.

## Suggested steps

- Create `src/routes/registry.ts` exporting `routeModules: RouteModule[]`;
  refactor `elysia-app.ts` to `for (const m of routeModules) app.use(m(deps))`.
- Move `handleApiRequest` to a pure 404/error responder; route all real
  endpoints through Elysia modules.
- Split `generate-route.ts` into `src/generation/steps/` (buildPrompt,
  callProvider, streamToClient, persist, postProcess). Same for image-gen.
- Land `EventBus` + `ToolRegistry` (see `08`) and have core services emit/
  execute at the natural seams.
