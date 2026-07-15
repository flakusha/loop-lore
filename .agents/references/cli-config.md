# Development Commands & Configuration

Quick CLI reference for loop-lore. See `.agents/references/recommendations.md` for implementation guidance.

## Code Quality (Linting & Testing)

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `bun run lint`    | ESLint (strict + unicorn + sonarjs)      |
| `bun run lint:css`| Stylelint on source CSS                    |
| `bun run lint:html`| Markuplint on htmx/Alpine templates      |
| `bun run md:lint` | Markdownlint on docs/                      |
| `bun run typecheck`| TypeScript `tsc --noEmit`               |
| `bun run typecheck:coverage`| Type coverage (>=85%)           |
| `bun run check`   | All checks: typecheck → lint → format    |
| `bun run format`  | Prettier                                    |
| `bun test`        | Bun test runner (Jest-compatible)        |
| `bun test --coverage`| Test coverage report                   |

## Configuration Files

| File                    | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `eslint.config.mjs`     | Flat ESLint config                       |
| `.prettierrc`           | Code formatting                          |
| `.markdownlint.json`    | Markdown rules                           |
| `.stylelintrc.json`     | CSS linting                              |
| `.markuplintrc.json`    | HTML linting                             |

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

| Command                    | Description              |
| -------------------------- | ------------------------ |
| `bun run src/server.ts`  | Dev server              |
| `bun run tui`            | Terminal UI              |
| `bun run build`          | Production build          |