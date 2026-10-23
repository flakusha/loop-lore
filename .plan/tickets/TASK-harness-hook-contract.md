<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness hook contract (event→matcher→handler)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-integration
**Related:** docs/meta/research/harness-hook-schema-absorption.md, TASK-harness-canonical-usage.md, TASK-harness-scoped-fallback-chain.md

**Summary:**

Widen the plugin event contract additively: `EventHandlerDefinition` gains optional `matcher` + `phase`, the handler return widens to `HookResult | void`, `emitPluginEvent` gains matcher filtering + result collection, and the four harness seams (`tool.call` pre-veto, `tool.batch` join, `compact.before`/`compact.after` brackets) fire at their exact existing call sites. The seam all other hook work hangs off.

**Context:**

Today the contract is name-only, notify-only, no matcher, no result (`src/plugins/types.ts:163-167`), dispatched by a linear scan that discards return values (`src/plugins/event-bus.ts:30-47`). External baselines: Claude Code's matcher + PreToolUse veto precedence (deny>defer>ask>allow) + PostToolBatch; opencode vetoes by throwing; omp `tool_call` is fail-closed with input rewrite. loop-lore has no per-call permission host — workflow-level approval only — so the surface is veto (deny) + silence (allow).

**Acceptance Criteria:**

- [ ] `EventHandlerDefinition` gains optional `matcher {tool?, toolPattern?}` + `phase: "pre"|"post"` (default post = today's behavior); handler return widens to `HookResult | void`; the 5 existing emitters compile unchanged
- [ ] `emitPluginEvent` applies matcher filter + collects results; sequential + error-isolated preserved (a throwing handler never blocks later handlers)
- [ ] `tool.call` pre-veto fires per tool in `executeToolCalls` (tool-execution.ts:158-203); veto produces the existing error-result shape, never a throw; `tool.batch` fires exactly once per resolved batch before the next provider round
- [ ] `compact.before` veto skips compaction at build-prompt.ts:96-109; `compact.after` notify-only with `{trigger, summary}`
- [ ] Unit tests: matcher filtering, veto short-circuit vs post fan-out, batch fired once, veto blocks compaction; `bun run check` green incl. 80% per-module floor

## Technical Notes

- Extend, never fork: no second extension registry (epic reuse-first rule §2). Veto aggregation lives in the harness dispatcher, not in `emitPluginEvent`.
- Input rewrite (`updatedInput`) is in the type but NOT v1 scope — open question in the doc; it changes what gets persisted and re-validated.


git issue: cf78912
