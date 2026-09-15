<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Unified Markdown Spec Framework for `.plan/`

> **Date:** 2026-09-15
> **Scope:** Reusable `.md` spec schema + bookkeep-tooling for `.plan/` epics, tasks, tickets, ideas, bugs.
> **Worktree:** `tree/unified-spec-framework` (branch: `unified-spec-framework`)
> **Companion JSON index:** `.plan/research-unified-spec-framework.index.json`
> **Companion epic (proposed):** `epic-unified-spec-framework.md`
> **Constraint (user):** MUST reuse existing `.plan/tickets/index.json`; tooling must bookkeep it (not replace it); new worktree work only.

## 0. Constraint acknowledgement

Two hard rules from the user override defaults:

1. **Reuse `.plan/tickets/index.json`** — it is the bookkeep target. Tooling writes *into* it, not a replacement format. Same path, same consumers (worktree `sync` subcommand + `plan:sync*` scripts).
2. **Work in a worktree** — `tree/unified-spec-framework`. No `dev` mutations. Companion epic lives in this worktree's `.plan/epics/` and lands via `worktree finalize`.

The research below honors both.

## 1. Why this research

Loop-lore has a substantial spec surface that **already works**, but it is hand-shaped:

- 281 epics, ~2100 tickets spread across 9 prefix types (`TASK 1526`, `BUG 354`, `FEAT 138`, `EPIC 43`, `TEST 12`, `WIRE 11`, `IDEA 9`, `PERF 2`, `IMPROVE 1`)
- Each ticket is a free-form `*.md` with prose `Status`/`Priority`/`Epic` headers, sometimes SPDX comment, often nothing
- 8 backlog bucket files (`.plan/backlog/priority*.md`, `open*.md`) re-summarize the same data by hand
- Existing tooling: `scripts/worktree/` (commits/finalize/ticket) + `scripts/gen-plan-docs.ts` (regenerates `epics-index.md`) + `bun run plan:sync:fix` (rewrites `tickets/index.json` from `.plan/tickets/*.md`)
- AI agents reading `.plan/` must parse prose; agents writing tickets invent their own shape; nothing cross-checks

External "spec-driven development" tools solve exactly this: a small, opinionated **schema for spec artifacts** + a **CLI that bookkeeps them** + an **agent surface** that reads/writes canonically.

## 2. Candidates surveyed

| Tool | Spec shape | CLI | Agent fit | Brownfield | Verdict |
|------|-----------|-----|-----------|------------|---------|
| **GitHub Spec Kit** | `spec.md` / `plan.md` / `tasks.md` per change | `specify` (Python/uv) | `/speckit.*` slash | Tolerated, greenfield-first | Heavy ceremony; rigid phase gates; Python toolchain |
| **Fission-AI OpenSpec** | `openspec/changes/<name>/{proposal.md, design.md, tasks.md, specs/*.md}` | `openspec` (Node 20+) | `/opsx:*` for 30+ tools | First-class | **Best fit** — fluid, iterative, lightweight, brownfield |
| **BMAD Method** | Phase artifacts (`PRD`, `architecture`, `epics/stories`) + agent personas | Prompt-pack | Cursor/Claude personas | Acceptable | Too heavy; more product than spec |
| **Backlog.md** | Per-task `*.md` with mandatory YAML frontmatter | `backlog` (Node/Bun) | CLI + MCP | Native | **Strong fit** for ticket-shaped scope; weak on phase/plan/spec artifacts |
| **Diátaxis** | Doc taxonomy only (tutorials/how-to/reference/explanation) | n/a | n/a | n/a | Useful **lens** only — epics = explanations, tickets = how-to references |

**Decision drivers** (ranked by what loop-lore already does):

1. **Brownfield fit** — `.plan/` has ~2100 tickets; we cannot migrate them all
2. **CLI maturity** — bun-native preferred; existing `scripts/worktree/` shape
3. **Agent surface** — must compose with `scripts/worktree/ sync` and friends
4. **Lightweight spec schema** — fits prose; doesn't force YAML everywhere
5. **Incremental adoption** — new tickets conform; old auto-stamp `_legacy: true`
6. **Reuse existing index** — write into `.plan/tickets/index.json`; never rewrite its schema

**Primary inspiration:** OpenSpec (artifacts: proposal / specs / design / tasks per change) **+** Backlog.md (per-file frontmatter discipline + CLI surface). Hybrid, narrowly tailored to loop-lore.

## 3. Tool-by-tool findings

### 3.1 GitHub Spec Kit — `https://github.com/github/spec-kit`

- **Spec layout:** One `.specify/` folder containing templates; phase output lands in `specs/<NNN-feature>/{spec,plan,tasks,checklists}/...`
- **Workflow:** `constitution → specify → clarify → plan → tasks → implement → converge`; each command writes one or two new files
- **Convergence loop:** `speckit-converge` runs the implementation against the spec and **appends remaining work as new tasks** until converged
- **Reusable:** *convergence discipline*; *bug extension (assess → fix → test)*; *idea extension (intake → research → define → shape → decide)*; *templates-with-overrides hierarchy*
- **Rejected for:** Python toolchain; rigid phase gates; ceremony overhead

### 3.2 Fission-AI OpenSpec — `https://github.com/Fission-AI/OpenSpec`

- **Spec layout:** `openspec/changes/<change-name>/{proposal.md, design.md, tasks.md, specs/<capability>.md}` — per change-folder
- **Artifact grammar:** `### Requirement: <SHALL>` + `#### Scenario: <when/then>` — executable prose
- **Workflow:** `explore → propose → apply → archive`; archive moves to `openspec/changes/archive/YYYY-MM-DD-<name>/` and merges spec deltas
- **Reusable:** *per-change folder shape*; *proposal/specs/design/tasks artifact split*; *requirement+scenario grammar*; *archive flow*; *schema config*
- **Why first pick:** built for brownfield; smallest reasonable ceremony; 30+ agent integrations pre-built

### 3.3 Backlog.md — `https://github.com/MrLesk/Backlog.md`

- **Spec layout:** `backlog/tasks/<id>-<slug>.md` with mandatory YAML frontmatter (`id`, `title`, `status`, `priority`, `assignee`, `labels`, `dependencies`, `acceptance_criteria`)
- **Reusable:** *mandatory YAML frontmatter schema*; *acceptance-criteria checklist*; *dependency edge*; *milestones*; *three-review-checkpoint model (spec → plan → code)*
- **Why second pick:** most disciplined frontmatter; AC checklist complements OpenSpec's WHEN/THEN grammar

### 3.4 BMAD Method

- **Skip for v1.** Too heavy; persona-driven; output is workflow not spec folder.

### 3.5 Diátaxis

- **Lens only.** Adopt the epic-vs-ticket role taxonomy in template guidance.

## 4. Mapping to `.plan/` today

### 4.1 What already conforms

| Concern | Today | Unified-spec proposal |
|--------|-------|----------------------|
| Epic scaffold (281 files) | `Status:` + `Priority:` + `Effort:` + `Overview` + numbered `## Tasks` + `## Files` + `## Migration Strategy` | Keep shape; add mandatory `frontmatter` block + `## Acceptance Scenarios` (WHEN/THEN/SHALL) + `## Dependencies` block |
| Ticket scaffold (~2100 files) | `# TYPE: Title` + `**Status:**` + `**Priority:**` + `**Effort:**` + `**Epic:**` + `## Summary` + `## Acceptance Criteria` (checklist) + `## Related` + `## Files` + `## Verification` + optional `## Open Questions` | Keep shape; add **required** YAML frontmatter (`id`, `type`, `title`, `status`, `priority`, `effort`, `epic`, `created`, `updated`); legacy passes via `_legacy: true` |
| `tickets/index.json` | Hand-rolled; diverges from `tickets/`; committed; regenerated by `bun run plan:sync:fix` (already in repo) | **REUSE not replace.** Tooling rewrites entries via same schema; only flag drifts. Existing key shape (`hash`, `extid`, `type`, `title`, `label`, `priority`, `epic`, `tags`, `source`, `git_issue`, `status`) preserved + enriched with `updated`, `frontmatter`, `links` |
| Status enum (prose) | `done`, `open`, `in progress`, `postponed`, `stale-resolved`, `[OK] Already resolved`, `✅ Resolved`, `fixed-in-worktree`, `🟨 In Progress`, `🟡 Design`, `📝 Draft` | **Single canonical enum** + alias map (`draft \| proposed \| accepted \| in_progress \| blocked \| done \| archived \| dropped`); emoji allowed as visual prefix |
| Bookkeeping tools | `scripts/worktree/` (commits/finalize/ticket/sync); `scripts/gen-plan-docs.ts`; `bun run plan:sync:fix` | Add `scripts/spec/` namespace: `validate`, `index`, `new`, `migrate`, `converge`, `archive`, `status`, `search` — all bun-native, zero deps, idempotent |

### 4.2 What's missing

1. **No spec for specs** — agents must guess what an "epic" vs "feature" vs "ticket" looks like
2. **No required machine-readable frontmatter** — `tickets/index.json` re-types every status, priority, effort field by hand
3. **No acceptance-scenario grammar** — ACs are checklists (good) but lack `GIVEN/WHEN/THEN/SHALL` shape (better for tools + tests)
4. **No convergence discipline** — once a worktree merges, nothing diffs the resulting code back against the spec ACs
5. **No schema validator** — entries drift (`priority: medium` vs `priority: Medium` vs `priority: med`)
6. **No per-change artifact folder** — large features scatter across `epics/` + many `tickets/*.md` files

### 4.3 Agent-surface fit

Loop-lore runs `bun run scripts/worktree/ <cmd>` natively. Proposed surface mirrors that:

```bash
bun run scripts/spec/ new epic <slug>            # scaffold epic-<slug>.md (matches scripts/worktree/ticket ergonomics)
bun run scripts/spec/ new feat <slug>            # scaffold FEAT-<slug>.md
bun run scripts/spec/ new task <slug>            # scaffold TASK-<slug>.md
bun run scripts/spec/ new bug <slug>             # scaffold BUG-<slug>.md
bun run scripts/spec/ new idea <slug>            # scaffold IDEA-<slug>.md
bun run scripts/spec/ validate                   # lint .plan/ artifacts
bun run scripts/spec/ validate --target <id>     # lint one
bun run scripts/spec/ index                      # rewrite .plan/tickets/index.json entries (preserves schema)
bun run scripts/spec/ migrate                    # backfill frontmatter; sets _legacy: true; preserves prose
bun run scripts/spec/ converge <branch>          # diff merged branch vs spec Acceptance Scenarios
bun run scripts/spec/ archive <change>           # move changes/<name>/ -> changes/archive/<date>-<name>/
bun run scripts/spec/ status                     # summary table by epic/status/priority
bun run scripts/spec/ search "<query>"           # fuzzy text search across .plan/
```

(Names final after Phase A user review.)

## 5. Proposed unified spec schema (v1)

### 5.1 Frontmatter — required for all new tickets

```yaml
---
id: TASK-encrypt-chat-key-rotation        # canonical slug-id; matches filename without .md
type: task                                 # bug | task | feat | idea | epic | test | wire | perf | improve
title: "Effective & Reliable Encryption + Membership-Triggered Key Rotation"
status: in_progress                        # draft | proposed | accepted | in_progress | blocked | done | archived | dropped
priority: high                             # critical | high | medium | low
effort: high                               # trivial | small | medium | large | xlarge
epic: epic-chat-product-features           # parent epic filename (no .md); "" if none
created: 2026-09-11                        # ISO date
updated: 2026-09-15                        # ISO date
owner: ""                                  # optional: handle / user-id
labels: [crypto, chat, idempotency]        # free-form; lowercase, hyphenated
dependencies: [TASK-encryption-wire-message-pipeline]   # task-ids this waits on
revision: 2                                # bumped by scripts/spec/* write operations
# _legacy: true                            # ONLY set by scripts/spec/migrate on legacy artifacts
---
```

### 5.2 Sections — required

```
# TYPE-ID: Title                           # mirror frontmatter

## Summary                                 # 1–3 paragraphs
## Acceptance Scenarios                    # executable prose, 1+ REQUIRED
### Scenario: <name>
- **GIVEN** <precondition>
- **WHEN** <action>
- **THEN** <observable result>

## Related
- epic: epic-…                          # parent epic(s)
- blocks: TASK-…                        # tasks this one unlocks
- blocked_by: [TASK-…]                  # duplicate of frontmatter.dependencies

## Files                                   # paths to read / add / modify
## Verification                            # exact bun commands + expected outcome

## Open Questions                          # optional; resolve before `status: accepted`
```

### 5.3 Epic — required for all new epics

```
# Epic: <Title>

## Status: 🟡 Design                     # allowed: prose + emoji + canonical enum
## Priority / Effort / Tags:              # free-text in v1

## Overview                               # problem statement, scope
## Goals                                  # 3–7 bullets

## Acceptance Scenarios                   # cross-cutting scenarios
### Scenario: <name>
- **WHEN** …
- **THEN** …

## Tasks                                  # linked ticket slugs
- [ ] TASK-<slug>

## Files (Target Surface — Read/Write Split)

## Migration Strategy
## Open Questions                         # optional
```

### 5.4 Status enum — single canonical set

```
draft → proposed → accepted → in_progress → blocked → done
                                          ↘ archived
                                          ↘ dropped
```

**Alias map** (migration uses; v1):

| Legacy string | Canonical |
|---|---|
| `🟡 Design`, `📝 Draft`, `Draft` | `draft` |
| `🟨 In Progress`, `In Progress` | `in_progress` |
| `✅ Resolved`, `[OK] Already resolved in dev — no code change needed`, `stale-resolved`, `fixed-in-worktree`, `Done` | `done` |
| `⬜ Not Started`, `open`, `Open` | `proposed` |
| `postponed`, `Postponed` | `dropped` |
| `blocked`, `Blocked` | `blocked` |

Index keys: `extid`, `hash`, `title`, `status` (canonical), `priority` (canonical), `epic`, `tags`, `source`, `git_issue`, `type`, `updated`, `frontmatter` (snapshot or `null`), `legacy_aliases` (list of legacy strings seen).

## 6. OpenSpec hybrid — proposal/design/specs/tasks per change

For **multi-ticket features** (epic with 5+ tasks or cross-cutting), a per-change bundle:

```
.plan/
  changes/                                     # NEW — optional; only when warranted
    encrypt-chat-key-rotation/
      proposal.md                              # WHY: problem + outcome
      design.md                                # HOW: technical approach
      specs/                                   # WHAT: requirement+scenario
        encryption.md
        rotation.md
      tasks.md                                 # WHO/WHEN: ordered checklist mapped to TASK-* files
      carryover.md                             # from scripts/spec/converge
      archive/                                 # after converge
```

**Rule:** `changes/` folder optional. Most tickets stay flat under `tickets/`. Only epic-scale or cross-cutting features use the bundle.

## 7. Bookkeep tooling — `scripts/spec/`

Each file ~80–120 LOC, bun-native, zero deps.

| File | Purpose |
|------|---------|
| `scripts/spec/index.ts` | CLI dispatcher (mirrors `scripts/worktree/index.ts` shape) |
| `scripts/spec/validate.ts` | Lints frontmatter + required sections; reports stale `updated`; rejects dup IDs; checks index entries match |
| `scripts/spec/index-build.ts` | Rewrites entries in `.plan/tickets/index.json` from `tickets/*.md` frontmatter; **preserves key schema**; flags drift |
| `scripts/spec/new.ts` | Scaffolds epic/feat/task/bug/idea/template with frontmatter + sections; bumps `revision`; adds new entry to `index.json`; creates git-issue (delegates to `scripts/worktree/ticket` if available) |
| `scripts/spec/migrate.ts` | Backfills legacy tickets; canonicalizes status/priority/effort; sets `_legacy: true`; preserves all prose |
| `scripts/spec/converge.ts` | Diffs merged branch commits against `Acceptance Scenarios`; emits `carryover.md` to the change bundle |
| `scripts/spec/archive.ts` | Moves `changes/<name>/` → `changes/archive/<date>-<name>/`; updates index entries |
| `scripts/spec/status.ts` | Prints human-readable summary (count by epic/status/priority) for backlog review |
| `scripts/spec/search.ts` | Fuzzy text search across `.plan/` |
| `scripts/spec/templates/{epic,feat,task,bug,idea,test,perf,wire,improve}.md` | YAML frontmatter + sectioned bodies |

**Constraints:** bun-native · zero deps · idempotent writes · fail-loud structured errors · preserve prose untouched during migrate · `_legacy: true` on migrated artifacts only.

**`index.json` contract:** schema unchanged. Entries gain `updated` + `frontmatter` (+ `legacy_aliases` for migrated ones); everything else intact.

## 8. Convergence discipline (loop-lore specific)

OpenSpec archives. Spec-Kit converges. Loop-lore has **worktrees** — natural convergence seam.

Sequence:

```
1. spec validate              # all green
2. spec new epic/task         # in worktree
3. <work>                     # commit + tests
4. worktree finalize          # merge to dev
5. spec converge <branch>     # NEW: diff merged commits vs spec Acceptance Scenarios
   - For each unchecked scenario, append "carryover" task
6. spec archive <name>        # move changes/ bundle to archive/
```

`scripts/spec/converge.ts` walks:

```bash
git log --oneline <base>..dev -- .plan/changes/<name>/ src/...
# Cross-walk against each `### Scenario` block in `specs/*.md`
# Emit open-scenario report to `.plan/changes/<name>/carryover.md`
```

## 9. Adoption plan (4 phases)

### Phase A — Schema + validate + index-build (1 worktree, this one)

- Land `scripts/spec/{index,validate,index-build,new,status,search}.ts`
- Land frontmatter templates (`scripts/spec/templates/*.md`)
- Land schema doc (`docs/spec/spec-schema.md`)
- Add `"spec": "bun run scripts/spec/index.ts"` to `package.json`
- Add `scripts/spec/validate` to `bun run check` (gated)
- **Reuse** `scripts/worktree/sync.ts`'s existing `index.json` writer as upstream; `scripts/spec/index-build.ts` becomes a thin validator in front

**Result:** new tickets/epics fail `check` if frontmatter invalid. Legacy still passes via `_legacy: true`.

### Phase B — Migration sweep (separate worktree)

- `spec migrate` on a dedicated worktree (no `dev` mutation)
- All ~2100 tickets frontmatter-stamped; `index.json` updated in place (entries canonicalized, schema preserved)
- `spec validate` green project-wide

### Phase C — Per-change bundle + converge (1 worktree)

- Land `scripts/spec/{converge,archive}.ts`
- Pick 2 in-flight epics; retroactively bundle into `changes/<name>/`
- Update `scripts/worktree/finalize` to call `spec converge` post-merge (optional hook, defaults off)

### Phase D — Extensions (as needed)

- `idea` extension (intake → research → decide → file)
- `bug` extension (assess → fix → test → close)
- `spec migrate --target=epic` for epic scaffold

## 10. Risks & non-goals

**Risks:**

1. **Migration drift** — `spec migrate` must be idempotent, preserve prose, set `_legacy: true` exactly once
2. **Frontmatter bloat** — agents add noise; lint must reject unknown keys
3. **Status drift** — `Medium` vs `medium` vs `med`; canonical + alias-mapped
4. **Index JSON inflation** — new fields could bloat the committed file; keep optional fields opt-in
5. **Refuse scope creep** — keep `changes/` optional; don't turn loop-lore into BMAD

**Non-goals (v1):**

- Cross-repo stores — defer to v2
- Web UI / kanban board — defer; CLI + markdown is the surface
- AI skill-pack personas — defer; integration is via `AGENTS.md` rule
- Telemetry — no
- Replacing `scripts/worktree/` — no; scripts/spec/ augments

## 11. Decision requests (pre-Phase A)

Three things to resolve before opening scripts/spec/* in this worktree:

1. **Hybrid shape confirm:** OpenSpec change bundle (large features) + Backlog.md frontmatter (all artifacts) — proceed?
2. **Adoption phase order:** A → B → C → D — proceed, or re-prioritize?
3. **`index.json` boundary:** scripts/spec/index-build.ts delegates to scripts/worktree/sync.ts (preserving canonical writers) vs. scripts/spec/ owns writes outright — preference?

(Nothing blocks spec drafting; sections 5–7 land either way; tooling choices above can finalize before commit.)

## 12. References

- GitHub Spec Kit — <https://github.com/github/spec-kit>
- Fission-AI OpenSpec — <https://github.com/Fission-AI/OpenSpec>
- Backlog.md — <https://github.com/MrLesk/Backlog.md>
- Diátaxis — <https://diataxis.fr/>
- loop-lore `.plan/` — 281 epics, ~2100 tickets in `tickets/` (prefix tally in JSON companion)
- loop-lore `scripts/worktree/` — CLI precedent for `scripts/spec/`
- loop-lore `scripts/worktree/sync.ts` — current `index.json` writer; target reuse seam
