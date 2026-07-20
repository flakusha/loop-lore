# EPIC: Tooling Support & Improvement (Permanently Ongoing)

**Status:** 🟡 Permanently Ongoing
**Priority:** Medium
**Effort:** Continuous
**Type:** Ongoing Epic

## Summary

Tooling support and improvement — repo worktree management, agent support, IO, import/export, migrations, etc. Continuously improve developer experience and operational tooling.

## Scope

- Worktree management scripts
- Agent support tools
- IO utilities (import/export, migrations)
- Build pipeline improvements
- CI/CD enhancements
- Developer experience improvements

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| TASK-dev-tooling-updates | Biome 2.5.4, dprint 0.55.2, stylelint 17.14.1 | — | ✅ Complete |
| TASK-agents-scripts-worktree-docs | AGENTS.md + .agents worktree docs | Low | Not Started |
| TASK-branch-workflow-dev-stg-master | dev→stg→master branch workflow | Low | Post-0.1.0 |
| TASK-github-pages-vitepress | GitHub Pages VitePress docs site | Low | Not Started |

## Files

- `scripts/worktree.sh` — worktree management
- `scripts/gpg-unlock.sh` — GPG signing
- `.agents/` — agent configuration
- `.githooks/` — git hooks
- `docs/meta/build-deploy.md` — build documentation
