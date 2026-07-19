# Plan: CI-03 Required CI Checks for Merge/Deploy

## Goal

Enforce that all GitHub Actions checks pass before allowing merge to `master` or deployment. Only dev releases allowed if checks fail (with manual override).

## Current State

- `package.json` has comprehensive `check` scripts:
  - `check:parallel` - runs typecheck, lint, format, markdown lint in parallel
  - `check:ci` - CI mode (fails on warnings)
  - `check:fix` - auto-fix mode
  - `check:full` - builds frontend then runs all checks
- Pre-commit hook runs `format:fix` + `check` + `test:unit` + `test:e2e` (with safeguard)
- No GitHub Actions workflows exist yet
- Branch protection not configured

## Required Work

1. **Create `.github/workflows/ci.yml`** - Main CI workflow:
   - Triggers: `pull_request`, `push` to `master`, `release/*`
   - Jobs (parallel):
     - `quality`:
       - `bun run check:ci` (typecheck + lint + format + markdown)
       - Must pass for merge
     - `test-unit`:
       - `bun run test:unit:parallel`
       - Must pass for merge
     - `test-e2e`:
       - `E2E_SAFEGUARD=1 bun run test:e2e:browser`
       - Must pass for merge (can be skipped for dev release with label)
     - `build`:
       - `bun run build`
       - Must pass for merge
     - `version-predict`:
       - `bun run version:predict`
       - Outputs next version for visibility

2. **Configure Branch Protection Rules** (via GitHub UI or `gh api`):
   - Protect `master` branch
   - Require status checks to pass:
     - `quality`
     - `test-unit`
     - `test-e2e`
     - `build`
   - Require PR reviews (1 approval)
   - Dismiss stale reviews on new commits
   - Require linear history (optional)
   - Include administrators (optional)

3. **Dev Release Exception** (for CI-02):
   - Allow merge with failed checks ONLY if:
     - PR has label `dev-release`
     - Manual approval from maintainer
   - Dev release workflow checks `dev-release` label before publishing

4. **Pre-commit Integration**:
   - Document that pre-commit runs same checks as CI
   - CI `check:ci` is stricter (fails on warnings)
   - Local `check:fix` can auto-fix most issues

## Acceptance Criteria

- [ ] PR to `master` blocked until all 4 checks pass (green checkmarks)
- [ ] Failed check shows details in PR checks tab
- [ ] `dev-release` label allows merge with failed checks (dev release only)
- [ ] Direct push to `master` blocked (requires PR)
- [ ] Pre-commit hook matches CI checks (local `bun run check:fix` fixes CI failures)
- [ ] Branch protection configured via code (infrastructure as code)

## Dependencies

- CI-01 (release workflow needs CI checks)
- CI-02 (dev release exception)

## Effort

L (2-3 days)

## Files to Create/Modify

- `.github/workflows/ci.yml` (new)
- `.github/branch-protection.yml` (for `gh api` import, or document manual steps)
- `.github/workflows/dev-release.yml` (update for check integration)
- Document in `docs/spec/ci-cd.md`
