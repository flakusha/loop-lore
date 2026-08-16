<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

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

| Task                                | Title                                         | Priority | Status      |
| ----------------------------------- | --------------------------------------------- | -------- | ----------- |
| TASK-dev-tooling-updates            | Biome 2.5.4, dprint 0.55.2, stylelint 17.14.1 | —        | ✅ Complete |
| TASK-agents-scripts-worktree-docs   | AGENTS.md + .agents worktree docs             | Low      | Not Started |
| TASK-branch-workflow-dev-stg-master | dev→stg→master branch workflow                | Low      | Post-0.1.0  |
| TASK-github-pages-vitepress         | GitHub Pages VitePress docs site              | Low      | Not Started |

## Files

- `scripts/worktree.sh` — worktree management
- `scripts/gpg-unlock.mjs` — GPG signing
- `.agents/` — agent configuration
- `.githooks/` — git hooks
- `docs/spec/build-deploy.md` — build documentation

> **Caution — formatter/linter drift:** Per AGENTS.md the project tooling is ESLint-centric (`eslint.config.mjs`, `bun run check`). The linked `TASK-dev-tooling-updates` already pins Biome 2.5.4. Adopting Biome as more than a secondary checker risks formatter/config drift unless it **replaces** ESLint as the single source of truth for lint+format. Keep one canonical toolchain until that migration is deliberately completed.

## Related Epics

- **Epic Code Quality & Best Practices** — lint/format ownership overlaps; Biome adoption must be reconciled with the ESLint-centric `bun run check` pipeline (see caution above).
- **Epic Testing & QA** — tooling improvements feed CI gates that QA relies on.
