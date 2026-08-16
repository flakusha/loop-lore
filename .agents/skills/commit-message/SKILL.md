---
name: commit-message
description: >
  Generate conventional commit messages from git diffs. Analyzes staged/unstaged
  changes, groups into logical batches, and writes subject+body following
  Conventional Commits with loop-lore project conventions.
version: 1.0.0
author: loop-lore contributors
license: Apache-2.0 OR MIT
metadata:
  agents:
    tags: [loop-lore, git, commit, conventional-commits, batching]
    related_skills: [loop-lore-context, loop-lore-tasks, caveman-commit]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Commit Message Skill

Generate crisp, conventional commit messages from `git diff` output.

## Workflow

1. Run `git status --short` — identify staged vs unstaged
2. Run `git diff --cached --stat` for staged, `git diff --stat` for unstaged
3. Read key diffs to understand intent (not full diff — stat + spot-check)
4. Group related files into batches (max ~15 files per batch)
5. For each batch, write one commit message

## Commit Message Format

### Subject line

```
type(scope): short imperative description
```

**Types:**

| Type       | When to use                                     |
| ---------- | ----------------------------------------------- |
| `feat`     | New feature for user or codebase                |
| `fix`      | Bug fix                                         |
| `refactor` | Code change that neither fixes nor adds feature |
| `test`     | Adding/updating tests (not test infrastructure) |
| `docs`     | Documentation only                              |
| `chore`    | Build, tooling, lint config, deps, formatting   |
| `style`    | CSS / styling changes (frontend)                |

**Scope:** Use the directory or module name, e.g. `providers`, `routes`, `middleware`, `frontend`, `e2e`, `crypto`, `assets`, `story`, `tui`, `db`.

**Subject rules:**

- <50 chars preferred, hard limit 72
- Imperative mood ("reorder", not "reordered" or "reorders")
- No trailing period
- Use `!` after type/scope for breaking changes

### Body (when needed)

Blank line after subject, then:

- **What** changed (specific files/patterns, not generic)
- **Why** it changed (motivation, problem being solved)
- **How** it changed (key implementation details only when non-obvious)

Use bullet points (`-`) for multiple changes. Each bullet is a complete sentence.

### Examples

```
refactor(providers): reorder ProviderError constructor params for ErrorOptions ergonomics

Move ErrorOptions (cause chaining) from 5th to 2nd position,
aligning with standard Error(message, options?) convention.

New signature: (message, options?, statusCode?, retryable?, retryAfter?)
Drops need for placeholder undefineds in the common case.
```

```
test(e2e): add E2E_SAFEGUARD, solo user seed, login rate limiter reset

- enforceE2eSafeguard() validates DB is :memory:, uploads under /tmp/,
  auth disabled — prevents accidental runs against real data
- seedSolo() creates Solo-role user + actor + chat so browser e2e tests
  in demo mode can find chat data
- resetLoginRateLimiter() clears process-global rate limiter between
  test files so sequential servers don't get locked out
```

```
refactor(routes): lint cleanup — try/catch over .catch(), remove disable comments

- Replace module-level let with const { value } wrapper in auth.ts
- Convert silent .catch(() => {}) to try/catch in chat participant inserts
- Remove stale eslint-disable directives (no-unnecessary-condition,
  sonarjs/regex-complexity, unicorn/no-break)
- Reorder variable declarations closer to first use
```

## Batching Rules

- Each batch is one `git add` + one commit
- Keep batches logically coherent (same concern, same module)
- Max ~15 files per batch — smaller is better
- Order batches: foundational changes first, dependent changes after
- Breaking API changes (reordered params, renamed exports) must be atomic
- Test-only batches should follow the code they test (adjacent in history)

## Anti-patterns

- **Don't** write "This commit..." or "This patch..." — just describe the change
- **Don't** list every file changed — group by theme
- **Don't** use vague scopes like `misc` or `other`
- **Don't** write a body that repeats the subject
- **Don't** mix unrelated concerns in one commit
