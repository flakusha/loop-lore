<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Subagent budget exhaustion — partial work, rescope, and refund

**Status:** Research — feeds task candidates
**Date:** 2026-10-04
**Source tickets:** `.plan/tickets/TASK-harness-subagent-delegation.md`, `.plan/epics/epic-harness-integration.md` §9

## Question

When a delegated subagent runs out of budget (wall-clock or tokens) before it can
finish, the parent must be able to (a) review the partial work and rescope — split
the original task into smaller `DelegationRecord`s because the size estimate was
wrong — or (b) grant additional budget so the subagent can finish. What is the
minimal design that fits the existing harness, governor, and persistence seams
without introducing a second scheduler?

## Findings

### 1. What a run record already captures (no new telemetry needed)

`HarnessRunRecord` (one line of `.harness/executions.jsonl`) already carries
everything needed to measure per-call consumption: `runMs`, `tokensIn`,
`tokensOut`, `costUsd`, `result` (`ok|error|timeout|cancelled`), `tools`,
`toolCount`, `task`, `taskType`, `model`, `branch`, `gitSha`, `pid`,
`turnId` (`src/harness/types.ts:37-63`). The wire shape is stable snake_case
(`src/harness/types.ts:80-101`, `:108-131`), so a `jq` rollup over a child's
records already yields "tokens spent / wall time / tools used" for one task.

Two gaps for delegation specifically:

- **No `result` value for "budget exhausted".** `HarnessResult` is
  `"ok" | "error" | "timeout" | "cancelled"` (`src/harness/types.ts:31`), so a
  budget stop is indistinguishable from a provider timeout or a user cancel. The
  route filter union mirrors the same four values
  (`src/routes/harness/index.ts:50`), so adding a value touches both.
- **No linkage from a run to the delegation that spawned it.** `runId` is a
  fresh UUID per call (`src/harness/run-context.ts:70-72`,
  `exec-recorder.ts:69`); correlating N child calls to one `DelegationRecord`
  needs one new field, not a new store.

Both writer (fire-and-forget, never throws, `src/harness/exec-log.ts:72-99`) and
reader (bounded tail scan, `src/harness/query.ts:30-36`, `getRun` `:134-137`) are
safe to reuse on the delegation hot path.

### 2. The governor is a rate gate, not a budget accountant

`AutonomyGovernor.tryConsume` is a windowed counter over the `autonomy_budget`
table (`src/autonomy/governor/index.ts:142-247`); it denies when `nextCount > cap`
and persists no mutation on denial (`:176-209`). Three consequences:

- The **caller supplies the cap** (`TryConsumeOptions.cap`, `types.ts:46-48`) and
  the governor "never mutates cap values autonomously" (`README.md:50-51`), so a
  "refund" cannot be a governor op — it is a higher caller-supplied cap.
- Limits are **counts per rolling window**, not tokens or dollars: the catalog is
  `per_tick_action`/`per_minute_generation`/`per_hour_beat_dispatch`
  (`index.ts:52-56`), resolved from `perAgentCap`/`perUserCap` (`caps.ts:74-79`).
  No token or spend ceiling exists in the governor today.
- The precedent for gating spawned work is `runNpcMovementTick` (jitter →
  `tryConsume` → work, `{ skipped: "budget", reason }` on denial,
  `tick-driver.ts:133-149`) — the shape a spawn gate should mirror.

The epic requires "Governor deny-by-default budgets enforced on every spawn"
(`.plan/tickets/TASK-harness-subagent-delegation.md:19`), so spawn must
`tryConsume` first. That gates *count*, not *size*; size comes from the exec log.

### 3. Prior art: who models budget exhaustion, and how

| System | Budget model | Partial result on exhaustion | Rescope / top-up |
| --- | --- | --- | --- |
| **OpenAI Agents SDK** | `max_turns` on the run; exceeding it raises `MaxTurnsExceeded` (Python) / `MaxTurnsExceededError` (JS), and the error carries an optional `RunState` for resume ([running_agents](https://openai.github.io/openai-agents-python/running_agents/), [MaxTurnsExceededError](https://openai.github.io/openai-agents-js/openai/agents/classes/maxturnsexceedederror/)) | None by default — the loop throws; the run's usage is still readable via `result.context_wrapper.usage` ([usage](https://openai.github.io/openai-agents-python/usage/)) | Resume from `RunState` (`result.to_state()`); usage snapshots are independent per resumed run |
| **Claude Code subagents** | `maxTurns` frontmatter field; "when the subagent reaches the limit, Claude Code returns its output marked as partial, and Claude can resume it" ([sub-agents](https://code.claude.com/docs/en/sub-agents.md)) | Yes — partial output + explicit partial marker; a subagent cut off mid-stream with text but no tool calls is prompted to continue instead of ending | Resume via `SendMessage` with full prior history (`sub-agents.md`, "Resume subagents") |
| **opencode `tool/task.ts`** | None in the tool itself; child is a separate session with `parentID`, depth-limited by `cfg.subagent_depth` ([task.ts](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/tool/task.ts)) | Partial output via the `<task state=...><task_result>` envelope (`renderOutput`, `:70-85`); on abort the child session is cancelled (`ops.cancel`, `:322-330`) and `status:"cancelled"` fails the call (`:340`) | Resumable via `task_id` reusing the same subagent session; budgets are community plugins |
| **hermes `delegate_task`** | Per-child iteration limit (default 250); **no wall-clock cap by default**, only inactivity staleness (450s idle / 1200s in-tool) ([delegation](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation)) | Yes — "a child that exhausts its budget returns with `exit_reason: max_iterations` and `truncated: true`"; stopped children return `status="interrupted"` with partial output | Steer channel queues course-correction without killing the child; budget warning at ~80% of the idle window; per-branch kill/pause |

Two community opencode plugins show the top-up pattern: `opencode-budget-limit`
enforces a per-session dollar ceiling and exposes `/budget +2` to raise it and
resume, with sub-agents billing to the parent session
([repo](https://github.com/boserh/opencode-budget-limit)); `opencode-subagent-budget`
moves an exhausted subagent to a `finalization` stage instead of killing it
([repo](https://github.com/egorssed/opencode-subagent-budget)). The anti-pattern
is [claude-code #44067](https://github.com/anthropics/claude-code/issues/44067):
subagents hitting `max_tokens` returned *nothing* before the partial-marking fix.

### 4. Persistence seam is already shaped for this

`DelegationRecord` persistence is scoped to reuse `workflow-session-store.ts` +
`src/async/store.ts` (epic §9, `.plan/epics/epic-harness-integration.md:203-210`):

- `workflow_sessions` is `chat_id` PK + `step_values` JSON + `updated_at`
  (`src/db/schema-manifest.ts:969-975`); `saveSession` is an upsert-by-chat with
  a TTL sweep (`src/assistant/workflow-session-store.ts:43-60`, `:70-100`) — a
  delegation record is the same shape (mutable JSON blob, owner-keyed, TTL'd).
- `AsyncStore.progress()` already carries free-form JSON per owner
  (`src/async/store.ts:143-151`, `:193-208`) — a running budget counter is
exactly a progress payload.

No second scheduler: the layer sits above `TurnManager`/`turn-selector` (epic §9
line 209) and reuses `tool-executor.ts` + the plugin event bus
(`src/plugins/tool-executor.ts:33-55`).

## Recommendation (design sketch, reuse-first)

**Three budget modes — declare which one applies at spawn:**

1. **Opt-in budget** — the *caller* (parent agent) declares `budgetMs` /
   `budgetTokens` on the `DelegationRecord`, which the ticket already scopes to
   "role id + prompt + tool subset + timeout"
   (`.plan/epics/epic-harness-integration.md:203-204`). `TaskSignal` also has
   `budgetMs`/`budgetTokens` (`src/generation/routing/task-signal.ts:37-40`) but
   nothing consumes them (grep for `.budgetMs`/`.budgetTokens` finds only the
   declaration) — they are per-LLM-call routing fields, not delegation fields,
   so do not reuse them for this; keep the two layers separate.
2. **Measured budget** — actual consumption is summed from the child's
   `HarnessRunRecord`s (`tokensIn + tokensOut`, `runMs`), correlated by the new
   `delegationId` field. Measurement is a read-side `jq`/rollup over the existing
   log, never a new counter store.
3. **Planned budget** — the parent pre-allocates a slice of a Governor window
   (`tryConsume` with an explicit `cap`, per `tick-driver.ts:137-146`), so N
   children share one ceiling. Breach = `{ skipped: "budget" }` before spawn.

**Breach contract (child → parent).** Extend `HarnessResult` with `"budget"` and
require a budget-stopped child to return `DelegationResult { status:
"budget_exhausted"; exitReason; partial: true; summary; filesTouched[]; budget:
{ elapsedMs, tokensIn, tokensOut } }` — hermes' `exit_reason: max_iterations` +
`truncated: true` shape with Claude Code's "partial marker" semantics. The last
assistant text is the `summary`; the run records are the telemetry.

**Parent review.** `GET /api/harness/runs?taskType=…` filtered to the child's
`delegationId`, plus the `DelegationResult` — the admin-only surface that exists
today (`src/routes/harness/index.ts:68-101`).

**Two actions.** *Rescope*: parent writes N smaller `DelegationRecord`s (each
with its own declared budget) via the `saveSession`-style upsert and marks the
original `superseded` — no scheduler change, the parent is already the loop.
*Refund*: parent re-spawns with a raised declared budget (or a higher explicit
`cap`); since the governor never mutates caps (`README.md:50-51`), refund is
always a caller-side re-declaration, mirroring opencode's `/budget +2`.

**Spawn gate.** Every spawn calls `governor.tryConsume(...)` first and aborts on
`!ok`, exactly as `runNpcMovementTick` does (`tick-driver.ts:147-149`).

## Task candidates

### TC-1: `DelegationResult` partial-work contract + budget-exhaustion result

- **Why:** No way today for a child to signal "I ran out of budget but here is
  what I have"; `HarnessResult` cannot express it (`src/harness/types.ts:31`).
- **Acceptance criteria:**
  - `HarnessResult` gains `"budget"` (`src/harness/types.ts:31`) and every
    consumer is updated in the same change: `deserializeRun`
    (`src/harness/types.ts:162`), `HarnessRunSummary.result`
    (`src/harness/read-models.ts:26`), the `HarnessRunFilter.result` union
    (`:58`), and the route's `asResult` allowlist
    (`src/routes/harness/index.ts:50`).
  - `rollupStats` decides explicitly whether `budget` counts as a failure: today
    `failed = record.result !== "ok"` (`src/harness/stats.ts:94`), so a silent
    union addition inflates the failure rate. Decide + test the rollup.
  - A budget-stopped child returns `DelegationResult` with `partial: true`,
    `exitReason`, `summary`, `filesTouched[]`, and a `budget` usage block.
  - Unit test: a child that exhausts its declared budget yields a result with
    `partial: true` and the last text, never an empty failure; and the rollup
    classifies it as intended.
- **Related files:** `src/harness/types.ts`, `src/harness/read-models.ts`,
  `src/harness/stats.ts`, `src/routes/harness/index.ts`,
  `src/harness/exec-recorder.ts`. (`src/tui/harness/api.ts:11` declares an
  unrelated `HarnessResult<T>`; same name, different type, no impact.)

### TC-2: `delegationId` correlation on run records

- **Why:** N child LLM calls cannot be rolled up per delegation; `runId` is
  per-call (`src/harness/run-context.ts:70-72`).
- **Acceptance criteria:**
  - `HarnessRunRecord` gains optional `delegationId` with the full wire
    round-trip: `HarnessRunWire` (`src/harness/types.ts:80-101`),
    `serializeRun` (`:108-131`), `deserializeRun` (`:139-174`), and
    `ExecRunInput` (`src/harness/exec-recorder.ts:21-41`).
  - `HarnessRunFilter` gains `delegationId` (`src/harness/read-models.ts:56-61`)
    and `matches()` applies it (`src/harness/query.ts:49-55`); a `jq`/rollup
    returns per-delegation tokens + elapsed ms.
  - Test: two records sharing a `delegationId` roll up to one summed budget.
- **Related files:** `src/harness/types.ts`, `src/harness/read-models.ts`,
  `src/harness/query.ts`.

### TC-3: Spawn budget gate + rescope/refund actions on `delegate_task`

- **Why:** Epic requires "Governor deny-by-default budgets enforced on every
  spawn" (`.plan/tickets/TASK-harness-subagent-delegation.md:19`) and the ticket's
  `DelegationRecord` includes a timeout field; no gate exists yet.
- **Acceptance criteria:**
  - Every spawn calls `governor.tryConsume` with a caller-supplied cap and aborts
    on `!ok`, mirroring `runNpcMovementTick` (`tick-driver.ts:137-149`).
  - `delegate_task` gains `action=rescope` (N smaller `DelegationRecord`s,
    original marked `superseded`) and `action=refund` (higher budget,
    re-spawn), persisted via the `workflow-session-store` upsert
    (`src/assistant/workflow-session-store.ts:43-60`).
  - Integration test: gate denial blocks spawn; rescope produces N records;
    refund re-spawns with the raised budget.
- **Related files:** `src/autonomy/governor/index.ts`,
  `src/assistant/workflow-session-store.ts`, `src/async/store.ts`.

## Open questions

- Should "budget exhausted" be one `HarnessResult` value or split
  wall-clock vs tokens? Hermes distinguishes `max_iterations` from timeout;
  one value plus `exitReason` keeps the union small.
- Does the delegation result live in `workflow_sessions` or a dedicated
  `delegations` table? The DB-tables ticket defers a `harness_runs` table
  (`TASK-harness-db-tables.md:17`), so JSONL + session store is the iteration-1
  answer.
- Refund across a window boundary: raising a cap inside a rolling window
  (`governor/index.ts:212-235`) resets on expiry — should a refund survive the
  reset? `[INFERENCE]` Probably not; treat it as a same-window top-up.
- Token/dollar ceilings are absent from the governor (`LIMIT_CATALOG`,
  `index.ts:52-56`); the cache-budgets ticket owns spend ceilings
  (`TASK-harness-cache-budgets.md:18`) — delegation budgets should consume that
  rather than add a parallel money counter.

## Sources

Repo (read-only, `tree/feat-harness-epic`):

- `src/harness/types.ts:31,37-63,80-101,108-131,162`; `exec-recorder.ts:21-41,65-90`;
  `exec-log.ts:72-99`; `query.ts:30-36,49-55,114-137`; `read-models.ts:17-61`;
  `run-context.ts:70-72`; `stats.ts:94`
- `src/routes/harness/index.ts:50,60-101`
- `src/autonomy/governor/index.ts:52-56,142-247`; `types.ts:46-48,60-72`;
  `caps.ts:74-79`; `README.md:50-51`
- `src/rpg/npc-navigation/tick-driver.ts:84-149`;
  `src/assistant/workflow-session-store.ts:43-100`;
  `src/db/schema-manifest.ts:969-975`; `src/async/store.ts:27-28,143-151,193-208`
- `src/generation/routing/task-signal.ts:27-41`; `src/plugins/tool-executor.ts:33-55`;
  `src/plugins/event-bus.ts:30-47`
- `.plan/epics/epic-harness-integration.md:203-210`;
  `.plan/tickets/TASK-harness-subagent-delegation.md:16-19`;
  `.plan/tickets/TASK-harness-cache-budgets.md:18`;
  `.plan/tickets/TASK-harness-db-tables.md:17`

External:

- https://openai.github.io/openai-agents-python/running_agents/
- https://openai.github.io/openai-agents-python/usage/
- https://openai.github.io/openai-agents-js/openai/agents/classes/maxturnsexceedederror/
- https://code.claude.com/docs/en/sub-agents.md
- https://github.com/anthropics/claude-code/issues/44067
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/tool/task.ts
- https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation
- https://github.com/boserh/opencode-budget-limit
- https://github.com/egorssed/opencode-subagent-budget
