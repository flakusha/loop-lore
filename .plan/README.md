# `.plan/` — In-Repository Planning

Distributed planning system using git-native-issue. Issues live in `refs/issues/<uuid>` and are linked to branches via commit trailers.

## Directory Structure

- `tickets/` — Individual task tickets (BUG-_, FEAT-_, FIX-_, IDEA-_, TASK-_, SOL-_)
- `epics/` — Major initiatives (EPIC-*)
- `solutions/` — Architectural solutions (SOL-*)
- `seeds/` — Research notes and planning seeds

## Extended Identifiers

| Type  | Prefix                      | Purpose |
| ----- | --------------------------- | ------- |
| BUG-  | Bug reports                 |         |
| FEAT- | Feature requests            |         |
| FIX-  | Non-bug fixes               |         |
| IDEA- | Research/experimental ideas |         |
| TASK- | Small tasks                 |         |
| SOL-  | Architectural solutions     |         |
| EPIC- | Major epics                 |         |

## Usage

```bash
# Create ticket
./scripts/worktree.sh ticket BUG 001 "Fix login crash"

# List open issues
./scripts/worktree.sh issues

# Create epic
./scripts/worktree.sh epic 16
```

## Commit Trailers

Link commits to issues:

```
Issue: BUG-2025-001
Epic: EPIC-16
Status: done
Solution: SOL-2025-001
```
