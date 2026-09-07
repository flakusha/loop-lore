<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agentic Coding Sandbox — Per-Project `.git` Repo + External Coding Agents + Community Plugins

**Status:** ⬜ Not Started
**Priority:** Low (P6+, far-fetched but on-theme)
**Effort:** Very High (security-sensitive; many sub-tickets)
**Type:** Implementation Task (child of epic)
**Tags:** agentic-coding, sandbox, git, opencode, claude-code, omp, codex, coding-agents, community-plugins, isolation, security, workspace-mode
**Epic:** epic-use-case-agentic-workspace.md ✅ (verified 2026-09-07 — epic confirmed as fit, see "Epic fit" below)

## Summary

Add a **coding-agent sub-mode** under `chat.mode = 'agentic'` (per `docs/spec/use-case-agentic-workspace.md`): a world/Epic can spawn a sandboxed `.git` repository + isolated workspace where external coding agents (opencode, Claude Code, omp, Codex, custom CLI) read project context, propose code changes via per-call sandboxed tool invocations, and ship community plugins through a PR-style review cycle. All agent actions go through a per-call sandbox mirroring `TASK-assistant-tool-injection-guard.md`'s 3-layer model.

## Epic fit (verified 2026-09-07)

`epic-use-case-agentic-workspace.md` is **the right home** for this work. The spec (`docs/spec/use-case-agentic-workspace.md`) explicitly maps:

| RPG Concept | Agentic Workspace | This ticket |
|---|---|---|
| **World** | **Epic** | per-Epic sandboxed `.git` repo |
| **Location** | **Task** | per-Task worktree / branch |
| **Character** (actor_type='character', agent_type='ai') | **Agent** | each external coding agent = 1 actor with `tools: [opencode, …]` |
| **Chat** | **Workspace** | per-Epic workspace UI |
| **Message** (`content_type: tool_call`, `tool_result`, `code`) | **Message** | agent invocations + tool results + diffs |
| **Asset** (`asset_type: code`) | **Artifact** | proposed code changes, plugins, docs |

The spec already covers:
- "Tool sandboxing (isolated containers/WASM)"
- "Plugin signing for community plugins"
- "Permission model per workspace"
- "Network egress via configurable proxy/allowlist"
- "Resource limits per agent execution"

This ticket fills the **coding-agent-specific** implementation details: which external CLIs to integrate, how to spawn them via Bun subprocess + sandbox, how the per-Epic `.git` repo lifecycle works, how community plugin PRs flow through review.

## Why this ticket exists (the gap)

- **No external coding agent integration** — `src/assistant/` is internal-only; no `opencode` / `claude-code` / `omp` / `codex` adapter
- **No per-Epic sandboxed `.git` repo** — agents run in user's local checkout (no isolation)
- **No community plugin PR flow** — `epic-plugin-management-ui.md` exists but is admin-curated, not PR-based
- **`epic-use-case-agentic-workspace.md` is a stub** — `_TBD — expand with implementation tasks derived from the spec` — this ticket is one such child task

### Note on entity naming

The spec calls `World` → `Epic` (agentic), but **no `epics` table exists on dev**. The "Epic" rename is **conceptual only** — `worlds.id` is the Epic key in both RPG and agentic modes. `chat.mode = 'agentic'` is the discriminator (per spec). Schema unchanged.

## Design


### Sandboxed `.git` repo per Epic

```ts
// src/agentic-workspace/repo.ts
export interface AgenticWorkspace {
  workspaceId: string;
  epicId: string;                    // world.id (renamed conceptually)
  /** Absolute path to the per-Epic sandboxed repo. */
  repoPath: string;
  /** Default branch (typically `main`). */
  defaultBranch: string;
  /** Open PRs against this workspace. */
  openPRs: PullRequestRef[];
  /** Configured external coding agents + their per-workspace tokens. */
  agents: AgentRef[];
  /** Reviewer list (humans + automated reviewers). */
  reviewers: ReviewerRef[];
  /** Audit log of every agent invocation. */
  auditLog: AuditEntry[];
}
```

Lifecycle (managed by `epic-use-case-agentic-workspace.md` "Workspace" chat):

1. Epic owner enables agentic sub-mode in Epic settings
2. System creates isolated `.git` repo under `data/agentic/<workspaceId>/`
3. System seeds with `AGENTS.md`, plugin skeleton, hook surface (per `docs/spec/use-case-agentic-workspace.md`)
4. External agents get scoped tokens + per-call sandbox limits
5. Agents propose changes via PR; humans review + merge

### External coding agent adapters

```ts
// src/agentic-workspace/agents/types.ts
export type CodingAgentName = "opencode" | "claude-code" | "omp" | "codex" | "custom";

export interface CodingAgentAdapter {
  name: CodingAgentName;
  /** Spawn the agent in a sandboxed Bun Worker. */
  spawn(opts: SpawnOpts): Promise<AgentSession>;
  /** Read agent's proposed diff. */
  readDiff(sessionId: string): Promise<string>;
  /** Cancel a running session. */
  cancel(sessionId: string): Promise<void>;
  /** Per-call sandbox limits (mirrors TASK-assistant-tool-injection-guard.md). */
  sandboxLimits: SandboxLimits;
}

export interface SpawnOpts {
  workspaceId: string;
  /** Agent actor id (FK actors.id where actor_type='character', agent_type='ai'). */
  agentId: string;
  /** Task description — what should the agent do? */
  task: string;
  /** Allowed paths inside the workspace. */
  allowedPaths: string[];
  /** Allowed network destinations (e.g. npm registry, GitHub). */
  allowedNetworkHosts: string[];
  /** Hard time budget. */
  timeoutMs: number;
  /** Hard memory budget. */
  memoryMb: number;
}
```

Per-agent adapter:

- `src/agentic-workspace/agents/opencode.ts` — opencode CLI (subprocess + JSON event stream)
- `src/agentic-workspace/agents/claude-code.ts` — Claude Code CLI (subprocess + Anthropic SDK event stream)
- `src/agentic-workspace/agents/omp.ts` — omp harness (subprocess)
- `src/agentic-workspace/agents/codex.ts` — Codex CLI (subprocess)
- `src/agentic-workspace/agents/custom.ts` — generic subprocess wrapper for user-supplied CLIs

All adapters share a common `SubprocessSandbox` (see Security below) — agent-specific differences are only in the CLI argv + JSON event-stream schema.

### Community plugins + review cycle

```ts
// src/agentic-workspace/review.ts
export interface PluginPR {
  prId: string;
  workspaceId: string;
  /** Author: external agent name OR human userId. */
  author: CodingAgentName | "human";
  /** Plugin manifest (per docs/spec/plugin-system.md). */
  manifest: PluginManifest;
  /** Diff (truncated to N MB; full diff in audit log). */
  diff: string;
  /** Automated reviewers that have run. */
  automatedReviews: ReviewResult[];
  /** Human reviewer approvals. */
  humanApprovals: UserId[];
  /** Final state. */
  state: "draft" | "review" | "approved" | "merged" | "rejected";
}
```

Review cycle:

1. Agent opens PR with plugin manifest + diff (`git format-patch` style)
2. Automated reviewers run (in order):
   - Security scan (`xd://security_scan`)
   - Plugin manifest validator (required fields, version compat)
   - Test runner (`bun test`)
   - Lint + typecheck (`bun run check`)
3. Human reviewers (Epic owner + curator pool) approve
4. System merges to workspace `main` (signed commit)
5. Plugin auto-loads via existing `epic-plugin-system.md` loader
6. Plugin visible in `plugins/community/` per spec

### Security model (mirrors TASK-assistant-tool-injection-guard.md + spec)

Three layers (per spec "Security" section):

1. **Capability matrix** — `CodingAgentAdapter.sandboxLimits` declares FS paths, network hosts, time/memory budgets. Per-workspace override via `data/agentic/<id>/.agentrc`.
2. **Aux-LLM judge** — every spawned session gets a security verdict (2s timeout, fail-deny). Same pattern as `TASK-assistant-tool-injection-guard.md:guard/judge.ts`.
3. **Per-call sandbox** — Bun Worker with `ResourceLimits` + `fetch`/`fs` interception:
   - Network: only `allowedNetworkHosts` allowed; everything else → `403 Forbidden in sandbox`
   - FS: only `allowedPaths` allowed; outside → `EACCES`
   - Time: hard kill at `timeoutMs`
   - Memory: hard kill at `memoryMb`

Plus per spec:

- **Plugin signing** — community plugins must be signed (npm-style or GPG); unsigned rejected
- **Permission model** — per workspace; Epic owner grants per-agent permissions
- **Network egress proxy** — configurable; allowlist enforced at proxy layer too
- **Resource limits** — per agent execution

### Integration with existing schema

Per spec "Schema Compatibility":

- `workspaces` table — new (FK to `chats.id` where `chats.mode='agentic'`)
- `agent_sessions` table — new (FK to `actors.id`, `workspaces.id`, `messages.id` for tool_call entries)
- `plugin_prs` table — new (FK to `workspaces.id`, `plugins/community/<name>`)
- `plugin_reviews` table — new (FK to `plugin_prs.id`, `users.id` or `agent_sessions.id`)
- `workspace_audit_log` table — new (FK to `workspaces.id`, append-only)

## Files

- `src/agentic-workspace/repo.ts` — per-Epic `.git` lifecycle
- `src/agentic-workspace/agents/types.ts` + 5 adapters
- `src/agentic-workspace/agents/subprocess-sandbox.ts` — shared Bun Worker sandbox
- `src/agentic-workspace/review.ts` — PR + automated review pipeline
- `src/agentic-workspace/security.ts` — capability matrix + judge + sandbox
- `src/agentic-workspace/audit.ts` — provenance + rollback + rate limits
- `src/db/migrations/parts/NNN_agentic_workspace.ts` — `workspaces`, `agent_sessions`, `plugin_prs`, `plugin_reviews`, `workspace_audit_log` tables (all append-only)
- `src/routes/epics/agentic-workspace.ts` — per-Epic config + agent spawn endpoints
- `src/frontend/pages/epic-agentic-workspace.ts` — workspace UI (agents panel, task graph, artifact gallery per spec "UI Adaptation")
- `src/agentic-workspace/repo.test.ts`, `agents/*test.ts`, `review.test.ts`, `security.test.ts`

## Sub-tickets (recommended breakdown)

This ticket is the umbrella; the following 5 child tickets split the work:

1. **`TASK-agentic-workspace-sandbox.md`** — `subprocess-sandbox.ts` + capability matrix (foundation)
2. **`TASK-agentic-workspace-agents.md`** — 5 external coding agent adapters
3. **`TASK-agentic-workspace-repo.md`** — per-Epic `.git` lifecycle + worktree-per-task
4. **`TASK-agentic-workspace-review.md`** — community plugin PR review cycle + automated reviewers
5. **`TASK-agentic-workspace-audit.md`** — provenance log + rollback + rate limits + signing

## Open questions (require user input before implementation)

1. **Cost model** — agent invocations cost API tokens. Who pays? User? Epic owner? Server operator? Subscription?
2. **Trust model** — community plugins: signed-only (npm-style)? reputation-based (curator pool)? whitelist-only? Per spec "Plugin signing for community plugins" — likely signed-only minimum.
3. **Agent identity** — does each agent need a stable identity (FK actors.id) or is each session ephemeral? Recommended: stable identity (matches spec's Character→Agent mapping).
4. **Reviewer pool** — community reviewers: opt-in volunteers? Reputation threshold? Per-Epic curators? Per spec: "Permission model per workspace" — Epic owner is primary reviewer; curator pool optional.
5. **Plugin types** — what kinds of plugins ship through this flow? Loop-lore plugins? Generic npm packages? World-specific modules? Per spec: "Plugin types: `plugins/core/`, `plugins/community/`, `plugins/local/`" — community plugins only here.

## Acceptance Criteria

### Epic integration

- [x] Epic fit verified 2026-09-07 — `epic-use-case-agentic-workspace.md` confirmed (was a stub; this ticket + 5 children flesh it out)
- [ ] Architecture sketch signed off by user
- [ ] Security model approved (capability matrix + judge + sandbox) — mirrors `TASK-assistant-tool-injection-guard.md`
- [ ] All 5 sub-tickets filed + approved
- [ ] No implementation lands until sub-tickets approved

### Schema (append-only)

- [ ] All new tables added in single migration part (`parts/NNN_agentic_workspace.ts`)
- [ ] No existing tables altered; nullable columns only
- [ ] FK relationships to existing tables (`chats.mode='agentic'`, `actors`)

### Implementation (per sub-ticket)

- [ ] `subprocess-sandbox.ts` blocks disallowed network hosts + FS paths
- [ ] 5 agent adapters load + spawn successfully (smoke test per agent)
- [ ] Per-Epic `.git` repo created + seeded on Epic enable
- [ ] PR review cycle: agent opens PR → automated reviews → human approval → merge
- [ ] Audit log captures every agent invocation (provenance, diff, reviews, sandbox metrics)

## Dependencies

- Builds on: `TASK-assistant-tool-injection-guard.md` (3-layer guard pattern)
- Builds on: `epic-plugin-system.md` (plugin loader), `epic-plugin-extension-points.md` (plugin surface)
- Builds on: `xd://security_scan` (security scan integration)
- Bridges: `epic-use-case-agentic-workspace.md` (now fleshed out by this ticket + children)
- Far-future dependency: external coding agent CLIs (opencode, Claude Code, omp, Codex) must have stable CLIs + JSON event streams
- Bridges: `docs/spec/use-case-agentic-workspace.md` (entity mapping)
