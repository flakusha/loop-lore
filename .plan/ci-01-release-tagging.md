# Plan: CI-01 True Release Tagging

## Goal

Implement true release tagging via GitHub Actions: push to `master` or `release/*` → create annotated tag `vX.Y.Z` → auto-generate GitHub Release draft.

## Current State

- No GitHub Actions workflows exist (`.github/workflows/` missing)
- `src/scripts/version-bump.ts` exists and predicts version from conventional commits
- `package.json` has `version:predict` and `version:bump` scripts
- CI maintenance spec defines release process (docs/spec-planned/features/ci-maintenance.md)

## Required Work

1. **Create `.github/workflows/release.yml`** workflow:
   - Trigger: `push` to `master` and `release/*` branches
   - Jobs:
     - `version-predict`: Run `bun run version:predict` to get next version
     - `create-tag`: Create annotated tag `v{version}` if version bump detected
     - `github-release`: Create GitHub Release draft with auto-generated notes from commits since last tag
   - Use `GITHUB_TOKEN` for auth
   - Only run on protected branches (require branch protection rules)

2. **Branch protection rules** (document in plan, configure in GitHub UI):
   - Require status checks: `quality`, `test-unit`, `test-e2e`, `build`
   - Require PR reviews
   - Dismiss stale reviews on new commits

3. **Version bump logic** (already in `version-bump.ts`):
   - `master`/`main`: semver bump (feat→minor, fix→patch, feat!→major)
   - `release/X`: stays within X major version
   - Feature branches: dev version (x.y.z-dev.YYYYMMDD.sha)

## Acceptance Criteria

- [ ] Push to `master` with feat commit → creates tag `v0.2.0` → GitHub Release draft
- [ ] Push to `release/0` with fix commit → creates tag `v0.1.1` → GitHub Release draft
- [ ] Push to feature branch → no tag, no release
- [ ] Release notes include conventional commits since last tag
- [ ] Annotated tag includes tagger info and message

## Dependencies

- CI-03. None (foundation)

## Effort

M (1-2 days)

## Files to Create/Modify

- `.github/workflows/release.yml` (new)
- `.github/workflows/ci.yml` (new - shared quality checks)
- Document branch protection setup in `docs/spec/ci-cd.md`
