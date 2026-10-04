<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Harness subagent intercommunication (progress, handoff, status board)

**Status:** Research — feeds task candidates
**Date:** 2026-10-04
**Source tickets:** `.plan/tickets/TASK-harness-subagent-delegation.md`, `.plan/tickets/TASK-harness-irc-ttsr.md`, `.plan/epics/epic-harness-integration.md` (§9, §17)

## Question

Progress, handoff, and status information must be available to the main agent and
intercommunicated between (sub)agents — so siblings do not repeat implementation,
re-tackle the same issue, or stall/conflict. What is the *minimum* in-repo contract
that delivers (a) progress reporting subagent→parent, (b) artifact/state handoff
between siblings, and (c) a status board (who is doing what / done / failed) — reusing
what already exists rather than building a new bus?

## Findings

### The run record is already a status source — but only after the fact

`HarnessRunRecord` (`src/harness/types.ts:37-63`) carries `runId`, `ts`, `runMs`,
`task`, `taskType`, `model`, `tools[]`, `pattern`, `result` (`ok|error|timeout|cancelled`,
`types.ts:31`), `error`, `toolingGap`, `costUsd`, `tokensIn/out`, `branch`, `pid`,
`gitSha`, `msg`, and `turnId` (the user turn's correlation id, shared by every
tool round of that turn). It is written one JSON line per run to
`.harness/executions.jsonl` (`src/harness/exec-log.ts:23-26`), gitignored
(`.gitignore:76`), best-effort and never blocking (`exec-log.ts:72-99`).

Two facts constrain reuse:

1. **Records are terminal.** `recordExecRun` runs on a *finished* egress call
   (`src/harness/exec-recorder.ts:98-100`); nothing is appended at start. `stats()` is a
   pure rollup over a bounded window (`src/harness/query.ts:145-147`, `stats.ts:78`;
   `MAX_LINES = 20_000`, `READ_WINDOW_BYTES = 4 MiB`, `query.ts:30-36`). No in-flight
   projection — "who is running right now" cannot be answered from the log alone.
2. **No agent identity.** Only `runId` (fresh UUIDv4 per call, `run-context.ts:70-72`)
   and `pid` (process-scoped, `run-context.ts:75`) exist; a subagent's calls are not
   linked to each other or to a parent. `taskType` has a `"handoff"` member
   (`types.ts:24`) but no field names *who* handed off to *whom*.

The read API is already admin-only and typed: `GET /api/harness/runs`, `/runs/:runId`,
`/stats` (`src/routes/harness/index.ts:60-101`), guarded by `admin.system`
(`index.ts:61`). Filtering supports `taskType|result` only (`index.ts:71-74`,
`read-models.ts:56-61`).

### In-flight status already has a store and an endpoint

`request_results` via `createAsyncStore` (`src/async/store.ts:86-191`) has exactly the
lifecycle a status board needs: `RequestStatus = pending|in_progress|complete|failed|expired`
(`store.ts:28`), a free-form `progress` payload (`ProgressUpdate`, `store.ts:56-59`), and
fire-and-forget `track/progress/complete/fail` writes (`store.ts:194-208`).
`GET /api/requests/:id/status` already exposes it (`src/routes/requests/status.ts:53-55`);
the frontend poller is `use-request-status.ts` (750 ms/30 s — cited at
`epic-harness-integration.md:225`). SSE push precedent:
`src/routes/notifications/stream.ts:142-179`.

### Durable run state and the one-live-run guard exist

`workflow_sessions` (`src/db/schema-core.ts:1115-1121`) persists `WorkflowSession`
(`src/assistant/workflow-session.ts:17-19`) with a 24 h TTL, write-through `saveSession`
(`src/assistant/workflow-session-store.ts:43-60`) and lazy rehydrate (`store.ts:70-100`).
`harness-verbs.ts` already refuses a second run per chat
(`src/assistant/commands/harness-verbs.ts:126-135`) — the existing anti-clobber rule; the
pure state machine is `WorkflowRun { workflowId, values, confirmed }`
(`src/assistant/workflow-runner.ts:18-23`).

### Existing "chat between agents" precedents (in repo, but not agent-to-agent)

- `scripts/worktree/utils/ledger.ts:5-20,40-41,118-147` — the agent ledger: append-only
  JSONL in `tree/<branch>/.ledger.jsonl`, `{v,ts,pid,cmd,branch,msg}`, msg capped at 280
  chars, best-effort. Closest thing to an in-repo status board, but CLI-invocation-scoped
  and not queryable by run/agent.
- `emitPluginEvent(handlers, event, data)` (`src/plugins/event-bus.ts:30-46`) — ordered
  fan-out with error isolation. The event seam a status board would publish through.
- Group chat has @mention routing (`src/group-chat/turn-selector.ts:4-16`,
  `mention-parser.ts:5-13`) and a **read-only** turn-order view
  (`src/chat/service/turn-order.ts:25-45`) — but actors never message mid-turn and there
  is no inbox/wait/broadcast (`TASK-harness-irc-ttsr.md:11`).

### What loop-lore lacks

1. No agent/run identity shared across a subagent's calls (no `agent_id`/`parent_run_id`).
2. No in-flight status read model (the log is terminal-only; nothing joins a live
   delegation to its progress).
3. No inter-agent mailbox/status board — `TASK-harness-irc-ttsr.md:16` scopes this to WRAP
   (omp `IrcBus`) first, BUILD only if offline DMs are needed; delegation is still Not
   Started (`TASK-harness-subagent-delegation.md:16-18`).

### External prior art (patterns, not code)

- **AutoGen** — direct message vs broadcast; topics are `(type, source)` and a
  subscription maps topic → agent id, so a publisher never needs recipient ids
  ([topics](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/core-concepts/topic-and-subscription.html));
  handoff = a tool call that publishes the task to the target topic
  ([handoffs](https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/design-patterns/handoffs.html)).
- **LangGraph** — checkpointer = per-thread state snapshots; store = cross-thread shared
  data; the docs' own guidance is to use a store for data crossing graph boundaries
  ([persistence](https://docs.langchain.com/oss/python/langgraph/persistence)). Supervisor
  handoff is a tool returning a `Command(goto=…, update={…})` state patch
  ([supervisor README](https://github.com/langchain-ai/langgraph-supervisor-py)).
- **CrewAI** — hierarchical process: a manager assigns, validates outcomes, and
  progresses tasks; delegation disabled by default
  ([hierarchical](https://docs.crewai.com/en/learn/hierarchical-process)).
- **Claude Code agent teams** — shared task list (pending/in-progress/completed +
  dependencies, file-locked claiming) plus per-agent mailbox JSON files; teammates
  self-claim unblocked tasks ([agent-teams](https://code.claude.com/docs/en/agent-teams)).
- **omp** — `agent://<id>` resolves a subagent's saved output (not live transcript);
  `write agent://<id>` steers/follows up, `agent://all` broadcasts; messaging a parked
  agent revives it (`omp://agent-hub.md` §Related surfaces). IRC semantics
  to wrap: mailbox cap 100, waiter-first, idle-wake vs busy-aside, `all`-broadcast,
  `replyTo` (`TASK-harness-irc-ttsr.md:11`).

## Recommendation (design sketch, reuse-first)

Wrap the existing seams; add no new bus, no second state machine, no new session table.

1. **Identity first (the load-bearing change).** Extend `HarnessRunRecord` additively
   with optional `agentId`/`parentRunId` (`types.ts:37-63`; wire names `agent_id`/
   `parent_run_id` in `serializeRun`/`deserializeRun`, `types.ts:108-174`). Populate from
   a new `run-context.ts` accessor seeded at dispatch (same memoized pattern as
   `getGitContext`, `run-context.ts:55-58`). Optional fields keep old log lines readable
   (`deserializeRun` already tolerates missing fields, `types.ts:149-172`).

2. **Progress = AsyncStore, not a new table.** A delegation gets a `request_results` id;
   the child calls `progress(id, owner, {progress:{step, detail}})` (already `store.ts:201`)
   and the parent polls `GET /api/requests/:id/status` (`routes/requests/status.ts:53-55`)
   or subscribes to a new SSE stream built on the `NotificationStreamer` shape
   (`routes/notifications/stream.ts:142-179`). Terminal state reuses `RequestStatus`
   (`store.ts:28`) — do not invent a second enum.

3. **Handoff = one typed run record + shared artifacts.** Record a `taskType:"handoff"`
   line (`types.ts:24`) whose `msg` names artifact paths (`local://…` shared root, per
   omp's convention) and whose `parentRunId` links the lineage; the receiving sibling
   reads the log via `listRuns` (`query.ts:114-127`) rather than a bespoke channel — the
   ledger's `--say` idea (`ledger.ts:92-107`) with run identity attached.

4. **Status board = projection, not storage.** A `listActiveRuns()`-style read model
   joining (i) in-flight `request_results` rows (`store.ts:194-208`), (ii) recent terminal
   `HarnessRunRecord`s grouped by `agentId`/`parentRunId`, and (iii) the one-live-run guard
   already in `harness-verbs.ts:126-135`. Served beside the existing admin routes
   (`routes/harness/index.ts:60-101`), rendered by the Harness tab
   (`src/views/admin.html:2626-2629`).

5. **IRC = wrap, per the ticket.** `TASK-harness-irc-ttsr.md:16` already mandates driving
   multi-actor messaging through `omp --mode rpc/json` + `IrcBus` and documenting the
   delivery contract (cap 100, waiter-first, idle-wake vs busy-aside, `all`, `replyTo`).
   The in-repo `irc_message` event + inbox table is only for offline group-chat DMs. Do
   not build a bus ahead of that need.

Rejected as unnecessary: a new `delegations` DB table (the run record + `request_results`
cover it), a second status enum, a second scheduler (the epic's binding rule,
`epic-harness-integration.md:32-36`).

## Task candidates

### 1. Add agent lineage to the harness run record

**Why:** Without `agentId`/`parentRunId` no progress, handoff, or status board can
attribute work to a subagent; this is the single blocking gap.
**Acceptance criteria:**
- [ ] `HarnessRunRecord` gains optional `agentId`/`parentRunId`; wire shape gains
      `agent_id`/`parent_run_id` (`src/harness/types.ts:37-63`, `:108-174`).
- [ ] `deserializeRun` still returns a record for legacy lines lacking both fields
      (`types.ts:139-148`).
- [ ] `run-context.ts` exposes a settable current-agent context (memoized `getGitContext`
      pattern, `run-context.ts:55-58`); `ExecRunInput` threads it (`exec-recorder.ts:21-41`).
- [ ] `listRuns` filter accepts `agentId` (`query.ts:114-127`, `read-models.ts:56-61`);
      round-trip test covers present/absent lineage.

**Related files:** `src/harness/types.ts`, `src/harness/run-context.ts`,
`src/harness/exec-recorder.ts`, `src/harness/query.ts`, `src/harness/read-models.ts`.

### 2. In-flight run status projection (status board read model)

**Why:** The exec log is terminal-only; the parent and siblings cannot see who is
currently doing what, so duplicate work and stalls are invisible until failure.
**Acceptance criteria:**
- [ ] New read model joins in-flight `request_results` (`src/async/store.ts:194-208`,
      `RequestStatus` `store.ts:28`) with recent terminal run records grouped by
      `agentId`/`parentRunId`.
- [ ] Exposed as `GET /api/harness/status` beside the existing admin-only routes
      (`src/routes/harness/index.ts:60-101`), reusing `toSummary` (`types.ts:181-201`).
- [ ] No new table and no second status enum; completed rows are aged to `expired` by
      the existing background pass (`src/async/offload-pass.ts:81-88`, `async.offload`
      cron) — in-flight `pending`/`in_progress` rows are never expired, so the
      projection stays live.
- [ ] Rendered in the existing Harness admin tab (`src/views/admin.html:2626-2629`).

**Related files:** `src/routes/harness/index.ts`, `src/harness/read-models.ts`,
`src/async/store.ts`, `src/frontend/alpine/use-request-status.ts`.

### 3. Handoff record + progress notification for delegated runs

**Why:** Siblings must transfer artifacts and signal progress without a new bus;
`taskType:"handoff"` already exists but is unattributed and untyped.
**Acceptance criteria:**
- [ ] A handoff is one `taskType:"handoff"` run record whose `msg` names artifact paths
      and whose `parentRunId` links sender→receiver (`src/harness/types.ts:24`).
- [ ] Delegation progress writes through `AsyncStore.progress` (`store.ts:201`); parent
      reads it via `GET /api/requests/:id/status` (`routes/requests/status.ts:53-55`).
- [ ] Delivery contract documented: mailbox cap 100, waiter-first, idle-wake vs
      busy-aside, `all`-broadcast, `replyTo` (`TASK-harness-irc-ttsr.md:16`) — wrapped
      through omp, not reimplemented.
- [ ] No `delegations` table added; `workflow_sessions` (`schema-core.ts:1115-1121`)
      remains the only persisted run state.

**Related files:** `src/harness/types.ts`, `src/harness/exec-recorder.ts`,
`src/async/store.ts`, `.plan/tickets/TASK-harness-irc-ttsr.md`.

## Open questions

- One `agentId` per subagent life (one process, many LLM calls) or one per spawn? omp
  parks/revives agents (`omp://agent-hub.md`), arguing for lifecycle-scoped identity.
  [INFERENCE] — confirm against the delegation ticket's `SubagentTask` shape.
- Progress push (SSE, `routes/notifications/stream.ts`) vs poll (`use-request-status.ts`):
  the epic cites the poller as the reuse target (`epic-harness-integration.md:225`); push
  is an upgrade, not a requirement.
- Admin-only status board like the exec log (`routes/harness/index.ts:61`), or visible to
  the delegating agent? The run record carries branch/pid/error text, so the current guard
  is the safe default. Also unresolved: whether the board subsumes the worktree ledger
  (`scripts/worktree/utils/ledger.ts`) or stays a separate host-level feed.

## Sources

**Repo (file:line)**

- `src/harness/types.ts:16-31,37-63,108-174,181-226` — run record, wire shape, read views; `exec-log.ts:23-26,72-99`, `exec-recorder.ts:21-41,98-100` — log path, best-effort append, terminal-only recording
- `src/harness/query.ts:30-42,114-147`, `stats.ts:78`, `run-context.ts:55-58,70-72,75`, `read-models.ts:18-112` — bounded read window, rollups, memoized context, UUID run id, pid, read shapes
- `src/routes/harness/index.ts:60-101` — admin-only read API
- `src/async/store.ts:27-28,56-59,86-191,194-208`, `offload-pass.ts:81-88`, `src/cron/jobs.ts:41` — RequestStatus, progress, AsyncStore, TTL aging, `async.offload` job
- `src/routes/requests/status.ts:53-55`, `src/frontend/alpine/use-request-status.ts` — status endpoint + poller
- `src/assistant/workflow-session-store.ts:19,43-60,70-100`, `workflow-session.ts:17-19,31-33` — 24 h TTL, write-through, rehydrate, session shape; `workflow-runner.ts:18-23` — pure WorkflowRun
- `src/assistant/commands/harness-verbs.ts:126-135` — one-live-run-per-chat guard
- `src/db/schema-core.ts:1115-1121` — `workflow_sessions` columns
- `scripts/worktree/utils/ledger.ts:5-20,28-42,92-107,118-147` — agent ledger + `--say`
- `src/plugins/event-bus.ts:30-46` — `emitPluginEvent` fan-out
- `src/group-chat/turn-selector.ts:4-16`, `mention-parser.ts:5-13`, `src/chat/service/turn-order.ts:25-45` — mention routing, read-only turn-order
- `src/routes/notifications/stream.ts:142-179`, `src/views/admin.html:2626-2629`, `.gitignore:76` — SSE precedent, Harness tab mount, `.harness/` ignored
- `.plan/tickets/TASK-harness-subagent-delegation.md:10,16-18`
- `.plan/tickets/TASK-harness-irc-ttsr.md:10-19`
- `.plan/epics/epic-harness-integration.md:32-36,203-210,318-335`

**External (URL)**

- AutoGen topics/subscriptions — https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/core-concepts/topic-and-subscription.html ; handoffs — https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/design-patterns/handoffs.html
- LangGraph persistence — https://docs.langchain.com/oss/python/langgraph/persistence ; supervisor handoff — https://github.com/langchain-ai/langgraph-supervisor-py
- CrewAI hierarchical process — https://docs.crewai.com/en/learn/hierarchical-process
- Claude Code agent teams — https://code.claude.com/docs/en/agent-teams
- omp Agent Hub — `omp://agent-hub.md` ; omp task tool — `omp://tools/task.md`
