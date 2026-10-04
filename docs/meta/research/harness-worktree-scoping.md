<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Harness worktree scoping (subagent confinement + root escalation)

**Status:** Research — feeds task candidates
**Date:** 2026-10-04
**Source tickets:** `.plan/tickets/TASK-harness-subagent-delegation.md`, `.plan/epics/epic-harness-integration.md` §5, `.plan/epics/epic-recursive-self-improvement.md` Part D

## Question

If a subagent is assigned a worktree, how do we make it unable to escape that
worktree — file writes, process cwd, and `giwt` branch operations all confined —
while the main/root checkout stays read-only, and how does a subagent escalate a
change that genuinely must land on root?

## Findings

### 1. The invariant is already policy; it is not yet enforced in code

- `AGENTS.md:391-400` states it verbatim: agents MUST NOT run mutating git on
  the dev checkout; "The dev checkout is for read-only inspection"; all mutating
  ops flow through `giwt`, the canonical CLI (`AGENTS.md:331-335`).
- That is prose for a human/LLM reader. The only *code* enforcement today lives
  inside the worktree CLI: `assertNotInWorktree()` refuses worktree-management
  commands run from `tree/*` (`scripts/worktree/utils/git.ts:108-114`), and
  `isProtected()` refuses protected branches as sources (`:31-35`,
  `PROTECTED_BRANCHES = master|main|stg|dev`). Neither guards an *agent tool call*.
- Layout is fixed and machine-readable: worktrees live under `tree/<branch>`;
  `dev` is the single integration target (`giwt.toml:3-5`;
  `epic-harness-integration.md:132-137`).
- The failure mode is already filed: a worktree-scoped `giwt sync --fix` mutated
  shared issue state repo-wide
  (`BUG-giwt-sync-fix-mutates-repo-wide-refs-issues-shared-across-al.md:26,53`).
  Scope leaks are real, not hypothetical.

### 2. The delegation record has no worktree field, and no scope concept exists

- `TASK-harness-subagent-delegation.md:16-18` specifies `SubagentTask` +
  `DelegationRecord` (role id + prompt + tool subset + timeout), depth-derived
  roles (leaf barred from `delegate_task` + sensitive tools), concurrency caps,
  credential lease. It does **not** name a worktree/scope binding;
  `epic-harness-integration.md:203-210` repeats the same shape.
- No `src/harness/` worktree module and no `src/agent/api/` exist yet
  (`epic-recursive-self-improvement.md:106-112` proposes the latter). The scope
  binding is greenfield; the *funnel* it must guard is not (below).

### 3. There is exactly one tool-execution funnel to guard

- `executePluginTool()` (`src/plugins/tool-executor.ts:33-56`) is the single
  timeout + failure-contract seam; the generation loop routes **every** tool
  (plugin and builtin) through it (`src/generation/generate-route/tool-execution.ts:192-195`).
- Per-request context is `ToolExecutionContext { db, actorId, chatId }`
  (`src/plugins/types.ts:93-97`) — no cwd, no path, no scope; the natural place
  to add `scope` once the delegation record carries it.
- `ToolDefinition.permissions?: string[]` and `sandboxed?: boolean` already exist
  (`src/plugins/types.ts:110,112`). `sandboxed` has **no reader anywhere in
  `src/`** (grep: declaration only) — a free, already-typed hook for "must pass
  the scope guard".

### 4. Reuse targets for the guard itself

- **Worktree detection is already written.** `findRepoRoot()` resolves the *main*
  root from anywhere including a linked worktree
  (`scripts/worktree/utils/git.ts:59-65`); `getWorktreeRoot()` resolves the
  *current* checkout top-level (`:79-85`); `isInsideWorktree()` compares the two
  (`:94-102`). In `src/`, `findMainRepoRoot(cwd)` does the same via the `.git`
  gitdir file (`src/utils/git-worktree.ts:25-53`), already used by config loading
  (`src/config/load/fs.ts:65`, `src/config/templates-loader/discovery.ts:36,84`).
  No new path-resolution code is needed.
- **Tool-surface gating is already written.** `gatePluginToolsByRole(agentRole)`
  filters the registry to a role's declared tools
  (`src/generation/generate-route/tool-execution.ts:74-87`); role prompts inject
  via `pluginAgentRoleSection` (`src/assistant/prompt/sections/plugin-agent-role.ts:19-34`).
- **Origin taxonomy is already written.** `PLUGIN_ORIGIN_CAPABILITIES` maps
  `core|community|local` → allowed extension points via `assertPluginCanRegister()`
  (`src/plugins/registry-policy.ts:7-34`). A `community`-origin tool should never
  get a root scope — the taxonomy already exists to say so.
- **Event bus + persistence are already written.** `emitPluginEvent()`
  (`src/plugins/event-bus.ts:30-46`) is the fan-out seam; delegation state
  persists through the `workflow-session-store` write-through pattern
  (`src/assistant/workflow-session-store.ts:43-60`).

### 5. How peer harnesses confine an agent to a workspace

| Harness | Confinement | Escalation |
|---|---|---|
| Claude Code | Worktree: four checks block `Edit`/`Write` to main checkout, commands whose cwd resolves there, git redirects (`git -C`, `GIT_DIR`/`GIT_WORK_TREE`, `cd`), and unverifiable command text; subagents with `isolation: worktree` inherit them ([worktrees](https://code.claude.com/docs/en/worktrees)). Permissions scope reads/writes to launch dir + `additionalDirectories`/`--add-dir` ([permissions](https://code.claude.com/docs/en/permissions)). Sandbox is OS-level, writes default to working dir + temp + added dirs ([sandboxing](https://code.claude.com/docs/en/sandboxing)). | None auto; refusal tells the model to rewrite. Widening is config (`--add-dir`, allow rules) or explicit `dangerouslyDisableSandbox`. |
| opencode | `external_directory` action — a path outside the active worktree needs approval before `read`/`edit`; `shell` has full host authority ([permissions](https://v2.opencode.ai/docs/permissions)). | `external_directory: allow` is a config grant; a subagent uses **its own** permissions, and `subagent` is itself a permission action ([agents](https://v2.opencode.ai/docs/agents)). |
| Codex | `workspace-write`: writes limited to the workspace; `<writable_root>/.git` forced read-only; outside edits need approval ([sandbox](https://developers.openai.com/codex/sandbox)). | Approval prompt for out-of-workspace edits — the operator decides. |
| Cursor | `sandbox.json` `type: workspace_readwrite` scopes read/write; `additionalReadwritePaths`/`additionalReadonlyPaths` widen; `.git/hooks/**`, `.git/config` always denied ([reference](https://cursor.com/docs/reference/sandbox.md)). | Widen via config only; team-admin rules can't be weakened by the repo file. |
| omp | No native worktree tool; community skill detects isolation via `--git-dir` vs `--git-common-dir` ([SKILL.md](https://github.com/hae-banko/my-omp-skills/blob/main/skills/using-git-worktrees/SKILL.md)). Agent Hub shows isolated-worktree branch metadata ([mirror](https://github.com/ketema/omp/blob/main/docs/agent-hub.md)); `[INFERENCE]`. | Hub `x` kills the agent; steering is a message, not a scope grant. |

Common shape: **write scope is a boundary (path/cwd), not a prompt instruction; widening it is a config/approval act outside the child; failure is a refusal, not a no-op.**

## Recommendation (design sketch, reuse-first)

### A. Bind scope in the delegation record (no new store)

Add to `DelegationRecord` (shape already specified at
`TASK-harness-subagent-delegation.md:16`):
`scope: { worktreeRoot: string; branch: string } | null` — `null` = root-scoped
(the upstream/orchestrator). Persist via the existing `workflow-session-store`
write-through pattern (`src/assistant/workflow-session-store.ts:43-60`); no new
table. The delegating agent sets it at spawn; the child cannot mutate it (never
an exposed tool param).

### B. One pure guard module, one call site

New `src/harness/worktree-scope.ts` exporting pure `resolveWithin(root, path)`,
`assertInScope(scope, path)`, `isRootPath(scope, path)`. It reuses
`findRepoRoot` / `getWorktreeRoot` / `findMainRepoRoot` rather than
re-implementing detection. Wire it **once** into `executePluginTool()`
(`src/plugins/tool-executor.ts:33`) before `tool.handler` runs, reading
`ctx.scope` (extend `ToolExecutionContext`, `src/plugins/types.ts:93-97`). The
guard resolves path-like params (`file_path`, `path`, `target`, `output`)
against `scope.worktreeRoot` via realpath, rejects `..` escapes and symlink
hops, and rejects any path under the main root but outside the child root. A
refused call returns the standard `{ error }` `isError` result (same contract as
timeout — `src/plugins/tool-executor.ts:50-55`), so the child sees a tool error
and can adapt, like Claude Code's worktree refusals.

### C. Root is read-only for a scoped child

`scope.worktreeRoot !== mainRoot` ⇒ writes under `mainRoot` denied, reads
allowed (matches `AGENTS.md:396` "read-only inspection"). Reuse
`isProtected(branch)` (`scripts/worktree/utils/git.ts:33`) to additionally deny
writes whose target branch is protected, independent of path.

### D. `giwt` branch guard at the existing seam

The repo has exactly one in-repo giwt spawn seam, `giwtArgv(repoRoot)`
(`docs/giwt-scripts-map.md:212-217`, `scripts/worktree/commands/sync.ts`). Route
mutating giwt verbs (`commit-wt`, `finalize`, `rebase`, `merge`) through the same
guard: the named worktree/branch MUST equal `scope.branch`; anything else is
refused with the stop-and-report contract (`AGENTS.md:412-417`). This closes the
`BUG-giwt-sync-fix-…` class at the call site.

### E. Tool-surface gate composes with the path guard

A child's exposed tools = `gatePluginToolsByRole(role)`
(`src/generation/generate-route/tool-execution.ts:74`) **∩** scope-allowed.
Path-mutating tools declared `sandboxed: true` (`src/plugins/types.ts:112`, today
unread) are the ones the guard must see; `community`-origin tools
(`src/plugins/registry-policy.ts:7-11`) never get a root scope. Leaf depth
(ticket:18) additionally removes `delegate_task` + sensitive tools.

### F. Escalation: request out, decision up

Add one tool, `request_root_change({ path, reason })`, exposed to scoped children
only. It performs **no** mutation: it emits `harness.scope_escalation` via
`emitPluginEvent()` (`src/plugins/event-bus.ts:30`) carrying child id, worktree,
and requested path, and returns "pending". The upstream agent's next turn reads
it from its inbox and chooses: (a) spawn a new helper with a wider (or root)
scope, or (b) edit root itself — the only actor whose scope permits it. This is
the loop-lore analogue of Codex's `on-request` approval and Claude Code's
"refusal tells the model how to proceed"; it reuses the delegation `action=steer`
channel (ticket:17) for the decision.

### Enforcement points (concrete)

| Rule | Where it lives | Reuses |
|---|---|---|
| Path escape (write/read) + process cwd | `src/harness/worktree-scope.ts` ← `executePluginTool` (`src/plugins/tool-executor.ts:33`); no per-tool cwd in-process, guard resolves path params | `findRepoRoot` (`scripts/worktree/utils/git.ts:59`), `findMainRepoRoot` (`src/utils/git-worktree.ts:25`), `getWorktreeRoot` (`scripts/worktree/utils/git.ts:79`) |
| `giwt` branch | `giwtArgv` seam (`scripts/worktree/commands/sync.ts`) | `isProtected` (`scripts/worktree/utils/git.ts:33`) |
| Root read-only | same path guard, `mainRoot` deny | `AGENTS.md:396` invariant |
| Tool surface | `gatePluginToolsByRole` (`tool-execution.ts:74`) + origin taxonomy (`registry-policy.ts:7`) | `ToolDefinition.sandboxed` (`types.ts:112`) |
| Escalation | `request_root_change` → `emitPluginEvent` → upstream decision | event bus (`event-bus.ts:30`), delegation record (`ticket:16`) |
| Telemetry | extend `HarnessRunRecord` (`src/harness/types.ts:37`) with `scope`/`worktree` | `.harness/executions.jsonl` (`src/harness/exec-log.ts:23`) |

## Task candidates

1. **TASK-harness-worktree-scope-guard**
   - *Why:* the invariant in `AGENTS.md:391-400` has no code enforcement on the
     agent tool path; scope leaks are a filed bug class (`BUG-giwt-sync-fix-…:26,53`).
   - *Acceptance criteria:*
     - New `src/harness/worktree-scope.ts` with pure `resolveWithin` / `assertInScope` /
       `isRootPath`; unit tests cover `..` escape, symlink hop, absolute path, in-worktree allow.
     - `ToolExecutionContext` (`src/plugins/types.ts:93`) gains `scope`; `executePluginTool`
       (`src/plugins/tool-executor.ts:33`) rejects out-of-scope path params as `isError`
       before `tool.handler` runs; a scoped child's write to `mainRoot` is refused, a read allowed.
     - `bun test src/harness/` + `src/plugins/` green.
   - *Related files:* `src/plugins/tool-executor.ts`, `src/plugins/types.ts`,
     `src/generation/generate-route/tool-execution.ts`, `src/utils/git-worktree.ts`.

2. **TASK-harness-giwt-branch-scope-guard**
   - *Why:* mutating giwt verbs are the second escape vector; the single in-repo spawn
     seam (`docs/giwt-scripts-map.md:212-217`) is unguarded today.
   - *Acceptance criteria:*
     - Mutating verbs (`commit-wt`, `finalize`, `rebase`, `merge`) invoked by a scoped
       child MUST name `scope.branch`; any other branch/root target is refused with the
       stop-and-report contract (`AGENTS.md:412-417`); protected-branch targets refused via
       `isProtected` (`scripts/worktree/utils/git.ts:33`).
     - Tests at the `giwtArgv` seam (`scripts/worktree/commands/sync.test.ts`).
   - *Related files:* `scripts/worktree/commands/sync.ts`, `scripts/worktree/utils/git.ts`.

3. **TASK-harness-scope-escalation**
   - *Why:* a confinement with no escape hatch deadlocks real work; the upstream-decides
     protocol is the requested behavior.
   - *Acceptance criteria:*
     - `request_root_change({ path, reason })` exposed to scoped children only; performs
       no mutation; returns a pending ack; emits `harness.scope_escalation` via
       `emitPluginEvent` (`src/plugins/event-bus.ts:30`) with child id + worktree + path.
     - Upstream can resolve via the delegation `action=steer` channel (ticket:17); choosing
       "edit root" succeeds because upstream is root-scoped while the child's own write fails.
     - Integration test: scoped child request → upstream spawns wider-scope helper → helper write lands.
   - *Related files:* `src/harness/` (new escalation module), `src/plugins/event-bus.ts`,
     `src/assistant/workflow-session-store.ts`.

## Open questions

- **Root identity:** is "root" the main repo root (`findRepoRoot`) or the `dev`
  checkout specifically?
- **Symlink/hardlink escape:** realpath guards symlinks; hardlinks/bind mounts are
  not distinguishable in-process. Accepted ceiling? (`[INFERENCE]` yes — matches
  Claude Code's best-effort note in [sandboxing](https://code.claude.com/docs/en/sandboxing).)
- **Windows:** the pure-JS path guard ports; `giwt` itself is POSIX-oriented. Out of scope.
- **One worktree per child vs shared:** a shared worktree needs the branch guard to
  stop one child finalizing another's half-done branch. Likely one-per-child.
- **omp parity:** no native worktree tool today, so the guard is ours to own;
  re-check if omp ships one (mirror content unverified).

## Sources

Repo (file:line): `AGENTS.md:331-335,391-400,412-417`; `docs/giwt-scripts-map.md:33,204-217`;
`giwt.toml:3-5`; `.plan/epics/epic-harness-integration.md:132-137,203-210`;
`.plan/tickets/TASK-harness-subagent-delegation.md:16-18`;
`.plan/epics/epic-recursive-self-improvement.md:106-112,131`;
`.plan/tickets/BUG-giwt-sync-fix-mutates-repo-wide-refs-issues-shared-across-al.md:26,53`;
`scripts/worktree/utils/git.ts:31-35,59-65,79-85,94-114`;
`src/utils/git-worktree.ts:25-53`; `src/plugins/tool-executor.ts:33-56`;
`src/plugins/types.ts:93-97,110-112`; `src/plugins/registry-policy.ts:7-34`;
`src/plugins/event-bus.ts:30-46`;
`src/generation/generate-route/tool-execution.ts:74-87,151-195`;
`src/assistant/prompt/sections/plugin-agent-role.ts:19-34`;
`src/assistant/workflow-session-store.ts:43-60`; `src/harness/types.ts:37-63`;
`src/harness/exec-log.ts:23-47`; `src/harness/run-context.ts:29-35`;
`src/config/load/fs.ts:65`; `src/config/templates-loader/discovery.ts:36,84`;
`src/autonomy/governor/types.ts:29-34`.

External (URL): Claude Code — [worktrees](https://code.claude.com/docs/en/worktrees),
[subagents](https://code.claude.com/docs/en/sub-agents),
[permissions](https://code.claude.com/docs/en/permissions),
[sandboxing](https://code.claude.com/docs/en/sandboxing). opencode —
[permissions](https://v2.opencode.ai/docs/permissions),
[agents](https://v2.opencode.ai/docs/agents). Codex —
[sandbox/approvals](https://developers.openai.com/codex/sandbox). Cursor —
[sandbox.json](https://cursor.com/docs/reference/sandbox.md). omp —
[Agent Hub mirror](https://github.com/ketema/omp/blob/main/docs/agent-hub.md),
[worktree skill](https://github.com/hae-banko/my-omp-skills/blob/main/skills/using-git-worktrees/SKILL.md).
