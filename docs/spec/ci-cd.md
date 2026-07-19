# CI/CD Pipeline

## Overview

loop-lore uses GitHub Actions for continuous integration and deployment. The pipeline enforces quality gates, runs tests, and automates releases based on conventional commits.

## Workflows

### 1. CI (`ci.yml`)

**Triggers:** PR to `master`/`release/*`, push to `master`/`release/*`

**Jobs (parallel):**

- `quality` - TypeScript typecheck, ESLint, Stylelint, Markuplint, dprint, markdownlint
- `test-unit` - Unit tests (`bun test src/ --concurrency=$(nproc)`)
- `test-e2e` - Playwright browser tests (`E2E_SAFEGUARD=1 bun run test:e2e:browser`)
- `build` - Frontend + server build (depends on quality + unit tests)
- `version-predict` - Shows next version on push to protected branches

**Required for merge:** All jobs must pass (enforced by branch protection)

### 2. PR Checks (`pr-checks.yml`)

**Triggers:** PR opened/synchronized/reopened

**Jobs:**

- `commit-lint` - Validates commit messages in PR against conventional commit format

### 3. Dev Release (`dev-release.yml`)

**Triggers:** PR merged to `master`

**Conditions:**

- Only runs if PR has `dev-release` label
- Creates pre-release with dev version (`x.y.z-dev.YYYYMMDD.sha`)
- Uploads build artifacts
- Creates GitHub Release (prerelease)

### 4. Release (`release.yml`)

**Triggers:** Push to `master`/`release/*` (branch), push tag `v*`

**Jobs:**

- `release` - On branch push:
  - Runs full CI pipeline
  - Predicts version from conventional commits
  - Creates annotated tag `vX.Y.Z` if bump detected
  - Generates release notes from commits since last tag
  - Creates GitHub Release with artifacts
- `release-tag-push` - On tag push:
  - Builds and creates GitHub Release from existing tag

## Version Strategy

| Branch      | Version Format | Example                     |
| ----------- | -------------- | --------------------------- |
| `master`    | Semver         | `0.2.0`, `1.0.0`            |
| `release/0` | `0.x.y`        | `0.1.1`, `0.2.0`            |
| `release/1` | `1.x.y`        | `1.0.1`, `1.1.0`            |
| `feature/*` | Dev            | `0.2.0-dev.20260719.abc123` |

**Bump rules:**

- `feat` → minor
- `fix` → patch
- `feat!` / `refactor!` → major
- Others → no bump

## Branch Protection Rules

Configure in GitHub → Settings → Branches → Branch protection rules:

```yaml
# Required status checks (must pass before merge)
required_status_checks:
  strict: true
  contexts:
    - "Quality Checks"
    - "Unit Tests"
    - "E2E Browser Tests"
    - "Build"

# PR requirements
required_pull_request_reviews:
  required_approving_review_count: 1
  dismiss_stale_reviews: true
  require_code_owner_reviews: false

# Other settings
enforce_admins: false
required_linear_history: true
allow_force_pushes: false
allow_deletions: false
```

## Local Development

Run full CI pipeline locally:

```bash
bun run ci
```

Individual checks:

```bash
bun run check:ci        # Quality checks (strict)
bun run check:fix       # Auto-fix formatting/lint
bun run test:unit:parallel
bun run test:e2e:browser
bun run build
```

Predict next version:

```bash
bun run version:predict
```

Bump version manually:

```bash
bun run version:bump --bump=patch  # or minor, major
```

## Pre-commit Hook

Installed via `git config core.hooksPath .githooks`:

```bash
# Runs on every commit
1. bun run format:fix          # Auto-format
2. bun run check               # Full quality checks
3. bun run test:unit           # Unit tests
4. E2E_SAFEGUARD=1 bun run test:e2e  # E2E tests (safeguarded)
```

Skip with: `git commit --no-verify`

## Dev Release Workflow

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes with conventional commits
3. Push and create PR to `master`
4. Add `dev-release` label to PR
5. Merge PR → triggers dev release workflow
6. Download artifacts from workflow run or GitHub Releases (prerelease)

## True Release Workflow

1. Ensure all desired commits are on `master` (via PR merges)
2. Push to `master` (or `release/X` for maintenance)
3. CI runs, detects version bump from commits
4. Annotated tag `vX.Y.Z` created and pushed
5. GitHub Release created with generated notes
6. Artifacts attached to release

## Hotfix Release

```bash
# From latest tag
git checkout v0.1.0
git switch -c release/0

# Make fix commits (type: fix)
git commit -m "fix(auth): resolve token refresh issue"

# Push to release branch
git push origin release/0

# CI creates tag v0.1.1 and GitHub Release
```

## Troubleshooting

### CI Fails Locally But Passes on GitHub

- Ensure `bun.lockb` is committed
- Run `bun install --frozen-lockfile` locally
- Check Node/Bun version matches CI (`1.2.x`)

### E2E Tests Flaky

- Run with `E2E_SAFEGUARD=1` (uses `:memory:` DB, `/tmp/` uploads)
- Check Playwright trace in workflow artifacts

### Version Prediction Wrong

```bash
# Check commits since last tag
git log --oneline $(git describe --tags --abbrev=0)..HEAD

# Manual prediction
bun run version:predict
```

### Release Not Created

- Check workflow ran on correct branch (`master` or `release/*`)
- Verify conventional commit format in recent commits
- Check `version-predict` job output in CI logs

## Secrets Required

| Secret         | Purpose                              |
| -------------- | ------------------------------------ |
| `GITHUB_TOKEN` | Auto-provided, creates releases/tags |

No additional secrets needed for basic CI/CD.
