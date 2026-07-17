# CI Maintenance Guide

GitHub Actions CI with conventional commits for automatic versioning.

## Commit Format

```
type(scope): short description (≤72 chars, no period)
```

### Types

| Type                                                                | Bump  | Scope           |
| ------------------------------------------------------------------- | ----- | --------------- |
| `feat`                                                              | minor | New feature     |
| `fix`                                                               | patch | Bug fix         |
| `feat!` / `refactor!`                                               | major | Breaking change |
| `refactor`, `docs`, `test`, `chore`, `style`, `perf`, `build`, `ci` | none  |                 |

### Scopes

`core`, `db`, `routes`, `server`, `middleware`, `config`, `logger`, `transport`, `assets`, `story`, `generation`, `actors`, `worlds`, `chats`, `messages`, `characters`, `frontend`, `tui`, `htmx`, `alpine`, `css`, `deps`, `security`, `crypto`, `testing`, `release`

## Pre-commit Hook

Validates commit message format. Skip: `git commit --no-verify`.

## Local Validation

## Branch Strategy

| Branch            | Version Output                   |
| ----------------- | -------------------------------- |
| `master` / `main` | Semver bump (0.2.0, 1.0.0, etc.) |
| `release/0`       | 0.x.y (0.2.1, 0.3.0, etc.)       |
| `release/1`       | 1.x.y                            |
| `feature/*`       | dev (0.1.0-dev.20260710.abc123)  |

## Release Process

1. Push to master → version predicted from commits since last tag
2. If bump detected: annotated tag `vx.y.z` created
3. GitHub Release draft auto-generated

Hotfixes: `git checkout v0.1.0 && git switch -c release/0 && ... && git push origin release/0`

## Adding New Scope

Edit `.commitlint.yaml` `scope-enum` list. Also update `RECOMMENDED_SCOPES` in `src/scripts/commit-check.ts`.

## CI Jobs

| Job         | Trigger                  | Purpose                     |
| ----------- | ------------------------ | --------------------------- |
| `quality`   | PR/push                  | Typecheck, lint, format     |
| `test-unit` | PR/push                  | Unit tests                  |
| `test-e2e`  | PR/push                  | Browser tests (Playwright)  |
| `version`   | PR/push                  | Predict next version        |
| `build`     | PR/push                  | Build frontend + server     |
| `release`   | push to master/release/* | Create tag + GitHub Release |

## Troubleshooting

- **Lint fails**: `bun run lint && bun run format:fix`
- **E2E fails**: `E2E_SAFEGUARD=1 bun run test:e2e:browser`
- **Version prediction wrong**: `git log --oneline $(git describe --tags --abbrev=0)..HEAD`
- **Hook not running**: `chmod +x .githooks/prepare-commit-msg` and verify `git config core.hooksPath`

## Multi-hosting

GitLab CI templates in `.github/templates/gitlab-ci.yaml`. Regenerate: `bun run .github/templates/generate.ts`.
