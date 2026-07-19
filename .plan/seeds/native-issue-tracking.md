# Native Issue Tracking Research

**Date**: 2026-07-19
**Status**: Seed document (to be expanded)

## Tool Assessment: git-native-issue

- Version: 1.3.3
- Format: Git-native (commits + trailers + refs)
- Storage: `refs/issues/<uuid>` chains
- Merge: Three-way merge with LWW for scalars, set-merge for labels

## Extended Identifiers

| Type     | Prefix | Examples                  |
| -------- | ------ | ------------------------- |
| Bug      | BUG-   | BUG-2025-001              |
| Feature  | FEA-   | FEA-2025-042              |
| Fix      | FIX-   | FIX-2025-001              |
| Idea     | IDEA-  | IDEA-2025-023             |
| Epic     | EPIC-  | EPIC-16 (matches plan.md) |
| Task     | TASK-  | TASK-2025-007             |
| Solution | SOL-   | SOL-2025-001              |

## Branch Conventions

- `epic/16-observability` - Epic development branch
- `ticket/BUG-2025-001-fix-foo` - Bug fix branch
- `ticket/FIX-2025-042-bar` - Fix branch
- `solution/SOL-2025-001-architecture` - Solution branch
- `idea/IDEA-2025-023-research` - Research branch

## Commit Trailers

```
Issue: BUG-2025-001
Epic: EPIC-16
Status: done
Solution: SOL-2025-001
```

## Integration Points

1. `scripts/worktree.sh` - add `issue` command
2. Branch naming - auto-prefix with type
3. Export to changelog - link closed issues to releases
