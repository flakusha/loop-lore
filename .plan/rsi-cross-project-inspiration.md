<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# RSI Cross-Project Inspiration — Survey + Candidate Targets

**Date:** 2026-09-29. **Scope:** external patterns mapped to RSI Parts A–D only. Qualitative judgments, no invented metrics. Every external claim carries an inline source link.

## Per-source pattern summaries

### OpenClaw — supervisor + gateway pattern → Part A

- Gateway daemon maintains provider connections, exposes typed WS API (requests/responses/server-push events), validates inbound frames against JSON Schema, emits `agent/chat/presence/health` events ([architecture](https://docs.openclaw.ai/architecture)).
- Claw-supervisor concept: one always-on OpenClaw instance monitors and drives a fleet of Codex sessions without changing normal UX (spec URL 404 at read time 2026-09-29; description via search index of [openclaw repo](https://github.com/openclaw/openclaw)).
- Gateway runbook + CLI: run/query/discover gateways, agent-first `/v1/models`, restart gating via `commands.restart` ([gateway runbook](https://docs.openclaw.ai/gateway), [CLI gateway](https://docs.openclaw.ai/cli/gateway)).
- **Takeaway:** watchdog = always-on supervisor process owning child lifecycle; typed event bus for health/agent events; restart as a gated, auditable operation — not a raw signal.

### Hermes Agent (Nous) — sandboxing + approval ladder → Part D

- Eight-layer defense-in-depth: user authz, dangerous-command approval, file-write denylist + optional write sandbox, container isolation (Docker/Singularity/Modal), MCP credential filtering, context-file prompt-injection scanning, cross-session isolation, input sanitization ([security](https://hermes-agent.nousresearch.com/docs/user-guide/security)).
- Approval modes `smart | manual | off`, per-context policies (`cron_mode`/`single_query_mode`/`unattended_mode` default `deny`), hardline always-on blocklist below `--yolo`, user `approvals.deny` globs evaluated before yolo; container backends skip command checks because container is the boundary ([security](https://hermes-agent.nousresearch.com/docs/user-guide/security)).
- Supervised-gateway lifecycle guard: agent inside its own supervised process cannot restart/kill the gateway; kills scoped to owned PIDs pass ([security](https://hermes-agent.nousresearch.com/docs/user-guide/security)).
- **Takeaway:** copy the ladder — default-deny unattended, hardline floor no flag overrides, container-as-boundary, self-restart guard. RSI Part D already sketches this; Hermes validates each rung.

### OpenCode (sst) — worktree isolation + plugin sandbox model → Part B

- `opencode-worktree` plugin: zero-friction git worktrees, each spawns own terminal, cleanup on exit, `agent/<task>` branch naming, dependency-manifest detection ([repo](https://github.com/kdcokenny/opencode-worktree), [ecosystem](https://opencode.ai/docs/ecosystem)).
- `opencode-daytona` plugin: run sessions in isolated Daytona sandboxes with git sync + live previews; `opencode-devcontainers`: multi-branch devcontainer isolation with shallow clones + auto-assigned ports ([ecosystem](https://opencode.ai/docs/ecosystem)).
- Custom tools receive `{ sessionID, messageID, directory, worktree }` context ([custom tools](https://opencode.ai/docs/custom-tools/)); `opencode-shell-strategy` plugin forces non-interactive shell commands to prevent TTY hangs (listed on [ecosystem](https://opencode.ai/docs/ecosystem)).
- **Takeaway:** TTY-free worktree spawn + per-session directory context + container/devcontainer isolation tier + no-hang shell policy. Direct model for RSI Part B `worktree.ts`/`sandbox.ts`.

### GitHub Copilot Coding Agent — issue→branch→PR loop + merge metrics → Parts B/C

- Assign issue → agent works in ephemeral GitHub-Actions dev env (explore, edit, run tests/linters) → branch + commits automated → human reviews PR ([about coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)).
- One branch + one PR per task; 59-min hard session cap — complex work must be split ([about](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)).
- Usage-metrics API exposes PR lifecycle outcomes: created/merged counts, Copilot-created merge counts, median time-to-merge ([changelog 2026-04-08](https://github.blog/changelog/2026-04-08-copilot-reviewed-pull-request-merge-metrics-now-in-the-usage-metrics-api/)).
- Custom instructions + MCP servers + hooks (custom shell at key execution points) + skills shape agent behavior per repo ([about](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)).
- **Takeaway:** task-scoped ephemeral env, one-task-one-branch, session time cap, hooks for validation, merge-outcome telemetry. RSI Part B (task API) + Part C (MRP/merge-readiness, ticket #16) mirror this.

### Devin — autonomous eval + unmerged-PR evidence → Parts C/D (tickets #16/#18/#19)

- Devin SWE-bench technical report: automated benchmark of GitHub issues + PRs as the eval harness ([Cognition](https://cognition.com/blog/swe-bench-technical-report)); 2026 SWE-2 vendor-reported near-parity with rivals at lower cost ([report](https://startupfortune.com/cognitions-swe-2-coding-agent-matches-rivals-at-a-quarter-of-the-price/)).
- Empirical counterweight: task-stratified study of 7,156 PRs across Codex/Copilot/Devin/Cursor/Claude Code compares acceptance by task type ([arXiv 2602.08915](https://arxiv.org/html/2602.08915v1)); fix-related agent PRs frequently remain unmerged — merge governance stays predominantly human ([arXiv 2602.00164](https://arxiv.org/html/2602.00164), [arXiv 2605.08017](https://arxiv.org/html/2605.08017v2)).
- **Takeaway:** N-version arena (ticket #19) needs task-stratified scoring, not a single pass rate; merge-readiness pack (ticket #16) must assume human merge governance; evaluator-drift detector (ticket #18) tracks exactly the flake/unmerged signals these papers measure.

### Claude Code — permissions + hooks → Part D

- Fine-grained allow/deny permission rules + modes + managed policies on what agent can access/do ([permissions](https://code.claude.com/docs/en/permissions), [SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions)).
- Hooks intercept agent behavior at key execution points (tool call, session start, stop) with 26 lifecycle events incl. `SessionStart`/`PreToolUse`/`PostToolUse`/`UserPromptSubmit` ([hooks](https://code.claude.com/docs/en/agent-sdk/hooks), [NVIDIA sandbox guide](https://docs.nvidia.com/ai-workbench/user-guide/latest/quickstart/quickstart-claude-sandbox.html)).
- Steering stack: `CLAUDE.md` + skills + hooks + subagents, each with distinct invocation scope ([Anthropic blog](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)).
- **Takeaway:** declarative permission rules + lifecycle hooks as enforcement points for RSI agent API scopes (`agent:worktree`, `agent:check`, …) and pre-commit secret scanning.

### omp (internal) — no external cite; baseline only

- `giwt` worktree/ticket/finalize flow is the TTY-bound baseline Part B replaces with an HTTP surface; GPG agent-side signing constraint stands.

## Scored candidate table

Legend: ticket-worthy = maps to an RSI ticket or a concrete new ticket; y/n with reason.

| Candidate | Source pattern | RSI part | Ticket-worthy | Why |
| --------- | -------------- | -------- | ------------- | --- |
| Always-on supervisor owning server lifecycle + typed health/agent event bus | OpenClaw gateway + claw-supervisor | A | y (tickets #1–#4) | Core Part A; events feed watchdog gate |
| Restart as gated auditable op; no self-restart from inside supervised process | OpenClaw `commands.restart` / Hermes supervised-gateway guard | A+D | y (#1 + sandbox rules) | Prevents supervisor-kill loops; cheap guard |
| Default-deny unattended approval + hardline blocklist below yolo | Hermes approvals | D | y (Part D spec) | RSI agent API runs unattended; needs fail-closed floor |
| Container/devcontainer isolation tier above worktree isolation | Hermes backends / OpenCode daytona+devcontainers | B+D | y (extend #6) | `tree/agent-<uuid>/` suffices now; containers when hostile code runs |
| File-write denylist + secret scan on patches | Hermes write safety | D | y (Part D cap) | Already in Part D (no secrets in patches); pre-LLM redaction is follow-up |
| One-task-one-branch + session time cap | Copilot cloud agent | B | y (#5/#6 scope) | Bounds runaway agents; timeout value TBD by smoke budget |
| Non-interactive shell policy (no TTY hangs) | OpenCode shell-strategy | B | y (#7) | `bun run check` over SSE must never block on pinentry/prompt |
| Repo hooks: custom validation shells at lifecycle points | Copilot hooks / Claude hooks | B+C | y (#7 + smoke) | Pre-check secret scan + post-check report hook |
| Merge-readiness pack wrapping check output | Copilot PR lifecycle + Devin eval | C | y (#16) | Assumes human merge per unmerged-PR evidence |
| Merge-outcome telemetry (created/merged/time-to-merge) | Copilot usage metrics | C | n (defer) | Needs merged-PR volume we lack; revisit post-#16 |
| Task-stratified N-version arena scoring | Devin eval + 7k-PR study | C | y (#19) | Single pass rate lies; stratify by task class |
| Evaluator drift detector (flake/suspicious-pass/coverage-drift) | Devin papers + UCR §5 (epic-internal) | C | y (#18) | Direct answer to flake-rate + unmerged signals |
| Declarative allow/deny permission rules per token scope | Claude Code permissions | D | y (#5 auth) | Maps 1:1 to `agent:*` scopes |
| Pre-agent ticket quality linter (BriefingScript) | SASE (epic-internal); Copilot custom-instructions corroborate | B | y (#17) | Shaped input → better patches |
| Per-session `{session, dir, worktree}` tool context | OpenCode custom tools | B | y (#5 router) | Pass worktree root explicitly; kills path-confusion bugs |

## Top-5 ranked backlog-derived targets

1. **Size-strict ceiling auto-ticket (`TASK-promote-size-check-to-ci`)** — watchdog blocks regrowing PRs + agent files `TASK-split-*`; debt already regressed once (`open-debt.md` release-hardening section). Exercises A→B→C end to end.
2. **Telemetry PII sweep (`BUG-telemetry-stores-raw-client-body`)** — `telemetry_hash_drift` alert → regression test + `trackTelemetry()` patch; Hermes denylist pattern (`open-untriaged.md` security-hardening wave).
3. **Unsafe date/buffer/JSON consolidation (`TASK-CONSOLIDATE-…-INTO-SHARED-UTILS` + `65c87b5`/`e72f484`/`02a9092`/`2984874`)** — root-cause-once fix across all callers; ideal N-version arena maiden task (`open-untriaged.md` date-handling + security-hardening rows).
4. **Browser e2e flake migration (`TASK-browser-tests-weak-interaction-coverage`, stale-fixture `30d0e69`, order-dependent `89f26c8`)** — nightly flake-rate trigger → web-first polling migration; evaluator-drift detector's first consumer (`open-untriaged.md` hardening rows).
5. **Coverage below-floor lift tickets (`be72331`/`b4789c2` + frontend batches `78c179f`/`55f201f`)** — per-commit coverage report → auto-filed per-module lift tickets; merge-readiness pack gates them (`open-untriaged.md` coverage-waiver cluster).

Skipped: transport-module wiring + music/SFX stubs (product decisions, not agent-loop wins); A9 tag/push (human-only by policy); RPG/mesh/VN batches (need owners first, no RSI leverage yet).
