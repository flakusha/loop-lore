# CI/CD Improvement Plan Summary

## Overview

Four coordinated plans to implement production-ready CI/CD for loop-lore based on existing package.json scripts and CI maintenance spec.

## Plan Dependencies

```
CI-04 (Script Integration) ──┐
                             ├──→ CI-03 (Required Checks)
CI-01 (Release Tagging) ─────┤
                             ├──→ CI-02 (Dev Releases)
```

## Execution Order

1. **CI-04** - Create `ci.yml` and `pr-checks.yml` workflows using exact package.json scripts
2. **CI-03** - Configure branch protection rules requiring CI-04 checks
3. **CI-01** - Create `release.yml` for true releases (tags + GitHub Releases)
4. **CI-02** - Create `dev-release.yml` for dev releases from PR merges

## Worktree Strategy for Parallel Development

### Create Worktrees for Each Plan

```bash
# From repo root
./scripts/worktree.sh new ci-04-script-integration
./scripts/worktree.sh new ci-03-required-checks
./scripts/worktree.sh new ci-01-release-tagging
./scripts/worktree.sh new ci-02-dev-release
```

### Worktree Assignments

| Worktree                        | Branch                     | Plan  | Focus                            |
| ------------------------------- | -------------------------- | ----- | -------------------------------- |
| `tree/ci-04-script-integration` | `ci-04-script-integration` | CI-04 | Workflows, caching, package.json |
| `tree/ci-03-required-checks`    | `ci-03-required-checks`    | CI-03 | Branch protection, status checks |
| `tree/ci-01-release-tagging`    | `ci-01-release-tagging`    | CI-01 | Release workflow, tagging        |
| `tree/ci-02-dev-release`        | `ci-02-dev-release`        | CI-02 | Dev release workflow             |

### Parallel Workflow

1. Start with CI-04 (foundation - all others depend on it)
2. CI-03 can start once CI-04 workflows exist (branch protection references them)
3. CI-01 and CI-02 can run in parallel after CI-03 (both need required checks)

### Merge Strategy

```bash
# After each plan complete:
./scripts/worktree.sh finalize ci-04-script-integration  # merges to master, signs, removes worktree
./scripts/worktree.sh finalize ci-03-required-checks
./scripts/worktree.sh finalize ci-01-release-tagging
./scripts/worktree.sh finalize ci-02-dev-release
```

## Shared Workflow Components

### `.github/workflows/ci.yml` (CI-04)

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [master, release/**]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: "1.2.x" }
      - run: bun install --frozen-lockfile
      - run: bun run check:ci
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bun run test:unit:parallel
  test-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - uses: microsoft/playwright-github-action@v1
      - run: bun install --frozen-lockfile
      - run: E2E_SAFEGUARD=1 bun run test:e2e:browser
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bun run build
  version-predict:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bun run version:predict
```

### `.github/workflows/pr-checks.yml` (CI-04)

```yaml
name: PR Checks
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  commit-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bun run commit:check
```

## Branch Protection Configuration

Apply via `gh api` or GitHub UI:

```bash
gh api repos/:owner/:repo/branches/master/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["quality","test-unit","test-e2e","build"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null
```

## Validation Checklist

After all plans merged:

- [ ] `bun run check:ci` passes locally → CI `quality` passes
- [ ] `bun run test:unit:parallel` passes locally → CI `test-unit` passes
- [ ] `E2E_SAFEGUARD=1 bun run test:e2e:browser` passes locally → CI `test-e2e` passes
- [ ] `bun run build` passes locally → CI `build` passes
- [ ] PR to master blocked until all 4 checks green
- [ ] Push to master with feat commit → tag `vX.Y.Z` created → GitHub Release draft
- [ ] PR from feature/* merged to master → dev version published as pre-release
- [ ] Failed checks + `dev-release` label → merge allowed, dev release only
- [ ] Pre-commit hook matches CI (run `bun run check:fix` to sync)

## Effort Summary

| Plan      | Effort | Duration                                |
| --------- | ------ | --------------------------------------- |
| CI-04     | M      | 1-2 days                                |
| CI-03     | L      | 2-3 days                                |
| CI-01     | M      | 1-2 days                                |
| CI-02     | M      | 1-2 days                                |
| **Total** | **L**  | **~1 week** (parallelizable to ~3 days) |
