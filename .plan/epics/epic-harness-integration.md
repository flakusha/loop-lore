<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Harness Integration (Agent Runtime Consolidation)

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** High
**Effort:** Very High (phased; each phase ships standalone value)
**Type:** Feature Epic
**Tags:** harness, orchestration, agents, routing, telemetry, worktree, giwt, skills, subagents, dashboard, eval, sandbox, topics, context-tier
**Depends on:** Workflow Engine (`epic-workflow-engine.md`), LLM Request Scheduler (`epic-llm-request-scheduler.md`), Group Chat (`epic-group-chat.md`), Plugin System (`epic-plugin-system.md`), Configurable Template System (`epic-config-templates.md`)
**Spec:** `docs/meta/workflow.md` (dev-harness flow), `docs/giwt-scripts-map.md` (giwt wrap map)

## Summary

Loop-lore already owns most of an agent harness, scattered across half a dozen
subsystems: `workflow-runner` (config-driven runtime), `TurnManager` +
`turn-selector` (multi-agent scheduling), `AutonomyScheduler` + `Governor`
(tick/budget loop), `callWithFailover` (single LLM egress seam), `giwt` +
`scripts/worktree/` (dev-harness), and the telemetry/admin stack. What is
missing is the consolidation layer that makes these pieces behave as one
runtime: model routing by task signal, a programmatic API, assistant
personalities, synchronized execution with merge coordination, MCP-native
tooling (lean-ctx), a stats dashboard, harness exec logs, a DB home for
harness data, context-build templates, plus five frontier gaps (eval harness,
LLM cache + budgets, OTEL tracing, deterministic replay, tool sandbox) and
three adjacent surfaces (commit discipline, canvas viz, omp reference
patterns, IRC messaging + TTSR/steering).

**Reuse-first rule (binding):** every section below names the exact existing
files to extend. No second state machine, no second scheduler, no second
prompt assembler, no second TUI, no in-repo reimplementation of `giwt`. Where
an external tool already does the job (`omp --mode rpc/json`, `engram`
sidecar, `gh`), wrap it; build only the thin in-repo seam.

Research inputs (read-only, in repo-root `.tmp/` — intentionally uncommitted, not part of this change):
`harness-research-internal.md`, `harness-research-pi-opencode.md`,
`harness-research-claw-hermes.md`, `harness-research-dispatch-sync.md`,
`harness-research-tui-memory.md`, `harness-research-wide-frontier.md`,
`harness-research-commit-canvas.md`.

## Ownership boundaries (vs sibling epics)

| This epic owns | Sibling epic owns |
|---|---|
| Task-signal routing *policy* on top of the scheduler (`generation/routing/`) | Scheduler machinery itself (`epic-llm-request-scheduler.md`: `src/llm/` wiring into `callWithFailover`) |
| Harness dispatch commands + run tracking (`assistant/commands/`) | Workflow runtime/state machine (`epic-workflow-engine.md`: `src/assistant/workflow-runner.ts`, `src/assistant/workflow-session.ts`, `src/assistant/workflow-session-store.ts`) — harness emits plan steps, never a second runner |
| Persona presets for dispatch agents (`convertPersonaToCharacter` reuse) | Character/GM behavior (`epic-assistant-gm-flows.md`: GM handoff, shadow-note steering; `epic-character-multi-personality.md`) |
| In-repo inbox event + wake/aside delivery contract | Turn order/mention UI (`epic-group-chat.md`: `turn-selector`, mention strip) |
| Nightly/reflection BDI stays untouched (`services/agency/`) | Autonomy tick/budget (`epic-actor-autonomy-story-drive.md`: scheduler + governor) |
| Harness `telemetry_events` types + dashboard block | Product analytics (`epic-analytics-observability.md`) |
| Federation *uses* ledger v2 claim shape if needed | Network swarm/CRDT (`epic-federation-swarm-sync.md`) — distinct axis, do not conflate |
| RSI *consumes* exec logs + eval harness | Agent dev loop itself (`epic-recursive-self-improvement.md`) |

Name-collision guard: prefix everything `harness-` / `agent-`. "Workflow"
already means three things (engine templates, archival/encryption pipelines,
cron jobs); "ledger" means three things (seen-ledger, story-points, economy);
`@` means actor-ping (NOT file import); `epic-skills.md` is game skills (NOT
agent skills). New code MUST NOT reuse these bare names.

Taken terms (do not use bare):
- `topic` — gossip pub/sub channel (`epic-anonymity-decentralization.md:205-216`),
  chat side-threads (`TASK-chat-feature-topics-side-threads`), NPC conversation
  topics (`epic-social-interaction.md:95,106`); harness entity is `WorkTopic` /
  `harness_work_topics` / `workTopicId`.
- `scope` — `actor_memories.scope`, `asset_tags.scope`,
  `message_search_tokens.scope`.
- `label` — `asset_links.label`, `chat_sections.label`,
  `ProviderCapabilities.label`.
- `tag` / `category` / `channel` / `thread` — also taken.

## Design

### 1. Model ranking / routing (extends scheduler, does not replace it)

- New `src/generation/routing/task-signal.ts`: `TaskSignal { taskType;
  contextSize?; estimatedTokens?; requiresCapabilities?; priority?; budgetMs?;
  budgetTokens? }`, set explicitly at call sites (generate-route handler →
  `interactive-turn`, auto-gen → `auto-gen`, aux-pipeline → per-`AuxTaskName`
  via `toTaskSignal()`, embeddings/rerank → background). Classification is a
  pure local function — never an LLM call (deadlock rule).
- New `src/generation/routing/router.ts`: `ModelRouter.route(signal, models)`
  → ordered primary + fallbacks; strategies `capability-match | cheapest |
  fastest | round-robin` via `config.generation.routing { strategy;
  fallbacks?; rules?: RoutingRule[] }` in `src/config/schema/generation.ts`.
- Extend `ProviderCapabilities` (`src/generation/providers/types.ts`) with
  `costPer1kTokens?; avgLatencyMs?; contextWindow?; maxOutputTokens?`.
- `buildFailoverList` (`providers/registry.ts`) accepts optional `TaskSignal`;
  `callWithFailover` consumes the router-scored list. External shape reference:
  LiteLLM model-group routing + Portkey rule/semantic routing (patterns only).
- Aux pipeline stops sharing one Auxiliary model blindly: 11 `AuxTaskName`
  types map to signals (cheap classifiers → fastest/cheapest capable).

### 2. Programmatic API reuse (wrap, don't build)

- Primary: shell out to `omp --mode rpc/json` (`createAgentSession()`,
  `session.agent.waitForIdle()`) for session control; adopt pi session storage
  layout (threads → JSONL, `history.db` FTS, `blobs/`) and `skill://<name>`
  protocol naming if a local session store is ever needed.
- opencode pattern: host owns server, TUI/SDK only via typed client
  (`specs/tui-package.md` host/TUI split + grep gate as the reference doc).
  Reuse `@opencode-ai/plugin` hook *shapes* (`tool.execute.before/after`,
  `session.compacting`) when adding loop-lore plugin hooks — no new hook
  taxonomy from scratch.
- `orchestrate`/`workflowz` fan-out prompts (pool-first, judge,
  evidence-not-truth) adapted as prompt text, not code.

### 3. Personalities (presets, not plumbing)

- Assistant personalities = named presets resolved through the FEAT-065
  template-override cascade (`chat.prompt_template_id` →
  `actor.settings.prompt_template_id` → `PROMPT_SECTIONS`); a "personality
  template" is an LLM-modality stored template (`template-service/resolve.ts`).
- Emulation reuses two dials: `behavioral_modifier:` world traits + the
  internal-traits voice block (tics/vocab/humor) — add preset rows, not tables.
- Card-field split (SillyTavern V2 shape, reimplemented): keep expertise
  (`description/scenario/lorebook`) separate from voice
  (`personality/mes_example/post_history_instructions`); add `voice` +
  `examples[]` + `lorebook` refs to `AgentRoleDefinition`. Lorebook injectors
  (regex keys + `scan_depth` + `token_budget` + priority/position) beat dumping
  docs; FTS in the embeddings service already exists.
- Dispatch personas (e.g. "reviewer") ride `convertPersonaToCharacter()`; if a
  global assistant voice is needed, one `PROMPT_SECTIONS` entry beside
  `userPersona`. PNG-embedded cards: explicitly skipped.

### 4. Synchronized execution + merges (ledger v2, manual order)

- Ledger v2 (additive, grep-compatible) in
  `scripts/worktree/utils/ledger.ts`: `{v:2, …, kind:
  'intent'|'outcome'|'gripe'|'signal'|'claim', prev?, deps?, gate?}`.
- Finalize slot claim: append `{"kind":"claim",…,"slot":N}` before finalizing;
  scan for pending same-lineage claims first; stale claims via PID liveness
  (same stale-reap as `acquireFinalizeLock`). Later claim wins by ledger
  timestamp; loser rebases + re-claims. No auto-resolution: conflicts record a
  gripe and exit 1. Generated files regenerate post-merge, never hand-resolve.
- Concerns protocol: `concerns-<workstream>/CONCERNS.md` header (scope,
  branches, dev HEAD, timestamp) + footer (resolved, fix commit); finalize
  MUST read its branch's CONCERNS first and log it. Cross-host → externalize
  claims to a DB table (same INSERT+UPDATE pattern as `nsfw_consent_state`).

### 5. Git worktree + giwt (wrap map stands)

- `giwt` stays the user-facing CLI; `scripts/worktree/` remains the internal
  implementation until the fork-retirement ticket closes. Layout: all feature
  worktrees under `tree/<branch>`; `dev` is the single integration target
  (`giwt.toml branches.root` + `PROTECTED_BRANCHES`).
- `giwt conflicts [branch|path] [--output json]` (highest value): wrap `git
  diff --name-only --diff-filter=U` + marker scan emitting `#N path Lx-Ly` +
  side-presence (ours/theirs/base); wire into merge/rebase/finalize failure
  paths replacing bare messages.
- Thread `--output json/jsonl` through read-only issue commands (show, search,
  issues, diff, status, branches, report): route data payloads through a
  format-aware emitter instead of `console.log` bypasses. Default stays human.
- `giwt prs diff N` + `giwt prs checkout N` (wrap `gh pr diff`, single-PR
  worktree add reusing the `prs.ts` loop body). Explicitly OUT: pr_create /
  pr_push (human merge governance), run_watch (document `gh run watch`).
- `#extid` shorthand in ticket/comment bodies via `resolver.ts resolveExtid` +
  plan-validate links-gate; `@` stays actor-scoped (document once in
  `docs/meta/workflow.md`). Deliberately NOT adopted: `@path` file-import
  macros, semantic-find cascade, checkpoint/rewind pair, fullscreen git TUI
  (document `omp git` as the human surface).

### 6. RTK / lean-ctx native (one wrapper, one seam)

- One MCP client wrapper mapping `ToolDefinition` ⇄ MCP tool schema; register
  `ctx_read`/`ctx_patch`/`ctx_execute` via the existing `registerTool()` hook.
  Execution reuses `executePluginTool()` timeout + `gatePluginToolsByRole`.
- All file/patch responsibility routes through `ctx_patch`-shaped anchored ops
  (line+hash from read); direct-write paths frozen for non-MCP callers.
- Token saving = `.rtk/filters.toml` (activate real filters; example-only
  today) + purpose-keyed compress in `PromptAssembler`; measured via the
  harness telemetry events (§8). Anchored read + patch + memory recall = the
  Serena loop with project-native pieces, no new service.

### 7. Stats dashboard (one tab, not new infra)

- New typed `TelemetryEventBody` union members reusing `record()` +
  `telemetry_events` + 90-day retention: `harness.call_completed{model,
  tokensIn,tokensOut,latencyMs,savedTokens}` and
  `gripe{submittedBy,category,text}` (`categoriseError()` already normalizes).
- Export `ResourceManager.inFlight` into the `MetricsCollector` snapshot → queue
  depth appears in `/metrics` + Health tab free. Per-model token/latency/error
  rollup fixes the `analytics/models` gap (group by model, not event_type).
- One new Analytics sub-block in `src/views/admin.html` reusing the
  `loadAnalytics()` fetch pattern (per-model table + gain totals + gripes
  list); user page reuses `routes/analytics.ts` user-scoped endpoints.

### 8. Harness exec logs (JSONL first, zero-dep)

- Append-only `<repo-root>/.harness/executions.jsonl` (gitignored like
  `tree/`), one record per run: `run_id|ts|run_ms|task|task_type|model|tools[]|
  tool_count|pattern|pattern_detail|result|error|tooling_gap|cost_usd|
  tokens_in/out|branch|pid|git_sha|msg`. Mirrors ledger `v/ts/pid/cmd/branch/
  msg` for grep compatibility. Best-effort append, never blocks the run.
- Query patterns are `grep`+`jq` one-liners (failure rate per pattern, tooling
  gaps, cost per task type, top tools on failures, avg duration per type) —
  documented in the ticket, no query service until volume demands it.

- **Shipped as turn correlation, not an agent tree.** The implemented slice adds
  a `turn_id` field to every exec-log record, so a dispatch correlates back to
  the turn that caused it and the provenance chain is closed. It is NOT a
  subagent `parentRunId` agent tree: no run spawns another run, so a
  parent/child hierarchy cannot be reconstructed from the log today. The agent
  tree remains unbuilt and is owned by `TASK-harness-subagent-delegation`.

### 9. Polyglot + skills + backlog + external integrations

- Polyglot: `runtime` field on `PluginManifest` (default `"bun"`) + runtime
  switch inside `loadSinglePlugin()`; `RuntimeAdapter { load, isAvailable }`
  modeled on the `src/native/loader.ts` cached-module-with-null-fallback
  pattern. Node via worker threads, py via spawned subprocess + JSON-RPC
  (adapters are new code; manifest + origin-capability gate are reuse).
- Skills: `SkillManifest` parsed from existing `SKILL.md` frontmatter + a
  `src/agents/skills/loader.ts` reusing the plugin dir-scan pattern; triggers
  map to `workflow-routing.ts` intent patterns. Contextual activation (load
  only when relevant) per the opencode `customize-opencode` pattern. Skill
  usage telemetry → auto-archive stale agent-created skills (hermes curator
  shape); pinned exempt. No marketplace in this epic (deferred runner-up).
- Subagents: `SubagentTask` + `DelegationRecord` (role id + prompt + tool
  subset + timeout) persisted reusing `workflow-session-store.ts` +
  `src/async/store.ts` patterns; execution wires `tool-executor.ts` + event
  bus; `delegate_task({goal|tasks[]})` with `action=list|steer|stop`,
  background flag, no-poll discipline, per-task output schemas; depth-derived
  roles + concurrency caps + credential lease per child; children barred from
  sensitive tools. Layers ABOVE TurnManager/turn-selector, never a parallel
  scheduler.
- Backlog: `tickets/index.json` stays the bookkeeping target (+
  `updated/frontmatter/legacy_aliases` keys, backlog-gate enforced); YAML
  frontmatter from the `ticket.ts` scaffold (`_legacy: true` for old);
  canonical status enum through the `giwt.toml` alias map +
  `giwt plan validate --gates status-vocab`; Jira as a new `giwt sync`
  provider (all sync logic stays in giwt, nothing new in loop-lore scripts).

### 10. Frontend / native consolidation

- New "Harness"/"Runs" tab in `admin.html` reusing admin shell +
  `adminViewGuard`; stat-card/table/activity-feed patterns for runs, approvals,
  budgets, traces; handlers beside existing `src/routes/admin/` sub-routes
  (registered in `admin/index.ts`, following the `audit.ts`/`cron.ts` shape);
  search/filter reuses `frontend/pages/shared.ts`; in-flight polling reuses
  `use-request-status.ts` (750ms poll, 30s ceiling).
- Upgrade path only: expose harness reads over Elysia GET
  `/api/harness/conflicts|issues|prs|diff` reusing the same formatter fns (one
  format fn, two sinks) — not a second implementation.
- TUI stays a thin HTTP client: add `orchestrate/workflowz/omp` verbs as
  `assistant/commands/registry.ts` entries reusing `confirmAndDispatch` +
  session-store TTL; zero TUI rewrite. Native `.cdylib` is a perf layer, not
  an app runtime — untouched.

### 11. DB for harness (jsonl → git+db cross-search)

- Iteration 1: new `Transport` impl (harness event → `harness_runs.jsonl`)
  reusing `Transport{write,flush}` + queue + rotation.
- Iteration 2: two tables via normal migration (`harness_runs`,
  `harness_calls` — run id, git sha, command, model, tokens, latency, error
  category), reusing `request_results`/`telemetry_events` column shapes; git
  sha captured at dispatch, no git library.
- Cross-search: harness call summaries via `storeEmbedding` + new
  `MemoryScope` (`harness`), recall via `semanticRecall`, inject via the
  `selectMemoriesForInjection` pattern. Audit/lineage via `recordAuditLog` +
  `reconstructMessageChain` patterns.

### 12. Context builds / templates

- New `PromptPurpose` keys reusing `purposes.ts` + `LLM_PROMPT_DEFAULTS`:
  `harnessCode|harnessEdit|harnessReview|harnessCreative|harnessImage|
  harnessVideo` — config-overridable via `configs/templates/llm.yaml`, no
  loader change.
- New workflow YAMLs reusing the `entities.yaml` schema
  (`triggers/intent/steps/dispatch/approval`), e.g. `harness-small-agent.yaml`
  (trigger phrase → steps → dispatch backend `omp` → approval preview).
- Per-task override reuses `assembleWithTemplate()`; image/video prompts reuse
  `applyImageTemplate` + `validateWorkflowPayload`.

### 13. Frontier gaps (ranked, each standalone)

1. **Agent/LLM eval harness** — pass/fail task suites with ground truth
   (`tests/benchmarks/` is crypto-only today); every assistant/workflow change
   ships measured before multi-agent work scales.
2. **LLM-call cache + dedup + cost budgets** — response cache (none exists;
   current `cacheKey` hits are idempotency keys only), per-user/chat spend
   tracking (replace hardcoded `COST_PER_1K_TOKENS` with route-attributed
   cost), fleet ceiling. Direct cost control for agent fleets.
3. **OTEL tracing + trace viz** — spans per generation feeding an admin Traces
   tab (today: in-process counters + `x-trace` header convention only).
   Multi-step runs are black boxes without it.
4. **Deterministic replay** — seed/temperature logging per run for bit-for-bit
   re-execution of failed agent runs (today: fixture seeding in tests only).
5. **Production tool-call sandbox** — worker/vm/subprocess isolation with
   timeouts + capability-scoped ctx for plugin/assistant tools (today:
   in-process, zero isolation; test isolation is test-only). Hostile/buggy
   community-plugin tools must not crash or exfiltrate from the server.

### 14. Commit discipline (unify 3 layers + grounding)

- Unify format layers on one scope/type table: export `VALID_TYPES` + scope
  list from `src/scripts/commit-check.ts` (or shared
  `scripts/worktree/utils/commit-conventions.ts`), import in `message.ts
  validateMessage()`, generate `.commitlint.yaml` enums from it (kills
  accept-here-fail-in-CI; `.commitlint.yaml` is orphaned — no reader).
- Diff-derived grounding (advisory first): after `validateMessage`, `git diff
  --cached --name-only` → top-level dirs; WARN when `(scope)` matches none +
  `did-you-mean: <top-dir>` hint; WARN when staged count > 15 (SKILL.md
  batching rule, prose-only today). Promote to error after measuring
  false-positives. Signing UX unchanged (hint taxonomy + `giwt gpg-unlock` +
  stop-and-report); only add the remediation hint on the `verify-commit` warn
  branch. NOT in scope: LLM-generated messages, interactive prompts, new lint
  deps.

### 15. Canvas viz (mermaid first, no new deps)

- Mermaid `gitGraph`/`graph TD` branch overview from `chat_branches` +
  `walkMessagePath` (promote `mermaid@12` devDep → runtime first); location-tree
  panel in world-edit `explore` tab from `LocationTreeService.tree()` (maps 1:1
  to `graph TD`); memory→message provenance mini-graph from
  `ExpandedMemoryContext`; world-timeline lane extending
  `world-timeline-bar.ts`; game-canvas overlays (location pins, memory-hit
  markers) via existing `draw.ts` helpers before any new canvas.
  `cytoscape.js` ONLY if node counts/layout exceed mermaid. NOT in scope: d3,
  gitgraph.js (archived), 3D, Gource-style animation.

### 16. OMP reference patterns (wrap, never reimplement)

- Above (§5) covers conflicts/json/prs/`#` shorthand. Additionally: hook
  event→matcher→handler schema with Pre-veto/Post-notify pairs (claude-code
  ~30-event lifecycle as shape reference; adopt subset incl. `PostToolBatch`
  parallel join point + `PreCompact/PostCompact` compaction brackets);
  fallback provider chain (ordered + scoped, explicit `[]` disables; hermes
  `scoped_fallback_chain` shape); `CanonicalUsage`
  (input/output/cache_read/cache_write/reasoning/request_count) + sub-cent
  cost labels; named session-scoped toolsets (never env-keyed); trivial-prompt
  recall gate; redacted `sessions_history` cross-session recall shape.

### 17. IRC messaging + TTSR / steering

- **IRC bus (the real gap):** loop-lore has @mention routing + a read-only
  turn-order view, but no agent-to-agent mailbox. WRAP first: drive
  multi-actor scenes through `omp --mode rpc/json` + `IrcBus.send`/`wait`
  semantics (mailbox cap 100, waiter-first, idle-wake vs busy-aside,
  `all`-broadcast, `replyTo` threading); BUILD only the thin in-repo inbox
  table + `irc_message` event if offline (non-omp) group-chat DMs are needed.
- **TTSR auto-steering:** stream-interrupt steering (rule md with
  `condition`/`astCondition`/`question`/`scope`, abort + mid-response
  inject), NOT prompt-injection. WRAP: author narrative guardrails as
  TTSR-shaped rule files, test with `omp ttsr test|scan`; BUILD the in-repo
  regex-watcher + abort/inject only if provider-independent runtime guards are
  needed (keep `interruptMode`/`repeatMode` knobs from day one).
- **User steering contract** (adopt verbatim when streaming long-run
  generation exists; deferred until then): `steer` (interrupt) / `followUp`
  (queue) / `aside` (next-step-boundary inject) + Enter/Ctrl+Q/Esc keymap +
  queue chips. No work until a running-agent concept exists to steer.

### 18. Work topics (scoping + session attachment)

- **`WorkTopic` shape:** a named work scope for agent sessions. It is NOT a world
  (no `MemoryScope` extension — that stays closed at `character | assistant |
  world` per `src/memory/types.ts:15` and `src/validation/schemas/entities.ts:15`,
  enforced by `checkScope()` at `src/memory/provision.ts:150`). It is NOT a chat
  section. It is NOT an auth session (`sessions` table at
  `src/db/schema-manifest.ts:2441`). It is a NEW concept layered above
  `WorkflowSession` in-memory (`src/assistant/workflow-session.ts:23`),
  `workflow_sessions` DB table (`src/assistant/workflow-session-store.ts:19`),
  `request_results` (`src/async/store.ts:78` TTL, `:195` table read), and the auth `sessions`
  table — keyed by run id, not chat id.
- **Storage:** `harness_work_topics` + `harness_work_topic_sessions` join table.
  Folded into the §11 `harness_runs`/`harness_calls` migration batch, not a new
  migration of its own. The join table is append-only: `(sessionId,
  workTopicId, attachedAt, detachedAt, attachedBy)` so lineage is reconstructable,
  matching the §8 exec-log append-only posture.
- **Auto-scoping ladder (5 rungs, deterministic first, LLM only out-of-band):**
  1. Explicit `--work-topic` / route param on dispatch → wins outright.
  2. Git branch name → epic slug via `.plan/epics-index.md`.
  3. Keyword match against `INTENT_PATTERNS` (`src/regex/intent.ts:19`) — the same
     taxonomy `matchWorkflowIntent()` already iterates (`src/assistant/workflow-routing.ts:102`).
  4. Sticky: inherit the session's current topic.
  5. LLM classification — out-of-band only, opt-in, cached on the run record.
  A run with no resolved topic falls to `project` tier and is logged as a
  classification miss. **Deadlock rule:** automatic topic classification must
  NEVER be an inline LLM call on the dispatch path (reason rung 5 is out-of-band).
- **Manual-first UX:** the user may start a work topic and attach sessions to it
  by hand; auto-scoping only proposes and can be overridden. Override precedence:
  manual pin beats auto forever for that session.
- **Epic binding:** a work topic MAY carry an `epicSlug` binding to
  `.plan/epics-index.md`, MAY be standalone, and an epic does not require topics.

### 19. Priority-tiered context injection

- **Tier table** (ranks content by provenance; orthogonal to the existing
  `PRIORITY` section-ranking axis):

  | Tier | Name       | Meaning                                                            |
  | ---- | ---------- | ------------------------------------------------------------------ |
  | 0    | `task`     | The current work item — what this dispatch is for                  |
  | 1    | `session`  | Context attached to the current session (prior turns, its memories) |
  | 2    | `workTopic`| Context scoped to the attached work topic (its runs, notes, memory) |
  | 3    | `project`  | Project-wide / repository-overall context (always eligible for trim) |

- **Composition with `PRIORITY`:** `PRIORITY` (at `src/assistant/prompt/types.ts:192-223`)
  ranks prompt *sections* within one tier; tier ranks content by *provenance*.
  Effective drop order: **tier first (3 → 2 → 1 → 0), then section priority
  within the tier.** `dropOverBudgetSections()` (`src/assistant/prompt-budget.ts:62`)
  sorts ascending by `PRIORITY`, drops lowest-priority sections first. Tier is a
  new orthogonal axis: `priorityOf(s.name) > 0` remains the droppable gate; the
  `?? 0` unknown-name default (`prompt-budget.test.ts` contract) makes unknown
  sections immune. The `prompt-budget.test.ts` contract is NOT rewritten — tier
  is derived, not a restructuring.

- **Where tier attaches:** `AssembleContext` (`src/assistant/prompt/types.ts`)
  gains a `contextTier` field on each assembled section's report. `SectionBuilder`
  (`types.ts:183-188`) is NOT restructured — tier is derived, not a new
  required `SectionBuilder` field, so all 29 builders stay untouched.
  The 0/1/2/3 tier per section is set at assembly time from the dispatch
  context (task/tier-0, session-scoped sections → tier-1, work-topic-scoped
  → tier-2, project-level → tier-3).

- **Memory sub-budget:** `selectWithinBudget()` (`src/memory/budget.ts:25`) gains a
  tier sub-tier alongside the existing `respectPins` bypass. Its hardcoded
  `maxTokens: 1024` (`src/memory/provision.ts:82`) becomes tier-aware: tier-3
  memories get a smaller slice than tier-0/-1. Pins outrank tier (pinned tier-3
  memory is not dropped before unpinned tier-0). `MemoryScope` is NOT extended
  (see §18 above).

- **Telemetry:** each injection records which tier won, feeding the §7 dashboard
  and the §8 exec log.

### 20. Proposals not yet in scope

Concrete gaps with evidence; each has an explicit `IN or OUT?` marker.

1. **Per-tier token budget observability** — tier drop order is specified but
   unmeasured. Add per-tier token counts to the §7 dashboard. Cost: one new
   `harness.context_tier_token_count` telemetry event. **IN or OUT?**

2. **Topic-level cost/stat rollup** — no aggregate cost-per-work-topic in the §7
   dashboard. Join `harness_work_topic_sessions` → `harness_calls` for a
   topic-level spend view. Cost: one aggregation query + dashboard panel.
   **IN or OUT?**

3. **Topic TTL vs 24h session TTL precedent** — `workflow_sessions` uses 24h lazy
   expiry (`src/assistant/workflow-session-store.ts:19`). Should
   `harness_work_topic_sessions` have a TTL? The join table is append-only
   (lineage requirement); but `workTopicId` resolution in `harness_runs` is
   mutable on the run record. Open question. **IN or OUT?**

4. **`tui.enabled` gate on all harness TUI surfaces** — `src/tui/harness/`
   overlay has no feature-gate. A `harness.tui.enabled` config knob would let
   operators disable it in headless environments. Cost: one config field + guard
   in the overlay mount. **IN or OUT?**

5. **`.tmp/harness-research-*.md` inputs no longer on disk** — lines 38-42 cite
   `harness-research-internal.md`, `harness-research-pi-opencode.md`, etc. as
   read-only research inputs in repo-root `.tmp/`. These files are not present
   on disk today; they are described as "intentionally uncommitted". If they are
   still needed, they must be re-created or the citation must be updated. If
   they are stale, the paragraph should be removed. **IN or OUT?**

6. **Spec-vs-code drift in `docs/spec/terminal-ui.md`** — the TUI epic owns this
   file, and its drift is now catalogued. A systematic spec-sync ticket
   (`TASK-tui-spec-sync`) closes it. Evidence: `epic-terminal-ui.md` carries a
   4-row drift table — `docs/spec/terminal-ui.md:15` claims `/api/assets` +
   `/api/assistant` while the code calls `/api/v1/assets`
   (`src/tui/asset-view.ts:206`) and `/api/v1/chats/:id/messages`
   (`src/tui/chat/api.ts:32,77`); `/api/assistant` is called nowhere under
   `src/tui/`; the spec predates the `src/tui/harness/` overlay entirely.
   **IN or OUT?**

7. **Sandbox interaction: does a work topic grant cross-run tool capability?** —
   §13 (production tool-call sandbox) mentions capability-scoped ctx. If a
   harness run is scoped to a work topic, does that grant the agent access to
   tools or data it would not have in a non-topic-scoped run? The question is
   open; the answer bounds the sandbox design. **IN or OUT?**

8. **Auto-scoping rung 3: reuse `workflow-routing.ts` intent patterns or a
   separate rules table?** — `INTENT_PATTERNS` (`src/regex/intent.ts:19`) holds the
   regex taxonomy `matchWorkflowIntent()` iterates (`src/assistant/workflow-routing.ts:102`). The auto-scoping
   ladder (§18 rung 3) could reuse this pattern set, or could have a separate
   `harness_topic_keywords` rules table. Reuse costs one function call;
   separate costs a new table + loader. **IN or OUT?**

## Tasks

- [ ] TASK-harness-model-routing — TaskSignal + ModelRouter + routing config
- [ ] TASK-harness-programmatic-api — omp RPC wrap + session-layout adoption
- [ ] TASK-harness-assistant-personalities — preset cascade + card-field split
- [ ] TASK-harness-sync-ledger-v2 — ledger v2 kinds + slot claims
- [ ] TASK-harness-merge-coordination — concerns protocol + conflict weighting
- [ ] TASK-harness-giwt-json-surface — --output json threading + conflicts cmd
- [ ] TASK-harness-lean-ctx-tools — MCP wrapper + anchored-op seam
- [ ] TASK-harness-stats-dashboard — telemetry events + admin block + rollups
- [ ] TASK-harness-exec-log — .harness/executions.jsonl schema + queries
- [ ] TASK-harness-db-tables — harness_runs/calls migration + embedding scope
- [ ] TASK-harness-plugin-runtime — manifest runtime field + adapters
- [ ] TASK-harness-skills-runtime — SKILL.md loader + triggers + curator
- [ ] TASK-harness-subagent-delegation — delegate batch above TurnManager
- [ ] TASK-harness-backlog-jira — Jira sync provider + frontmatter + enum
- [ ] TASK-harness-frontend-consolidation — admin Harness tab + API reads
- [ ] TASK-harness-context-templates — PromptPurpose keys + harness YAMLs
- [ ] TASK-harness-eval-harness — task suites with ground truth
- [ ] TASK-harness-cache-budgets — LLM cache + dedup + spend ceilings
- [ ] TASK-harness-otel-replay — OTEL spans + trace tab + replay log
- [ ] TASK-harness-tool-sandbox — worker/vm isolation + capability ctx
- [ ] TASK-harness-commit-grounding — convention unify + diff grounding warns
- [ ] TASK-harness-canvas-viz — mermaid branch/location/memory panels
- [ ] TASK-harness-irc-ttsr — inbox contract + TTSR rules + steer contract
- [ ] TASK-harness-work-topics — entity + CRUD + epic binding + auto-scoping ladder
- [ ] TASK-harness-topic-session-attach — session attachment + lineage + exec-log field
- [ ] TASK-harness-context-priority-tiers — 0/1/2/3 tier budget composed with PRIORITY
- [ ] TASK-harness-topic-tui-surface — work topics on existing src/tui/harness/ overlay

## Dependencies

- **Requires (land first):** `epic-llm-request-scheduler.md` (scheduler seam —
  router output feeds it); `epic-workflow-engine.md` (runner — harness emits
  into it); `src/llm/` orphaned-slice wiring tickets
  (`FEAT-llm-request-complexity-classification.md` et al — requestClass feeds
  TaskSignal).
- **Blocks:** `epic-recursive-self-improvement.md` (consumes exec logs + eval
  harness); `epic-local-process-swarm.md` (delegation record is the
  single-process precursor); `epic-federation-swarm-sync.md` (may reuse ledger
  v2 claim shape).
- **External prerequisite:** `TASK-retire-the-scripts-worktree-fork-of-giwt-*`
  (fork-vs-shim decision bounds all §5 work).
- **Consumer relationship:** `epic-terminal-ui.md` (TUI epic) consumes §18 — the
  work-topic TUI surface (`TASK-harness-topic-tui-surface`) is a consumer of this
  epic's work-topic subsystem, not a peer.

## Related Epics

- `epic-llm-request-scheduler.md` — scheduler machinery + orphaned `src/llm/`
- `epic-llm-queue.md` — superseded on scheduling; do not extend
- `epic-workflow-engine.md` / `epic-assistant-creative-studio-workflows.md` /
  `epic-entity-generation-workflows.md` / `epic-model-family-presets.md`
- `epic-group-chat.md` / `epic-actor-autonomy-story-drive.md` /
  `epic-assistant-gm-flows.md` / `epic-gm-shadow-notes.md` /
  `epic-assistant-step-planning.md` (display-only precedent)
- `epic-plugin-system.md` (extension points incl. `assistant-workflows`)
- `epic-config-templates.md` (FEAT-065 cascade personalities ride on)
- `epic-memory-knowledge-systems.md` (embedding/recall primitives)
- `epic-analytics-observability.md` / `epic-logging-telemetry.md` /
  `epic-observability-telemetry.md` (telemetry neighbors)
- `epic-security-sandboxing.md` (sandbox policy neighbor)
- `epic-character-multi-personality.md` (character-side personalities)
- `epic-recursive-self-improvement.md` (consumer of logs + eval)
- `epic-project-spaces-pm-integration.md` — distinct axis: business project isolation
  (`kind:"project"` worlds) vs agent work scope; both use isolation vocabulary and
  are easily conflated by readers — note the distinction.


git issue: 9085399
