# 00 — Index and decisions

**Date:** 2026-10-07 · **Role:** synthesis. No new code was written for this document; one slice of implementation landed while the research was in flight and is recorded here.
**Method:** decision pass over docs 01–04, re-checked against doc 05 and against the source I opened for this synthesis. Facts carry `file:line`; anything I could not open is marked `[UNVERIFIED]` rather than smoothed over.

> **Verification:** see [`05-claim-verification.md`](./05-claim-verification.md) for the adversarial claim pass over docs 01–04. That file now carries a **post-slice-1 addendum** (§A) recording which of its verdicts went stale when the plugin route access-control slice landed.

| Doc | Subject | Read it for |
|---|---|---|
| [01 — Harness integrations](./01-harness-integrations.md) | What the agent runtime already ships | MCP config, skills, marketplace install, memory systems |
| [02 — Plugin system](./02-plugin-system.md) | loop-lore's own plugin surface | Lifecycle, injection, tiers, security surface, hot reload |
| [03 — LLM routing and safeguards](./03-llm-routing-and-safeguards.md) | Context and generation | Context retain/drop, TTS, loop/hallucination guards, external APIs |
| [04 — giwt extension candidates](./04-giwt-extension-candidates.md) | What to push into giwt | Ranked shortlist, and the explicit "should NOT" list |
| [05 — Claim verification](./05-claim-verification.md) | Adversarial pass | Verdicts + corrections + the post-slice-1 addendum |

---

## 1. What this research answers

The question was which harness and CLI capabilities loop-lore can **reuse** — git+giwt, superpowers, jira, MCP servers, marketplace plugins, memory/context — versus which it must **build**, across six axes: plugin hot reload, approved in-application injection and rerouting, tiers, LLM rerouting, context retain/drop, and loop/hallucination protection, plus external API integration. The short answer, developed below: **reuse the harness for anything that is per-user machine state (MCP config, skills, memory, marketplace install), reuse giwt for repo-shaped worktree/ticket automation, and build everything inside loop-lore that is application state** — the plugin system and its hot reload, tier/provenance, injection approval, rerouting, and HTTP-client consolidation. The single most consequential negative finding is that two capabilities the brief assumed existed — `superpowers` and every non-git tracker — are **not present** anywhere.

---

## 2. Reuse vs build

`REUSE` = adopt what already exists. `BUILD` = implement in loop-lore. `EXTEND` = the capability exists in loop-lore and needs widening, not rewriting.

| Capability | Where it already exists | Call | Why |
|---|---|---|---|
| Worktrees, git policy, GPG commits, ticket `.md` + git issue | `giwt` — static command registry `node_modules/giwt/src/cli-registry.ts:57`; worktree helpers `src/utils/git.ts` | **REUSE** | Already the canonical repo-side tool; loop-lore's `.agents/skills/giwt-usage/SKILL.md` documents it as such. |
| Ledger / run records | `giwt` — `readLedger`/`listRuns` re-exported from `node_modules/giwt/src/index.ts` | **REUSE**, export them | Every agent handoff already hand-rolls these two parses (doc 04 E3). |
| Skills (repo + harness-managed) | `.agents/skills/` (repo) and `~/.omp/agent/managed-skills/` (harness) | **REUSE** | Frontmatter schema already permissive; three of the four managed skills are loop-lore-specific. |
| Agent memory | Three non-interoperating systems: harness SQLite, `opencode-mem`, and **engram** over MCP (`~/.omp/agent/mcp.json:16-23`) | **REUSE** | engram is already mounted as an MCP stdio server with `mem_save`/`mem_search`/`mem_context`; no in-repo memory service needed. |
| MCP server configuration | Harness, `~/.omp/agent/mcp.json` — 7 servers declared, 6 enabled (`:4-51`) | **REUSE** | Case-insensitive `\bmcp\b` over `src/` returns zero matches: loop-lore has no MCP client at all. Adding config *inside* the app would fork the harness's. |
| Marketplace / plugin install | Harness — Anthropic Claude Code manifest format, GitHub-sourced (`~/.omp/marketplaces.json`, catalog schema `https://anthropic.com/claude-code/marketplace.schema.json`), installed set in `~/.omp/plugins/omp-plugins.lock.json` | **REUSE the install story, BUILD the in-app runtime** | The distribution format is solved; the *execution* model (registry, lifecycle, gating) is loop-lore's own and not interchangeable. |
| Plugin system (registry, lifecycle, extension points) | loop-lore — `src/plugins/registry.ts`, `loader.ts`, `registry-policy.ts` | **BUILD (exists)** | Fully working; the gaps are reload safety, tiering, and the injection/rerouting seams — see §5. |
| Plugin hot reload | Nothing. Plugins `await import()` a fixed specifier (`src/plugins/loader.ts:135`); no cache-busting mechanism exists in `src/` | **BUILD** | The one config watcher in `src/` (`src/config/hot-reload.ts:62`) re-imports a *different* module and sidesteps the problem entirely. |
| Approved in-application injection | Precedent exists: append-only NSFW consent ledger, `src/middleware/nsfw-gate/consent-ledger.ts` (`getLatestConsent:44`, `hasActiveConsent:76`, `recordNsfwConsent:106`) | **BUILD the seam, reuse the pattern** | There is a real consent ledger to model on, and exactly one ungated injection primitive to gate (`plugin-agent-role.ts:20-35`). |
| LLM rerouting | loop-lore — `ModelRouter` at `src/generation/routing/router.ts:58` | **EXTEND** | The abstraction, failover, and breaker exist; what is missing is a plugin-reachable seam and the bypasses in §3. |
| Tiers / provenance | loop-lore — `PluginOrigin` 3 values (`src/plugins/types.ts:19`), allowlist `src/plugins/registry-policy.ts:7-11` | **BUILD (exists, decorative)** | It is a real load-time allowlist, but origin is never consulted at request time — `checkRouteAccess` reads the route's own fields, not its origin (`src/plugins/route-access.ts:74-93`). |
| Context retain/drop | loop-lore — **four unconnected mechanisms**, see §3 | **BUILD (exists, unconnected)** | Each works alone; there is no shared policy across them, and the static `PRIORITY` table (`src/assistant/prompt/types.ts:192`) is the only ordering that exists. |
| LLM provider abstraction + failover + circuit breaker | loop-lore — interface `src/generation/providers/types.ts`, breaker `circuit-breaker.ts:44` (singleton `:191`), failover `call-with-failover.ts:35`, shared retry `providers/retry.ts`, shared HTTP helper `providers/openai-compatible/http.ts:166-225` | **EXTEND** | Solid and already centralized for LLM calls — the gap is that a dozen callsites bypass it, and the *non*-LLM integrations have no shared client at all. |
| Loop / hallucination guards | loop-lore — streaming repetition + theatrical-loop detection, entity hallucination detector, world-event validator, DB-backed turn cap | **BUILD (exists)** | Both streaming-level and turn-level guards exist; the hallucination guards run *after* persistence, which is the real ordering gap. |
| External provider integrations | loop-lore — `src/integrations/` (email + bridge/registry/secrets/health) | **BUILD (exists, per-provider)** | There is **no shared HTTP client** for integrations, and retry/backoff is explicitly deferred (`src/integrations/bridge.ts:13`). |
| TTS | **Does not exist.** Only prompt templates *describing* audio | **BUILD (net-new)** | `src/generation/audio-prompt-templates.ts:11-12` says so in its own header; the per-modality apply route answers 501. |
| `superpowers` skill collection | **NOT FOUND** | — n/a | Searched; absent. See §3. |
| Jira / Linear / Atlassian / any non-git tracker | **NOT FOUND** | — n/a | Searched; absent. See §3. |

---

## 3. Verified findings that drive the plan

Only claims doc 05 confirmed, plus what I re-opened for this synthesis. File paths are relative to the repo root unless absolute.

**Plugin system**

- `RouteDefinition.requiresAuth` and `.permissions` **were** dead fields (doc 05 C1, CONFIRMED at review time) and **are now enforced** — `checkRouteAccess` reads both (`src/plugins/route-access.ts:79,87`) from `dispatchPluginRoute` (`src/plugins/loader.ts:241-242`). Superseded by slice 1; see §5.
- Plugins load via `await import()` with no cache-busting anywhere in `src/` (doc 05 C6, CONFIRMED). The only dynamic import in the plugin path is `src/plugins/loader.ts:135`.
- On failed load the plugin stays registered and `onUnload` never runs (doc 05 C7, CONFIRMED): registration precedes `onLoad` (`src/plugins/loader.ts:153-154`), the failure is caught at `:177-179`, and `unloadAllPlugins` iterates `loadOrder` only. There is no per-plugin unload — `registry-store.ts:155` clears *every* collection at once.
- Tier enforcement is the origin→capability allowlist only (`src/plugins/registry-policy.ts:7-11`); origin is never consulted at request time (doc 05 C8, still exact after slice 1).
- `persistPluginState` auto-approves any newly seen plugin name (`src/plugins/loader.ts:201-211`) — status is hardcoded `"active"`.
- `sandboxed` is still a dead field (doc 05 C2, re-confirmed): a `ToolDefinition` property at `src/plugins/types.ts:112` with no reader.
- **Correction:** no agent-protocol support exists in the app — case-insensitive `\bmcp\b` over `src/` returns zero matches (doc 05 R3, CONFIRMED). MCP is a harness concern only.

**LLM, context, safeguards**

- `LLMProvider` is complete (`src/generation/providers/types.ts:227-249`) and the breaker/failover/retry layers are centralized (doc 05 R1, CONFIRMED; re-verified `circuit-breaker.ts:44,191`, `call-with-failover.ts:35`, `retry.ts`).
- Direct `provider.complete()` callsites bypass the scheduler, failover, breaker, and exec-log. Doc 03 listed 9; doc 05 corrected that to 13 and its own list carries 13 entries with `translate.ts` counted twice. Re-verified the *file* set: `src/assistant/commands/{create,regen,rewrite,summarize,translate}.ts`, `src/chat/auto-translate.ts`, `src/generation/caption-route.ts`, `src/generation/auto-gen/story-mode.ts`, `src/routes/generation/compare.ts`, `src/routes/story-orchestration/helpers.ts`, `src/routes/vn-generate/{choices,story}.ts`. **12 files, 13 callsites.** The disagreement is recorded rather than resolved — re-derive before step 6.
- `routingReorders` is **not** a no-op guard — it returns false only when config is absent or fully default (`src/generation/routing/router.ts:129-132`), and `capability-match` drops candidates via the `requiresCapabilities` filter (`router.ts:81-88`) (doc 05 R7, PARTIAL, resolved).
- Token estimation is duplicated across **seven** sites with two different ratios (doc 05 correction 7, re-verified): `length / 4` at `src/generation/context-window-config.ts:67`, `src/frontend/alpine/memory-panel/transform.ts:23`, `src/frontend/pages/new-chat/helpers.ts:10`; `length * 0.3` at `src/generation/context-compactor.ts:24`, `src/chat/pruning/prune.ts:31,40,121`, `src/routes/messages/scene-transition-context-cut.ts:79`. Note `src/chat/token-utils.ts:23` already exports a shared `estimateTokens` — the frontend copies cannot import backend code, but the backend ones can.
- TTS does not exist as a runtime capability (doc 05 R6, CONFIRMED; re-verified `src/generation/audio-prompt-templates.ts:11-12`). The only TTS scaffolding is a cancellation hook with no producer (`src/generation/cancellation-actions/side-effects.ts:33`, job type `cancellation-tracker/types.ts:21`) and prompt templates.
- **Correction to doc 03 §4(a):** the claim that no `maxTurns` cap exists is **wrong**. A DB-backed turn cap does exist — column `max_turns` on `chats` (`src/db/schema-core.ts:665`), loaded into host state (`src/turning/turn-manager/state.ts:79,170-172`), enforced by `TurnManager.isComplete` (`src/turning/turn-manager/index.ts:81-86`), consumed by the story game-master (`src/story/game-master/beat.ts:151`). Doc 03 bounded its claim to files it did not read and flagged exactly this file `[UNVERIFIED]`. What genuinely does not exist is a *conversation-level* loop breaker — a detector for a chat that keeps producing new turns rather than repeating within one.
- Hallucination detection exists but runs **after** persistence (`src/generation/auto-gen/post-store.ts:127`, `src/generation/auto-gen/story-mode.ts:140`); nothing blocks, rewrites, or re-prompts. `validateEvents` (`src/story/events/validation.ts:89-116`) is the one place LLM-extracted structure is rejected before it mutates world state.
- Case-insensitive grep for jira/atlassian/youtrack over `src/`, `scripts/`, `plugins/` returns **no real matches**; the `linear` hits in `src/` are the English word (doc 05 H1 + correction 8 — and doc 01's original `linear` citations were **fabricated**, so do not carry them forward).

**giwt and harness**

- giwt contains **zero network code** — two independent greps over `node_modules/giwt/src` for socket/HTTP symbols found only string literals (doc 05 G2, CONFIRMED). External I/O is subprocess-only (`gh` in `commands/prs.ts`).
- giwt's command surface is a static record (`node_modules/giwt/src/cli-registry.ts:57`, closing `:226`) with an eagerly-built parser (`src/cli.ts`) — no runtime discovery, so no plugin mechanism can be bolted on without a trust model.
- Harness MCP config is `~/.omp/agent/mcp.json` (7 servers, 6 enabled — `serena` is `"enabled": false` at `:42`). The two git MCP servers in the opencode-compat config are `"enabled": false` there too, so "ready-made and available" would be wrong (doc 05 H2, CONFIRMED with that nuance).
- Marketplace install is GitHub-sourced with a GitHub `sourceUri` (`~/.omp/marketplaces.json:6-7`) and the Anthropic Claude Code catalog schema; the installed set is pinned in `~/.omp/plugins/omp-plugins.lock.json`. Opencode-side installs from npm — **two distinct registries**.
- **NOT FOUND:** `superpowers`. Filename search plus content grep across `~/.omp/skills`, `~/.omp/agent/managed-skills/`, `~/.omp/plugins/`, and `.agents/skills/` returned nothing.
- **NOT FOUND:** any non-git tracker integration, in the harness *or* in loop-lore.

---

## 4. Where giwt should extend, not loop-lore

Doc 04's shortlist, ranked by its own Value/Effort table. Full designs in [04](./04-giwt-extension-candidates.md).

| Item | Value | Effort | Note |
|---|---|---|---|
| E3 `ledger --export` | High | **Trivial** | `ledger.ts` is small and `readLedger`/`listRuns` already exist and are exported. Every handoff hand-rolls these parses today. |
| E5 `ticket --from <KEY>` | High | Small | Reuses the gated ticket template instead of duplicating it. Extends an existing flag-token table. |
| E2 `giwt batch` | High | Medium | The one genuine orchestration gap. Reuses `getWorktrees` and the doctor memory clamp; adds no new persistence. |
| E4 `doctor check --checks mcp` | Medium | Medium | One string in `CHECK_IDS`; the pool/timeout/memory discipline already exists. **Gated on whether loop-lore ships a repo-level MCP config section** — it does not today, so this is premature. |
| E1 `tracker pull` | Medium | **Large** | Read-only pull only. Large because auth, argv templating, and idempotency all need designing. **Gate it on demand** — there is no tracker in use to pull from. |

**What must NOT go into giwt**, from doc 04, with the reasons that matter:

1. **MCP server management** (`giwt mcp list/call/configure`). MCP config is per-user machine state (`~/.omp/agent/mcp.json`), not repo state; a shared repo file describing one machine's private server set is the wrong shape. Only E4 — a repo-health *check* — is legitimate.
2. **LLM call inspection, routing config, context budgeting.** Already built in loop-lore. Adding it to giwt needs the **first HTTP client in a codebase with zero**, forks an existing schema, and puts runtime state in a git-pinned dependency.
3. **Plugin / marketplace install and pinning.** loop-lore owns `src/plugins/`; a second implementation forks the schema. giwt is itself the cautionary tale — it is pinned to a bare git SHA, so a marketplace install command inside it would be managing its own delivery problem.
4. **TTS / asset / media work.** Application functionality with a database and an HTTP API behind it. Zero shared seams.
5. **Session-handoff prose / semantic memory capture.** Conversational, not repo state. giwt already has the primitive (`--say` on every command); a new command duplicates it. Feed it from E3's export instead.
6. **A generic plugin mechanism for giwt itself.** The registry is static and the parser is eager; runtime discovery needs a trust model and would break the repo's dead-code and coverage gates.
7. **Two-way sync to a non-git tracker.** Deferred explicitly. Needs conflict resolution, retry, and auth refresh; giwt has no network client, no secret store beyond GPG identity, and no idempotency story for a remote side effect. Failure mode: a silent duplicate-issue storm.

---

## 5. Sequenced plan

Each step names the files it touches and the gate that proves it worked. This is a plan, not a design.

### Landed: slice 1 — plugin route access control

The first blocker from doc 02 §8 is closed. `RouteDefinition.requiresAuth` and `.permissions` went from declared-and-never-read to load-bearing.

- **Files:** `src/plugins/route-access.ts` (new, `checkRouteAccess:74-93`), `src/plugins/solo-mode-warning.ts` (new, `warnIfAccessFieldsAreInert:39-59`), `src/plugins/types.ts` (`PluginCaller:143-148`, handler signature `:175`, caveats on the type at `:154-166`), `src/plugins/loader.ts` (call site `:241-242`, boot warning `:123`), `src/elysia-app.ts` (identity destructure `:268`, handoff `:284`), `src/server/handler.ts` (`:140-143`).
- **What it did:** identity that the Elysia auth derive already resolved is now forwarded instead of discarded; `checkRouteAccess` runs before the handler and returns 401/403 via the existing `unauthorizedResponse`/`forbiddenResponse` helpers, gated by the existing `hasAll` matrix (`src/users/permissions.ts:119`), localised through the same `TranslatorFn` every other route passes. Handlers now receive `caller` so they can do row-level ownership checks — route gating is explicitly *not* row-level, and that caveat is on the type.
- **What it deliberately did not do:** solo mode. `auth.required` defaults to false and `authenticate` auto-resolves every request to the solo super-user (`src/middleware/auth/authenticate.ts:161-177`, role `solo` = `*` at `src/users/permissions.ts:83`), so in the default deployment neither field can deny. Treating solo as anonymous would break single-user UX, so the resolution was **one aggregated boot warning** naming every affected route, not enforcement.
- **Gate:** `src/plugins/route-access.test.ts`, `src/plugins/solo-mode-warning.test.ts`, and `src/plugins/plugin-auth-wiring.test.ts` — the last drives the real `createApp` → `handleApiRequest` → `dispatchPluginRoute` chain rather than calling the loader directly.

### Remaining, in order

**2. Per-plugin unload + load-failure rollback.** Makes reload safe to attempt at all. Touches `src/plugins/loader.ts` (a `unloadPlugin(name)` mirroring `loadSinglePlugin`, rolling back a partial registration when `onLoad` throws) and `src/plugins/registry-store.ts` (per-name removal — today `:155` clears every collection at once). Gate: a load that throws leaves no routes, tools, or roles registered, and `onUnload` still runs.

**3. Hot reload with real cache busting.** Touches `src/plugins/loader.ts:135` (the fixed `await import(pluginFile)` specifier) plus whatever watcher is added. Gate: edit a plugin's `plugin.ts`, reload, observe the new behaviour. **Blocked on an unverified assumption** — see §6.

**4. Tier / provenance model mapped onto the origin field.** Touches `src/plugins/types.ts:19` (`PluginOrigin`), `src/plugins/registry-policy.ts:7-11`, `PLUGIN_DIRS` in `loader.ts`, and `persistPluginState` (`loader.ts:201-211`) so `external`/`marketplace` require an explicit admin row instead of auto-approving. Gate: a `marketplace`-origin plugin with no `plugin_state` row does not load.

**5. Approval seam for in-application injection.** Touches `src/assistant/prompt/sections/plugin-agent-role.ts:20-35` — the one ungated injection primitive — modelled on the NSFW consent ledger (`src/middleware/nsfw-gate/consent-ledger.ts`). Gate: enabling a plugin agent role without a persisted grant is blocked, and the block reason is machine-readable.

**6. Rerouting seam at the provider egress point.** Touches the `callWithFailover` call site in the generation path or the provider registry, so a plugin can influence provider selection. Folds in the bypass callsites from §3, which is the precondition for the seam meaning anything. Gate: no production callsite reaches `provider.complete()` without passing through the scheduler.

**7. External-provider HTTP client consolidation.** Touches `src/integrations/` — currently no shared client exists and retry/backoff is explicitly deferred (`bridge.ts:13`). Separate from the LLM provider helper, which *is* shared (`providers/openai-compatible/http.ts:166-225`). Gate: every integration reaches the network through one client with one retry policy.

**8. Align the seven duplicated token-estimation sites.** Two ratios, `length / 4` and `length * 0.3`, across backend and frontend. Backend sites can import the existing `src/chat/token-utils.ts:23`; frontend sites cannot import backend code and need either a shared module or an honest acknowledgement that they are a different estimator. Gate: one ratio per tier, and any divergence is documented at the call site.

**9. Loop-breaker at the conversation level — only if justified.** Step 3 of the brief says "if the research found none". **Partially answered:** a turn cap exists (`src/turning/turn-manager/index.ts:81-86`, column at `src/db/schema-core.ts:665`) and streaming-level repetition/theatrical-loop detection exists (`src/generation/cancellation-actions/streaming.ts:99-103`). Neither detects a *conversation* looping. Whether that is a real problem or a hypothetical is **not established by this research**. Decide first, build second.

---

## 6. Open risks / unverified

Carried forward from docs 01–05. These are not disclaimers — each one can invalidate a plan step above.

1. **Bun query-suffix cache busting was never verified in-repo.** Step 3 assumes `await import(path + "?v=" + Date.now())` re-evaluates a module in Bun. No production code in `src/` does this. The only hint is a test comment asserting *"bun resolves it at runtime"* (`src/frontend/alpine/shortcuts-listener.test.ts:51`) — a comment, not evidence. **Verify before designing step 3**; if Bun ignores the suffix, hot reload needs a different mechanism entirely.
2. **MCP hot-install behaviour is unknown.** The harness marketplace registry has `updatedAt` later than `addedAt`, implying a refresh mechanism, but no trigger was found. Do not build against an assumed hot-install path.
3. **Harness context-file load order is undocumented.** Only one precedence rule is stated anywhere (repo `AGENTS.md` beating the giwt skill). Anything depending on context-file precedence rides undocumented behaviour.
4. **The solo-mode authorization posture is a live risk, not a closed question.** Slice 1 made the enforcement path real but left the default deployment effectively open: `requiresAuth` cannot deny and `permissions` is always satisfied under `auth.required = false`. The boot warning tells an operator; it does not protect anything. Whether that is acceptable depends on deployment posture, and no one has decided it.
5. **Tiering remains decorative at request time.** Origin is load-time only; `checkRouteAccess` reads the route's own fields. Slice 1 did not change this.
6. **`sandboxed` is still a dead field**, and the plugin spec (`docs/spec/plugin-system.md:9`) claims signature verification that does not exist. Any doc that repeats the spec is repeating an unimplemented claim.
7. **Per-plugin unload does not exist**, so a failed reload leaks live registrations today (`src/plugins/loader.ts:153-154` vs the catch at `:177-179`).
8. **Uncharacterized code:** `src/integrations/**` and `src/federation/**` were listed or grepped, not read end-to-end (doc 03 sources list, doc 04 sources table). Step 7's scope is a floor, not a bound.
9. **Doc 03's turn-cap claim was wrong** and only one follow-up pass has been done (§3). Other doc 03 `NOT FOUND` claims carry the same risk and should be read as "not found *in the files that were read*".
10. **An unresolved disagreement on the bypass-callsite count** (9 vs 13 vs 12 files, §3). Derive it fresh before step 6.

---

## 7. How to re-verify this

loop-lore drifts and line numbers rot. Run these before trusting anything above, from the repo root.

```bash
# 1. The plugin claims. Expect hits in route-access.ts + loader.ts (slice 1 landed),
#    and exactly the declaration in types.ts for sandboxed.
grep -rn 'requiresAuth' src/plugins/ | grep -v test
grep -rn '\bsandboxed\b' src/ | grep -v test
grep -n 'checkRouteAccess\|warnIfAccessFieldsAreInert' src/plugins/loader.ts

# 2. Tiering is still load-time only: origin must NOT appear in the request path.
grep -rn 'origin' src/plugins/route-access.ts src/plugins/registry-policy.ts

# 3. Hot reload preconditions. No production cache-busting and no per-plugin
#    unload are expected yet.
grep -rn 'await import(' src/plugins/ | grep -v test
grep -n 'unregister\|perPlugin\|clear()' src/plugins/registry-store.ts

# 4. Provenance is path-derived and unverified.
grep -n 'PLUGIN_DIRS' src/plugins/loader.ts
grep -rn 'signature\|checksum\|integrity' src/plugins/

# 5. MCP: zero in the app, present in the harness.
grep -rioE '\bmcp\b' src/ | head
cat ~/.omp/agent/mcp.json

# 6. superpowers and non-git trackers: both should still return nothing.
grep -ril superpowers ~/.omp/skills ~/.omp/agent/managed-skills ~/.omp/plugins .agents/skills
grep -rilE 'jira|atlassian|youtrack' src/ scripts/ plugins/

# 7. The turn cap doc 03 missed, and the loop guard doc 03 did find.
grep -n 'max_turns' src/db/schema-core.ts
grep -n 'isComplete' src/turning/turn-manager/index.ts
grep -n 'detectTheatricalLoop\|repetitionDetector' src/generation/cancellation-actions/streaming.ts

# 8. Token-estimation duplication: two ratios, seven production sites.
grep -rn 'length / 4' src/ --include=*.ts | grep -v test | grep -v /native/
grep -rn 'length \* 0.3' src/ --include=*.ts | grep -v test

# 9. Provider bypasses for step 6 — re-derive the count, don't trust §3.
grep -rn '\.complete(' src/ --include=*.ts | grep -v test

# 10. TTS still absent.
grep -rioE 'speechSynthesis|text-to-speech|audio/speech' src/ | head

# 11. giwt has no network code; its command table is static.
grep -rlE 'Bun\.connect|node:https|XMLHttpRequest|WebSocket' node_modules/giwt/src/

# 12. The gates for what already landed.
bun test --isolate src/plugins/route-access.test.ts src/plugins/solo-mode-warning.test.ts src/plugins/plugin-auth-wiring.test.ts
bunx markdownlint-cli2 "docs/research/*.md"
```

**Docs to re-read when the plan moves:** doc 02 §4 (hot reload) and §8 (the two structural blockers — blocker 1 is closed, blocker 2 is open), and doc 05 §A (the post-slice-1 addendum) before trusting any verdict in its C/R tables.