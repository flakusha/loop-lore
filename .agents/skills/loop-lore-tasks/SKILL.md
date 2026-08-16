---
name: loop-lore-tasks
description: >
  Use when implementing a feature, fixing a bug, or writing tests for loop-lore.
  Provides task workflow: read docs, explore, plan, implement, verify.
version: 1.0.0
author: loop-lore contributors
license: Apache-2.0 OR MIT
metadata:
  agents:
    tags: [loop-lore, workflow, testing, implementation, verification]
    related_skills: [loop-lore-context, loop-lore-db]
---

# Loop-Lore Task Workflow

## 1. Read Relevant Docs

Before touching any feature, read the relevant spec in `docs/`:

| Feature            | Doc File                        |
| ------------------ | ------------------------------- |
| DB schema (all)    | `docs/spec/schema.md`           |
| Messages           | `docs/spec/messages.md`         |
| Users/sessions     | `docs/spec/users-sessions.md`   |
| Assets             | `docs/spec/assets.md`           |
| Actors             | `docs/spec/actors.md`           |
| Characters/persona | `docs/spec/character-setup.md`  |
| RPG mechanics      | `docs/spec/rpg-mechanics.md`    |
| Architecture       | `docs/spec/architecture.md`     |
| Build/deploy       | `docs/spec/build-deploy.md`     |
| Implementation     | `docs/spec/implementation.md`   |
| TUI                | `docs/spec/tui.md`              |
| Plugin system      | `docs/spec/plugin-system.md`    |
| Memory system      | `docs/spec/memory-system.md`    |
| Artifacts system   | `docs/spec/artifacts-system.md` |
| Plan / tasks       | `.plan/implementation-plan.md`  |
| Frontend UX        | `docs/frontend/overview.md`     |

## 2. Explore Existing Code

```bash
# Find similar patterns
bun run jscpd                          # Detect duplication
ls src/<feature>/                      # List all files in a feature

# Check existing tests
bun test --coverage                    # See what's tested
```

## 3. Plan

- What files change? (create/modify/delete)
- What tests need updating?
- Any side effects (migrations, config changes, docs updates)?
- Check `docs/plan.md` if this is part of the MVP roadmap

## 4. Implement

Follow coding conventions from `AGENTS.md`:

- **Types**: Interfaces > types; enums for fixed sets; strict mode
- **Files**: One class/feature per file; <200 lines preferred; `index.ts` exports public API
- **Naming**: camelCase vars/fns, PascalCase classes, UPPER_SNAKE_CASE constants, no `I` prefix
- **Async**: Always handle promises (await or .catch()); no bare `.then()` waterfalls
- **JSDoc**: All public exports — @param, @returns, @throws, @example
- **Imports**: Never import DB-specific modules in services/controllers (use Kysely types + db instance)

### Implementation Patterns (see `.agents/references/recommendations.md` for full docs)

- **Options-Object**: `function fn({ a, b, c, d? })` for 3+ params (94 existing interfaces)
- **Discriminated Unions**: Tagged unions for state modeling, prevent impossible states
- **Exhaustiveness Checking**: `assertNever` in default switch case for enum/union coverage
- **Branded Types**: `Brand<string, "UserId">` to prevent ID mix-ups across layers
- **Result Type**: `{ ok: true, value } | { ok: false, error }` — extend `JsonResult<T>` pattern
- **Factory Functions**: Single export with `ReturnType<typeof createXxx>` inference
- **State Machine**: `StateDef` + `StateMachine` for lifecycle states — guard at service boundary

## 5. Verify

```bash
bun run typecheck          # tsc --noEmit
bun run lint               # ESLint
bun run format             # Prettier check
bun run md:lint            # Markdownlint on docs/
bun run check              # All of the above
bun test                   # Run tests
bun test --coverage        # Coverage report
```

**Always** run `bun run check` before finishing. It writes
`.tmp/check-report.json` (provenance: branch, gitHead, mode, runId);
`bun run check:report-ls` aggregates status across all worktrees. A report
whose gitHead no longer matches HEAD is stale — rerun the check.

## 6. Commit

```bash
git add <files>
git commit -m "type(scope): description"
```

Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.

## Common Pitfalls

1. **Skipping doc reading.** Always read relevant `docs/` before implementing.
2. **Skipping `bun run check`.** Pushing without it causes CI failures.
3. **Bare `.then()` waterfalls.** Always await or .catch().
4. **Forgetting migration files.** Schema changes need a migration, not just a type update.
5. **Importing DB-specific modules in services.** Use Kysely types + db instance only.
6. **Pushing without user permission.** The project prohibits `git push` unless explicitly requested.
