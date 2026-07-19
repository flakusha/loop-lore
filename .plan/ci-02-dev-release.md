# Plan: CI-02 Dev Release from Master Merges

## Goal

Enable dev releases (pre-release versions) when merging feature branches to `master` via PR, without creating full releases.

## Current State

- `version-bump.ts` already generates dev versions for feature branches: `x.y.z-dev.YYYYMMDD.sha`
- No CI workflow publishes dev releases
- PR merges to master currently only trigger full release (CI-01)

## Required Work

1. **Create `.github/workflows/dev-release.yml`** workflow:
   - Trigger: `pull_request` merged to `master` (or `pull_request_target` for security)
   - Condition: Only if PR is from `feature/*` or non-release branch
   - Jobs:
     - `version-predict`: Run `bun run version:predict` on PR head (feature branch)
     - `build`: Run `bun run build` to verify build passes
     - `test`: Run `bun run test:unit` and `bun run test:e2e`
     - `publish-dev`: If all checks pass, publish dev package/artifact
       - For Bun: `bun publish --tag dev` (if package configured)
       - For Docker: build and push `loop-lore:dev-{sha}` image
       - For generic: upload build artifacts as workflow artifacts with dev version name

2. **Dev version format** (from `version-bump.ts`):
   - `{major}.{minor}.{patch}-dev.{YYYYMMDD}.{short-sha}`
   - Example: `0.1.0-dev.20260719.abc1234`

3. **Publish targets** (configurable):
   - GitHub Packages (npm registry) with `dev` tag
   - Docker Hub / GHCR with `dev-{sha}` tag
   - GitHub Release as "Pre-release" with dev artifacts

4. **Distinguish from true release**:
   - Dev release: PR merged to master from feature branch
   - True release: Direct push to master/release/* (CI-01)
   - Dev releases are pre-releases, not latest

## Acceptance Criteria

- [ ] PR from `feature/auth` merged to `master` → dev version `0.2.0-dev.20260719.abc123` published
- [ ] Dev release marked as "Pre-release" on GitHub
- [ ] Dev artifacts downloadable from workflow run
- [ ] Direct push to `master` (not via PR) → true release (CI-01), not dev release
- [ ] Failed checks → no dev release published

## Dependencies

- CI-03 (checks must pass first)
- CI-01 (release workflow for true releases)

## Effort

M (1-2 days)

## Files to Create/Modify

- `.github/workflows/dev-release.yml` (new)
- `.github/workflows/ci.yml` (shared quality checks)
- Update `package.json` with `publishConfig` for dev tag if needed
