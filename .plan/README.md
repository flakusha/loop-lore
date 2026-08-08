# `.plan/` — In-Repository Planning

Spec-driven planning system. Specs live in `.plan/`, active tracking via `git issue`.

## Directory Structure

| Folder                          | Purpose                                            | Count |
| ------------------------------- | -------------------------------------------------- | ----- |
| `tickets/`                      | Task specs (authoring, review, iteration)          | ~761  |
| `epics/`                        | Epic definitions (major initiatives, includes merged design/roadmaps/ideas/research/features) | ~174  |
| `backlog/`                      | **Status queue (consolidated: 2 docs)**         | 2     |
| `backlog/priority.md`           | Full priority ladder (P0–P6+) + 0.1.0 value tiers | 1   |
| `backlog/open.md`               | In-flight, debt, unwired code, deferred (P6+)   | 1     |
| `epics-index.md`                | Epic registry index (generated)                    | 1     |

## Backlog Categories (`backlog/`)

The former monolithic `immediate.md` / `backlog.md` / `open-items.md` were split into
small single-purpose files, then re-consolidated (2026-08-08) into **two** backlog files
to cut duplication:

| File            | Holds                                                              | Reads-when                     |
| --------------- | ------------------------------------------------------------------ | ------------------------------ |
| `priority.md`   | Full priority ladder P0–P6+ (critical path → core → 0.1.0 value tiers → release gate) | Working on priority / release  |
| `open.md`       | In-flight/decision queue, debt, unwired code, schema drift, deferred P6+ | Auditing what's open / deciding |

**Rules:**

- **One home per item.** Every item lives in exactly one backlog file; rows are moved
  (not mirrored) between `priority.md` and `open.md` as they transition open → in-flight →
  priority/high-value.
- **Dedup:** `open.md` removes rows that mirror a `priority.md` tier; `priority.md` does
  not restate `open.md` debt.
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
