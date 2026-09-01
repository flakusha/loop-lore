<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# `.plan/` — In-Repository Planning

Spec-driven planning system. Specs live in `.plan/`, active tracking via `git issue`.

## Directory Structure

| Folder                | Purpose                                                                                       | Count |
| --------------------- | --------------------------------------------------------------------------------------------- | ----- |
| `tickets/`            | Task specs (authoring, review, iteration)                                                     | ~761  |
| `epics/`              | Epic definitions (major initiatives, includes merged design/roadmaps/ideas/research/features) | ~174  |
| `backlog/`            | **Status queue (index + 8 tier files, split 2026-08-15)**                                     | 10    |
| `backlog/priority.md` | Priority index — file map + status header + milestone gates                                   | 1     |
| `backlog/open.md`     | Open index — file map + status header + next actions                                          | 1     |
| `epics-index.md`      | Epic registry index (generated)                                                               | 1     |

## Backlog Categories (`backlog/`)

The former monolithic `immediate.md` / `backlog.md` / `open-items.md` were split into
small single-purpose files, then re-consolidated (2026-08-08) into **two** backlog files
to cut duplication, then **re-split by priority/phasing (2026-08-15)** into index + tier
files. Indexes (`priority.md`, `open.md`) hold file maps + status; tier files hold detail.

| File                 | Holds                                                                                 | Reads-when                      |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| `priority.md`        | **Index** — status header, file map, milestone gates                                  | Working on priority / release   |
| `priority-p0-p2.md`  | P0–P2 — critical path, high priority, accessibility, core workstream + tier details   | Current work                    |
| `priority-p3-p5.md`  | P3–P5 — 0.1.0 core foundation value tiers, experience, wiring/search/polish           | 0.1.0 value tiers               |
| `priority-p6.md`     | P6+ — post-0.1.0 systems (RPG, Memory, Agentic), waves P6-0…P6-H, sequencing          | Deferred systems                |
| `priority-release-010.md` | Post-P3 road to happy 0.1.0, release artifacts, hardening, 0.1.0 Quick Wins       | Release prep                    |
| `open.md`            | **Index** — status header, file map, open/next actions, preserved notes               | Auditing what's open / deciding |
| `open-inflight.md`   | In-flight / decision queue (rows needing finalize-vs-defer call) + next actions       | Current decisions               |
| `open-debt.md`       | Dead/unwired code, schema drift / latent bugs, release hardening                       | Debt audit                      |
| `open-deferred.md`   | Item-systems deferred follow-ups (IS1–IS7), hardening / deferred clusters             | Deferred work                   |
| `open-closed.md`     | Closed (reference) — recent wiring log, security closed, resolved, preserved notes    | History / audit                 |

**Rules:**

- **One home per item.** Every item lives in exactly one backlog file; rows are moved
  (not mirrored) between files as they transition open → in-flight → priority/high-value.
- **Dedup:** `open-*.md` removes rows that mirror a `priority-*.md` tier; `priority-*.md`
  does not restate `open-*.md` debt.
- **Index integrity enforced by gate.** `bun run plan:backlog:sync` checks that every
  tier file appears in exactly one index file map (no orphans, no phantoms, no outside
  targets); `--fix` re-registers missing rows. Registered in `bun run check`
  (`backlog - index` gate).
- **Detail lives in `tickets/` + `epics/`**; category files are status views, not specs.
- **Active items** referenced by git issues point at their `.plan/backlog/*.md` source.

## Git Issue Integration

Git issues track active work. Each issue references its spec:

- **Spec source**: `.plan/tickets/<name>.md`
- **Git issue**: Active tracking, status updates, comments
- **Link**: Comment contains `Plan spec: .plan/tickets/<name>.md`

### Workflow

1. **Author spec** in `.plan/tickets/` (markdown, detailed)
2. **Create git issue** when work begins (references spec)
3. **Update** via `git issue comment` or `git issue state`
4. **Close** git issue when done; spec remains for reference

### Commands

```bash
# List open issues
./scripts/worktree.sh issues

# Show issue details
./scripts/worktree.sh show TASK-023

# Add comment (e.g., plan reference)
./scripts/worktree.sh comment TASK-023 -m "Plan spec: .plan/tickets/TASK-3d-view-modes.md"

# Change state
./scripts/worktree.sh state TASK-023 done
```

## Ticket Naming

| Type  | Prefix | Use for                          |
| ----- | ------ | -------------------------------- |
| TASK- | TASK-  | Small tasks, implementation work |
| FEAT- | FEAT-  | Feature requests                 |
| BUG-  | BUG-   | Bug reports                      |
| FIX-  | FIX-   | Non-bug fixes                    |
| IDEA- | IDEA-  | Research/experimental ideas      |
| SOL-  | SOL-   | Architectural solutions          |
| EPIC- | EPIC-  | Major epics (matches `epics/`)   |

## Integration Matrices

Cross-system integration tracking lives in top-level `matrix-*` files at `.plan/`
root — one file per domain scope:

| File | Scope | Companion epic |
| ---- | ----- | -------------- |
| `matrix-cross-mechanics.md` | RPG sub-system cross-mechanics gaps (G1–G42) + standardized `## Integration Points` template | (many RPG epics) |
| `matrix-federation-swarm.md` | Fediverse, messaging bridges, swarm CRDT sync — feature evaluation + integration points | `epic-federation-swarm-sync.md` |
| `matrix-precompiled-hot-binaries.md` | Native hot binary module integration points | `epic-precompiled-hot-binaries.md` |
| `matrix-story-coherence.md` | Story-coherence pipeline — pairwise integration gaps SC1–SC10 + shared contracts across the five coherence epics | `epic-perspective-narration-voice.md` +4 |

**Naming rule:** every integration matrix is named `matrix-<scope>.md` (kebab-case scope),
lives at `.plan/` root, and aggregates one domain's cross-system integration surface. Epics
carry their own `## Integration Points` section using the standardized template defined in
`matrix-cross-mechanics.md`; a matrix aggregates pairwise gaps and domain-scoped integration
points that span multiple epics.

**Next steps:** add further domain matrices (e.g. frontend↔backend, platform integrations)
as needed; new epics and tickets reference the relevant `matrix-<scope>.md` for cross-system
integration tracking.

## Commit Trailers

Link commits to issues:

```
Issue: TASK-023
Epic: EPIC-26
Status: done
```

## Plan ↔ Code Discovery

Two tools reconcile `.plan/` + `docs/` with `src/` so you can jump either
direction without grepping prose:

| Tool | Direction | Command |
| ---- | --------- | ------- |
| `check-md-links.ts` | `src/` comments → `.plan/` + `docs/` (stale-citation guard) | `bun run md:links` |
| `plan-code-map.ts` | `.plan/` + `docs/` → `src/` (reverse index) | `bun run plan:map` |

- **Reverse index** (`.plan/code-map.json`, generated): maps every `src/…` path
  referenced in plan/spec prose to the tickets/epics/specs that own it.
  `bun run plan:find src/rpg/quests/service` lists owners (exact or directory
  prefix match). Regenerate with `bun run plan:map`; freshness is gated in
  `bun run check` (`code-map - freshness`).
- **Source-comment guard**: `md:links` now also scans TypeScript comment text
  for `.plan/…` and `docs/…` citations and flags ones whose target no longer
  resolves (catches rot when specs/epics are renamed or merged).
