<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire `src/llm` ResourceManager into generation dispatch

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`
**Summary:** First ticket of `epic-llm-request-scheduler.md`. Constructs a `ResourceManager` and routes every `callWithFailover` invocation through it, so the existing (currently orphaned) `src/llm/` scheduling slice becomes reachable from a real request. Behavior-preserving: all requests submit at `PriorityLevel.Normal` and the manager's `defaultMax` is set high enough that no request ever actually waits, until later tickets move the policy.
**Context:** `src/llm/` (resource-manager, priority-queue, concurrency-limiter, message-state-machine, internal-handle, running-handles) is complete, tested, and imported by nothing outside its own tests. Its header comment at `src/llm/resource-manager.ts:13-15` states the intended call site was never written. This ticket writes it.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] A single `ResourceManager` instance is constructed at startup with `Config`-derived slot caps and is reachable from the generation dispatch path (threaded through the existing `GenDeps` bag at `src/generation/auto-gen/deps.ts:42-45` and/or the `RegisterPluginsOpts` closure injection, not a module-level singleton — the repo rejected DI frameworks and module globals for stated reasons; see `src/elysia-app.ts:14-15`).
- [ ] Every `callWithFailover` call site routes through the manager. Verified call sites:
  - `src/generation/generate-route/stream-to-client.ts:114`
  - `src/generation/generate-route/non-stream.ts:91` (and its tool-round loop, `MAX_TOOL_ROUNDS` iterations each re-entering the scheduler)
  - `src/generation/auto-gen/call-llm.ts:148` (streaming) and `:192` (non-streaming)
- [ ] Each submission passes a unique, stable `id` (the manager rejects duplicates — `src/llm/resource-manager.ts:80`). The existing `attemptId` from the cancellation tracker is the natural id; do not mint a second id scheme.
- [ ] Provider key is the resolved provider name from `buildFailoverList` (`src/generation/providers/registry.ts:173`), so per-provider slot caps key off the same identity failover already uses.
- [ ] **Behavior is unchanged when the ticket lands.** With the default config, no request waits longer than it does today. Assert this explicitly: submit N concurrent requests with `defaultMax >= N` and verify completion order matches submission order.
- [ ] The existing per-request `AbortController` (client disconnect, cancellation tracker) still aborts the underlying provider fetch through the manager's `run` thunk — a queued request cancelled before it acquires a slot must reject, not hang.
- [ ] `ResourceManager` is exercised through a real dispatch path in at least one integration test, not only through `src/llm/resource-manager.test.ts`.
- [ ] No new dependency added. `bun run typecheck` and `bun run lint` pass; `bun run check` green.
- [ ] The `ponytail` ceiling comment at `src/llm/resource-manager.ts:17-19` is preserved verbatim — it documents the in-process/single-node boundary this epic deliberately does not cross.

## Notes

**Why behavior-preserving matters here.** Every subsequent ticket in the epic changes *policy* (priority bands, admission limits, rotation). If the wiring itself also changes observable behavior, a regression in any later ticket becomes ambiguous — was it the wiring or the policy? Landing the wire with a no-op policy makes the diff attributable.

**Tool-round loop interaction.** `non-stream.ts:90-121` and `stream-to-client.ts:110+` loop up to `MAX_TOOL_ROUNDS`, calling `callWithFailover` each round. Each round re-enters the scheduler. That is correct (each round is a real dispatch) but it means one user turn can occupy the queue repeatedly. Do not add special-casing for the loop here — a request that needs N round-trips holding a slot N times is a policy question, and policy is the next ticket.

**Do not** add persistence, cross-process coordination, or a DB-backed queue. Out of scope by the epic's non-goals.

## Related Files

- `src/llm/index.ts` — barrel to import from
- `src/llm/resource-manager.ts` — the manager being wired (unmodified except injection plumbing)
- `src/generation/providers/call-with-failover.ts:25` — what gets wrapped
- `src/generation/auto-gen/deps.ts:42-45` — existing dependency-injection bag
- `src/generation/generate-route/stream-to-client.ts`, `non-stream.ts` — call sites
- `.plan/epics/epic-llm-request-scheduler.md` — parent epic


git issue: 25e3c7b
