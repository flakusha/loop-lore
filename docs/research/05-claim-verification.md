# 05 — Adversarial claim verification of docs 01–04

**Date:** 2026-10-07 · **Role:** reviewer (no fixes, no proposals)
**Method:** opened every cited location plus its surrounding code in `/home/flak/git-ai/loop-lore/src`, `/home/flak/git-ai/loop-lore/plugins`, `/home/flak/git-ai/loop-lore/scripts`, `node_modules/giwt/src`, `~/.omp/agent/mcp.json`, `~/.config/opencode/opencode.json`.
No source modified. No tests, linters, or builds run. Citations below are ranges I actually opened — not the originals.

**Verdict key:** CONFIRMED = claim true at the cited place. PARTIAL = conclusion true, evidence/citation wrong or incomplete. REFUTED = conclusion false as stated.

---

## Claim table

| # | Claim | Verdict | Evidence I opened | Note |
|---|---|---|---|---|
| C1 | `requiresAuth` at `types.ts:146`, no reader anywhere | **CONFIRMED at time of review — SUPERSEDED by slice 1** | declared `src/plugins/types.ts:141-148` (field on 146). Grep `requiresAuth` over `src/` + `plugins/` → **1 hit, the declaration**. | Correct as written on 2026-10-07. **No longer true**: `checkRouteAccess` (`src/plugins/route-access.ts:79`) now reads it. |
| C2 | `sandboxed` (`types.ts:112`) has no reader in `src/` | **CONFIRMED** | `src/plugins/types.ts:102-113` (field on 112). Grep `\bsandboxed\b` over `src/` + `plugins/` → declaration + one unrelated prose comment `src/frontend/scene/view-mode.ts:100`. | No code reads it. |
| C3 | Plugin routes dispatch through an Elysia catch-all and inherit auth/CSRF/idempotency/i18n | **CONFIRMED** (citation off) | Catch-all is `src/elysia-app.ts:259-275`; `handleApiRequest(...)` invoked at `:271`. Chain registered earlier: `requestIdMiddleware()` `:91`, auth `.derive(async …)` `:93-125`, `applyCsrfPlugin` `:156`, idempotency `:175`/`:177`, lifecycle `:199`, `versionResolver` `:212`. Handler: `src/server/handler.ts:132-148`. | Doc cites `:257-274`/`:271`; real range is **259-275** (271 is the dispatch line). Two material facts the doc omits — see CORRECTIONS. |
| C4 | `authenticate` is a `.derive()` returning `{userId:null}` on failure; never enforced for plugin routes | **CONFIRMED at time of review — SUPERSEDED by slice 1** | `src/elysia-app.ts:93-125` — comment at `:95-96` "Route handlers check for userId === null and return 401"; returns `{userId:null,userRole:null,sessionId:null,…}` at `:101-105`. `dispatchPluginRoute` (`src/plugins/loader.ts:207-217`) matches on `url.pathname` + `request.method` only. | The verbatim comment confirmed the design claim. **The derive itself is unchanged** — it still returns nulls rather than rejecting — but `dispatchPluginRoute` now enforces the two declared fields before the handler (`src/plugins/route-access.ts:79,87`, called `src/plugins/loader.ts:241-242`), so "never enforced" no longer holds. In the default solo mode it still cannot deny anything; see CORRECTIONS §A. |
| C5 | `persistPluginState` auto-approves any newly seen plugin name | **CONFIRMED** | `src/plugins/loader.ts:190-200` — unconditional `insertInto("plugin_state").values({name, status:"active", …}).onConflict(doNothing)`. Boot read `loader.ts:73-83` (`selectFrom("plugin_state")` at `:74`, loop at `:81-83`) maps `status === "active"` → `registry.setEnabled(name, true)`. Independently `registry.register` → `store.enable(name)` (`src/plugins/registry.ts:33-37`, `registry-store.ts:27-29`) enables it in-process. | Doc's `~186-200` is close; real body is **190-200**. |
| C6 | Plugins load via `await import()`; no cache-busting anywhere in repo | **CONFIRMED** (citation off) | `await import(/* @vite-ignore */ pluginFile)` at `src/plugins/loader.ts:135`. Grep for dynamic specifiers (``import(`…${` ``, `?v=`, `cacheBust`) across `src/` → **no runtime-built module specifier**. | Doc says `:126`; real line is **135**. Only mtime logic is `src/generation/workflow-loader/loader.ts:116-120` (unrelated loader, no import). |
| C7 | On failed load the plugin stays registered and `onUnload` never runs | **CONFIRMED** | `loader.ts:142-143` (`registry.register` + `registerManifestExtensions`) precede `onLoad` at `:148-161`; `loadOrder.push` at `:163`; catch at `:166-168`. `unloadAllPlugins` (`loader.ts:223-237`) iterates `loadOrder` only. | Doc's `:135-137` is wrong; real lines **142-143**. Leak claim holds. |
| C8 | Tier enforcement is only `PLUGIN_ORIGIN_CAPABILITIES`; core vs community differ solely on `migrations`; origin never consulted at request time | **CONFIRMED** | `src/plugins/registry-policy.ts:7-11` (core has `migrations`, community does not, local == core). Enforced only via `assertPluginCanRegister` (`:22-36`) called from `src/plugins/registry.ts:49,59,69,79,89,99` (`addMigrations` body opened and verified at `:98-100`). Request path `dispatchPluginRoute` (`loader.ts:207-217`) reads `registry.getEnabledRoutes()` only — no origin. | Substantively still exact. Slice 1 added `checkRouteAccess` to that loop (`loader.ts:241-242`) but it consults the *route's own* declared fields, never the route's origin — so **origin remains unconsulted at request time and the tier allowlist remains load-time only**. |
| C9 | `plugins/community/nsfw-cards/routes.ts` exposes routes with no NSFW/permission check | **CONFIRMED** | Read `plugins/community/nsfw-cards/routes.ts:1-60`: `handleStart` validates only `difficulty`/`handSize` (`:31-37`). Grep `assertNsfw\|checkNsfw\|authenticate\|requirePermission\|can(\|userId\|session` over the file → **no matches**. Registered at `plugin.ts:24-36` with no `requiresAuth`. | Add the reachability nuance in CORRECTIONS. |
| R1 | `LLMProvider` at `providers/types.ts:227-249` with complete/stream/healthCheck/listModels | **CONFIRMED** | `src/generation/providers/types.ts:227-249` — `capabilities` 228, `complete` 231, `stream` 234, `healthCheck` 237-243, `listModels` 246, optional `embed` 248. | Exact. |
| R2 | Streaming + abort already exist (`streaming.ts`, `combineAbortSignals`) | **CONFIRMED** | `src/generation/cancellation-actions/streaming.ts:37-41` (`processStreamingChunk`), abort check `:46`, chunk counter `:50`, `onChunk` `:71`, repetition `:74`, theatrical loop `:99-103`, policy mismatch `:143`. `combineAbortSignals` at `src/generation/providers/openai-compatible/http.ts:138-155`; `fetchRaw` controller `:173-174`, timeout `:176-178`, `clearTimeout` in `finally` `:194-196`. | Exact. |
| R3 | Case-insensitive `\bmcp\b` across `src/` returns ZERO matches | **CONFIRMED** | Grep `(?i)\bmcp\b\|model.context.protocol` over `src/` → **No matches found**. | Exact. |
| R4 | "N direct `provider.complete()` callsites bypass scheduler/failover/circuit-breaker" | **REFUTED (incomplete list)** | See true list below. Doc lists 9; there are **13** production callsites. | Must be corrected. |
| R5 | Two token constants: `length/4` in context-window-config, `length*0.3` in context-compactor | **CONFIRMED** | `src/generation/context-window-config.ts:66-68` (`Math.ceil(text.length / 4)`); `src/generation/context-compactor.ts:23-25` (`Math.ceil(text.length * 0.3)`). | Two distinct ratios confirmed — but there are **more than two sites**; see CORRECTIONS. |
| R6 | TTS does not exist anywhere in `src/` | **CONFIRMED** | Grep `(?i)tts\|text-to-speech\|textToSpeech\|speechSynthesis\|elevenlabs` over `src/` → only prompt-template machinery (`src/generation/audio-prompt-profiles.ts:22-25,48-53,107-114`; `audio-prompt-templates.ts:34,63-64`, header `:11-12` "Audio generation has no provider yet"), the cancellation job *type* (`src/generation/cancellation-tracker/types.ts:21`), its fan-out comment (`cancellation-actions/cancel.ts:55`), and tests. `registerSideEffectJob(` appears only in `side-effects.ts`, `index.ts`, and `*.test.ts`. | NOT-FOUND holds. |
| R7 | `ModelRouter` + `ROUTING_STRATEGIES` exist; is `routingReorders` really a no-op guard? | **PARTIAL** | `ROUTING_STRATEGIES` at `src/generation/routing/router.ts:46-51`; `class ModelRouter` at `:58` (doc says 57); `routingReorders` at `:129-132` with rationale comment `:123-128`; `sharedRouter` `:143-148`. Sole caller: `src/generation/providers/registry.ts:223-224` (`if (!signal \|\| !routingReorders(routing,)) return result;`). | `capability-match` still **drops candidates** via the `requiresCapabilities` filter (`router.ts:81-88`, empty-set bail at `:90`) — it is order-preserving, not a no-op. |
| G1 | giwt has exactly 41 command keys in `cli-registry.ts` | **CONFIRMED** | `export const commands: Record<string, CommandHandler> = {` at `node_modules/giwt/src/cli-registry.ts:57`, closes `:226`. Structural count of top-level entries → **41**. Full table read. | Exact. |
| G2 | giwt contains ZERO network code — only string literals | **CONFIRMED** | Grep for `fetch(` call sites, `Bun.connect`, `node:https`, `node:http`, `WebSocket`, `XMLHttpRequest`, `net.connect`, `https.request` over `node_modules/giwt/src` → **No matches found**. Literal hits confirmed: `commands/prs.ts:45` "failed to fetch PRs", `git/policy-tables.ts:72` `fetch: true`. External I/O is subprocess-only (`prs.ts:23-43` spawns `gh`). | Holds; `gh` is the escape hatch the doc already names. |
| G3 | `src/harness/` and `src/llm/` exist in loop-lore | **CONFIRMED** | `src/harness/` — `exec-log.ts`, `exec-recorder.ts`, `query.ts`, `read-models.ts`, `run-context.ts`, `stats.ts`, `types.ts`, `types-wire.ts`. `src/llm/` — `concurrency-limiter.ts`, `resource-manager.ts`, `message-state-machine.ts`, `priority-queue.ts`, `internal-handle.ts`, `running-handles.ts`, `resource-manager-types.ts`. | Exact. |
| H1 | No jira/linear/atlassian/glab/gh integration in `src/` or `scripts/` | **PARTIAL** | Grep `(?i)jira\|linear.app\|atlassian\|youtrack\|gitlab\|glab` over `src/`, `scripts/`, `plugins/`, `.agents/` → **no real matches**. `linear` hits in `src/` are the English word (`src/chat/types/context.ts:77` "linear decay", `src/federation/negotiation.ts:6,16` "linear handshake", `src/regex/html-sanitize-streaming.ts:56`, CSS `src/public/css/app.css:2082`). `scripts/` uses `gh` as a subprocess only (`scripts/worktree/commands/prs.ts:23-45`). | Conclusion right; doc 01's cited false-positive examples are fabricated — see CORRECTIONS. |
| H2 | Harness MCP config is `~/.omp/agent/mcp.json`; opencode lists git MCP servers not visible to omp | **CONFIRMED** | `~/.omp/agent/mcp.json` — 7 servers (RivalSearchMCP, context7, deepwiki, engram, lean-ctx, serena `enabled:false`, context-mode), `mcpServers` key at line 3. `~/.config/opencode/opencode.json` `"mcp"` block `:138-249`: `diff` = `uvx mcp-server-git@2026.7.10` `:164-171` and `git` = `uvx mcp-server-git@2026.6.16` `:193-200` — **neither appears in `mcp.json`**. | One nuance: both git entries are `"enabled": false` in opencode too, so opencode does not load them either. |

### R4 — true list of direct `provider.complete()` callsites

Grep `\.complete\(` over `src/`, excluding `*.test.ts` and the unrelated `asyncStore.complete` / `tunnelConnector.complete` homonyms. **13 production sites**, none going through `callWithFailover`, the scheduler, the circuit breaker, or the exec-log:

1. `src/assistant/commands/create.ts:257`
2. `src/assistant/commands/regen.ts:100`
3. `src/assistant/commands/rewrite.ts:193`
4. `src/assistant/commands/summarize.ts:147`
5. `src/assistant/commands/translate.ts:153`
6. `src/assistant/commands/translate.ts:171`
7. `src/chat/auto-translate.ts:158`
8. `src/generation/caption-route.ts:167`
9. `src/generation/auto-gen/story-mode.ts:89`
10. `src/routes/generation/compare.ts:177` — **missed by doc 03**
11. `src/routes/story-orchestration/helpers.ts:132` — **missed**
12. `src/routes/vn-generate/choices.ts:96` — **missed**
13. `src/routes/vn-generate/story.ts:89` — **missed**

Two further `.complete(` hits are *inside* the guarded path and are not bypasses: `src/generation/providers/base.ts:131-133` (the interface delegation) and `call-with-failover.ts:88` (`handler ? stream : complete`, inside the breaker/failover loop).

### Could not check

- **Doc 01 §5 plugin/marketplace internals** (`~/.omp/marketplaces.json`, `plugins/cache/marketplaces/**`, `omp-plugins.lock.json`, the 75 files in `~/.omp/rules/`, the 10-skill count under `.agents/skills/`, `~/.omp/agent/hooks/pre/git-giwt-reroute.ts` at 16.7K). Outside the assigned claim set; not opened.
- **Doc 01–04 statements outside the enumerated claim list** (runtime behaviour of the omp hook interceptor, i18n precedence, hot-reload EMFILE bug notes, giwt lint/gate conventions, `check-file-size.ts` budgets). Not opened — outside the assigned scope.
- **R7 "no-op by default" runtime claim** — verified statically from source only; no deployment config was inspected for `generation.routing`.

---

## CORRECTIONS THAT MUST PROPAGATE

1. **Doc 02, C3 line range** — the catch-all is `elysia-app.ts:259-275` (`app.all("/*")` opens at 259, closes at 275), not `257-274`. (271 is the `handleApiRequest` line.)
2. **Doc 02, C6/C7 line numbers** — `await import()` is `loader.ts:135` (not 126); register-before-onLoad is `loader.ts:142-143` (not 135-137); `persistPluginState` is `loader.ts:190-200`. Every `loader.ts` citation in §2.1/§2.2/§4/§6 is shifted ~7 lines.
3. **Doc 02 omits the version-redirect hop** — `elysia-app.ts:267-268` 308-redirects any unversioned `/api/*` to `/api/v1/*`, and `server/handler.ts:139-146` strips the prefix back before re-dispatching to plugins. Plugin routes therefore only serve *after* a redirect round-trip. This changes the read of C3/C9: they are reachable, not shadowed — but only via that path.
4. **Doc 02's "unauthenticated exposure" for `nsfw-cards` is overstated** — CSRF *does* apply. The catch-all's route pattern is `/*`, so `decideCsrf` computes `routeKey = "POST /*"`, which is unsafe and absent from the 7-entry exempt set (`middleware/csrf.ts:23-42`, decision at `:234-238`), so a naive cross-site POST is blocked. But the binding for a session-less caller is `anonymous::<requestId>` (`csrf.ts:274`) and `requestId` is **client-supplied** via `x-request-id` / `idempotency-key` (`middleware/request-id.ts:64-71`, applied at `:111-117`) — an attacker pins one id, GETs to mint the token, then POSTs with it. The conclusion survives; the stated mechanism ("reachable by an unauthenticated caller", unqualified) does not.
5. **Doc 03, R4 is wrong** — 13 direct `provider.complete()` callsites, not 9. Missing: `src/routes/generation/compare.ts:177`, `src/routes/story-orchestration/helpers.ts:132`, `src/routes/vn-generate/choices.ts:96`, `src/routes/vn-generate/story.ts:89`. The "bypasses failover/breaker/exec-log" conclusion holds for all 13.
6. **Doc 03, R7 `routingReorders` is not a pure no-op guard** — with `capability-match` the *order* is preserved but `router.ts:81-88` still drops candidates declaring a required capability `false` (and `:87` drops on `estimatedTokens > contextWindow`). `routingReorders` returns `false` only when config is absent or fully default (`router.ts:129-132`); any non-empty `rules[]` flips it on. Also `ModelRouter` is at `router.ts:58`, not 57.
7. **Doc 03, R5 undercounts the duplication** — beyond the two cited files, `length*0.3` also appears three times in `src/chat/pruning/prune.ts:31,40,121`; `length/4` appears in `src/chat/token-utils.ts:12,25` and twice under `src/frontend/` (`alpine/memory-panel/transform.ts:23`, `pages/new-chat/helpers.ts:10`). Aligning onto one constant touches 7 sites, not 2.
8. **Doc 01, §3 false-positive citations are fabricated** — `generateContentStorage` does not exist anywhere in `src/` (grep: no matches); neither `globalThis` nor `plugins` contains `linear`; and the cited fixtures `src/chat/scheduled/dispatcher.ts:127`, `src/integrations/encryption.ts:7,51`, `src/routes/gm-notes.test.ts:191` contain no `linear|jira|git` match. The real `linear` hits are the English word (`src/chat/types/context.ts:77`, `src/federation/negotiation.ts:6,16`, `src/regex/html-sanitize-streaming.ts:56`, `src/public/css/app.css:2082`). The conclusion (no tracker) stands; the supporting evidence is fabricated and must not be cited downstream.
9. **Doc 01, MCP table needs the `enabled` nuance** — the two opencode git MCP servers (`diff`, `git`) are `"enabled": false` *in opencode as well*, not merely absent from `mcp.json`. "already configured, not in omp" is right; "ready-made and available" would be wrong.
10. **Doc 02 §5.4 middleware table** — correct as stated for CSRF / idempotency / lifecycle / auth-derive, but the rate-limit row needs the qualifier that idempotency's `route` key for plugin traffic is the literal catch-all pattern, not the plugin's own path, so idempotency records cannot be attributed per plugin route.

---

## A. Post-slice-1 addendum (claims that went stale after this review)

The plugin route access-control slice landed after the table above was written. Those verdicts were correct **when made**; these rows no longer describe the code. Nothing else in the table is affected.

| # | Originally | Status now | Evidence I opened |
|---|---|---|---|
| A1 | C1 — `requiresAuth` has no reader | **REFUTED** | `checkRouteAccess` (`src/plugins/route-access.ts:74-93`) reads it at `:79`; `dispatchPluginRoute` calls it at `src/plugins/loader.ts:241-242`, before `route.handler` at `:246`. |
| A2 | C4 — identity *never enforced* | **REFUTED as stated; the derive itself is unchanged** | The auth `.derive()` still returns nulls rather than rejecting (`src/elysia-app.ts:113`). Identity now reaches the dispatcher: the catch-all destructures `{ request, userId, userRole, t }` (`src/elysia-app.ts:268`) and passes `caller: { userId, userRole }` plus `t` (`src/elysia-app.ts:284`) into `handleApiRequest` (`src/server/handler.ts:140-143`). Previously both were dropped. |
| A3 | `permissions` is consulted by nothing | **REFUTED for `RouteDefinition`; still true for `ToolDefinition`** | `src/plugins/route-access.ts:87` calls `hasAll(userRole, route.permissions)` — the existing matrix at `src/users/permissions.ts:119`. `ToolDefinition.permissions` (`src/plugins/types.ts:110`) still has no reader. |
| A4 | C2 — `sandboxed` has no reader | **UNCHANGED — still CONFIRMED** | `sandboxed` is a `ToolDefinition` field (`src/plugins/types.ts:112`); slice 1 touched route access only. Re-verified, not assumed. |
| A5 | tiering is decorative | **STILL TRUE** | `checkRouteAccess` reads the route's own declared fields, never its origin. The origin→capability allowlist (`src/plugins/registry-policy.ts:7-11`) remains load-time only. |

**Newly true, not previously claimed:**

- **401/403 bodies are localised.** `unauthorizedResponse` / `forbiddenResponse` receive the `TranslatorFn` from the same derive (`src/elysia-app.ts:284` → `src/server/handler.ts:143` → `src/plugins/loader.ts:241`), so denials use the existing i18n path rather than a new one — `src/plugins/route-access.ts:56-62`.
- **`RouteDefinition.handler` gained a second parameter.** `handler(request, caller?)` (`src/plugins/types.ts:175`). Additive — one-argument handlers stay valid. It exists because **route-level gating is not row-level authorization**; that caveat is written on the type itself (`src/plugins/types.ts:154-159`).
- **Solo mode is not closed, and that is a deliberate decision.** `auth.required` defaults to false (`src/config/load/safety.ts:71-72`); in that mode `authenticate` resolves every request to the solo super-user (`src/middleware/auth/authenticate.ts:161-177`) whose role `solo` holds `*` (`src/users/permissions.ts:83`). So `requiresAuth` cannot deny and `permissions` is always satisfied. Solo was **not** treated as anonymous — that would break single-user UX — so the resolution was a single aggregated boot warning, `warnIfAccessFieldsAreInert` (`src/plugins/solo-mode-warning.ts:39-59`), called from `loadAllPlugins` (`src/plugins/loader.ts:123`).
- **Tests exist for the slice**: `src/plugins/route-access.test.ts`, `src/plugins/solo-mode-warning.test.ts`, and `src/plugins/plugin-auth-wiring.test.ts` — the last drives the real `createApp` → `handleApiRequest` → `dispatchPluginRoute` chain rather than calling the loader directly.

**What slice 1 did *not* change:** `sandboxed` (A4), origin-based gating (A5), `persistPluginState` auto-approval (C5), the missing cache-busting (C6), and the failed-load leak (C7). Those remain the open blockers.

---

## Self-review of this document

This file was re-reviewed as an adversary after the first draft. Seven of my own citations were **wrong** — line numbers I had counted by eye instead of pinning — and are now corrected:

| Where | I had written | Verified actual |
|---|---|---|
| C3 row / correction 1 | catch-all `259-276` | `259-275` (`app.all("/*")` opens 259, closes 275) |
| C5 | boot read `74-83` | `73-83` (`selectFrom` at `:74`, loop `:81-83`) |
| C8 | assert calls `registry.ts:48,58,68,78,88,98` | `:49,59,69,79,89,99` — I had cited the *method* lines, and had never opened the `addMigrations` body on the first pass; now read at `:98-100` |
| R7 row / correction 6 | filter `router.ts:78-86` | `:81-88`, empty-set bail `:90` |
| Correction 4 | `csrf.ts:216-259`, `request-id.ts:61-70` | exempt set `:23-42`, decision `:234-238`, binding `:274`; `request-id.ts:64-71` + `:111-117` |

Two evidence gaps were also closed:

- **G2 re-run with a broader pattern** (`node:net`, `node:dgram`, `node:tls`, `undici`, `Bun.fetch`, `globalThis.fetch`, `.request(`, `curl`, `wget`, bare `\bfetch\b`) over `node_modules/giwt/src`. Every hit is a string literal or a git subcommand name (`commands/prs.ts:45`, `git/policy-tables.ts:72`, `git/policy.ts:64`, plus test fixtures). The "zero network code" verdict is unchanged and now rests on two independent greps rather than one.
- **H2's server count structurally re-verified** — grepping 4-space-indented keys in `~/.omp/agent/mcp.json` returns exactly 7.

**No verdict changed as a result of this pass.** Every REFUTED and PARTIAL verdict already rested on grep-pinned evidence from the first pass; only line-number precision did. The lesson worth recording for whoever consumes this file: the *conclusions* in docs 01–04 largely survive scrutiny — the real defects are citation drift and one incomplete enumeration (R4), not wrong conclusions.

