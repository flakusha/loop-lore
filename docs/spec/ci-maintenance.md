# CI Maintenance Guide

## Overview

This repository uses GitHub Actions for CI/CD with conventional commits for automatic versioning.

## Commit Format

All commits must follow conventional commit format:

```
type(scope): short description (≤72 chars, no period)
```

### Types (required)

| Type                  | Triggers   | Description         |
| --------------------- | ---------- | ------------------- |
| `feat`                | minor bump | New feature         |
| `fix`                 | patch bump | Bug fix             |
| `feat!` / `refactor!` | major bump | Breaking change     |
| `refactor`            | none       | Code reorganization |
| `docs`                | none       | Documentation       |
| `test`                | none       | Tests               |
| `chore`               | none       | Tooling/config      |
| `style`               | none       | CSS/styling         |
| `perf`                | none       | Performance         |
| `build`               | none       | Build system        |
| `ci`                  | none       | CI/CD               |

### Scopes (recommended)

Use one of: `core`, `db`, `routes`, `server`, `middleware`, `config`, `logger`, `transport`, `assets`, `story`, `generation`, `actors`, `worlds`, `chats`, `messages`, `characters`, `frontend`, `tui`, `htmx`, `alpine`, `css`, `deps`, `security`, `crypto`, `testing`, `release`

## Pre-commit Hook

Install hooks:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

The hook validates your commit message format before commit creation. To skip: `git commit --no-verify`.

## Local Validation

```bash
# Check all commits since last tag
bun run commit:lint

# Validate a single commit message
echo "feat(core): add feature" | bun run src/scripts/commit-check.ts

# Predict next version
bun run version:predict
```

## Branch Strategy

| Branch            | Version Output                          |
| ----------------- | --------------------------------------- |
| `master` / `main` | Semver bump (0.2.0, 1.0.0, etc.)        |
| `release/0`       | 0.x.y (0.2.1, 0.3.0, etc.)              |
| `release/1`       | 1.x.y (maintained separately)           |
| `feature/*`       | dev version (0.1.0-dev.20260710.abc123) |

## Release Process

1. Push to master triggers workflow
2. Version is predicted from commits since last tag
3. If bump detected: annotated tag `vx.y.z` created
4. GitHub Release draft auto-generated

For hotfixes on existing releases:

```bash
git checkout v0.1.0  # or create from tag
git switch -c release/0  # or release/1, etc.
# ... make fix commits ...
git push origin release/0
```

## Adding New Scope

Edit `.commitlint.yaml` and add to `scope-enum`:

```yaml
scope-enum:
  - "new-scope"
```

The script-only validation (src/scripts/commit-check.ts) uses its own `RECOMMENDED_SCOPES` list - update both.

## CI Jobs Reference

| Job         | Trigger                  | Purpose                     |
| ----------- | ------------------------ | --------------------------- |
| `quality`   | PR/push                  | Typecheck, lint, format     |
| `test-unit` | PR/push                  | Unit tests (bun test)       |
| `test-e2e`  | PR/push                  | Browser tests (Playwright)  |
| `version`   | PR/push                  | Predict next version        |
| `build`     | PR/push                  | Build frontend + server     |
| `release`   | push to master/release/* | Create tag + GitHub Release |

## Troubleshooting

### CI Fails on Lint

Run locally: `bun run lint && bun run format:fix`

### E2E Tests Fail

Ensure safeguard is enabled: `E2E_SAFEGUARD=1 bun run test:e2e:browser`

### Version Prediction Wrong

Check commits since last tag: `git log --oneline $(git describe --tags --abbrev=0)..HEAD`

The prediction uses only `feat` (minor), `fix` (patch), and breaking changes (major). Other types are ignored.

### Hook Not Running

Ensure executable: `chmod +x .githooks/prepare-commit-msg`

Verify hooks path: `git config core.hooksPath` (should be `.githooks`)

## Multi-hosting Support

Templates for GitLab CI in `.github/templates/gitlab-ci.yaml`. Use `bun run .github/templates/generate.ts` to regenerate.

---

_Maintained by loop-lore contributors. Edit `docs/spec/ci-maintenance.md` for updates._
