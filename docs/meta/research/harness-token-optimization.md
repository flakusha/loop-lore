<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Harness Token Optimization — RTK / lean-ctx / token-optimizer

**Status:** Research — feeds task candidates
**Date:** 2026-10-04
**Source tickets:** `.plan/tickets/TASK-harness-lean-ctx-tools.md`, `.plan/epics/epic-harness-integration.md` §6–§7

## Question

Which token-saving practices do the three external tools implement, how should
harness call sites chain through them (one MCP wrapper mapping `ToolDefinition`
⇄ MCP schema), and — the forward-looking requirement — what would it take for
harness code to reimplement each tool's essential capability natively if the
dependency dies or stops being valuable?

## Findings

### 1. Tool identities (exact, not guessed)

| Tool | Identity | Installed evidence | License |
|---|---|---|---|
| **RTK** | `rtk-ai/rtk` — "Rust Token Killer", CLI proxy filtering bash output before the agent reads it | `rtk --version` → `rtk 0.49.0`; repo `.rtk/filters.toml:3` cites `https://github.com/rtk-ai/rtk#custom-filters` | Apache-2.0 |
| **lean-ctx** | `yvgude/lean-ctx` — "Control what your AI can see", Rust context engine + MCP server (`ctx_*`) | `/usr/local/bin/lean-ctx` (93.6 MB native binary); `lean-ctx --version` → `lean-ctx 3.10.5 (official, https://github.com/yvgude/lean-ctx)`; `~/.omp/agent/mcp.json:24-28` stdio server | (upstream repo) |
| **token-optimizer** | `alexgreensh/token-optimizer` — hook-based context compressor + session continuity for Claude Code/OpenCode/Codex/Hermes/Copilot | local clone `/home/flak/git-ai/token-optimizer`, `git remote -v` → `https://github.com/alexgreensh/token-optimizer.git`; repo `.gitignore:95` ignores `token-optimizer/` | **PolyForm Noncommercial 1.0.0** |

Identity risk: `token-optimizer-mcp` (`ooples/…`, `Tjpatel16/…`) and
`omkar9854/token_optimizer` are *different* projects; this workstation uses the
`alexgreensh` one (local clone origin + its `LEAN-CTX.md`).

### 2. The repo seam (what exists today)

- Epic §6 "RTK / lean-ctx native (one wrapper, one seam)": one MCP client wrapper
  mapping `ToolDefinition` ⇄ MCP tool schema; register `ctx_read`/`ctx_patch`/
  `ctx_execute` via the existing `registerTool()` hook; execution reuses
  `executePluginTool()` timeout + `gatePluginToolsByRole`; all file/patch work
  routes through `ctx_patch`-shaped anchored ops; savings measured via harness
  telemetry (`epic-harness-integration.md:154-171`).
- Ticket `TASK-harness-lean-ctx-tools.md:10-11,16-19`: same scope; notes **no MCP
  at runtime** (no `@modelcontextprotocol` dep, no MCPClient, no `ctx_*` in
  `src/`) — confirmed: `grep` for `modelcontextprotocol|MCPClient|ctx_read` in
  `src/` returns nothing, and `package.json` declares no MCP dependency.
- Plugin tool seam already exists and is the reuse target: `ToolDefinition`
  (`src/plugins/types.ts:102-113`), `ToolResult` (`:118-122`),
  `ToolExecutionContext` (`:93-97`); dynamic registration `ctx.registerTool` →
  `registry.addTools` (`loader.ts:154`, `registry.ts:50-53`, read `:116-118`);
  timeout contract `executePluginTool` / `DEFAULT_TOOL_TIMEOUT_MS = 30_000`
  (`tool-executor.ts:21,33-56`); role gating `gatePluginToolsByRole`
  (`generate-route/tool-execution.ts:74-87`); execution loop + sanitize +
  encrypted persist `executeToolCalls` (`tool-execution.ts:151-203`,
  `sanitizeToolOutput` `:58-67`).
- `.rtk/filters.toml:1-13` is a commented template (schema_version = 1, one
  commented `[filters.my-tool]` example) — example-only, no active filter.
- Tool-routing note: `.agents/references/agent-rules.md:11-14` defers routing
  (`ctx_*` vs native) to the global agent config; the workstation hook
  `lean-ctx-native-reroute.ts:1-34` escalates `edit`→`ctx_patch`,
  `write`→`ctx_patch(create)`, `glob`→`ctx_glob`, blocks `eval`, and leaves
  `read`/`grep` native by deliberate choice.
- Measured-savings path exists but the field does not: `HarnessRunRecord`
  (`src/harness/types.ts:37-63`) has `tokensIn`/`tokensOut`/`costUsd` but **no
  `savedTokens`**; `recordExecRun`/`buildRunRecord` (`exec-recorder.ts:65-99`)
  likewise. `harness.call_completed{…,savedTokens}` (epic `:169-171`) — a gap.

### 3. Catalogue of token-saving techniques (practices, not marketing)

**RTK — pre-shell output filtering** (`rtk-ai/rtk` README, `src/filters/README.md`):
- Intercepts the command, runs it, filters stdout/stderr *before* the agent sees
  it; four strategies: smart filtering (drop comments/whitespace/boilerplate),
  grouping (files by dir, errors by type), truncation (keep context, cut
  redundancy), deduplication (collapse repeated log lines with counts).
- TOML DSL applies 8 ordered stages: `strip_ansi` → `replace` (regex, chainable)
  → `match_output` (short-circuit) → `strip_lines_matching`/`keep_lines_matching`
  → `truncate_lines_at` → `tail_lines` → `max_lines` → `on_empty`
  (`src/filters/README.md` file-format table).
- Filter lookup priority: project `.rtk/filters.toml` → user
  `~/.config/rtk/filters.toml` → builtin embedded TOML → passthrough; first match
  wins. Custom filter files are **trust-gated** (SHA-256 of contents; editing
  invalidates trust) — consent + tamper-evidence, explicitly *not* a sandbox.
- Token counts are estimated as `bytes/4` (no tokenizer): percentages reliable,
  absolute numbers approximate. Honest upstream limitation: aggressive filters
  can truncate `cargo build`/`test` error detail (`rtk-ai/rtk` issue #3500).

**lean-ctx — context-minimal reads + hash-anchored edits** (`leanctx.com/docs`,
`github.com/yvgude/lean-ctx`):
- `ctx_read` with 10+ modes — `map`, `signatures`, `full`, `lines:N-M`, `diff`,
  `task`, `entropy`, `aggressive`, `reference`, plus `raw`, `full-compact`,
  `anchored`, `density:0.40`, `cognitive`. The right representation for the task
  saves 60–90% vs reading full source; docs are explicit that density/semantic
  modes are **lossy views, not accuracy guarantees** (read-modes doc).
- `mode:"anchored"` returns line+hash references; `ctx_patch` consumes them.
  Ops: `set_line`, `replace_lines`, `insert_after`, `delete`, `replace_unique`,
  `replace_symbol`, `replace_all`, `create`; `CONFLICT` means re-read (stale
  anchors are never force-overwritten). `replace_unique` is a no-read exact
  unique replacement; cross-file `ops[]` batches are supported
  (`ctx-patch` tool reference).
- `ctx_compose` returns ranked files + inline source for one task — "use instead
  of search→read chains". `ctx_search` has regex/semantic/symbol actions;
  `ctx_callgraph` gives callers/callees; `ctx_glob` respects `.gitignore`.
- Read cache: an unchanged repeated read may return a compact reference;
  `fresh:true` bypasses it but is not the same as `raw`. `ctx_knowledge`/
  `ctx_session` provide persistent memory recall.

**token-optimizer — hook-based compression + continuity** (`alexgreensh/token-optimizer` README, `HOOKS.md`):
- PreToolUse hooks intercept Read and Bash before context entry; PostToolUse
  archives the full original to disk and logs a compression event to SQLite
  (nothing lost, everything retrievable via `expand`).
- Delta Mode: re-reads return only the diff (≈20% on re-reads; a 2,000-token
  re-read → ~50-token diff). Structure Map: unchanged code re-reads return a
  signatures/imports skeleton (720 KB → 250 tokens). First-Read Skeleton applies
  to large **code** files only; markdown/prose is never skeletoned (a
  headings-only outline drops load-bearing prose) — a good anti-pattern to copy.
- Bash compression (111 commands / 22 pattern families, credential-safe),
  search compression (top hits + count), large-result progressive disclosure
  (>4 KB archived, expand on demand). Lean-output nudges, quality nudges, loop
  detection, activity-mode-aware compaction, decision extraction, checkpoints.
- Zero network / zero telemetry / stdlib-only Python; two local SQLite DBs.
- **License is PolyForm Noncommercial** — a hard constraint for absorption
  (§4.3): its *ideas* are reusable, its *code* is not vendorable into an AGPL
  project.

## Recommendation (design sketch, reuse-first)

### 4.1 Chaining seam: one MCP wrapper, one file/patch path

1. **New module `src/plugins/mcp-client.ts`** (name TBD) owning a single stdio
   MCP client (spawn `lean-ctx`; config-driven command/args, mirroring
   `~/.omp/agent/mcp.json:24-28`). No MCP types leak past this module.
2. **Mapping layer `ToolDefinition` ⇄ MCP tool schema**, pure and unit-testable:
   MCP `{ name, description, inputSchema }` → `ToolDefinition.parameters` (already
   JSON Schema, `plugins/types.ts:105`); harness → MCP `{ name, arguments }`;
   MCP result `{ content:[{type:"text",text}], isError }` → `ToolResult`
   (`:118-122`), `isError` mapped through.
3. **Registration** via the existing `onLoad` hook: call `ctx.registerTool(def)`
   for `ctx_read`/`ctx_patch`/`ctx_glob`/`ctx_execute` once the client connects
   (`loader.ts:154`). The LLM sees them as ordinary plugin tools; no execution
   fork — `executeToolCalls` (`tool-execution.ts:151-203`) and
   `executePluginTool` timeout (`tool-executor.ts:33-56`) already apply.
4. **One anchored seam**: `ctx_patch` ops are the single file/patch path.
   `ToolDefinition` for `ctx_patch` is generated *from* the MCP schema, so op
   names never drift; direct-write paths stay frozen for non-MCP callers
   (ticket `:17`).
5. **RTK is not MCP** — it is a shell-layer proxy. Chain it as *config*, not a
   wrapper: activate real filters in `.rtk/filters.toml` (`:1-13` template) for
   the repo's noisy commands (bun test, eslint, typecheck, `git status`). The
   harness never calls RTK; the agent's bash hook does. RTK's trust gate means
   committed filters need `rtk trust` per clone — document it, don't automate.
6. **token-optimizer is not MCP either** — it is host hooks. Chain it as a
   *reference policy*: adopt the markdown-never-skeleton rule and the
   archive-original-then-expand pattern inside `PromptAssembler`; add no third
   runtime dependency.

### 4.2 Measured-savings path

- Add `savedTokens` to the harness record + wire shape (`types.ts:37-63`,
  `serializeRun`) and to `ExecRunInput`/`buildRunRecord` (`exec-recorder.ts`).
  Keep it out of `HarnessTotals` sums until the semantics are proven — do not
  fold an estimate into a counted total (token-optimizer's "counted" vs
  "estimated" tiers stay separate).
- Source: RTK's `rtk gain` / filter byte-delta for bash; lean-ctx's per-call
  response metadata for reads/patches. Where the tool cannot report it, log
  `null` (unknown ≠ free), matching the `costUsd` convention (`types.ts:51-56`).
- Rollup: extend `rollupStats` (`stats.ts:78-148`) and `HarnessStats`
  (`read-models.ts:106-112`) with a `savedTokens` total only after the field is
  populated end-to-end.

### 4.3 Internal absorption (explicit requirement)

Ranked by (value if the dependency dies) × (effort). Priority: **P1 = ship with
the seam**, **P2 = next**, **P3 = only if the tool disappears**.

**Absorbing RTK** — the easiest, because it is a pure function over text.
- Feature-by-feature: (a) 8-stage filter pipeline over command output,
  (b) `match_command` regex routing, (c) filter lookup priority, (d) trust gate.
- Native design: a small in-repo `src/harness/output-filter.ts` — parse a
  `.rtk/filters.toml`-compatible file (keep the format; it is already committed),
  apply the same 8 stages in order, return filtered text. Reuse the repo's own
  bash tool path. No binary, no proxy.
- Effort: **P2, low** (one module + TOML parse; the repo already parses TOML for
  `giwt.toml`/config templates). P2 rather than P1 because the shell hook keeps
  working without harness code. Cheapest 80%: filter only the repo's top
  offenders (test, lint, typecheck) as hard-coded stages; skip the general TOML
  DSL until a second command needs it.

**Absorbing lean-ctx** — the largest, because it owns both read and edit.
- Feature-by-feature:
  1. `ctx_read` modes → a `readFile(path, mode)` helper. `lines:N-M` already
     exists natively (`read` tool); the delta is `map`/`signatures`/`diff`/
     `entropy`. Absorb `signatures` via a regex/TS-parser outline (no new dep —
     `tsgo`/TypeScript is already present); skip `entropy`/`density` (lossy
     heuristics, low trust).
  2. `ctx_patch` anchored ops → **the real value and the real cost.** Hash =
     content hash of the target line/range. Store `(line, hash)` from a read;
     on patch, re-hash and reject on mismatch (`CONFLICT` semantics). Ops
     `replace_unique`/`replace_all`/`create` need no anchors at all and are the
     easiest first slice; `replace_lines`/`insert_after` need the anchor.
  3. `ctx_compose` (ranked files + inline source) → reuse the existing
     embedding/rerank service and the harness read-models; do **not** rebuild a
     second index.
  4. `ctx_search` symbol/semantic → reuse `ast-grep` (already in the toolchain)
     for symbol search; semantic search already exists via the embeddings
     service.
  5. `ctx_knowledge`/`ctx_session` → already exists in-repo (`MemoryScope`,
     `semanticRecall`, `selectMemoriesForInjection` per epic §11).
- Effort: **P1 for `ctx_patch` anchors + `signatures` read** (these are the
  capabilities the seam depends on and the ones a dead dependency would strand);
  **P3 for compose/search/knowledge** (already covered by in-repo services).
  Note: lean-ctx's Rust source is public but the binary is 93 MB; absorbing
  means reimplementing the *contract*, not vendoring code.

**Absorbing token-optimizer** — absorb ideas, never code.
- Feature-by-feature: (a) delta re-reads (diff vs cached read), (b) structure-map
  skeletons for unchanged code, (c) large-result archive + `expand`, (d) loop
  detection, (e) decision extraction into compaction, (f) quality scoring.
- Native design: (a)+(b) are a read-cache keyed by path+mtime inside the harness;
  (c) reuses the existing `artifact://` spill mechanism; (d) compares recent
  tool-result hashes; (e) already partially present via memory injection;
  (f) is telemetry over the harness log — no new store.
- Effort: **P2 for (a)+(b)+(c)** (highest measured savings, smallest surface);
  **P3 for (d)–(f)**. Hard constraint: PolyForm Noncommercial — ideas only.

## Task candidates

1. **TASK: Harness MCP wrapper (lean-ctx `ctx_read`/`ctx_patch`/`ctx_glob`)**
   - Why: unblocks epic §6; the seam every other token task hangs off.
   - Acceptance: `src/plugins/mcp-client.ts` maps MCP tool schema ⇄
     `ToolDefinition` (unit-tested both directions); tools registered via
     `ctx.registerTool`; execution routes through `executePluginTool` +
     `gatePluginToolsByRole`; no `@modelcontextprotocol` types outside the
     module; a `ctx_patch` `replace_unique` round-trip against a fixture file
     succeeds and a stale-anchor patch returns a CONFLICT-shaped error.
   - Related files: `src/plugins/mcp-client.ts` (new), `plugins/loader.ts`,
     `plugins/registry.ts`, `plugins/tool-executor.ts`,
     `generation/generate-route/tool-execution.ts`.
2. **TASK: Anchored edit seam (`ctx_patch` ops native fallback)**
   - Why: the forward-looking absorption for the capability a dead lean-ctx
     would strand; also the "single file/patch seam" the ticket requires.
   - Acceptance: a native `src/harness/anchored-patch.ts` implements
     `replace_unique`/`replace_all`/`create` and hash-validated
     `replace_lines`/`insert_after`; rejects on hash mismatch with a re-read
     signal; unit tests cover stale-hash, duplicate-match, and create-existing
     cases; the MCP `ctx_patch` tool delegates to the same code path when
     lean-ctx is absent.
   - Related files: `src/harness/anchored-patch.ts` (new),
     `src/harness/read-models.ts`, `plugins/tool-executor.ts`.
3. **TASK: Activate RTK filters + `savedTokens` telemetry**
   - Why: epic §6/§7 require real filters and a measured-savings field; today
     the filter file is a comment and the record has no `savedTokens`.
   - Acceptance: `.rtk/filters.toml` has ≥2 active filters for repo commands
     (bun test, eslint) with inline tests; `savedTokens` added to
     `HarnessRunRecord` + wire shape + `ExecRunInput`, defaulting 0/null;
     `rollupStats` exposes a `savedTokens` total; a fixture run asserts the
     field round-trips through `serializeRun`/`deserializeRun`.
   - Related files: `.rtk/filters.toml`, `src/harness/types.ts`,
     `src/harness/exec-recorder.ts`, `src/harness/stats.ts`,
     `src/harness/read-models.ts`.
4. **TASK: Read-cache (delta + skeleton) absorption spike**
   - Why: token-optimizer's highest measured savings are delta/skeleton
     re-reads; absorbing them is dependency-free and bounds the third tool's
     role to a design reference.
   - Acceptance: a documented spike (`[INFERENCE]`-free) with a
     path+mtime-keyed cache returning diff-only or signatures-only for re-reads;
     markdown/prose explicitly excluded from skeletoning; measured against a
     fixture before any production wiring.
   - Related files: `src/harness/` (new module), `src/assistant/prompt-assembler.ts`.

## Open questions

- MCP transport: stdio child process per harness process, or a shared client?
  A long-lived server needs lifecycle/restart handling not yet designed.
- `savedTokens` semantics: byte-delta/4 estimate in a "counted" total, or an
  "estimated" tier (token-optimizer's split)? This doc recommends not mixing.
- `.rtk/filters.toml` trust gate: committed filters are skipped until `rtk trust`
  runs per clone. Documented manual step, or a harness first-run prompt?
- Does absorbing `ctx_patch` anchors duplicate any existing `edit`-tool hash
  validation? `[INFERENCE]` none exists in `src/` today.

## Sources

- Repo: `.rtk/filters.toml:1-13`;
  `.plan/tickets/TASK-harness-lean-ctx-tools.md:10-24`;
  `.plan/epics/epic-harness-integration.md:154-171`;
  `.agents/references/agent-rules.md:11-14`;
  `src/plugins/types.ts:93-122`, `loader.ts:154`, `registry.ts:50-53,116-118`,
  `tool-executor.ts:21,33-56`;
  `src/generation/generate-route/tool-execution.ts:58-87,151-203`;
  `src/harness/types.ts:37-63`, `exec-log.ts:23`, `exec-recorder.ts:65-99`,
  `stats.ts:78-148`, `read-models.ts:106-112`.
- Local config: `/home/flak/.omp/agent/mcp.json:24-51`;
  `/home/flak/.omp/agent/extensions/rtk.ts:1-21`;
  `/home/flak/.omp/plugins/node_modules/oh-my-pi-integration/hooks/pre/lean-ctx-native-reroute.ts:1-34`.
- External: RTK — https://github.com/rtk-ai/rtk ,
  https://github.com/rtk-ai/rtk/blob/develop/src/filters/README.md ,
  https://github.com/rtk-ai/rtk/issues/3500 . lean-ctx —
  https://github.com/yvgude/lean-ctx ,
  https://leanctx.com/docs/concepts/read-modes ,
  https://leanctx.com/docs/tools/ctx-patch ,
  https://leanctx.com/docs/tools/ctx-compose . token-optimizer —
  https://github.com/alexgreensh/token-optimizer (local clone origin verified;
  README, `HOOKS.md`, `opencode/README.md`, `LEAN-CTX.md` in that clone).
