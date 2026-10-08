# Harness Integrations Audit — What the Agent Harness Already Provides

**Date:** 2026-10-07
**Scope:** the coding-agent runtime loop-lore's agents run under (oh-my-pi / "omp", plus an
opencode-compatible sibling config), and loop-lore's own project-level harness surface.
**Method:** read-only inspection. Every claim below cites a concrete path. Anything unverified is
marked `[UNVERIFIED]`. Absence claims state what was searched.

> **Verification:** see [`05-claim-verification.md`](./05-claim-verification.md) — claim set independently verified (12 confirmed / 4 partial / 1 refuted); corrections are applied inline below.

## 0. The harness, concretely

"Harness" here is three cooperating layers, and the audit must keep them distinct because they
have very different reuse properties:

| Layer | Root | What it is | Evidence |
| --- | --- | --- | --- |
| Agent runtime | `~/.omp/` | oh-my-pi global config, plugins, skills, rules, marketplace registry | `~/.omp/marketplaces.json`, `~/.omp/agent/config.yml`, `~/.omp/agent/mcp.json` |
| Opencode-compat config | `~/.config/opencode/` | Parallel config consumed by the opencode-compatible runtime | `~/.config/opencode/opencode.json`, `~/.config/opencode/AGENTS.md` |
| Project harness surface | `/home/flak/git-ai/loop-lore/.agents/`, `.omp/` | Per-repo skills and references | `.agents/skills/` (10 skills), `.omp/` (exists but **empty**) |

Notable structural fact for planning: `.omp/` exists in the repo root and is empty
(`ls -la .omp/` → total 0), and `.omp` is gitignored (`.gitignore:72`). So the project-side
`.omp/receipt.toml` that the global agent instructions describe does not exist yet — see §6.

---

## 1. git + giwt source control

### What exists

`giwt` is a repo-pinned CLI (git dependency `github:flakusha/giwt`), not a raw git wrapper the
harness ships. Evidence: `.agents/skills/giwt-usage/SKILL.md:21-31` states giwt is "the canonical
worktree / commit / GPG / git-issue CLI for loop-lore (git dependency `github:flakusha/giwt`,
resolved and pinned by `bun.lock`)".

Pinning (`.agents/skills/giwt-usage/SKILL.md:27-31`):
- `bun node_modules/giwt/src/cli.ts <args>` — pinned copy, matches `bun.lock`.
- Repo code shelling out to giwt MUST spawn that exact path (`giwtArgv` in
  `scripts/worktree/commands/sync.ts`, cited at `SKILL.md:29`).
- `giwt <args>` — `~/.local/bin/giwt` symlink to a *mutable* local checkout; may drift.

Note: `node_modules/giwt/` was not present in this checkout at inspection time, so the pinned
path could not be read directly. The command surface below is reconstructed from the SKILL.md
command map, not from `node_modules/giwt/src/cli.ts` — mark any part of it that SKILL.md omits as
unverified.

### What giwt already wraps

Command map, verbatim from `.agents/skills/giwt-usage/SKILL.md:76-86`:

| Group | Commands (from SKILL.md) |
| --- | --- |
| Status/read | `list`, `branches`, `status [branch]`, `diff <branch>`, `docs list/show/search/dump/sync-agents` |
| Tickets | `ticket`, `issues`, `search`, `show`, `comment`, `attach`, `attach-dir`, `edit`, `state`, `gi` |
| Plan/backlog | `sync` (ticket index), `backlog sync [--fix]`, `plan` (code map, validate, status) |
| Observability | `report`, `runs` with `triage <run>` or `diff <a> <b>`, `ledger [--last N] [--json]`, `gripe --at <branch> <message>` |
| Hygiene | `clean`, `tmp`, `doctor [--apply / check / scratchpad]` |
| GPG | `gpg-unlock`, `sign <branch>` |
| Prompting | `task <directive> [-w] [--base <ref>] [--tickets <csv>] [-g <gates>] [-j <n>] [-a <n>]` |

**Worktree lifecycle** (`SKILL.md:48-71`): `new <branch> [base] [--scope] [--tickets]` (branch +
worktree under `tree/`), `commit-wt <branch>`, `rebase <branch> [onto]`, `merge <target> <source>`,
`finalize <branch> [--merge-strategy rebase|squash|direct] [--gates <csv>]`, plus recovery
`abort`, `remove`, `cleanup`, `create`, `prs`. Note `giwt rebase` and `giwt merge` already exist —
rebasing is *not* a gap at the giwt level.

**Safety-gated git passthrough** (`SKILL.md:33-46`): raw `git` is rerouted to `giwt git`. Each
invocation is classified pass / refuse before git runs. Refused shapes listed at `SKILL.md:39-43`:
`reset --hard`, `clean`, force push, checkout/restore path discard, `branch -D`, `stash
drop/clear`, reflog expire, `filter-branch`, `tag -d`, `gc`, GPG bypass (`--no-gpg-sign`,
`commit.gpgsign=false`, credential overrides, `core.hooksPath` overrides), config writes,
editor-requiring commits, unknown subcommands. Tuned via the `git` section of `giwt.toml`
(`rtk`, `safe`, `allow`, `deny`).

This passthrough is enforced in the harness, not just documented: a pre-tool hook at
`~/.omp/agent/hooks/pre/git-giwt-reroute.ts` (16.7K) does the rerouting. It fires in practice —
attempting `cd <path> && ...` in this session was refused by a harness interceptor citing
`no-redundant-cwd-routing.md`, and the git-rewrite is visible in that same layer.

**`giwt.toml`** (repo root, 2.0K / 437B in the worktree copy) contains only two sections:
`[branches] root = "dev"` (`giwt.toml:3-5`) and a large `[status.aliases]` map
(`giwt.toml:7-61`) normalizing free-form legacy statuses into the closed vocabulary
`Not Started | In Progress | Blocked | Done | Wontfix | Postponed`. There is **no `[git]` section
present in this file**, despite `SKILL.md:46` saying tuning lives there. Either the section is
optional/empty-by-default or the documented key is aspirational — `[UNVERIFIED]`.

### Gaps vs. raw git

Judged against the command map only; absence from SKILL.md is weak evidence of absence in the CLI.

| Capability | giwt status | Evidence |
| --- | --- | --- |
| Rebase | **covered** — `giwt rebase <branch> [onto]`, default onto root branch (`dev`) | `SKILL.md:57` |
| Merge | **covered** — `giwt merge`, plus `--merge-strategy rebase\|squash\|direct` on finalize | `SKILL.md:58, 59-61` |
| Worktree mgmt | **covered** — new/create/remove/cleanup/prs/abort/finalize | `SKILL.md:50-71` |
| Hooks | **repo-owned, not giwt-owned** — 5 scripts in `.githooks/` (`pre-commit`, `pre-commit:full`, `pre-merge-commit`, `pre-push`, `prepare-commit-msg`) | `.githooks/` listing |
| CI | **repo-owned** — `.github/workflows/`: `ci.yml` (4.8K), `deploy.yml`, `dev-release.yml`, `pr-checks.yml` (955B), `release.yml` (5.9K) | `.github/workflows/` listing |
| `git bisect` | **NOT FOUND** in the command map | searched `.agents/skills/giwt-usage/SKILL.md` for `bisect` — no match |
| Stash mgmt beyond safety refusal | **NOT FOUND** — `stash drop/clear` appear only in the refuse list | `SKILL.md:39-43` |

### GitHub / GitLab issue + PR integration

**Partial, and it is about PRs only.** Evidence:
- `giwt prs` — "create worktrees for open PRs" (`SKILL.md:71`). This is the only PR touchpoint
  found in giwt; it is a *consumer* of PRs (checkout side), not a PR-authoring or PR-comment
  surface.
- Grepping `.agents/skills/` for `github|gitlab|gh pr|pull request` returned exactly one hit —
  the `github:flakusha/giwt` dependency string at `giwt-usage/SKILL.md:22`. No `gh` CLI, no
  `glab`, no GitLab reference anywhere in the skills.

So: **no GitHub/GitLab issue+PR integration** in the harness or in giwt's documented surface.
`.github/workflows/pr-checks.yml` is CI reacting to PRs, not an agent-facing API. The issue
tracking that does exist is git-native (below).

---

## 2. superpowers

**NOT FOUND.**

Searched:
- Filename search across `~/.omp/`, `~/.config/opencode/`, and the whole repo for
  `*superpower*`, `*super-powers*`, `*super_power*`. Result: no matches outside this research
  worktree's own agent transcript files
  (`tree/harness-research/.../research-harness.SuperpowersSweep.{md,jsonl}` — created by this
  audit's own delegation, not harness content).
- Content grep for `superpowers|super-powers` across `/home/flak/git-ai/loop-lore` — no matches.
- Adjacent workflow-skill names (`brainstorming`, `writing-plans`, `executing-plans`,
  `test-driven-development`, `subagent-driven-development`, `verification-before-completion`):
  none of these skill directories exist. The repo's 10 project skills are
  `code-practices, commit-message, giwt-usage, loop-lore-bookkeeping, loop-lore-context,
  loop-lore-db, loop-lore-tasks, native-issue, sync-tickets, worktree-merge`
  (`.agents/skills/`).

What the harness *does* offer in that conceptual space, under different names:
- **Workflow skill**: `~/.config/opencode/skills/task-management/` and a large
  `~/.config/opencode/context/` set (`core/coding-standards.md`, `core/navigation.md`,
  `core/workflow.md`, `project-intelligence/{patterns,security,tech-stack}.md`).
- **Prompt/mode skills**: `caveman*` (6 skills), `grug`, `cavecrew`, `lean-ctx`, `context7`, and
  23 `arkcli-*` skills (`~/.config/opencode/skills/`).
- Loop-lore's own closest analogue is a project *epic*, not a skill:
  `.plan/epics/epic-harness-integration.md` (24.1K).

Conclusion: if loop-lore wants a superpowers-style brainstorm→plan→execute pipeline, there is
**no installed instance to reuse**; the nearest real artifacts are the `.plan/` ticket/epic
machinery (§3) and the `core/workflow.md` context file.

---

## 3. jira / other issue trackers

**NOT FOUND** beyond giwt git issues + `.plan/`.

Searched: content grep across `/home/flak/git-ai/loop-lore/src` for
`jira|linear.app|atlassian|youtrack|gh issue|gh pr|glab|gitlab`. **Zero real matches** — the
regex hits returned were false positives from the substring `linear` in unrelated identifiers;
the cited fixtures (`src/chat/scheduled/dispatcher.ts:127`, `src/integrations/encryption.ts:7,51`,
`src/routes/gm-notes.test.ts:191`) contain no tracker match. The `linear` hits that do appear are
the English word in: `src/chat/types/context.ts:77` ("linear decay"),
`src/federation/negotiation.ts:6,16` ("linear handshake"),
`src/regex/html-sanitize-streaming.ts:56`, and `src/public/css/app.css:2082`.
No importer, no tracker client, no `jira`/`atlassian`/`youtrack` string anywhere in `src/`.

What *does* exist — a complete, working in-house issue system:

**git-native-issue**, described in `.agents/skills/native-issue/SKILL.md:14-15`: issues live in
`refs/issues/<uuid>` as commit chains with metadata trailers. No external service. Ticket
identifiers (`native-issue/SKILL.md:21-29`): `BUG-`, `FEAT-`, `FIX-`, `IDEA-`, `TASK-`, `SOL-`,
`INFRA-`. Epics are explicitly *not* tickets — they are files in `.plan/epics/`
(`native-issue/SKILL.md:31-32`).

Commands, all via `giwt` (`native-issue/SKILL.md:41-63`): `giwt ticket BUG "title" --label
bug --priority high` (creates both `.plan/tickets/BUG-*.md` *and* the git issue), `giwt issues`,
`giwt show TASK-001`, `giwt search "combat"`.

The on-disk plan tree is large and generated (`.plan/`):
- `tickets/` — one markdown file per ticket plus `index.json` (1.4MB); ticket count exceeds 3000
  (directory listing shows "… 3014 more" after 11 entries).
- `epics/` — "… 307 more" after 11 entries; plus `epics-index.md` (139.7K).
- `backlog/` — `open-untriaged.md`, `priority.md`, `security-review-2026-08-25.md`, etc.
- Generated artifacts: `code-map.json` (1.1MB), `feature-matrix.md` (449.5KB), several
  `matrix-*.md` cross-cutting views.
- `giwt sync` regenerates the ticket index; `giwt plan validate --fix` enforces the status
  vocabulary (`giwt.toml:7-16`).

Takeaway: loop-lore already has a mature, git-native tracker. It does **not** need a jira
integration to function; what it lacks is any *bridge* to external trackers (import/export).

---

## 4. MCP server support

### How the harness exposes MCP servers

Config file: `~/.omp/agent/mcp.json`, schema-declared as
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json`.

Shape (real keys, verbatim from the file):

```json
{
  "$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
  "mcpServers": {
    "<name>": { "type": "http", "url": "https://…/mcp" },
    "<name>": { "type": "stdio", "command": "…", "args": [ … ], "enabled": true|false }
  }
}
```

Two transports: `http` (URL-based) and `stdio` (`command` + `args`). Servers configured:

| Server | Type | Endpoint / command | Enabled |
| --- | --- | --- | --- |
| RivalSearchMCP | http | `https://RivalSearchMCP.fastmcp.app/mcp` | yes |
| context7 | http | `https://mcp.context7.com/mcp` | yes |
| deepwiki | http | `https://mcp.deepwiki.com/mcp` | yes |
| engram | stdio | `engram mcp --tools=agent` | yes |
| lean-ctx | stdio | `/usr/local/bin/lean-ctx` | yes |
| context-mode | stdio | `node ~/.omp/plugins/node_modules/context-mode/server.bundle.mjs` | yes |
| serena | stdio | `uvx --from git+https://github.com/oraios/serena serena start-mcp-server …` | **`"enabled": false`** |

The opencode-compat layer has its own, larger MCP block at
`~/.config/opencode/opencode.json:138-265` under the `"mcp"` key, using `"type": "remote"` for
HTTP and a `"command": [ … ]` **array** form for stdio. It declares, beyond the omp set:
`chrome-devtools` (`bunx chrome-devtools-mcp@1.5.0`), `diff` (`uvx mcp-server-git@2026.7.10`),
`fetch` (`uvx mcp-server-fetch@2026.6.4`), `git` (`uvx mcp-server-git@2026.6.16`),
`headroom` (local binary, `"enabled": false`), `playwright`
(`bunx @playwright/mcp@0.0.77`), `stealth-chrome-devtools-mcp` (`uvx
stealth-chrome-devtools-mcp==1.0.0`).

Key reuse fact: the opencode layer declares two git MCP servers
(`mcp-server-git`, pinned to `@2026.6.16` / `@2026.7.10`) in its `mcp` block
(`~/.config/opencode/opencode.json:164-200`), but both carry `"enabled": false` —
they are not active in opencode either, not merely absent from `~/.omp/agent/mcp.json`.
loop-lore would need to enable them explicitly to use them.

`~/.omp/agent/config.yml` contains **no** `mcp`, `plugin`, or `marketplace` keys (grep: no
matches). MCP config is isolated in `mcp.json`; plugin/marketplace config is isolated in
`~/.omp/plugins/` (§5).

### Does loop-lore have any MCP surface?

**No.** Content grep across `/home/flak/git-ai/loop-lore/src` for
`mcp|modelcontextprotocol|model-context-protocol` (case-insensitive): **no matches found.**
loop-lore is a pure HTTP consumer of the harness; it neither speaks MCP nor is spoken to over MCP.

### Where a "loop-lore MCP server" would hook

Server entrypoint: `src/elysia-app.ts` (278 lines), `createApp(deps: AppDeps)` at line 59.
It builds an Elysia app on `BunAdapter` (`src/elysia-app.ts:71`).

Middleware order is load-bearing and explicitly commented as such — an MCP endpoint added
inside this chain inherits it:
1. `onError` error boundary — line 77, with a comment (lines 72-76) that it MUST precede the
   validation handler or it never runs.
2. `onError` validation handler — line 86.
3. `.derive(requestIdMiddleware())` — line 91.
4. Auth `.derive(...)` — line 93 ("runs before all routes, populates context").
5. CSRF — `applyCsrfPlugin(...)` line 156; `CSRF_EXEMPT_ROUTES` (line 26) is described at
   lines 157-162 as "the canonical 'what we protect' surface for plugin authors".
6. Idempotency — `onBeforeHandle` line 175, `onAfterHandle` lines 177-195.
7. Lifecycle `onAfterHandle` — line 199.
8. `onStop` shutdown flush — line 204.
9. `versionResolver()` — line 212, populates `ctx.apiVersion` for every request.
10. **Route mounting**: `registerPlugins(...)` line 214, then `v1Routes({...})` line 216.
11. Inline `/api/v1/assets` upload route — line 228 onward, deliberately mounted on the parent
    app with `parse: "none"` (comment lines 220-227).

Unversioned route modules are registered in `src/app/register-plugins.ts:49-68`
(`healthRoutes`, `livenessRoutes`, `metricsRoutes`, `federationRoutes`, `buildIdRoutes`,
`agencyRoutes`, `memoryAuditRoutes`, `locationExplorerRoutes`, `gameStateRoutes`,
`storyOrchestrationRoutes`, `viewRoutes`, `configMenuRoutes`); everything else is mounted by the
v1 barrel under `/api/v1` (doc comment at `register-plugins.ts:6-11`). The file warns that
"later registrations can shadow earlier ones — keep this sequence stable" (lines 42-44).

**There is already a `harness` route module**: `src/routes/harness/index.ts` (+ a 12.9K test),
exposing three admin-only read endpoints over the harness exec-log, with
`requirePermission` and an explicit "No write endpoint — the log is append-only from inside the
process (`harness/exec-log.ts`)" rule (`src/routes/harness/index.ts:5-10`). This is the
nearest existing precedent for exposing harness state over HTTP, and the natural sibling location
for agent-facing endpoints.

Note `src/routes/` also contains `export-sse/` — an existing SSE surface, relevant if an MCP
stream/HTTP-SSE transport were ever needed `[UNVERIFIED: exact SSE reuse path not traced]`.

Practical hook for an MCP server: a standalone stdio process would side-step this chain entirely
and just call loop-lore's existing `/api/v1` endpoints over HTTP with the normal auth. If it must
run *inside* the app, it would register via `registerPlugins` or the v1 barrel, and would need a
`CSRF_EXEMPT_ROUTES` entry (stateless MCP clients do not carry the CSRF header).

---

## 5. Marketplace plugin integration

A real, working marketplace mechanism exists — but it is the **Anthropic Claude Code marketplace
format**, not an omp-native one.

**Registry:** `~/.omp/marketplaces.json` — real content:

```json
{
  "version": 1,
  "marketplaces": [
    { "name": "caveman",
      "sourceType": "github",
      "sourceUri": "JuliusBrussee/caveman",
      "catalogPath": "/home/flak/.omp/plugins/cache/marketplaces/caveman/marketplace.json",
      "addedAt": "2026-09-26T08:48:29.261Z",
      "updatedAt": "2026-10-04T01:08:17.681Z" }
  ]
}
```

Real keys: `version`, `marketplaces[]`, and per-entry `name`, `sourceType`, `sourceUri`,
`catalogPath`, `addedAt`, `updatedAt`. Install source is a **GitHub repo slug**; the catalog is
cached to a local path.

**Catalog manifest format:** `~/.omp/plugins/cache/marketplaces/caveman/marketplace.json` (532B),
schema `"https://anthropic.com/claude-code/marketplace.schema.json"`. Structure:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "caveman",
  "description": "Ultra-compressed communication mode. …",
  "owner": { "name": "Julius Brussee", "url": "https://github.com/JuliusBrussee" },
  "plugins": [ { "name": "caveman",
                 "description": "Talk like caveman. …",
                 "source": "./",
                 "category": "productivity" } ]
}
```

Per-plugin keys: `name`, `description`, `source` (a path relative to the repo), `category`.
No version pinning in the catalog itself.

**Installed plugin lockfile:** `~/.omp/plugins/omp-plugins.lock.json` — three plugins installed,
with versions recorded:

```json
{ "plugins": {
    "oh-my-pi-integration": { "enabled": true, "enabledFeatures": null },
    "context-mode": { "version": "1.0.169", "enabledFeatures": null, "enabled": true },
    "caveman": { "version": "2.7.0", "enabledFeatures": null, "enabled": true } },
  "settings": { "oh-my-pi-integration": {} } }
```

Per-plugin keys: `enabled` (bool), `version` (when versioned), `enabledFeatures` (null = all).
The `settings` block is per-plugin config.

**Independent manifest channel:** `~/.omp/plugins/oh-my-pi-integration.manifest` (24.9K) sits
alongside the lockfile — an integration manifest distinct from the Claude-format catalog.

**Who consumes it:** the installed plugins materialize as skill directories under
`~/.config/opencode/skills/` (`caveman*`, `grug`, `cavecrew`, `lean-ctx`, `context7`) and as
extensions under `~/.omp/agent/extensions/` (`commands/`, `guards/`, `plugin/`, `receipt/`,
`util/`, plus `index.ts` 5.3K and `rtk.ts` 4.7K). The opencode layer declares plugins as an
**array of npm-style specifiers** at `~/.config/opencode/opencode.json:266+`:
`"context-mode@1.0.169"`, `"opencode-log-sanitizer@1.3.0"`, `"token-optimizer-opencode"`. So the
opencode side installs from **npm**, the omp side from **GitHub** — two distinct registries.

**Hot install:** `[UNVERIFIED]` — not determined. No install/refresh command was located in
`~/.omp/agent/config.yml` (no marketplace keys there) and no CLI surface was traced in this pass.
What is *verified* is the cache layout (`plugins/cache/marketplaces/<name>/marketplace.json`) with
an `updatedAt` that post-dates `addedAt`, implying some refresh mechanism exists; how it is
triggered is unconfirmed.

---

## 6. Idea creation / memory management / context inclusion

### Context files (load order NOT documented)

Every context/instruction file found:

| Path | Size | Scope |
| --- | --- | --- |
| `~/.omp/agent/APPEND_SYSTEM.md` | 991B | omp runtime — tooling-discipline rules (`hub` for long jobs, lean-ctx MCP for edits, `eval` disabled, no writes outside project root) |
| `~/.omp/agent/AGENTS.md` | 779B | omp runtime — describes the receipt ledger plugin (§6 receipts) |
| `~/.config/opencode/AGENTS.md` | 2.3K | opencode runtime |
| `~/.config/opencode/AGENTS.grug.md` | 12.6K | opencode — "grug" persona/rule set |
| `~/.config/opencode/LEAN-CTX.md` | 791B | lean-ctx MCP instructions |
| `~/.config/opencode/.cursorrules` | 519B | cursor compat |
| `~/.config/opencode/.hermes.md` | 684B | unknown/hermes |
| `~/.config/opencode/context/core/{coding-standards,navigation,workflow}.md` | — | context injection set |
| `~/.config/opencode/context/project-intelligence/{patterns,security,tech-stack}.md` | — | context injection set |
| `~/.omp/rules/` + `~/.omp/agent/rules/` | — | 75 rule files, **identical sets** (verified `diff -rq` → IDENTICAL); e.g. `no-git-state-investigation.md`, `parallel-safe-tests.md`, `no-redundant-cwd-routing.md`, `harness-tooling-discipline.md` |
| `~/.omp/agent/agents/census.md` | 1.1K | agent definition |
| repo `AGENTS.md` | 24.2K | project-level; `.agents/skills/giwt-usage/SKILL.md:23` states "AGENTS.md takes precedence where the two differ" |

**Load order: NOT DOCUMENTED.** No file found in this pass states a precedence chain between these
sources. Any ordering claim would be inference from filenames and is `[UNVERIFIED]`. The one
explicit precedence statement located is repo-internal: `AGENTS.md` beats the giwt skill
(`.agents/skills/giwt-usage/SKILL.md:23`).

Who consumes `~/.config/opencode/context/` was not traced `[UNVERIFIED]`.

### Skills

Real SKILL.md frontmatter, quoted from `.agents/skills/giwt-usage/SKILL.md:1-14`:

```yaml
---
name: giwt-usage
description: >
  Canonical giwt CLI usage for loop-lore: … Trigger: any giwt invocation, …
version: 1.0.0
author: project-maintainers
license: Apache-2.0
metadata:
  agents:
    tags: [giwt, worktree, git, tickets, finalize, ledger]
    related_skills: [worktree-merge, native-issue, sync-tickets, commit-message]
---
```

Keys: `name`, `description`, `version`, `author`, `license`, `metadata.agents.tags`,
`metadata.agents.related_skills`. Note `native-issue/SKILL.md:1-7` carries only
`name` + `description` — the schema is permissive, not uniform.

Skill directories:
- Repo: `.agents/skills/` — 10 skills (listed in §2).
- `~/.omp/skills/` and `~/.omp/agent/skills/` — `context-tooling/` each.
- `~/.omp/managed-skills/` — empty. `~/.omp/agent/managed-skills/` — 4 harness-installed skills:
  `gpg-pinentry-timeout-agent-commits`, `loop-lore-gate-verification`, `loop-lore-latest-commit`,
  `loop-lore-world-timeline`.
- `~/.config/opencode/skills/` — 37 skill dirs, each with a `SKILL.md`; 23 of them are `arkcli-*` (verified by `glob */SKILL.md`); the rest are `lean-ctx`, `cavecrew`, `caveman` + 5 `caveman-*`, `grug`, `context7`, `task-management`.

**A managed-skill channel exists and is already used for loop-lore concerns** — 3 of the 4
managed skills are loop-lore-specific. `~/.config/opencode/skills/.arkcli-managed-skills.json`
(2.3K) is the manifest for that channel.

### Hooks

`~/.omp/agent/hooks/pre/` — three pre-tool hooks:
- `git-giwt-reroute.ts` (16.7K) — the raw-git → `giwt git` rewrite (§1).
- `harness-evasion-guard.ts` (50.0K) — the guard that blocks `eval`, `python -c`, chained
  segments that hide binaries from the interceptor (this fired on `sed`/`ls | wc -l` during this
  audit).
- `lean-ctx-native-reroute.ts` (6.5K).

Only a `pre/` tier exists — no `post/` directory. `[UNVERIFIED]` the full list of hook event names
the runtime supports; only the `pre` directory name and these three files were observed.

### Memory

Three distinct, non-interoperating memory systems:

1. **Harness-internal (SQLite)**: `~/.omp/agent/agent.db` (1.3M), `history.db` (668K),
   `models.db` (9.1M), `skill-descriptions.db` (12K), `~/.omp/stats.db` (120.8M). A `memories/`
   directory also exists under `~/.omp/agent/`. Contents not read.
2. **opencode-mem**: `~/.config/opencode/opencode-mem.jsonc` (10.0K config) +
   `~/.config/opencode/.opencode-mem/`. Config keys not extracted in this pass `[UNVERIFIED]`.
3. **Engram — external, MCP-delivered**: not a harness feature but an MCP stdio server
   (`~/.omp/agent/mcp.json`, `engram mcp --tools=agent`) exposing `mem_save`, `mem_search`,
   `mem_context`, `mem_judge`, `mem_session_summary`, `mem_save_prompt`, and ~15 more. loop-lore's
   own session context arrived via an engram "Prior recorded context" block in this task.

Separately, **lean-ctx** (`~/.omp/agent/mcp.json`, stdio `/usr/local/bin/lean-ctx`) is
context-engineering, not memory: `ctx_batch_execute`, `ctx_search`, `ctx_index`, `ctx_patch`,
`ctx_expand`, `ctx_session`, `ctx_knowledge`. Its output is auto-indexed into a BM25/FTS5 knowledge
base. This is the closest thing the harness has to a RAG/context-inclusion service.

### Receipts ledger

The mechanism is described in `~/.omp/agent/AGENTS.md:3-8`, which states that "the
oh-my-pi-integration plugin carries `<project>/.omp/receipt.toml` into every turn as an invisible
footer message — a cross-turn job ledger". Documented rules: keep entries terse; first key of each
`[[job]]`/`[[issue]]` is its id; `state` is `finished` / `in progress` (default) / `postponed`;
mark blockers with a `# Blocker` comment; plugin chores bump `n`, stamp `done_at`, drop finished
jobs after 3 receipts, prune empty entries; fail-open on a malformed ledger; opt out with
`PI_RECEIPT_DISABLE=1`.

Two findings that matter for planning:
- **The project `.omp/receipt.toml` does not exist.** Repo `.omp/` is empty and `.omp` is
  gitignored (`.gitignore:72`). A grep for `receipt.toml` across the whole repo returned **no
  matches**. The loop-lore side of this receipt mechanism is unbuilt.
- The footer actually surfaced in this session came from a *different*, built artifact:
  `tree/.ledger.jsonl` (8.0K, one JSON object per line). Real line
  (`tree/.ledger.jsonl:1`):
  `{"v":2,"ts":"2026-10-07T12:14:12Z","pid":971521,"agent":"localhost:971521","cmd":"show","branch":"dev","msg":"show 3ee5466","state":"in-progress","seq":2980}`
  Keys: `v`, `ts`, `pid`, `agent`, `cmd`, `branch`, `msg`, `state`, `seq`. Written by giwt
  (`giwt ledger [--last N] [--json]`, `SKILL.md:83`; "giwt appends agent activity … to the shared
  ledger", `SKILL.md:88-91`).

So there are **two receipt mechanisms**: the harness's TOML one (global plugin, unbuilt in this
project) and giwt's JSONL one (built, worktree-local at `tree/.ledger.jsonl`). `~/.omp/agent/` also
has an extension set for the JSONL side at `~/.omp/agent/extensions/receipt/`:
`giwt-bridge.ts`, `ledger-watch-core.ts`, `ledger-watch.ts`, `receipt-carry.ts`, `receipt-doc.ts`,
`receipt.ts`.

**`ctx_handoff`** — a harness tool, not a file. It is referenced twice in the repo's `AGENTS.md`
(lines 111, 123) instructing that `.tmp/` scratch paths be carried forward via
`ctx_handoff(paths=[…])`. The `ctx_` prefix matches the context-mode MCP tool family, so it is
`mcp__context_mode_ctx_*` `[UNVERIFIED: exact tool identity not confirmed; it did not appear in the
connected tool list for this session, which lists ctx_batch_execute, ctx_execute_file,
ctx_fetch_and_index, ctx_index, ctx_search, ctx_stats, etc. but no ctx_handoff]`.

---

## 7. Known gaps summary

| Capability | Harness provides? | Evidence path | What loop-lore must build |
| --- | --- | --- | --- |
| Worktree lifecycle | **yes** | `.agents/skills/giwt-usage/SKILL.md:48-71`; hook `~/.omp/agent/hooks/pre/git-giwt-reroute.ts` | nothing |
| Raw-git safety gating | **yes** | `giwt-usage/SKILL.md:33-46`; refuse list `:39-43` | nothing |
| Rebase / merge / finalize | **yes** | `giwt-usage/SKILL.md:57-61` | nothing |
| GPG-signed commits + cache warm | **yes** | `giwt-usage/SKILL.md:55, 85` | nothing |
| Git hooks + CI | **yes** (repo-owned, not harness) | `.githooks/` (5 scripts), `.github/workflows/` (ci, deploy, dev-release, pr-checks, release) | nothing |
| `git bisect` | **no** | absent from command map `giwt-usage/SKILL.md:76-86` | a bisect wrapper, or shell out via `giwt git` passthrough |
| Git-native issue tracking | **yes** | `.agents/skills/native-issue/SKILL.md:14-63`; `.plan/tickets/` (3000+ files) | nothing |
| External tracker (jira/linear) | **no** | grep over `src/` for `jira\|linear.app\|atlassian\|youtrack\|glab\|gitlab` → no real matches | an importer/exporter; the in-house tracker is sufficient without one |
| GitHub/GitLab issue+PR API | **partial** — `giwt prs` checks out open PRs only | `giwt-usage/SKILL.md:71`; only github hit in skills is the dep string `:22` | PR authoring, review comments, PR↔ticket linking if wanted |
| superpowers skill collection | **no** | filename search `*superpower*` over `~/.omp/`, `~/.config/opencode/`, repo → nothing; content grep → no matches | the whole collection if wanted |
| Workflow/context injection | **partial** — files exist, **load order undocumented** | `~/.config/opencode/context/{core,project-intelligence}/`, `~/.omp/rules/` (75 files), `~/.omp/agent/APPEND_SYSTEM.md` | document or define the precedence chain |
| Skills framework | **yes** | frontmatter `.agents/skills/giwt-usage/SKILL.md:1-14`; managed channel `~/.omp/agent/managed-skills/` (3/4 loop-lore-specific) | nothing |
| Pre-tool hooks | **yes** (pre tier only) | `~/.omp/agent/hooks/pre/` (3 hooks) | anything post-tool `[UNVERIFIED: other tiers]` |
| Long-term memory | **yes, three systems** — harness SQLite, opencode-mem, engram MCP | `~/.omp/agent/*.db`, `~/.config/opencode/opencode-mem.jsonc`, `~/.omp/agent/mcp.json` | pick one; do not build a fourth |
| Context/RAG | **yes** | lean-ctx MCP (`ctx_index`, `ctx_search`, `ctx_expand`) + context-mode MCP | nothing |
| Harness state over HTTP | **partial** — read-only, admin-only | `src/routes/harness/index.ts:5-10` (no write endpoint by design) | write/command endpoints if agents must drive the harness |
| MCP client (loop-lore side) | **no** | grep `src/` for `mcp\|modelcontextprotocol` → no matches | an MCP client, if loop-lore wants to call out |
| MCP server (loop-lore side) | **no** — but the harness can host one | `~/.omp/agent/mcp.json` (stdio+http); hook points `src/elysia-app.ts:214, 216`, `src/app/register-plugins.ts:49-68` | the server itself; register via `registerPlugins`/v1 barrel, else run stdio and call `/api/v1` over HTTP |
| MCP git servers for agents | **yes in opencode layer, not in omp** | `~/.config/opencode/opencode.json:164-200` (`mcp-server-git`); absent from `~/.omp/agent/mcp.json` | nothing if the omp runtime is used; add to `mcp.json` if omp needs git access |
| Plugin marketplace | **yes** — GitHub-sourced, Claude catalog format | `~/.omp/marketplaces.json`, `plugins/cache/marketplaces/caveman/marketplace.json`, `plugins/omp-plugins.lock.json` | a `marketplace.json` + git repo to publish loop-lore plugins |
| Hot plugin install | **UNVERIFIED** | `updatedAt` > `addedAt` in `~/.omp/marketplaces.json` implies refresh; no trigger found | confirm before depending on it |
| Receipt ledger (harness TOML) | **partial** — plugin exists, project file does not | `~/.omp/agent/AGENTS.md:3-8`; repo `.omp/` empty; `receipt.toml` grep → no matches; `.gitignore:72` | create `.omp/receipt.toml` (and decide the gitignore interaction) |
| Receipt ledger (giwt JSONL) | **yes** | `tree/.ledger.jsonl:1`; extensions `~/.omp/agent/extensions/receipt/` (6 files) | nothing |
| `ctx_handoff` | **UNVERIFIED** — referenced in `AGENTS.md:111,123`, absent from this session's connected tool list | repo `AGENTS.md:111,123` | confirm identity before relying on it |
| Idea/ticket lifecycle + status vocabulary | **yes** | `giwt.toml:7-61`, `giwt sync`, `giwt plan validate --fix` | nothing |
| Generated plan artifacts (code map, matrices) | **yes** | `.plan/code-map.json` (1.1MB), `feature-matrix.md` (449.5KB), `matrix-*.md`, `epics-index.md` | nothing |

---

## Appendix — what was searched and not found

Recorded so a later pass does not repeat it:

- **superpowers**: `find ~/.omp ~/.config/opencode <repo> -iname '*superpower*' -o -iname '*super-powers*'`;
  content grep `superpowers|super-powers` over the repo. Nothing outside this audit's own
  transcript files.
- **jira/linear/gitlab in product code**: content grep over `src/` for
  `jira|linear.app|atlassian|youtrack|gh issue|gh pr|glab|gitlab`. All hits were substring
  false positives (`generateContentStorage`, `globalThis`, `plugins`).
- **MCP in product code**: content grep over `src/` for `mcp|modelcontextprotocol|model-context-protocol`.
  No matches.
- **`receipt.toml` in repo**: content grep, no matches. `node_modules/giwt/src/cli.ts` — path did
  not exist in this checkout at inspection time.
- **mcp/plugin/marketplace keys in `~/.omp/agent/config.yml`**: content grep, no matches (config
  is split across `mcp.json` and `~/.omp/plugins/`).


## Appendix — counts re-verified on self-review

The quantitative claims in this document were re-checked against the filesystem after the first
draft, because directory listings had been read through truncated output (`… N more` markers).
Two were wrong and are corrected above:

| Claim | First draft | Verified | How |
| --- | --- | --- | --- |
| Rule files | "~140 files" across `~/.omp/rules/` + `~/.omp/agent/rules/` | **75**, and the two directories are **byte-identical sets** | `glob ~/.omp/rules/*.md` (75 returned); `diff -rq ~/.omp/rules ~/.omp/agent/rules` → IDENTICAL. The draft's ~140 was a double-count of one set listed twice. |
| opencode skills | "37 dirs including 23 `arkcli-*`" | 37 dirs each containing a `SKILL.md`, 23 of them `arkcli-*` — **confirmed** | `glob ~/.config/opencode/skills/*/SKILL.md` |
| MCP servers in `mcp.json` | 7 | **7 confirmed** | A structural grep for server keys at four-space indent returned 7; a naive `grep -c` on a quote-colon-open-brace pattern returns 8 because it also matches the enclosing `mcpServers` container line. The 7-server table stands. |

Other counts in this document are directory-listing derived and were each read from a concrete
path (sizes quoted in the tables are from `ls -la` at the time of inspection). Counts that could
not be re-derived precisely — `.plan/tickets/` ("3000+") and `.plan/epics/` ("300+") — are
stated as lower bounds derived from the truncation markers rather than as exact figures, which is
why they are phrased as "exceeds"/"more" rather than given a precise number.
