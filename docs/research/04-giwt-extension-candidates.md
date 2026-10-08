# 04 — giwt extension candidates

Research date: 2026-10-07. Research only; nothing was modified.

> **Verification:** see [`05-claim-verification.md`](./05-claim-verification.md) — claim set independently verified (12 confirmed / 4 partial / 1 refuted); corrections are applied inline below.

**Sources actually read** (coverage stated per section; anything beyond is marked `[UNVERIFIED]`):

| Path | Coverage |
|---|---|
| `node_modules/giwt/src/cli.ts` | full (177 lines) |
| `node_modules/giwt/src/cli-registry.ts` | full (227 lines) |
| `node_modules/giwt/src/cli-usage.ts` | full (80 lines) |
| `node_modules/giwt/AGENTS.md` | full (116 lines) |
| `node_modules/giwt/package.json`, `giwt.toml` | full |
| `node_modules/giwt/scripts/check-file-size.ts` | full |
| `node_modules/giwt/.oxlintrc.json`, `.oxlint/plugins/giwt-style.js` | full (two elided helper bodies unread) |
| `node_modules/giwt/src/utils/config.ts` | header + all export signatures; `loadConfig` body elided |
| `node_modules/giwt/src/utils/settings-schema.ts` | full (108 lines) |
| `node_modules/giwt/src/utils/emit.ts` | full |
| `node_modules/giwt/src/utils/git.ts` | export signatures + selected bodies |
| `node_modules/giwt/src/index.ts` | full |
| `node_modules/giwt/src/commands/{runs,ledger,issues,report,docs,prs,new-branch,backlog,sync,resolver,abort,clean,agent-merge,attach,attach-dir,comment,scoped-worktree,worktree-registry,doctor}.ts` | signatures + doc headers + targeted ranges; long bodies of `finalize/*`, `sync-index.ts`, `doctor/check/*` NOT read end-to-end |
| `node_modules/giwt/src/commands/ticket/{args,create}.ts`, `task/{args,vocab}.ts` | args.ts full; create.ts head |
| `node_modules/giwt/src/doctor/check/types.ts`, `src/plan/validate/types.ts` | full |
| `node_modules/giwt/src/commands/runs.test.ts` | head + selected ranges |
| loop-lore side: `giwt.toml`, `package.json`, `scripts/worktree/index.ts`, `src/harness/*`, `src/generation/*`, `src/plugins/*` | targeted greps/reads |

---

## 1. giwt's actual architecture (FACT)

### 1.1 Process and dependency shape

- giwt is a **bun-only, AGPL-3.0-or-later, ESM CLI**: `package.json:6` (license), `package.json:4` (`type: module`), `package.json:15-17` (`engines.bun >= 1.2`).
- **Only runtime dependencies are `@optique/core` and `@optique/run`** (`package.json:34-37`). Everything else is a devDependency (`package.json:38-46`).
- `bin.giwt → src/cli.ts` (`package.json:12-14`); `exports["."] → src/index.ts` (`package.json:8-11`).
- **There is no network client anywhere in `src/`.** A grep for `fetch|Bun\.connect|node:https|node:http|WebSocket|net\.connect|XMLHttpRequest|require\("http` across `src/` returns **only string literals, no call sites** — the error text `"failed to fetch PRs"` (`src/commands/prs.ts:45`), git subcommand names in the passthrough allowlist (`src/git/policy-tables.ts:72`), and flag strings (`src/git/policy.ts:64`). Every external interaction is a subprocess (`Bun.spawnSync`) or a file read/write.
- loop-lore pins it as a git dependency: `package.json:145` (`"giwt": "github:flakusha/giwt"`), resolved at `bun.lock:1386` to `giwt@github:flakusha/giwt#2b99649`.

### 1.2 Dispatch pipeline (the central seam)

`main()` (`src/cli.ts:89-171`) runs a fixed, ordered pipeline:

1. **Empty argv → `["help"]`**, so bare `giwt` prints help and exits 0 (`src/cli.ts:91-92`).
2. **`giwt help <cmd>` short-circuits** before Optique parses, via `printCommandHelp` (`src/cli.ts:96-105`, `src/cli.ts:80-87`).
3. **Optique parse** — `run(buildParser(), {...})` (`src/cli.ts:108-117`); parse errors, `--help`, `--version` exit inside `run()`.
4. **`giwt <cmd> --help` / `-h` is intercepted centrally** (`src/cli.ts:122-125`) because handlers own their flags.
5. **`loadConfig()`** (`src/cli.ts:127`), then the **root-only guard**: `ROOT_ONLY_COMMANDS` (`src/cli.ts:63-76`, applied at `src/cli.ts:128-130`) forces `cleanup|create|merge|new|remove` to run from the main repo root. The comment at `src/cli.ts:64-68` states the guard is applied centrally *so new commands cannot forget it*.
6. **`--say` extraction** — `extractSayArgs` strips say-flags before dispatch (`src/cli.ts:135`; `src/utils/ledger.ts:94`).
7. **Output-format resolution** — settings `[output].format` then `setColorMode` (`src/cli.ts:139-141`); an explicit `--json|--toml|--emoji` forces JSON and moves banners to stderr (`src/cli.ts:143-151`).
8. **Silent-command skip** — `LEDGER_SILENT_COMMANDS` (`src/cli.ts:153`; table `src/utils/ledger.ts:45-48`).
9. **Run record + ledger append** (`src/cli.ts:155-165`), before the handler runs.
10. **`handler.action(cleanArgs, config)`**, then `runRec.finish(realExitCode)` (`src/cli.ts:167-169`); a throw → `log("error")` + `finish(1)` + `exit(1)` (`src/cli.ts:170-175`).

### 1.3 Extension seams — how to add a command

**Seam A — the registry.** `commands: Record<string, CommandHandler>` (`src/cli-registry.ts:57`; handler type `:52-55`):

```ts
export interface CommandHandler {
  description: string;
  run: (args: string[], config: WorktreeConfig) => Promise<void>;
}
```

One entry in that table (`src/cli-registry.ts:57-226`) + one import. **There is no plugin hook for external commands** — the registry is a static literal.

**Seam B — the parser.** `buildParser()` (`src/cli.ts:55-61`) maps registry entries to `command(name, object({ action: constant(def.run), args: withDefault(passThrough({format:"greedy"}), []) }))` (`src/cli.ts:43-52`). Two consequences:

- **Handlers own their own arg parsing** — the pre-Optique contract (`src/cli.ts:36-41`, `AGENTS.md:12`). Optique only knows the generic `[[...]]` synopsis.
- `or()` takes at most 15 branches, so `buildParser()` chunks entries into groups of 15 (`src/cli.ts:53-61`). **Adding a command is free of parser changes** — the chunking is automatic, so the 42nd key needs no hand-editing. (Caveat: `groups` are themselves spread into an outer `or()`, `src/cli.ts:60`, so this nesting is one level deep today; it was not stress-tested beyond the current 41.)

**Seam C — usage text.** `USAGE: Record<string, string>` (`src/cli-usage.ts:10-80`). `AGENTS.md:12` says in bold: *"update those when changing a command or its flags."* Entries may be `""` (`"branches"`, `"cleanup"`, `"gpg-unlock"`, `"prs"`, `"report"` — `src/cli-usage.ts:17,20,43,58,63`).

**Seam D — naming.** `AGENTS.md:61`: command keys must match their `src/commands/<key>.ts` module, with the one documented exception `new → new-branch.ts`.

**Seam E — the ledger.** `LEDGER_SILENT_COMMANDS` (`src/utils/ledger.ts:45`) — add a key only for pure readers.

**Seam F — config.** New TOML keys must be added to `SCHEMA` (`src/utils/settings-schema.ts:12-43`) **and** `EXPECTED` (`:45-79`) or they are warn-ignored (`AGENTS.md:75`).

### 1.4 Arg-parsing conventions (three coexisting styles)

| Style | Where | Pattern |
|---|---|---|
| Hand-rolled left-to-right scan | `src/commands/ledger.ts:20-36`, `issues.ts:26-64`, `doctor.ts:169-193` | `for (let i=0;i<args.length;i++)`, `--flag` and `--flag=value`, unknown flag → `log("error")` + usage + `process.exit(1)` |
| Extracted arg module | `src/commands/ticket/args.ts`, `task/args.ts` | `parseTicketArgs` (`ticket/args.ts:82`), `TaskArgError` (`task/args.ts:47`); flags consumed before **or** after positionals, `--` ends flag parsing, unknown `-`-tokens fall through as positionals (`ticket/args.ts:75-81`) |
| Shared out-flags | `src/utils/emit.ts:19` | `parseOutFlags(args) → { format, rest }`; precedence json > toml > emoji; caller warns once on duplicates (`runs.ts:215-217`) |

**Flag vocabulary is a `Record<string, true>` static table**, never a `Set` (`AGENTS.md:58`): `FLAG_TOKENS` (`ticket/args.ts:6-17`), `task/vocab.ts:10-39`, `VALID_STATES` (`issues.ts:10`), plus `NO_VALUE_FLAGS` / `VALUE_VOCAB` (`task/vocab.ts:48-62`).

### 1.5 Test conventions

- **Runner is `bun test`; ~30 colocated `*.test.ts` files, no test directory** (`AGENTS.md:90`).
- Two documented idioms:
  - **In-process pure functions** — e.g. `isOrphanRebaseMarker` over an injected `FsOps` map (`abort-orphan-marker.test.ts:1-24`).
  - **CLI subprocess against a fixture repo** — `Bun.spawnSync(["bun", CLI, ...args], { cwd: root, env: {...process.env, REPO_ROOT: root} })` (`runs.test.ts:30-45`).
- **Parallel-safety is a stated contract**: every test owns a private `mkdtempSync(join(scratchRoot(), "giwt-<cmd>-<slug>-"))` root removed in `afterEach`/`finally` (`runs.test.ts:47-49`, `clean.test.ts:5-13`, `abort.test.ts:12-13`).
- **Child git must be spawned with `isolatedGitEnv()`** to strip `GIT_*` plus `OMP_`/`PI_`/`ENGRAM_`/`MNEMO_` (`AGENTS.md:92`; `src/utils/git.ts:152-156`).
- **Output captured by `spyOn(process.stdout, "write")`** — never `console.log` spies; the logger writes via `raw()` (`AGENTS.md:94`).
- **Coverage is a ratchet** (`.coverage-baseline.json`, inside `bun run check`) — new code must arrive with tests (`AGENTS.md:91`).
- Tests are **exempt from the 250-line size budget** (`scripts/check-file-size.ts:107-122`).

### 1.6 Enforced conventions / banned patterns

`bun run check` (`package.json:32`) = `fmt:check` → `lint` → `lint:md` → `lint:sh` → `deadcode` → `duplication` → `size` → `tsc --noEmit` → `coverage`.

| Rule | Source | Enforcement |
|---|---|---|
| **Never `console.*`** — use `log(level,msg)` / `raw(msg)` / `section()` | `AGENTS.md:57` | convention + test technique |
| **Static string-keyed tables → `Record<K,V>`**; `Set`/`Map` only for dynamic membership | `AGENTS.md:58` | convention |
| **File ≤250 content lines** (300 ceiling); `// size-allow: N` header grants the top tier | `AGENTS.md:60`, `scripts/check-file-size.ts:29,44` | `bun run size --strict` |
| **Options-object params for functions with 3+ positional params** | `AGENTS.md:62` | oxlint JS plugin `giwt-style/options-object-params` at `warn` (`.oxlintrc.json:8,11`; `.oxlint/plugins/giwt-style.js:4-6`) |
| **AGPL-3.0-or-later SPDX header on every file** | `AGENTS.md:59`; pre-commit warns (`AGENTS.md:51`) | hook + `plan validate` `spdx` gate (`src/plan/validate/types.ts:18`) |
| **`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, narrow over `!`** | `AGENTS.md:65` | `tsc --noEmit` |
| **knip dead-code + jscpd duplication** — an unused export or copy-paste block fails | `package.json:29-30` | `bun run check` |
| **Never hand-format** (dprint owns it) | `AGENTS.md:59` | `fmt:check` |

There is **no separate "banned patterns" file**; the closest are oxlint correctness=error / suspicious=warn (`.oxlintrc.json:3-6`) and the `Co-Authored-By:` denylist in `.githooks/commit-msg` (`AGENTS.md:52`).

---

## 2. Full current command surface (FACT)

All 41 keys in `src/cli-registry.ts:57-226`; purposes are the registry `description` fields, flags from `src/cli-usage.ts`.

### Worktree lifecycle

| Command | Purpose | Flags |
|---|---|---|
| `new` | Create new branch + worktree | `<branch> [base] [--scope <text>] [--tickets <csv>]` (`cli-usage.ts:54-55`) |
| `create` | Create worktree for an **existing** branch | `<branch>` (`:31`) |
| `prs` | Create worktrees for open PRs (via `gh`, auth-checked `prs.ts:22-36`) | none (`:58`) |
| `remove` | Remove a worktree; `--branch-only` deletes a bare branch | `[--branch-only] [--force]` (`:61-62`) |
| `cleanup` | Remove stale worktrees for deleted branches | none (`:20`) |
| `list` | Show all worktrees with status | `[--json\|--toml\|--emoji]` (`:50-51`) |
| `branches` | List branches with status | none (`:17`) |
| `status` | Branch sync status | `[branch]` (`:73`) |
| `diff` | Show diff for a worktree branch | `<branch>` (`:32`) |
| `rebase` | Rebase a worktree branch onto a target | `<branch> [onto] [--autostash]` (`:59-60`) |
| `merge` | Merge a source branch into a worktree branch | `<branch> <source> [--allow-author-override]` (`:52-53`) |
| `finalize` | Validate, merge, remove worktree, delete branch | `[--merge-strategy rebase\|squash\|direct] [--force] [--gates <csv>] [--skip-gates <csv>] [--plan-gates <csv>] [--jobs <n>] [--allow-author-override]` (`:37-38`) |
| `agent-merge` | Alias for `finalize` (thin delegate, `agent-merge.ts:11-16`) | passes through |
| `abort` | Manually recover a finalize that left the tree in a bad state | `[--dry-run]` (`:11`) |
| `sign` | Configure GPG signing for an existing worktree | `<branch>` (`:70`) |

### Git safety and commits

| Command | Purpose | Flags |
|---|---|---|
| `git` | Safety-gated git passthrough (allowlist + destructive/gpg guard, run-record capture, rtk compaction); the harness reroutes raw `git` here | `[--] <git args...>` (`:41-42`); `[git] rtk/safe/allow/deny/classify` (`settings-schema.ts:42`) |
| `commit` | GPG-signed commit on the current branch | `[-F <file>] "<msg>" [--on-protected] [--no-verify] [--allow-author-override]` (`:27-28`) |
| `commit-wt` | GPG-signed commit in a worktree | `<branch> [-F <file>] ...` (`:29-30`) |
| `gpg-unlock` | Warm/verify the GPG agent passphrase cache | none (`:43`) |
| `gripe` | Vent at another agent on the shared ledger | `[--at <branch>] <message...>` (`:44-45`) |

### Tickets / issues

| Command | Purpose | Flags |
|---|---|---|
| `ticket` | Create ticket file + git issue; `close`/`copy`/`3way` subactions | `<TYPE> <title> [body]` + `--label/--priority/--epic/--effort/--tag/--upstream`; TYPE ∈ `BUG\|FEAT\|FIX\|IDEA\|TASK\|SOL\|INFRA` (`ticket/create.ts:13`) (`:78-79`) |
| `show` | Issue details + comments | `[--json\|--toml\|--emoji]` (`:68-69`) |
| `search` | Search issues by text | `<pattern> [--json...]` (`:66-67`) |
| `issues` | List issues | `[--all\|-a] [--state <v>] [--format <f>]` (`:46-47`) |
| `state` | Change issue state | `<ID> <open\|closed>` (`:71-72`) |
| `comment` | Add a comment | `<ID> <message...>` (`:25-26`) |
| `edit` | Edit issue metadata | `<ID> [git-issue edit options...]` (`:35-36`) |
| `attach` / `attach-dir` | Attach file / directory to an issue as a comment | `<ID> <FILE>` / `<ID> <DIR>` (`:14-15`) |
| `gi` | Run git-issue verbatim | `<git-issue args...>` (`:39-40`) |
| `sync` | Reconcile `.plan/tickets/*.md` + `.plan/epics/*.md` ↔ `index.json` ↔ git issues | `[--fix] [--import] [--import-back] [--verbose] [--diff-base <ref>]` (`:74-75`); `--import/--import-back` require `--fix` (`sync.ts:57-60`) |

### Plan / docs / gates

| Command | Purpose | Flags |
|---|---|---|
| `plan` | `.plan/` tooling | `code-map` (`--check --find <path>`), `gen-docs` (`--check`), `check-links`, `validate` (`--gates/--skip-gates/--fix/--diff-base/--json`), `status` (`--tickets`), `matrix` (`--check --json --cooccurrence`) (`:56-57`, `AGENTS.md:29`) |
| `backlog` | `.plan/backlog/` index ↔ tier files | `sync [--fix] [--verbose]` (`:16`) |
| `docs` | List / show / search / dump / **sync-agents** the repo markdown corpus | `--dir <path>`, `--json\|--toml\|--emoji` (`:23-24`, `docs.ts:40-45`) |
| `doctor` | Setup dev tooling, or `check` repo health, or `scratchpad` report | `[--apply] [--tool <csv>] [--root <dir>]` / `check [--json] [--checks <csv>] [--jobs <n>] [--timeout <ms>]` / `scratchpad [--json]` (`:33-34`) |

### Observability / agent coordination

| Command | Purpose | Flags |
|---|---|---|
| `ledger` | Show recent agent ledger records | `[--last N] [--json]` (`:48-49`) |
| `report` | Aggregate check-report status across worktrees | none (`:63`) |
| `runs` | List run records; `triage` failures; `diff` two runs; `stats` | `[--last N] [--json...]` (`:64-65`) |
| `task` | Render an agent task prompt (flags → guidance, user directive last) | `-m/-d/--message/--directive`, `-F/--file`, `-j/--jobs`, `-a/--agents`, `--good/--fast`, `-g/--gates`, `--strict`, `--shallow/--deep`, `-s/--skills`, `-w/--worktree`, `--base`, `--tickets`, `--follow`, `--careful`, `--docs`, `--roster`, `--vocab` (`:76-77`, `task/vocab.ts:10-39`) |

### Scratch hygiene

| Command | Purpose | Flags |
|---|---|---|
| `clean` | Age/size-capped pruning of `.tmp` scratchpad (dry-run default) | `[--dry-run] [--apply] [--json...] [--verbose]` (`:18-19`) |
| `tmp` | Analyze the machine temp root, prune stale test fixtures (dry-run default) | `[--dry-run] [--apply] [--json...] [--max-age-hours <n>]` (`:21-22`) |

---

## 3. Capability map

Legend: **(a)** already in giwt · **(b)** natural giwt extension · **(c)** loop-lore proper · **(d)** the harness. Section is **RECOMMENDATION** except the cited "FACT" lines.

### 3.1 Jira / non-git issue-tracker sync and import — **(b), narrowly**

**FACT:** giwt's issue layer is hardwired to `git issue` as a subprocess — `issues.ts:67-70`, `search.ts:68`, `show.ts:117`, `state.ts:31`, `comment.ts:26`, `edit.ts:26`, `attach.ts:38`, `ticket/create.ts:160-186`, `ticket/close.ts:107-110`, `scoped-worktree.ts:237-240`, and `resolveExtid` scanning `git issue ls --all` (`resolver.ts:65`). **No HTTP client** in `src/` (grep `fetch(` = 0). **No jira string anywhere in giwt's `src/`.** `runSync` reconciles markdown ↔ `index.json` ↔ git issues only (`AGENTS.md:15`).

**RECOMMENDATION:** a read-only, pull-only import is a natural extension because `sync --import-back` already means "generate `.md` + index for **foreign git issues**" (`cli-usage.ts:75`) — Jira is the same shape with a different subprocess source. A *push* sync is **not** recommended: it needs auth, retry, and conflict policy, none of which exist.

### 3.2 MCP server management from the CLI — **(d), one (b) carve-out**

**FACT:** no MCP concept in giwt (grep `mcp` in `src/` hits only unrelated strings — `.opencode/`, `.playwright-mcp/` in the gitignore generator `src/doctor/generators/gitignore.ts:53`, plus dprint/eslint "plugins"). loop-lore documents `~/.omp/agent/mcp.json` with `mcpServers` and `type: http|stdio` (`docs/research/harness-mcp-wiring.md:47-50`) and reserves `src/integrations/mcp/` for its own bridge (`docs/research/harness-mcp-wiring.md:70`).

**RECOMMENDATION:** `giwt mcp list/test/call` is **not** giwt — MCP config is per-user harness state, not repo state, and an `mcp` key would sit in `[branches]/[paths]/[commands]/[doctor]` where nothing about it belongs (`settings-schema.ts:12-43`). The one legitimate slice: `doctor check --checks mcp` verifying that servers a repo depends on are reachable — that is exactly what `doctor check` is (`CHECK_IDS`, `src/doctor/check/types.ts:18-27`). Low-ranked (E4).

### 3.3 Plugin / marketplace install and pinning — **(c), not giwt**

**FACT:** loop-lore owns the plugin system in `src/plugins/` (`loader.ts`, `registry.ts`, `bundles.ts`, `config-store.ts`, `config-merge.ts`, `event-bus.ts`, `mount-points.ts`). giwt's only "plugin" strings are config generators (`src/doctor/generators/dprint.ts:25-28`, `eslint.ts`, `semantic-release.ts`, `remark.ts`) and its own oxlint JS plugin (`.oxlintrc.json:8`).

**RECOMMENDATION:** not giwt. A second implementation in a git-pinned CLI forks the schema and drifts immediately.

### 3.4 LLM call inspection, routing config, context budgeting — **(c), not giwt**

**FACT:** loop-lore already has the harness exec-log subsystem: `src/harness/exec-log.ts` (append-only `.harness/executions.jsonl`, best-effort writes, `exec-log.ts:4-14`), `exec-recorder.ts` (writer's only real caller, `:5-9`), `query.ts` (bounded tail reads; `MAX_LINES = 20_000`, `READ_WINDOW_BYTES = 4 MiB`, `:30-36`), `stats.ts`, `run-context.ts`, `types.ts`/`types-wire.ts`. LLM orchestration is in `src/llm/` (`concurrency-limiter.ts`, `resource-manager.ts`, `message-state-machine.ts`, `priority-queue.ts`).

**RECOMMENDATION:** not giwt, on three grounds: (1) it needs an HTTP client and giwt has **zero** network code — adding one changes its security posture wholesale; (2) it already exists; (3) it is per-process runtime state with no git artifact. Git provenance is already attached at the right place: `exec-recorder.ts:88` calls `getGitContext()`.

### 3.5 Test/gate orchestration, worktree batching, parallel agent coordination — **(a) mostly done; (b) for the batch loop**

**FACT — already in giwt:**
- Gate fan-out inside finalize: `--gates/--skip-gates/--plan-gates/--jobs` (`cli-usage.ts:38`) with a lock-protected, full-jitter FIFO-ticket queue (`AGENTS.md:16`).
- Bounded check pool + per-check timeouts + memory clamp: `[doctor] jobs` (default 1), `[doctor] timeout_ms` (default 120000), `[doctor] memory_budget_mb` (`AGENTS.md:19`; `settings-schema.ts:22-30`).
- Gate vocabulary: `ALL_GATES` = format, linkage, backlog, tickets, code-map, links, spdx, naming, epics-doc, status-vocab, matrix (`src/plan/validate/types.ts:25-37`); `FIXABLE_GATES` at `:40-47`.
- Cross-worktree aggregation: `report` (`report.ts:84-128`) and `runs` (`runs.ts:201-270`).
- Agent-coordination primitives: append-only ledger + lock (`utils/ledger.ts`, `ledger-core.ts`, `ledger-lock.ts`, `ledger-read.ts`), `gripe`, `docs sync-agents`.

**RECOMMENDATION:** the one gap is a **batch** loop — run a command across N worktrees and aggregate. Today an agent must shell out and parse `report --json`. Small, fits existing seams (E2).

### 3.6 Memory / context capture commands — **(d)/(c) split**

**FACT:** giwt owns the two *git-native* artifacts — the agent ledger `.ledger.jsonl` (`utils/ledger.ts:126`, read at `ledger.ts:38`) and run records under `<repoRoot>/<paths.runlog>/runs/` (`runs.ts:41-43`, `AGENTS.md:13`). loop-lore owns semantic memory (`src/memory/`: `history-search.ts`, `embeddings.ts`, `rerank.ts`, `extraction-store.ts`, `shareability.ts`, `audit.ts`, `purge.ts`) and the exec-log read side (`src/harness/query.ts`).

**RECOMMENDATION:** session *handoff* text is harness/loop-lore territory — conversational content, not repo state. giwt already has the right primitive: `--say` on every command (`src/cli.ts:135`), recorded into the ledger as `msg :: <said>` (`AGENTS.md:14`). **No new command — document `giwt ledger --json --last N` as the handoff input.** The one legitimate (b) is a combined machine-readable ledger+runs export, since handoff needs two parses today (E3).

### 3.7 TTS or any asset/media side work — **(c), definitively not giwt**

**FACT:** loop-lore owns the media seam: `src/generation/audio-prompt-profiles.ts` (profiles for ElevenLabs v3, OpenAI TTS, Piper, Bark, Stable Audio, MusicGen, Riffusion — `:108-114`), `audio-prompt-templates.ts` (which states *"Audio generation has no provider yet (FEAT-089/090/091 are future)"* — `:11-12`), `src/assets/` (`controller.ts` 21.3 KB, `service/`, `alpha-detect.ts`), and the cancellation side-effect registry (`src/generation/cancellation-actions/side-effects.ts`, job `kind: "tts" | "image-queue" | "other"`).

**RECOMMENDATION:** application functionality with a database, an HTTP API, and a UI. Zero shared seams with worktree/ticket/git-issue management.

---

## 4. Concrete designs for the "natural giwt extension" picks

Five picks: **E1** tracker pull-import, **E2** `giwt batch`, **E3** `giwt ledger --export`, **E4** `doctor check --checks mcp`, **E5** `giwt ticket --from`. Each sized to the 250-line budget and existing seams.

### E1 — External tracker pull-import (new `tracker` command)

**Where it lives:** `src/commands/tracker.ts` + `src/tracker/<name>.ts` per tracker. It does **not** extend `runSync` — that reconciler must stay git-issue-only (`AGENTS.md:15`).

**Surface (RECOMMENDATION):**

```
giwt tracker pull <jira|github> [--project <key>] [--since <date>] [--dry-run]
                  [--json|--toml|--emoji] [--limit <n>]
giwt tracker list
```

- **Reads:** the tracker's read API *as a subprocess* (e.g. `gh issue list --json …`, matching the existing `gh` auth-check precedent `prs.ts:22-41`). No HTTP client added to giwt.
- **Writes:** nothing by default. With `--apply`, it emits the `.md`/index records that `sync --import-back` (`cli-usage.ts:75`) already generates — hand off, don't duplicate. Default is dry-run, matching `clean.ts:9` and `tmp` (`cli-usage.ts:21-22`).
- **Settings (RECOMMENDATION):** `[tracker] cmd = "<argv template>"` — a template string. Rationale: giwt's schema is `Record<section, Record<key, type>>` with flat scalars/arrays only (`settings-schema.ts:12-43`); a nested per-tracker object would be the first of its kind. Richer config belongs in the tracker's own file.
- **Error contract:** follow `sync.ts:49-56` — unknown flag → `log("error")` + usage + `process.exit(1)`, before any mutation.

**Tests that would prove it:**
1. `--dry-run` with a stubbed spawn prints a plan and creates no file (mirror the dry-run-is-default coverage implied by `cli-usage.ts:19`).
2. `--json` parses back to `{items:[{key,title,state,url}]}` via `renderRecords` (`emit.ts:47`).
3. Unknown flag exits 1 **and writes nothing** (the `sync.ts:49-56` contract).
4. A missing tracker CLI (`which` fails, as `prs.ts:22-26`) exits 1 naming the binary.
5. `--apply` on an already-imported key is idempotent (second run reports 0 new).

### E2 — `giwt batch` (worktree fan-out)

**Where it lives:** `src/commands/batch.ts`, split at 250 lines if needed (the `abort/helpers.ts` precedent, `abort/helpers.ts:5-8`).

**Surface (RECOMMENDATION):**

```
giwt batch <run|finalize|check> [args...] [--branches <csv>] [--jobs <n>]
          [--dry-run] [--json|--toml|--emoji]
```

- **Reads:** the same worktree list `list`/`report` read — `getWorktrees(repoRoot)` (`utils/git.ts:225`), the same call `report.ts` and `cleanup.ts:19` use.
- **Writes:** nothing new — run records + ledger lines arrive free via the central wrapper (`src/cli.ts:155-165`).
- **Concurrency:** MUST reuse the doctor pool's memory clamp rather than reinventing it — `effectiveJobs = floor(availableMemMb / DOCTOR_PER_WORKER_MEM_MB)`, 1024 MB/worker, `[doctor] memory_budget_mb` override (`AGENTS.md:19`). Copying that arithmetic is a jscpd hit and a drift risk.
- **Root-only guard:** NOT in `ROOT_ONLY_COMMANDS` (`src/cli.ts:69-76`) — like `finalize`, it resolves targets from arguments and is cwd-independent (the documented exemption, `src/cli.ts:64-68`).

**Tests that would prove it:**
1. N worktrees × 1 fake action → N ledger lines, one per branch, each with its own run record dir (seed via the `runs.test.ts:24-28` pattern, assert via `listRuns`).
2. `--jobs 1` output is byte-identical to `--jobs 4` (order-independence is the suite's stated goal, `runs.test.ts:12`).
3. One failing branch does not abort the others; aggregate exit 1 names each failure.
4. Zero matching branches exits 0 with an empty JSON array, not 1 (`renderRecords` on `[]` returns `""` for toml — `emit.ts:41-45`; assert the documented empty-input behavior).

### E3 — `giwt ledger --export` (handoff feed)

**Where it lives:** extends `src/commands/ledger.ts` (50 lines today — well under budget). Smallest possible win.

**Surface (RECOMMENDATION):**

```
giwt ledger [--last N] [--json] [--export <path>] [--with-runs] [--branch <name>]
```

- **Reads:** `readLedger(config.treeDir, last)` (`ledger.ts:38`) and, with `--with-runs`, `listRuns` (exported at `index.ts:81`).
- **Writes:** one JSON document via plain `Bun.write`, matching `writeScopedMeta` (`scoped-worktree.ts:53-55`). No new format.
- **Why this is a handoff command, not a memory command:** it emits the two artifacts a handoff needs, already normalized (resolved branch, `--say` text, run outcome). It invents no conversation format.

**Tests that would prove it:**
1. `--json --last 3` round-trips to 3 records (existing style, `runs.test.ts:52-73`).
2. `--with-runs` merges ledger + run records keyed by timestamp and parses back.
3. `--export <path>` writes the same bytes `--json` prints (byte-equality, not field-equality).
4. `--export` to an unwritable path exits 1 with a `"<path>: <problem>"`-shaped message (`AGENTS.md:63`).
5. An empty ledger exports `[]` and exits 0 — do not regress `ledger.ts:43-46`.

### E4 — `doctor check --checks mcp`

**Where it lives:** registration in `src/doctor/check/entry.ts` + a new `src/doctor/check/mcp.ts`, mirroring existing per-check modules (`src/doctor/check/{parse,run,scans,spawn,tools,todo}.ts`).

**Surface (RECOMMENDATION):** none. Add the literal `"mcp"` to `CHECK_IDS` (`src/doctor/check/types.ts:18-27`); it becomes selectable through the existing `--checks <csv>` flag (`cli-usage.ts:34`; validation `doctor/check-cmd.ts:76-83`). Zero new user-facing syntax.

- **Reads:** the servers the repo declares (loop-lore's `mcpServers` config section, if any), probing each transport.
- **Writes:** nothing.
- **Hard constraints:** bounded by `[doctor] timeout_ms`, `defaultSpawn` passing `AbortSignal.timeout` (`AGENTS.md:19`); through `boundedSpawn` so an injected spawn cannot pin a pool slot; a timeout is a **check error naming the command and budget**, not a thrown exception (`AGENTS.md:19`); a repo with no MCP config drops out of `applicableChecks` rather than failing (`entry.ts:145`).
- **Requires:** update `doctor`'s hardcoded check list at `doctor.ts:165`, and `cli-usage.ts:33-34`.

**Tests that would prove it:**
1. `expect(CHECK_IDS).toContain("mcp")` — the exact assertion already used for `leaks` (`leaks.test.ts:207-209`).
2. Runs through `runDoctorChecks` against a fixture with a bogus server URL and yields a `CheckResult` with `severity: "error"`, **not** a throw (`leaks.test.ts:211`).
3. A repo with no MCP config → the check is absent from the report (`applicableChecks`, `entry.ts:145`).
4. An unreachable server returns within the timeout budget; the finding names both the server and the budget.
5. `--checks mcp` alone returns exactly one result (`entry.ts:146-148`).

### E5 — `giwt ticket --from <KEY>`

**Where it lives:** `--from` + value token added to `FLAG_TOKENS` (`src/commands/ticket/args.ts:6-17`), handling in `src/commands/ticket/create.ts` (which already owns the create-then-annotate sequence at `:160-186`).

**Surface (RECOMMENDATION):**

```
giwt ticket <TYPE> <title> [body] --from <KEY> [--tracker <name>]
```

- **Reads:** the key stashed by E1's `--apply`, or re-fetched through the same tracker seam.
- **Writes:** the standard ticket `.md` **plus** the standard git issue, via `create.ts:160-186` unchanged. The `Plan spec:` comment at `:172` and the single-`edit`-invocation label rule at `:173-181` must be preserved exactly.
- **Why this seam and not a new command:** ticket *body* generation is load-bearing against the plan gates — `create.ts:60-63` states the template must emit exactly what the `format` and `status-vocab` gates accept. Duplicating it in a tracker command would guarantee a second source of truth for a gated format.

**Tests that would prove it:**
1. `--from KEY` produces a `.md` that passes `plan validate` (assert both the issue exists and the md validates — the `ticket.test.ts:355-358` pattern).
2. The `--from` token is consumed as a flag and never leaks into the ticket body (the `--no-verify` non-forwarding contract, `commit-wt.test.ts:11-12`).
3. `--from UNKNOWN-KEY` exits 1 **before any git mutation** (the `new-branch.ts:31-32` pre-flight pattern).
4. `--from` + `--label` keeps single-`edit` semantics (`create.ts:173-181`).
5. `--from` still parses when it follows the positional body (`ticket/args.ts:75-81` — this regression already has a ticket: `BUG-giwt-ticket-drops-flags-that-follow-the-positional-body`).

---

## 5. Ranked shortlist (RECOMMENDATION)

| # | Item | Value | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **E3 `ledger --export`** | High | **Trivial** | `ledger.ts` is 50 lines; `readLedger` and `listRuns` already exist and are exported (`index.ts:42-55,75-84`). Every agent handoff hand-rolls two parses. No new seam touched. |
| 2 | **E5 `ticket --from`** | High | Small | Reuses the gated ticket template instead of duplicating it; extends an existing `FLAG_TOKENS` table. Kills the "hand-wrote the .md and `plan validate` rejected it" class. |
| 3 | **E2 `giwt batch`** | High | Medium | The one genuine orchestration gap. Reuses `getWorktrees` and the doctor memory clamp; adds no new persistence. |
| 4 | **E4 `doctor check --checks mcp`** | Medium | Medium | Zero new syntax (one string in `CHECK_IDS`); pool/timeout/memory discipline already built. Value is capped by whether loop-lore ships a repo-level `mcpServers` section — if not, premature. |
| 5 | **E1 `tracker pull`** | Medium | **Large** | High value *if* a non-git tracker is in use; large because auth, argv templating, and idempotency all need designing, and it would be the first non-git/non-lint binary giwt shells out to beyond `gh`. Gate it on demand. |
| 6 | **`docs sync-agents` extension** (already exists) | Low | Small | `docs.ts:45` already ships `sync-agents --dir <path>`. Only worth extending if a skill/plugin distribution format is needed; likely superseded by the harness's own skills system. |

---

## 6. What should NOT go into giwt (with reasons)

1. **MCP server management (`giwt mcp list/call/configure`).** *(d)* — MCP config is per-user harness state (`~/.omp/agent/mcp.json`, `docs/research/harness-mcp-wiring.md:47-50`), not repo state. A shared repo file describing a machine's private server set is the wrong shape. loop-lore already reserves `src/integrations/mcp/` (`docs/research/harness-mcp-wiring.md:70`). The only legitimate slice is E4 (a repo-health *check*), not a management command.
2. **LLM call inspection / routing config / context budgeting.** *(c)* — already built in loop-lore (`src/harness/*` read/write, `src/llm/*` orchestration). Adding it to giwt needs the **first HTTP client in a codebase with zero**, forks an existing schema, and puts runtime state in a git-pinned dependency. Git provenance is already attached at the right place (`exec-recorder.ts:88` calls `getGitContext()`).
3. **Plugin / marketplace install and pinning.** *(c)* — loop-lore owns `src/plugins/` (`registry.ts`, `loader.ts`, `bundles.ts`, `config-store.ts`); a second implementation forks the schema. `giwt` itself is the cautionary tale: `bun.lock:1386` pins it to a bare git SHA (`#2b99649`), so every giwt release is a lockfile edit + reinstall in every consuming repo — a marketplace install command inside giwt would be managing its own delivery problem.
4. **TTS / asset / media work.** *(c)* — application functionality (`src/generation/audio-prompt-profiles.ts`, `src/assets/`, `src/generation/cancellation-actions/side-effects.ts`) with a database and an HTTP API behind it. Zero shared seams.
5. **Session-handoff prose / semantic memory capture.** *(d)* — conversational content, not repo state. giwt already has the primitive: `--say` on every command (`src/cli.ts:135`), recorded as `msg :: <said>` (`AGENTS.md:14`), plus run records. A new command duplicates it. Use E3's export as the feed.
6. **A generic plugin/extension mechanism for giwt itself.** — the registry is a static `Record<string, CommandHandler>` (`src/cli-registry.ts:57`) and the parser is built eagerly from `Object.entries` (`src/cli.ts:56`). Runtime discovery would need a trust model, break knip's dead-code gate, and break the coverage ratchet (`.coverage-baseline.json`) for dynamically-loaded modules. Commands ship from the giwt repo or not at all.
7. **Pushing to non-git trackers (Jira write-back).** *(b, explicitly deferred)* — read-only pull is defensible; two-way sync needs conflict resolution, retry, and auth refresh, and giwt has **no** network client, **no** secret store beyond the `.credentials.env` GPG identity (`config.ts:24-26,29-38`), and **no** idempotency story for a remote side effect. Failure mode: a silent duplicate-issue storm.

---

## 7. Open questions for the integrator

- **RECOMMENDATION / unresolved:** does loop-lore intend a repo-level `mcpServers` section? E4 is worthless without one and worth little with one.
- **RECOMMENDATION / unresolved:** is a non-git tracker actually in use? If not, drop E1 rather than build it speculatively — it is the only large-effort pick with a demand assumption.
- **FACT / note:** giwt is AGPL-3.0-or-later (`package.json:6`), loop-lore is LGPL-3.0-or-later (`package.json:6`); giwt is a normal npm-installed git dependency, not a vendored copy. `[UNVERIFIED]` — I did not read loop-lore's LICENSE or run a license check.
- **FACT / note:** loop-lore keeps a legacy parallel CLI at `scripts/worktree/index.ts` with its own hand-maintained command table (`scripts/worktree/index.ts:10-40`, `gi` entry `:115-118`) shadowing giwt's surface. If giwt gains a command that is a second place to update. Whether it is still live is `[UNVERIFIED]` — I read only its header and registry block.
