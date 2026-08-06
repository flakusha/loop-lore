# `.plan/` — In-Repository Planning

Spec-driven planning system. Specs live in `.plan/`, active tracking via `git issue`.

## Directory Structure

| Folder                          | Purpose                                            | Count |
| ------------------------------- | -------------------------------------------------- | ----- |
| `tickets/`                      | Task specs (authoring, review, iteration)          | ~539  |
| `epics/`                        | Epic definitions (major initiatives)               | ~169  |
| `backlog/`                      | **Status queue, split by priority/value/activity** | 4     |
| `backlog/priority.md`           | High-priority workstack (P0–P2)                    | 1     |
| `backlog/high-value.md`         | 0.1.0 value tiers (P3–P5) + release gate           | 1     |
| `backlog/active.md`             | Ongoing / in-flight + decision queue               | 1     |
| `backlog/open.md`               | Open debt, unwired code, deferred (P6+)            | 1     |
| `roadmaps/`                     | Implementation roadmaps                            | 5     |
| `research/`                     | Research artifacts, landscape analysis             | 2     |
| `design/`                       | Design reconciliations                             | 5     |
| `ideas/`                        | World/chat navigation proposals                    | 9     |
| `features/`                     | Feature specs                                      | 1     |
| `implementation-plan.md`        | Active implementation checklist (v0.1)             | 1     |
| `future-features-plan.md`       | Full planned feature list                          | 1     |
| `external-integrations-plan.md` | External integrations roadmap                      | 1     |
| `epics-index.md`                | Epic registry index (generated)                    | 1     |

## Backlog Categories (`backlog/`)

The former monolithic `immediate.md` / `backlog.md` / `open-items.md` were split into
four small, single-purpose files to cut context pressure and remove duplication:

| File            | Holds                                                              | Reads-when                     |
| --------------- | ------------------------------------------------------------------ | ------------------------------ |
| `priority.md`   | P0–P2 tiers (critical path, high priority, core workstream)        | Working on priority work       |
| `high-value.md` | P3–P5 0.1.0 value tiers + Post-P3 release gate + milestone gates   | Triaging 0.1.0 scope / release |
| `active.md`     | Ongoing / in-flight + open decision queue (finalize-vs-defer)      | Deciding what to do next       |
| `open.md`       | Open debt (security/access), dead code, schema drift, deferred P6+ | Auditing what's open           |

**Rules:**

- **One home per item.** Every item lives in exactly one category file; rows are moved
  (not mirrored) between files as they transition active → priority/high-value → open.
- **Dedup:** `active.md` removes rows that mirror a `priority.md`/`open.md` row.
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

## Commit Trailers

Link commits to issues:

```
Issue: TASK-023
Epic: EPIC-26
Status: done
```
