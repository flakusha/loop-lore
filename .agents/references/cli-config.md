# Development Commands & Configuration

Quick CLI reference for loop-lore. See `.agents/references/recommendations.md` for implementation guidance.

## Code Quality (Linting & Testing)

| Command                      | Description                           |
| ---------------------------- | ------------------------------------- |
| `bun run lint`               | ESLint (strict + unicorn + sonarjs)   |
| `bun run lint:css`           | Stylelint on source CSS               |
| `bun run lint:html`          | Markuplint on htmx/Alpine templates   |
| `bun run md:lint`            | Markdownlint on docs/                 |
| `bun run typecheck`          | TypeScript `tsc --noEmit`             |
| `bun run typecheck:coverage` | Type coverage (>=85%)                 |
| `bun run check`              | All checks: typecheck → lint → format |
| `bun run format`             | Prettier                              |
| `bun test`                   | Bun test runner (Jest-compatible)     |
| `bun test --coverage`        | Test coverage report                  |

## Configuration Files

| File                 | Purpose            |
| -------------------- | ------------------ |
| `eslint.config.mjs`  | Flat ESLint config |
| `.prettierrc`        | Code formatting    |
| `.markdownlint.json` | Markdown rules     |
| `.stylelintrc.json`  | CSS linting        |
| `.markuplintrc.json` | HTML linting       |

## Pre-commit Hook Setup

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

Runs on commit: format → check → unit tests → e2e (with safeguards).

## Database

- **SQLite**: `bun:sqlite` native (no better-sqlite3)
- **Queries**: Kysely with bind parameters (never interpolation)
- **Migrations**: `src/db/migrations/`, Kysely Migrator
- **Migrations are source of truth**

## Running

| Command                 | Description      |
| ----------------------- | ---------------- |
| `bun run src/server.ts` | Dev server       |
| `bun run tui`           | Terminal UI      |
| `bun run build`         | Production build |

## Native Issue Tracking

| Command | Description |
|---------|-------------|
| `./scripts/worktree.sh ticket TYPE ID "Title"` | Create ticket + worktree (BUG/FIX/FEA/IDEA/TASK/SOL) |
| `./scripts/worktree.sh epic NUM` | Create epic branch + worktree |
| `./scripts/worktree.sh issues` | List open issues with branch mapping |
| `./scripts/worktree.sh issue <args>` | Run git-issue command directly |

### Extended Identifiers

| Type | Prefix | Example |
|------|--------|---------|
| Bug | BUG- | BUG-2025-001 |
| Feature | FEA- | FEA-2025-042 |
| Fix | FIX- | FIX-2025-002 |
| Idea | IDEA- | IDEA-2025-023 |
| Task | TASK- | TASK-2025-007 |
| Solution | SOL- | SOL-2025-001 |
| Epic | EPIC- | EPIC-16 |

## RTK Commands (Token-Efficient Output)

**Golden Rule**: Always prefix commands with `rtk`. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

Even in command chains with `&&`, use `rtk`:

```bash
rtk git add . && rtk git commit -m "msg" && rtk git push
```

### Build & Compile (80-90% savings)

```bash
rtk tsc         # TypeScript errors grouped by file (83%)
rtk lint        # ESLint violations grouped (84%)
rtk bun run build # Build output compressed
```

### Test (90-99% savings)

```bash
rtk bun test          # Failures only (99% on passing tests)
rtk vitest            # Vitest failures only (99.5%)
rtk test <cmd>        # Generic test wrapper - failures only
```

### Git (59-80% savings)

```bash
rtk git status    # Compact status
rtk git log       # Compact log (works with all flags)
rtk git diff      # Compact diff (80%)
rtk git add       # Ultra-compact
rtk git commit    # Ultra-compact
```

### Files & Search (60-75% savings)

```bash
rtk ls <path>       # Tree format, compact
rtk find <pattern>  # Grouped by directory
```

### Meta Commands

```bash
rtk gain            # View token savings statistics
rtk proxy <cmd>     # Run command without filtering (debug)
```

Typical savings: **60-99%** on common development operations.
