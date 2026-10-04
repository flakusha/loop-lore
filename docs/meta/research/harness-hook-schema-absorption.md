<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Harness hook schema + external-capability absorption

**Status:** Research — feeds task candidates
**Date:** 2026-10-04
**Source tickets:** `.plan/epics/epic-harness-integration.md` §16 (`:306-316`); `.plan/tickets/TASK-harness-irc-ttsr.md` (`:18`)

## Question

What hook/extension schema should the harness expose — event→matcher→handler with Pre-veto/Post-notify pairs, a `PostToolBatch` parallel join point, `PreCompact/PostCompact` brackets, a fallback provider chain shape, and a `CanonicalUsage` record — and what is the reusable framing for absorbing an external tool's essential behavior when that tool is abandoned?

## Findings

### 1. What the repo already has (do not build a parallel taxonomy)

- Plugin capability taxonomy is 6 values, one already `eventHandlers` (`src/plugins/types.ts:22-28`), origin-gated per capability (`src/plugins/registry-policy.ts:7-11`). The handler contract is **name-only, notify-only, no matcher, no result** (`src/plugins/types.ts:163-167`), registered via manifest (`src/plugins/loader.ts:181`) and `PluginContext.registerEventHandler` (`types.ts:83`).
- Dispatch is a linear scan on exact event name, sequential, error-isolated, return value discarded (`src/plugins/event-bus.ts:30-47`). Event names in use are ad-hoc dotted strings — `chat.created` (`src/chat/crud/create.ts:117-121`), `chat.archived`/`chat.unarchived` (`archive.ts:133,180`), `chat.deleted` (`delete.ts:59`), `message.variant.created` (`src/chat/service/write.ts:156-158`) — all Post-notify in effect.
- The agentic tool loop is `executeToolCalls` (`src/generation/generate-route/tool-execution.ts:151-236`), capped at `MAX_TOOL_ROUNDS = 5` (`:48`), called inside the round loop (`non-stream.ts:93-128`, `stream-to-client.ts:119-182`). There is **no** pre-tool interception, no input rewrite, no batch-level join point today.
- Compaction is a single bracket-free call site: `ContextCompactor.compact()` (`src/generation/context-compactor.ts:87-110`), best-effort when the assembled prompt exceeds 85% of budget (`src/generation/generate-route/build-prompt.ts:96-109`).
- Usage is narrowest-possible `{ promptTokens, completionTokens, totalTokens }` (`src/generation/providers/types.ts:104-108`); the harness recorder narrows it to `ExecUsage { promptTokens, completionTokens }` (`src/harness/exec-recorder.ts:14-18`) and the run record keeps only `tokensIn/tokensOut` + nullable `costUsd` (`src/harness/types.ts:56-58`). Anthropic parses `cache_creation_input_tokens`/`cache_read_input_tokens` (`src/generation/providers/anthropic/types.ts:45-50`) but the mapping drops them.
- Failover is already ordered: `buildFailoverList` (`src/generation/providers/registry.ts:181-209`) → `callWithFailover` (`src/generation/providers/call-with-failover.ts:29-67`), capped by `fallbacks?: number` (`src/generation/routing/routing-config.ts:26-27`).

**Conclusion:** extend `EventHandlerDefinition` + `emitPluginEvent`; no second extension registry — the epic's reuse-first rule and §2 say so (`.plan/epics/epic-harness-integration.md:32-36`, `:93-95`).

### 2. External shape references

| Tool | Matcher | Pre-veto | Post-notify | Batch | Compaction |
|---|---|---|---|---|---|
| Claude Code | `matcher` + `if` | `PreToolUse` → `permissionDecision` deny/allow/ask/defer | `PostToolUse`, `PostToolUseFailure` | `PostToolBatch` (once/batch, no matcher) | `PreCompact` (can block) / `PostCompact` (no control) |
| opencode | none (code branches) | `tool.execute.before` (throw = veto) | `tool.execute.after` | — | `experimental.session.compacting` (inject/replace prompt); `session.compacted` (notify) |
| omp | in-handler | `tool_call` → `{block, reason, input}` | `tool_result` → `{content, details, isError, additionalContext}` | — | `session_before_compact` (cancel) / `session.compacting` (inject) / `session_compact` |

Claude Code is the canonical chain: event fires → `matcher` narrows the tool → optional `if` narrows the subcommand → handler runs; omission/`"*"` matches all; PreToolUse precedence is `deny > defer > ask > allow`; `PostToolBatch` fires exactly once with the full `tool_calls` array (<https://docs.claude.com/en/docs/claude-code/hooks>). opencode vetoes by throwing and mutates `output.args` after (<https://dev.opencode.ai/docs/plugins>). omp's `tool_call` is fail-closed on handler throw, `input` rewrite last-wins (<https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md>). Hermes' `fallback_providers:` is an ordered `{provider, model}` list with per-task `fallback_chain` overrides and explicit `[]` to disable inheritance (<https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/fallback-providers.md>) — the same axis loop-lore has, missing only the *ordered, scoped* part.

## Recommendation (design sketch, reuse-first)

### 3.1 Event→matcher→handler contract (extend, don't fork)

Widen `EventHandlerDefinition` additively; keep `event: string` so the 5 existing emitters compile unchanged:

```ts
type HookPhase = "pre" | "post";     // pre = veto-capable, post = notify-only
type HookEvent =
  | "tool.call"      // pre, per tool      (Claude PreToolUse)
  | "tool.result"    // post, per tool     (PostToolUse / PostToolUseFailure)
  | "tool.batch"     // post, once/batch   (PostToolBatch)
  | "compact.before" // pre, veto-capable  (PreCompact)
  | "compact.after"  // post, notify-only  (PostCompact)
  | "turn.before" | "turn.after" | "session.start" | "session.end";

interface HookMatcher { tool?: string; toolPattern?: string }  // undefined/"*" = all
interface HookResult {
  veto?: boolean; reason?: string;          // pre only
  updatedInput?: Record<string, unknown>;   // pre tool.call only
  updatedOutput?: { content: string };      // post tool.result only
  additionalContext?: string;               // both phases
}
interface EventHandlerDefinition {
  event: string;                            // unchanged
  matcher?: HookMatcher;                    // NEW — absent = match all
  phase?: HookPhase;                        // NEW — default "post" (current behaviour)
  handler: (data: unknown) => Promise<HookResult | void>;  // widened return
}
```

`emitPluginEvent` (`src/plugins/event-bus.ts:30-47`) keeps its signature and gains a matcher filter + result collection pass; it stays sequential and error-isolated (a throwing handler never blocks later handlers). The harness dispatcher owns veto aggregation, not the emitters.

**Veto vs notify.** `pre` handlers aggregate and short-circuit on first `veto: true` (fail-closed, mirroring omp's `tool_call`). `post` handlers never veto — collect every `additionalContext` in registration order, drop duplicates, merge `updatedOutput` last-wins. Skip Claude Code's four-value `allow/ask/defer` ladder: loop-lore has no per-tool-call permission host — its only approval gate is workflow-level (`WorkflowApprovalConfig { type: "confirm" | "auto" }`, `src/config/sections/templates-workflow.ts:54-58`, enforced at `src/assistant/workflow-runner.ts:132-134`) — so `veto` (deny) + silence (allow) is the whole surface.

### 3.2 Join and bracket points (exact existing seams)

- **`tool.call` / `tool.result`**: wrap each iteration of the `for (const tc of toolCalls)` loop in `executeToolCalls` (`src/generation/generate-route/tool-execution.ts:158-203`). Pre veto → synthesize the existing error-result shape (`:161-168`) so the round continues.
- **`tool.batch`**: fire once after `executeToolCalls` returns, before the next `callWithFailover` round — `non-stream.ts:117-128` / `stream-to-client.ts:171-181`. The only place that sees the whole batch; per-tool hooks fire concurrently and cannot.
- **`compact.before` / `compact.after`**: bracket `new ContextCompactor(...).compact(...)` at `build-prompt.ts:96-109`. `compact.before` veto → skip compaction and proceed with full context (today's catch branch, `:106-108`); `compact.after` receives `{ trigger: "auto", summary }` for logging only.

### 3.3 `CanonicalUsage`

```ts
interface CanonicalUsage {
  input: number;        // openai prompt_tokens | anthropic input_tokens
  output: number;       // completion_tokens | output_tokens
  cacheRead: number;    // prompt_tokens_details.cached_tokens | cache_read_input_tokens
  cacheWrite: number;   // (openai: none) | cache_creation_input_tokens
  reasoning: number;    // thinking/reasoning count when the provider reports it
  requestCount: number; // 1 per egress call; summed by the harness rollup
}
```

One mapper per provider (`openai-compatible/core.ts:47-51`, `anthropic/types.ts:45-50`) fills it; `ExecUsage` (`src/harness/exec-recorder.ts:14-18`) becomes `CanonicalUsage` and the run record gains the four extra counters. `reasoning` is **[INFERENCE]** — no current parser extracts a separate reasoning count (`thinking` is a capability flag only, `src/generation/providers/types.ts:29-30`), so it stays 0 until one does. `requestCount` makes per-request cost attributable; `costUsd` stays nullable so unknown price never sums as free (`src/harness/types.ts:51-56`).

### 3.4 Fallback chain shape

Keep `buildFailoverList` as the resolver; change `config.generation.routing.fallbacks?: number` (`routing-config.ts:26-27`) into an ordered scoped list:

```ts
interface FallbackScope { scope: string; entries: string[] }  // scope = taskType | "default"
fallbacks?: FallbackScope[];   // [] disables inheritance for that scope
```

Ordered, scoped, explicit `[]` disables — the hermes `scoped_fallback_chain` shape. The router already emits an ordered `RouteResult { primary, fallbacks }` (`src/generation/routing/router.ts:38-42`). **[INFERENCE]** feeding that scoped list through `buildFailoverList` is a config-shape change, not a new resolver — unverified until the ticket lands.

### 3.5 The absorption pattern (capability catalogue → native seam → deprecate wrapper)

When an external tool owns a capability: (1) **capability catalogue** — enumerate what it does mechanically, no parity claim by eye (the giwt-fork ticket measured spawn isolation 39/39 vs 50/50 and LOC 1095 vs 1646, `TASK-delete-the-in-repo-scripts-worktree-fork-giwt-is-the-only-wo.md:28-33`); (2) **native seam** — build only the thin in-repo interface (wrapper, event name, type), never a reimplementation, because live imports are the real blocker (`:41-52`); (3) **deprecate wrapper** — retire the duplicate only once the seam covers every live caller; generated files regenerate post-cutover, never hand-resolve (`:54-57`).

Applied here: external tools are shape references, not dependencies — adopt the event names, matcher concept, and result fields; the wrapper being deprecated is the narrow `EventHandlerDefinition`/`emitPluginEvent` pair once the widened contract lands.

## Task candidates

### 1. `TASK-harness-hook-contract` — event→matcher→handler + veto/notify + join/bracket points

**Why:** §16 names the schema; the repo has a notify-only stub (`event-bus.ts:30-47`) with no matcher, no result, no batch, no compaction bracket. This is the seam all other hook work hangs off.

**Acceptance criteria:**
- [ ] `EventHandlerDefinition` gains optional `matcher` + `phase`; `handler` return widened to `HookResult | void` (`src/plugins/types.ts:163-167`); the 5 existing emitters compile unchanged.
- [ ] `emitPluginEvent` (`src/plugins/event-bus.ts:30-47`) applies the matcher filter and collects results; error isolation and sequential order preserved.
- [ ] `tool.call` pre-veto fires per tool inside `executeToolCalls` (`tool-execution.ts:158-203`); a veto produces the existing error-result shape, never a throw.
- [ ] `tool.batch` fires exactly once per resolved batch before the next provider round (`non-stream.ts:117-128`, `stream-to-client.ts:171-181`), no matcher.
- [ ] `compact.before` veto skips compaction at `build-prompt.ts:96-109`; `compact.after` receives `{trigger, summary}` and is notify-only.
- [ ] Unit tests: matcher filtering, veto short-circuit vs post-handler fan-out, batch fired once, pre-veto blocks compaction. `bun run check` green incl. 80% per-module floor.

**Related files:** `src/plugins/types.ts`, `event-bus.ts`, `loader.ts`, `src/generation/generate-route/tool-execution.ts`, `build-prompt.ts`, `non-stream.ts`, `stream-to-client.ts`, `src/generation/context-compactor.ts`.

### 2. `TASK-harness-canonical-usage` — one usage record + cache/reasoning counters

**Why:** provider parsers each shape usage differently and drop the cache fields Anthropic already reads (`anthropic/types.ts:45-50`); per-request cost and cache-hit rate are unmeasurable.

**Acceptance criteria:**
- [ ] `CanonicalUsage {input, output, cacheRead, cacheWrite, reasoning, requestCount}` defined once; `ExecUsage` (`exec-recorder.ts:14-18`) replaced by it; run record + wire (`types.ts:56-58, 79-101`) gain the extra counters.
- [ ] openai-compatible and anthropic parsers fill it (`core.ts:47-51`, `anthropic/types.ts:45-50`); absent fields default to 0, never NaN.
- [ ] `costUsd` stays nullable and is never summed as 0 for unknown prices.
- [ ] Unit tests: anthropic cache fields survive mapping; `requestCount` sums across a batch; rollup (`src/harness/stats.ts`) exposes cacheRead totals.

**Related files:** `src/generation/providers/types.ts`, `openai-compatible/core.ts`, `anthropic/types.ts`, `src/harness/exec-recorder.ts`, `types.ts`, `stats.ts`.

### 3. `TASK-harness-scoped-fallback-chain` — ordered, scoped fallbacks with explicit disable

**Why:** `fallbacks?: number` (`routing-config.ts:26-27`) is a cap, not a policy; the router already emits an ordered list (`router.ts:38-42`) but config cannot express per-scope order or `[]` disable.

**Acceptance criteria:**
- [ ] `fallbacks` becomes an ordered `FallbackScope[]`; `[]` disables inheritance for that scope; absent falls back to today's provider-order behavior.
- [ ] `buildFailoverList` (`registry.ts:181-209`) consumes the scoped list; circuit breaker and cancellation semantics in `call-with-failover.ts:29-67` unchanged.
- [ ] Unit tests: order honored, scope override wins, `[]` disables, unconfigured scope = today's output byte-for-byte.

**Related files:** `src/generation/routing/routing-config.ts`, `router.ts`, `src/generation/providers/registry.ts`, `call-with-failover.ts`, `src/config/schema/generation.ts`.

## Open questions

- Does `tool.call` input rewrite belong in v1, or only veto? A rewrite changes what gets persisted and re-validated, so it may deserve its own ticket.
- Should `tool.batch` `additionalContext` be capped like Claude Code's 10,000-char limit, or left to the existing prompt-budget compaction?
- `reasoning` counter: which provider reports a separate count? Until one does, it is a reserved slot, not a measurement.

## Sources

Repo:
- `.plan/epics/epic-harness-integration.md:306-316` (§16), `:32-36`, `:93-95`; `.plan/tickets/` `TASK-harness-irc-ttsr.md:18`, `TASK-harness-model-routing.md:11,18`, `TASK-harness-stats-dashboard.md:11,16`, `TASK-delete-the-in-repo-scripts-worktree-fork-giwt-is-the-only-wo.md:28-57`
- `src/plugins/types.ts:22-28,83,163-167`; `src/plugins/event-bus.ts:30-47`; `loader.ts:181`; `registry-policy.ts:7-11`; `src/chat/crud/create.ts:117-121`, `archive.ts:133,180`, `delete.ts:59`; `src/chat/service/write.ts:156-158`
- `src/generation/generate-route/tool-execution.ts:48,151-236`; `build-prompt.ts:96-109`; `non-stream.ts:93-128`; `stream-to-client.ts:119-182`; `src/generation/context-compactor.ts:87-110`
- `src/generation/providers/types.ts:29-30,104-108`; `anthropic/types.ts:45-50`; `openai-compatible/core.ts:47-51`; `registry.ts:181-209`; `call-with-failover.ts:29-67`
- `src/generation/routing/routing-config.ts:26-27`; `router.ts:38-42`; `src/harness/exec-recorder.ts:14-18`; `src/harness/types.ts:51-58,79-101`; `stats.ts`

External:
- Claude Code hooks — <https://docs.claude.com/en/docs/claude-code/hooks>
- opencode plugins — <https://dev.opencode.ai/docs/plugins>
- omp hooks — <https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md>
- hermes fallback providers — <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/fallback-providers.md>
