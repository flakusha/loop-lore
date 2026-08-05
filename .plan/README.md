# `.plan/` — In-Repository Planning

Spec-driven planning system. Specs live in `.plan/`, active tracking via `git issue`.

## Directory Structure

| Folder                            | Purpose                                   | Count |
| --------------------------------- | ----------------------------------------- | ----- |
| `tickets/`                        | Task specs (authoring, review, iteration) | 112   |
| `epics/`                          | Epic definitions (major initiatives)      | 57    |
| `roadmaps/`                       | Implementation roadmaps                   | 5     |
| `research/`                       | Research artifacts, landscape analysis    | 2     |
| `implementation-plan.md`          | Active implementation checklist (v0.1)    | 1     |
| `future-features-plan.md`         | Full planned feature list                 | 1     |
| `external-integrations-plan.md`   | External integrations roadmap             | 1     |
| `epics-index.md`                  | Epic registry index                       | 1     |

> Note: `roadmaps/roadmap.md` is the master roadmap; the root-level planning docs above were relocated into `.plan/` alongside the existing folders.

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
