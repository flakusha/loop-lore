# 02 — Loop-Lore Plugin System: Inventory, Lifecycle, and Gap Analysis

**Date:** 2026-10-07
**Scope:** `src/plugins/**`, `src/app/register-plugins.ts`, all import sites, shipped plugin directories, extension points, gating machinery.
**Method:** static read of source. Every structural claim carries `file:line`. No source modified; no tests or checks run.

> **Verification:** see [`05-claim-verification.md`](./05-claim-verification.md) — claim set independently verified (12 confirmed / 4 partial / 1 refuted); corrections are applied inline below.

---

## 0. Headline correction up front

**`src/app/register-plugins.ts` has nothing to do with the plugin system.** Despite the name, it is the Elysia route-mounting function for first-party HTTP route modules (`healthRoutes`, `agencyRoutes`, `metricsRoutes`, …) — `src/app/register-plugins.ts:49-70`. It is imported once, from `src/elysia-app.ts:19`. The actual plugin system is loaded entirely separately, via `loadAllPlugins` in `src/server/start.ts:198`.

Consequence: the plugin system does **not** register anything onto the Elysia app. Plugin routes are served by a hand-rolled dispatcher invoked from an `app.all("/*")` catch-all (`src/elysia-app.ts:259-275`) rather than by Elysia routing — so they inherit the app middleware chain but bypass per-route configuration entirely (see §5.4). This is the single most important structural fact for all three gap areas.

---

## 1. Full inventory of the current plugin system

### 1.1 Files

| File | Lines | Role |
|---|---|---|
| `src/plugins/types.ts` | 198 | All plugin interfaces (authoritative type surface) |
| `src/plugins/loader.ts` | 242 | Directory scan, manifest load, lifecycle hooks |
| `src/plugins/registry.ts` | 211 | `PluginRegistry` class; per-plugin collections; public getters |
| `src/plugins/registry-store.ts` | 179 | Backing `Map`s + enabled-state filter |
| `src/plugins/registry-policy.ts` | 36 | **Provenance → capability allowlist** (the only tier machinery) |
| `src/plugins/event-bus.ts` | — | `emitPluginEvent` dispatcher |
| `src/plugins/tool-executor.ts` | 57 | Timeout-race tool invocation |
| `src/plugins/mount-points.ts` | — | UI location lookup |
| `src/plugins/config-merge.ts` | — | Deep merge of stored config over manifest defaults |
| `src/plugins/config-store.ts` | — | `plugin_state.config_json` read/write |
| `src/plugins/bundles.ts` | — | Pure-function bundle character requirements |
| `src/plugins/index.ts` | — | Barrel |

Tests: `loader.test.ts`, `registry.test.ts`, `loader-dispatch.test.ts`, `event-bus-wiring.test.ts`, `bundles.test.ts`, `placeholders.test.ts`.

### 1.2 What a plugin registers

Everything is declared on `PluginManifest` — `src/plugins/types.ts:52-72`:

| Manifest field | Type | Registry sink |
|---|---|---|
| `onLoad`/`onUnload` | lifecycle hooks, `types.ts:60-61` | called by loader |
| `tools` | `ToolDefinition[]`, `types.ts:102-113` | `registry.addTools` |
| `agentRoles` | `AgentRoleDefinition[]`, `types.ts:127-136` | `registry.addAgentRoles` |
| `apiRoutes` | `RouteDefinition[]`, `types.ts:141-148` | `registry.addRoutes` |
| `uiComponents` | `UIComponentDefinition[]`, `types.ts:153-158` | `registry.addUIComponents` |
| `eventHandlers` | `EventHandlerDefinition[]`, `types.ts:163-167` | `registry.addEventHandlers` |
| `migrations` | `MigrationDefinition[]`, `types.ts:172-177` | `registry.addMigrations` |
| `config`/`configSchema` | `types.ts:68-69, 182-186` | merged into `onLoad` ctx |
| `characterRequirements` | `types.ts:70-71` | consumed by `bundles.ts` only |

`onLoad` additionally receives a `PluginContext` (`types.ts:75-84`) with `registerTool` / `registerAgentRole` / `registerApiRoute` / `registerUiComponent` / `registerEventHandler` closures wired at `loader.ts:150-158`.

**Extension points a plugin CANNOT reach** (verified absent): generation hooks (`src/generation/hooks/types.ts:47-53` `HookHandler`), turning pipeline, regex extractors, TUI. `registry.ts` exposes only the six collections above.

### 1.3 Shipped plugins

- `plugins/core/`: `card-battle`, `dice-roller`, `image-editing`, `native-blake3`, `rps`
- `plugins/community/`: `trivia`, `nsfw-cards`
- `plugins/local/`: **does not exist** (confirmed by `ls`); loader skips missing dirs at `loader.ts:88-91`

Each is a directory containing `plugin.ts` exporting `export const plugin: PluginManifest`. E.g. `plugins/community/trivia/plugin.ts:16-…` registers 3 API routes, 1 tool, 1 agent role.

### 1.4 Import sites of plugin modules outside `src/plugins/`

- `src/server/start.ts:23` — `loadAllPlugins`, `unloadAllPlugins` (boot/shutdown)
- `src/server/handler.ts:9,133,143` — `dispatchPluginRoute` (invoked from the Elysia catch-all at `src/elysia-app.ts:271`)
- `src/generation/generate-route/tool-execution.ts:32-33` — `registry`, `executePluginTool`
- `src/assistant/prompt/sections/plugin-agent-role.ts:15` — prompt injection of role system prompt
- `src/chat/service/write.ts:14-15`, `src/chat/service/crud/{create,delete,archive}.ts` — `emitPluginEvent`
- `src/routes/plugins/index.ts:20-21`, `src/routes/plugins/config.ts:19-22` — admin API
- `src/routes/views/plugin-mounts.ts:13-14` — UI mount rendering
- `src/frontend/alpine/character-extension-editor.ts:18` — type-only import

---

## 2. Plugin lifecycle

### 2.1 Boot sequence

`src/server/start.ts`:
1. `:171-185` — conditional config hot-reload watcher (see §4)
2. `:198` — `await loadAllPlugins(database)` — after DB ready

`loadAllPlugins` (`loader.ts:66-113`):
- clears `loadOrder`
- reads `plugin_state` rows; sets enabled/disabled (`:74-83`) — wrapped in `try/catch` so first-boot absence is tolerated
- iterates `PLUGIN_DIRS` **in fixed order** core → community → local (`loader.ts:30-34`)
- per dir: `existsSync` check, `readdirSync`, `localeCompare` sort (deterministic)
- per plugin: `await loadSinglePlugin(...)`
- `:104-112` — registers builtin core tools (`write_memory_note`, character/world/location/item creation) under the pseudo-plugin name `"core"`

`loadSinglePlugin` (`loader.ts:124-169`):
- requires `plugin.ts` to exist; silently returns if not
- **`await import(/* @vite-ignore */ pluginFile)`** — real dynamic import (`:135`)
- validates `mod.plugin?.name`, else warn+return
- `registry.register` → then `registerManifestExtensions(manifest)` (static fields)
- reads stored config, computes effective config via `mergePluginConfig`
- `await manifest.onLoad({...})` — dynamic registrations happen here
- pushes to `loadOrder`, logs, persists state

### 2.2 Error behavior

- **A plugin that throws during load is fully contained**: `loader.ts:167-169` catches, logs `Failed to load plugin`, and continues the loop. Boot never fails on one bad plugin.
- **Partial registration is possible and unguarded**: `registry.register` and `registerManifestExtensions` run *before* `onLoad` (`:142-143`). A plugin whose `onLoad` throws has already left its static routes/tools in the registry. `loader.test.ts:363-366` confirms the plugin object remains registered (`expect(registry.getPlugin(...)).toBeDefined()`) while never being pushed to `loadOrder` — so `onUnload` is never called for it. **A failed plugin leaks live registrations and has no cleanup path.**
- **Event handlers are isolated**: `event-bus.ts` documents invocation in registration order with per-handler error isolation; `event-bus-wiring.test.ts` covers this.
- **Tool errors are contained**: `tool-executor.ts:39-56` converts throws/timeouts into `{ error }` `ToolResult` with `isError`.

### 2.3 Order sensitivity

Order matters in three distinct places:
1. `PLUGIN_DIRS` order determines `loadOrder`; `unloadAllPlugins` (`loader.ts:223-237`) reverses it — verified by `loader.test.ts:431-441` (`["b","a"]`).
2. `getAll*` getters preserve `Map` insertion order (`registry-store.ts:168-175`), so tool list order = registration order = dir sort order.
3. **Plugin routes are first-match-wins**: `dispatchPluginRoute` (`loader.ts:207-217`) returns on the first handler that returns a non-null Response. Conflicting paths across plugins resolve by load order.

### 2.4 Dynamism today

**None at runtime.** There is no `fs.watch`, no registry reload, no per-request discovery in the plugin path. `loadAllPlugins` is called exactly once at boot. Admin enable/disable (`src/routes/plugins/index.ts`) flips `registry.setEnabled` + persists — it never re-imports or re-runs `onLoad`, so enabling does **not** activate a plugin that was disabled at boot and never loaded its state (a plugin disabled before load still runs `onLoad`; only its definitions are filtered).

---

## 3. Existing extension points, enumerated

| # | Extension point | Type signature | Defined at | Plugin-reachable? |
|---|---|---|---|---|
| 1 | API route | `handler: (request: Request) => Promise<Response \| null>` | `types.ts:144` | ✅ via `registerApiRoute` |
| 2 | AI tool | `handler: (params, ctx?: ToolExecutionContext) => Promise<ToolResult> \| ToolResult` | `types.ts:106-109` | ✅ via `registerTool` |
| 3 | Agent role | `{ id, name, systemPrompt, tools: string[], modelConfig?, memoryConfig? }` | `types.ts:127-136` | ✅ via `registerAgentRole` |
| 4 | UI component | `{ type: "web"\|"tui"\|"both", name, location, props? }` | `types.ts:153-158` | ✅ via `registerUiComponent` |
| 5 | Event handler | `handler: (data: unknown) => Promise<void>` | `types.ts:163-167` | ✅ via `registerEventHandler` |
| 6 | DB migration | `{ version, name, up, down? }` | `types.ts:172-177` | ⚠️ registered, **no executor found in `src/`** |
| 7 | Config schema | `PluginConfigSchema` | `types.ts:182-186` | ✅ merged at `loader.ts:148` |

Consumers (where each is actually invoked):

- **Routes** → `dispatchPluginRoute` (`loader.ts:207`) ← `server/handler.ts:133,143`
- **Tools** → `executeToolCalls` (`src/generation/generate-route/tool-execution.ts:157-…`), gated by `gatePluginToolsByRole` (`tool-execution.ts:73-88`)
- **Agent roles** → prompt injection at `src/assistant/prompt/sections/plugin-agent-role.ts:20-35`, only when `actor.agent_role` is set; tool allowlist enforced at `tool-execution.ts:73-88`
- **UI components** → `src/routes/views/plugin-mounts.ts:44-53`, expands `{{plugin:location}}` directives in view content; emits inert `<div class="plugin-mount">` with HTML-escaped props. Locations: `chat.header`, `chat.sidebar`, `chat.composer`, `admin.dashboard` (`mount-points.ts:15-20`)
- **Event handlers** → four emit sites only: `chat.created` (`create.ts:120`), `chat.deleted` (`delete.ts:59`), `chat.archived`/`chat.unarchived` (`archive.ts:135,182`), `message.variant.created` (`write.ts:158`)

**Not reachable by plugins (verified):**
- Generation hook chain — `HookHandler` at `src/generation/hooks/types.ts:47-53`; registered via a *separate* module-local registry (`src/generation/hooks/registry.ts:25-27`), initialized only by `initDefaultHooks` with 4 hardcoded hooks (`:87-91`). No plugin bridge exists.
- TUI — `rg 'getAllUIComponents' src/tui` returns no matches; `plugin-mounts.ts:50` explicitly filters `c.type !== "tui"` out of web views. `type: "tui"` is accepted and then dropped.
- Turning pipeline, regex extractors, asset providers — no plugin surface found.

**Gaps (this section):**
- **Injection**: no prompt-section extension point. The only injection primitive is `AgentRoleDefinition.systemPrompt`, reachable only by an admin setting `actor.agent_role`, and it is not consent- or review-gated.
- **Rerouting**: no extension point can redirect an LLM call. Tools *influence* generation after the fact but cannot substitute or intercept the provider call.
- **Tiers**: no tier beyond the origin→capability allowlist (§6).

---

## 4. Hot reload

### 4.1 What already exists

The plugin loader already uses **runtime dynamic import** — `loader.ts:135`:

```ts
const mod = (await import(/* @vite-ignore */ pluginFile)) as Record<string, unknown>;
```

This is the load primitive a hot-reload feature would reuse.

There is exactly **one** fs-watching precedent in `src/`: `src/config/hot-reload.ts`. `watchDomainConfigs` (`:42-74`) uses `watch(configsDir, { recursive: false })`, filters filenames against a domain/extension table (`:16-33`), and on match does `void import("./load").then(...)` to re-read config and invoke a callback. `stopWatchingDomainConfigs` (`:79-82`) closes it. It is wired at `src/server/start.ts:171-185` behind `existsSync(configsDir)`, with EMFILE/`start.ts:182-184` teardown. Its test file (`hot-reload.test.ts`) documents that a prior BUG fix stubbed `node:fs.watch` because the real watcher early-returned on EMFILE/ENOENT — **so the known failure mode of this exact approach is already documented in-repo**.

No `chokidar`, no `require.cache` busting, no HMR anywhere. `Bun.file` appears only in `src/aux-pipeline/eval/cli.ts:26` for reading an eval baseline — unrelated.

### 4.2 What would have to change

1. **A watcher.** Copy `config/hot-reload.ts`'s shape: `watch(pluginsDir, { recursive: true })` per origin dir. `recursive: true` is required (config watcher uses `false`), and the in-repo BUG note says recursive/inotify limits are already a known hazard.
2. **Cache invalidation — the hard part.** `await import(path)` in Bun caches by resolved specifier. Re-importing the *same* path after an edit returns the **stale module**. The config watcher dodges this because it re-imports a *different* module (`./load`, which reads YAML fresh from disk). A plugin hot-reload needs either a cache-busting query specifier (`import(`${file}?v=${mtimeMs}`)`) or a child-process boundary. No precedent exists in-repo for the query-string trick — **[UNVERIFIED]** whether Bun's loader honors it for user modules.
3. **Teardown.** `unloadAllPlugins` (`loader.ts:223-237`) is all-or-nothing: it clears the entire registry and does not support single-plugin unload. Hot reload of one plugin needs a per-plugin unload — and per §2.2, a plugin that failed mid-load has no working unload path today.
4. **Stale-state hazard.** Because `registry.register` happens *before* `onLoad` (`loader.ts:135-137`), a reload that throws leaves double-registered state. `RegistryStore.set*` (`registry-store.ts:79-…`) overwrite by plugin name, so route arrays are replaced cleanly — but the leaked-registration bug from §2.2 would compound.

**Gaps (hot reload):**
- No watcher for plugin dirs (only `config/hot-reload.ts` exists, and it is domain-specific).
- **No cache-busting precedent** — module re-import would return stale code; this is the blocker, and it is unproven in-repo.
- `unloadAllPlugins` is global-only; no single-plugin unload primitive.
- Failed-load leak (`loader.ts:135-137` before `onLoad`) makes naive reload unsafe.

---

## 5. Approved in-application injection and rerouting

### 5.1 Existing gating machinery

Present in `src/middleware/`: `auth/`, `admin-gate.ts`, `csrf*.ts`, `i18n.ts`, `rate-limit.ts`, `permissions.ts`, `nsfw-gate/`, `request-id.ts`, `response-headers.ts`, `scope-by-user.ts`, `idempotency*.ts`, `csp-nonce.ts`, `lifecycle.ts`, `dynamic-response.ts`, `handle-resolver.ts`. Barrel: `src/middleware/index.ts`.

These are **Elysia-scoped**. They run as Elysia `resolve`/onRequest hooks on the app assembled in `src/app/register-plugins.ts` + `src/elysia-app.ts`.

NSFW gating is a separate, capability-oriented layer:
- `src/middleware/nsfw-gate/consent.ts:122` — `checkNsfwWithConsent`, delegating to `resolveRequestContext` (`:131`) = auth → base → participants → consent, batched and fail-fast (`request-context.ts:95`)
- `src/nsfw/capability-gate.ts:96` — `assertNsfwCapability`: middleware verdict → consent invariants → rating limit → intimacy threshold; throws `CapabilityBlockedError` with a machine-readable `reason`
- `src/nsfw/capability-gate.ts:~190` — `assertNsfwConfigEnabled`, reads live admin-overridable runtime config
- `src/middleware/nsfw-gate/consent-ledger.ts` — append-only persisted consent ledger (migration 069); `src/middleware/nsfw-gate/access.ts` — `canAccessNsfw`, the documented single choke point

Real call sites of the NSFW gate are narrow: `src/generation/auto-gen/content-hooks.ts:105`, `src/routes/nsfw/shared.ts:103`, `src/rpg/intimacy/service/actions.ts:56`. **The main interactive generation route is not among them** — the gate is applied to auto-gen, NSFW routes, and intimacy mutations.

Note: `src/chat/moderation/` **does not exist**. Moderation lives at `src/nsfw/moderation-service/` (service + `preferences`) and as a `ModerationHook` in the generation hook chain.

### 5.2 The injection path that exists today

`pluginAgentRoleSection` (`src/assistant/prompt/sections/plugin-agent-role.ts:20-35`) injects a plugin-supplied `systemPrompt` verbatim (wrapped via `wrapSection("plugin_agent_role", …)`) into the assistant conversation. Preconditions: `ctx.actor.agent_role` is truthy and the id resolves to a registered role. There is **no approval prompt, no diff, no user confirmation, and no consent check** on this path. Enabling it is an admin setting an `agent_role` column — an existing, sanctioned, ungated injection primitive.

### 5.3 Rerouting

**No rerouting extension point exists.** Nothing a plugin registers can intercept, replace, or redirect an LLM provider call. `handleGenerate` / the provider layer are not plugin-reachable.

### 5.4 Gates a reroute/injection path would bypass

This is the sharpest finding. `src/server/handler.ts:132-148`:

```ts
export async function handleApiRequest({ request }: HandleApiRequestOpts): Promise<Response> {
  let pluginResult = await dispatchPluginRoute(request);
  if (pluginResult) { return pluginResult; }
  ...
```

### 5.4a Superseded claim, recorded for traceability

An earlier draft of this document asserted that plugin routes are "dispatched **before the Elysia app is consulted at all**" and bypass *every* middleware including auth and CSRF. **That claim was wrong and is retracted.** It came from reading `handler.ts:132-148` in isolation without following `handleApiRequest` to its real call site at `elysia-app.ts:271`. The corrected analysis is §5.4 below.

### 5.4 What gating plugin routes actually get

`handleApiRequest` calls `dispatchPluginRoute` first, which makes plugin routes *look* like a pre-Elysia interceptor. **They are not.** `handleApiRequest` is injected into the app builder as a dependency (`src/elysia-app.ts:51,60`; wired at `src/server/start.ts:110`) and invoked from an `app.all("/*")` catch-all (`src/elysia-app.ts:259-275`). Plugin routes therefore run *inside* Elysia, after the app-level chain registered at `elysia-app.ts:71-212`:

| Middleware | Applied to plugin routes? | Evidence |
|---|---|---|
| `requestIdMiddleware()` | ✅ yes | `elysia-app.ts:91` — global `.derive()` |
| `authenticate(...)` | ✅ **runs** | `elysia-app.ts:92-125` — global `.derive()` |
| CSRF | ✅ yes | `applyCsrfPlugin(app, csrfOpts)` at `elysia-app.ts:156`, before the catch-all at `:257` |
| Idempotency before/afterHandle | ✅ yes | `elysia-app.ts:175,177` |
| Lifecycle `onAfterHandle` | ✅ yes | `elysia-app.ts:199` |
| `versionResolver()` | ✅ yes | `elysia-app.ts:212` |
| Error boundary / validation handler | ✅ yes | `elysia-app.ts:82-87` |
| i18n locale | ✅ yes | `detectLocale` inside the auth derive, `elysia-app.ts:100,110` |
| Response headers / CSP | ✅ yes | `headerPolicy.apply(...)` wraps `app.fetch` at `src/server/handler.ts:56`, so a plugin `Response` still passes through it |
| `rate-limit.ts` | ❌ **no** | Not app-wide: `rg 'rateLimit' src/elysia-app.ts src/app/register-plugins.ts` → no matches. Applied per-route only (auth login/register/request, `turn-skip-routes.ts`, `integrations-surface.ts`) |
| `requirePermission` | ❌ no | Per-route; plugin routes never call it |

> **Route reachability nuance:** unversioned `/api/*` is 308-redirected to `/api/v1/*` (`src/elysia-app.ts:267-268`), and the prefix is stripped back in `src/server/handler.ts:139-146` before re-dispatch to plugins. Plugin routes are therefore reachable only after that redirect round-trip — not directly at their declared paths.

**The important nuance on authentication.** `authenticate` *runs* for plugin routes, but it is a `.derive()`, not a guard. On failure it does not reject — it returns `{ userId: null, userRole: null, sessionId: null }` (`elysia-app.ts:113`), and the in-code comment states the design explicitly: *"Route handlers check for userId === null and return 401."* At the time this document was written, enforcement was delegated entirely to each route handler, and `dispatchPluginRoute` (`loader.ts:207-217`, as it then stood) checked **nothing but path and method**:

```ts
for (const route of registry.getEnabledRoutes()) {
  const url = new URL(request.url);
  if (url.pathname === route.path && request.method === route.method) {
    const result = await route.handler(request);
    if (result) return result;
  }
}
```

On that basis this document concluded: *"So identity is resolved and available, but **never enforced for plugin routes**. `RouteDefinition.requiresAuth?: boolean` (`types.ts:146`) is declared and read nowhere — repo-wide `rg requiresAuth` returns exactly one line, the declaration itself. `permissions?: string[]` (`types.ts:147`) is likewise never consulted by any code."

> **Superseded by slice 1 — plugin route access control.** Every sentence in that quoted conclusion is now false.
>
> `checkRouteAccess` (`src/plugins/route-access.ts:74-93`) reads both fields and is called by `dispatchPluginRoute` (`src/plugins/loader.ts:241-242`) *before* the handler runs. Identity now flows end to end: the catch-all destructures `{ request, userId, userRole, t }` (`src/elysia-app.ts:268`) and hands `caller: { userId, userRole }` plus `t` to `handleApiRequest` (`:284`), which passes them to `dispatchPluginRoute` (`src/server/handler.ts:143`) — previously the derive's identity was discarded. 401 comes from `unauthorizedResponse`, 403 from `forbiddenResponse`, gated by the repo's existing `hasAll` role→permission matrix (`src/users/permissions.ts:119`); denial bodies are localised through the same `TranslatorFn` every other route already passes, so there is no new i18n path. `RouteDefinition.handler` now takes `(request, caller?)` (`src/plugins/types.ts:175`) so a handler can scope its own queries; route-level gating is explicitly **not** row-level authorization and that caveat is documented on the type itself (`types.ts:154-159`).
>
> **The solo-mode caveat is real, and was deliberately not enforced away.** `auth.required` defaults to false, and in that mode `authenticate` resolves *every* request to the solo super-user (`src/middleware/auth/authenticate.ts:161-177`) whose role `solo` holds `["*"]` (`src/users/permissions.ts:83`). So in the default deployment `requiresAuth` can never deny and `permissions` is always satisfied — the declarations are false assurance there. The decision was document-and-warn, **not** enforce: treating `solo` as anonymous would break the single-user UX, so `warnIfAccessFieldsAreInert` (`src/plugins/solo-mode-warning.ts:39-59`), called from `loadAllPlugins` (`loader.ts:123`), emits ONE aggregated boot warning naming every affected route when `authRequired !== true`.
>
> Net effect: slice 1 delivers the enforcement path and identity delivery, not a closed HTTP surface in the default mode. Tests: `src/plugins/route-access.test.ts`, `src/plugins/plugin-auth-wiring.test.ts` (drives the real `createApp` → `handleApiRequest` → `dispatchPluginRoute` chain), `src/plugins/solo-mode-warning.test.ts`.

**Concrete shipped exposure:** `plugins/community/nsfw-cards/plugin.ts:22-37` registers `POST /api/nsfw-cards/start` and `POST /api/nsfw-cards/play` with no `requiresAuth` and no permission check. Verified: `rg 'assertNsfw|checkNsfw|authenticate|requirePermission|can\(' plugins/community/nsfw-cards/routes.ts` → **no matches** (exit 1). CSRF *does* apply — the catch-all's route pattern is `/*`, so `decideCsrf` computes `routeKey = "POST /*"`, which is unsafe and absent from the 7-entry exempt set (`middleware/csrf.ts:23-42,234-238`), so a naive cross-site POST is blocked. However, a session-less caller is bound to `anonymous::<requestId>` (`csrf.ts:274`), and `requestId` is client-supplied via `x-request-id`/`idempotency-key` (`middleware/request-id.ts:64-71,111-117`) — an attacker can pin one id, GET to mint the token, then POST with it. The conclusion survives (reachable); the stated mechanism must change. Separately the `play_seduction_card` tool (`plugin.ts:40-…`) runs as an LLM-callable tool with no NSFW gate on the tool path (`tool-execution.ts:157+` → `executePluginTool`, no gating).

Tool output *is* sanitized before re-injection — `sanitizeToolOutput` (`tool-execution.ts:59-68`) strips `<script>`, `on*=` handlers, and dangerous tags. That is a prompt-injection/XSS mitigation, not an authorization gate.

### 5.5 Approval / user-confirm machinery that could be reused

There is a real, well-built consent ledger to model an "approved injection" flow on: `src/middleware/nsfw-gate/consent-ledger.ts` (append-only rows, latest-per-`(user, chat)` wins) plus `recordNsfwConsent` (`src/middleware/nsfw-gate/index.ts:17`) and `checkNsfwWithConsent` (`:16`). The pattern — persisted grant, scoped by action, fail-closed, machine-readable block reason (`CapabilityBlockReason`, `capability-gate.ts:31-36`) — is exactly the shape an injection-approval ledger should take. This is the closest existing precedent for "user approved this specific thing".

**Gaps (injection + rerouting):**
- **No per-route authorization for plugin routes.** Auth, CSRF, idempotency, lifecycle, and response headers all run (§5.4), but enforcement is delegated to handlers by design, and `dispatchPluginRoute` (`loader.ts:207-217`) never enforces it. `requiresAuth`/`permissions` are dead fields (repo-wide grep confirms).
  - **Superseded by slice 1.** `requiresAuth`/`permissions` are now enforced by `checkRouteAccess` (`src/plugins/route-access.ts:74-93`) from `dispatchPluginRoute` (`src/plugins/loader.ts:241-242`). What remains open: `ToolDefinition.permissions` (`types.ts:110`) is still unread, row-level authorization is still the handler's job, and in the default solo mode neither route field can deny anything (see the §5.4 callout).
- **No rate limiting** on plugin routes — `rate-limit.ts` is applied per-route, never app-wide.
- No approval/confirmation step exists on the one injection path that works (`plugin-agent-role.ts:20-35`).
- No rerouting extension point exists at all.
- The NSFW capability gate is not applied to plugin routes or plugin tools — proven by shipped `nsfw-cards` (`routes.ts` has zero gate calls).
- Consent ledger (`nsfw-gate/consent-ledger.ts`) is the reusable approval primitive; no plugin analogue.

---

## 6. Tiers

### 6.1 What exists today

**A three-value provenance enum and nothing more.**

`src/plugins/types.ts:19` — `export type PluginOrigin = "core" | "community" | "local";`

The only enforcement is a capability allowlist, `src/plugins/registry-policy.ts:7-11`:

```ts
export const PLUGIN_ORIGIN_CAPABILITIES = {
  core:       ["routes","tools","agentRoles","uiComponents","eventHandlers","migrations"],
  community:  ["routes","tools","agentRoles","uiComponents","eventHandlers"],
  local:      ["routes","tools","agentRoles","uiComponents","eventHandlers","migrations"],
}
```

Enforced by `assertPluginCanRegister` (`registry-policy.ts:22-36`), called from every `registry.add*` (`registry.ts:46,53,60,67,74,81`). The **sole** difference between core and community is the `migrations` capability.

Origin is assigned purely by **which directory** the plugin was found in — `PLUGIN_DIRS` (`loader.ts:30-34`), i.e. path-based, not manifest-declared and not verified.

Adjacent primitives that exist:
- **Enable/disable**: `registry.setEnabled` (`registry-store.ts:44`), persisted in `plugin_state` (`loader.ts:186-200`), admin-only via `src/routes/plugins/index.ts` (`admin.system` permission). Default for an unknown plugin name is **false** — `isEnabled` returns `this.enabledMap.get(name) ?? name === "core"` (`registry-store.ts:35-37`); `register()` calls `store.enable(name)` (`registry.ts:36`) which sets true only if unset.
- **Per-plugin config**: `plugin_state.config_json` (`config-store.ts`), admin read/write (`src/routes/plugins/config.ts`).
- **Declared-but-unenforced per-tool fields**: `permissions?: string[]` (`types.ts:110`) and `sandboxed?: boolean` (`types.ts:112`). `rg 'sandboxed|\.permissions' src/` finds **no read of either** in the plugin path.

**Not present anywhere:** signature/integrity verification. `rg 'signature|verifySignature|integrity|checksum|hash' src/plugins/` → **no matches**. The spec (`docs/spec/plugin-system.md:9`) claims community plugins are "signature required" — **this is unimplemented; the doc self-warns it may drift.**

### 6.2 Minimal tier model on actual primitives

The requested four tiers (core / community / external / marketplace) map onto three existing primitives — **directory path, `PLUGIN_ORIGIN_CAPABILITIES`, and `plugin_state`** — with no new abstraction:

1. **Origin becomes 4-valued, still path-assigned.** Extend `PluginOrigin` (`types.ts:19`) and `PLUGIN_DIRS` (`loader.ts:30-34`) with `external` and `marketplace` directories. This reuses the existing, working discovery loop verbatim. Path-based assignment is a known weakness (a hostile actor who can write to `plugins/core/` claims core), but it is the mechanism that already exists and needs no new machinery.

2. **Differentiate the allowlist by what actually matters — migrations and routes.** Today core and community differ only on `migrations` (`registry-policy.ts:8-10`). Meaningful tiering:
   - `core` — unchanged (all 6).
   - `community` — unchanged (no `migrations`).
   - `external` — no `migrations`, no `routes`; keep `tools`, `agentRoles`, `uiComponents`, `eventHandlers`. Rationale: an unknown-author plugin should not be able to add HTTP surface to the host.
   - `marketplace` — treat as **untrusted-by-default**: same capability set as `external` plus an additional enablement requirement (see 3).

3. **Enablement: reuse `plugin_state` as the approval record.** `plugin_state` already stores `{name, status, enabled_at, disabled_at}` (`loader.ts:190-196`) and is read at boot into `registry.setEnabled` (`loader.ts:78-81`). A marketplace tier needs exactly one addition: a plugin may load only when its row exists and is `active`. Today a brand-new plugin is auto-enabled by `persistPluginState` (`loader.ts:186-200`) — **auto-approve on first sight**. Flipping that to "require an explicit admin row for `external`/`marketplace`" is a ~3-line change in one existing function and needs no new table.

4. **What is deliberately NOT proposed.** No sandbox abstraction (nothing consumes `sandboxed` today), no permission-grants system (nothing consumes `ToolDefinition.permissions`), no signature infrastructure (zero precedent). Ponytail: tiers are a *gating* concern today, and gating has exactly one real enforcement point — `assertPluginCanRegister` plus the `plugin_state` boot read. Model it there and stop.
   - **Partly superseded by slice 1.** `RouteDefinition.permissions` now has a reader — `checkRouteAccess` calls the repo's existing `hasAll` matrix (`src/plugins/route-access.ts:87`, `src/users/permissions.ts:119`). `ToolDefinition.permissions` (`types.ts:110`) and `sandboxed` (`types.ts:112`) remain dead fields. There is still no *per-plugin grants* system: the check is role→permission via `hasAll`, not origin→grant.

**Gaps (tiers):**
- 3 origins exist; 4 requested. Adding two is a `PLUGIN_DIRS` + enum change.
- Provenance is path-derived and unverified — no signature/integrity check anywhere in `src/plugins/`.
- `permissions` and `sandboxed` are dead fields on `ToolDefinition`/`RouteDefinition` — declared, never read.
  - **Partly superseded by slice 1.** `RouteDefinition.permissions` is now read by `checkRouteAccess` (`src/plugins/route-access.ts:87`). `ToolDefinition.permissions` (`types.ts:110`) and `ToolDefinition.sandboxed` (`types.ts:112`) are still never read.
- Marketplace approval needs one behavior change: `persistPluginState` currently auto-approves any newly seen plugin (`loader.ts:190-196`).
- Tier has no effect on *gating at request time* — origin is never consulted by `dispatchPluginRoute` or any handler wrapper (§5.4), so a `community` and a `marketplace` plugin get identical request-time treatment.

---

## 7. Security surface of what a third-party plugin can reach today

All plugin code is loaded via `await import()` into the **main server process** (`loader.ts:126`). There is no worker thread, no subprocess, no VM, and no WASM boundary. `sandboxed?: boolean` (`types.ts:112`) is never read.

| Capability | Evidence |
|---|---|
| **Full process env** | Same-process execution; no env filtering. Existing code reads env (e.g. `E2E_SAFEGUARD`, referenced `register-plugins.ts:36`) |
| **Full filesystem R/W** | Same process; loader itself uses `node:fs` (`loader.ts:12`) |
| **Network egress** | Unrestricted `fetch`; plugins already use dynamic `await import()` at runtime (`nsfw-cards/plugin.ts:62`) |
| **Direct DB handle, unscoped** | `PluginContext.db: Kysely<DB>` (`types.ts:76`) — every table, including `users`, credentials, consent ledger |
| **ToolExecutionContext: chat content** | `{ db, actorId, chatId }` (`types.ts:93-97`) → cross-user chat IDs are reachable |
| **Prompt injection into system prompt** | `AgentRoleDefinition.systemPrompt` (`types.ts:131`) → `plugin-agent-role.ts:31-33` |
| **Unauthenticated HTTP surface** | Auth identity is derived but never enforced for plugin routes; `requiresAuth` is declared and read nowhere (§5.4) |
| ↳ *superseded by slice 1* | `checkRouteAccess` now enforces it (`src/plugins/route-access.ts:74-93`, called `src/plugins/loader.ts:241-242`) — but in the default solo mode nothing can deny, so the surface is still effectively open. See §5.4. |
| **NSFW content without gate** | Shipped `nsfw-cards` community plugin (§5.4) |
| **Persistence** | `migrations` for `core`/`local` (`registry-policy.ts:8,10`) — DDL against the app DB |
| **Resource exhaustion** | `timeoutMs` (`types.ts:111`) bounds tool *await*, but `tool-executor.ts:39-56` **cannot cancel** the handler — a runaway plugin keeps running after the timeout rejects |

Error isolation is real but narrow: event handlers are isolated (`event-bus.ts`), tool throws become `isError` (`tool-executor.ts:54-56`), boot survives a throwing plugin (`loader.ts:167-169`). None of that is a security boundary — an uncaught async rejection or an infinite loop in a plugin handler escapes all of it.

**Gaps (security):**
- No isolation at all: third-party plugin code is first-party-privileged code.
- `sandboxed` and `permissions` are dead fields — the type system advertises a control that does not exist.
  - **Partly superseded by slice 1:** `RouteDefinition.permissions` now has a reader (`src/plugins/route-access.ts:87`). `ToolDefinition.sandboxed` and `ToolDefinition.permissions` (`types.ts:110,112`) are still dead.
- Unauthenticated plugin HTTP surface (§5.4) is the highest-severity item, and it ships today in a community plugin.
  - **Superseded by slice 1 in mechanism, not in outcome.** Route-level enforcement exists (`src/plugins/route-access.ts:74-93`) and `nsfw-cards` still declares neither field — so its routes are still reachable in the default solo mode. What changed is that declaring the fields would now *do* something in `auth.required = true` deployments.
- Tool timeout is advisory (no abort); a plugin can hold the event loop indefinitely.
- No integrity verification despite the spec asserting one.

---

## 8. Cross-cutting: the two structural blockers

Everything in §4–§7 traces back to two facts:

1. ~~**No per-route authorization for plugin routes.** They run inside Elysia and inherit the app middleware chain (§5.4), but `authenticate` is a `.derive()` that resolves identity without rejecting (`elysia-app.ts:96-106`), and `dispatchPluginRoute` never checks it. `requiresAuth` and `permissions` are dead fields. Until `dispatchPluginRoute` enforces them — or `registerApiRoute` wraps handlers in a guard — a `marketplace` plugin gets the same unauthenticated surface as `core`, and tiering stays decorative.~~
   - **Landed: slice 1.** Exactly the change this section recommended: `checkRouteAccess` (`src/plugins/route-access.ts:74-93`) is now a real reader for both fields, called from `dispatchPluginRoute` (`src/plugins/loader.ts:241-242`), and identity flows from the derive through `src/elysia-app.ts:268,284` → `src/server/handler.ts:143`. Two caveats keep this from being a closed surface: route-level gating is not row-level authorization (the handler owns that, via the new `caller` argument, `types.ts:175`), and in the default solo mode neither field can deny anything (`src/middleware/auth/authenticate.ts:161-177`, `src/users/permissions.ts:83`) — surfaced by the aggregated boot warning `warnIfAccessFieldsAreInert` (`src/plugins/solo-mode-warning.ts:39-59`).
2. **No module cache-busting exists**, so hot reload cannot re-import an edited plugin. The one watcher in `src/` (`config/hot-reload.ts`) sidesteps this entirely by re-importing a *different* module.

Fix (1) came first, and it is done. Blocker (2) is now the first thing left to fix: hot reload is the remaining structural gap, and it is harder — it needs per-plugin unload plus failure rollback, not just a reader.
