# TASK: Branch Workflow — dev → stg → master

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med

## Summary

Establish a permanent three-tier branch workflow: `dev` (unstable, most changes) → `stg` (beta/release candidates) → `master` (finalized releases).

## Current State

- Single `master` branch for all work
- Worktrees used for parallel feature development
- No formal release staging

## Proposed Workflow

```
dev  ← most changes land here, can be unstable, NOT protected
  ↓
stg  ← release candidates, beta releases, MUST be stable
  ↓
master ← finalized releases, highest protection, reproducible CI/CD
```

### Branch Protection Rules

| Branch | Protected | Force Push | Direct Commits | CI Gate | Merge Required |
| ------ | --------- | ---------- | -------------- | ------- | -------------- |
| `dev` | No | Yes | Yes | Optional | No |
| `stg` | Yes | No | No | Required | PR from `dev` |
| `master` | Yes | No | No | Required | PR from `stg` |

### Release Flow

1. **Feature complete on `dev`** — merge feature branches via worktree
2. **Promote to `stg`** — `git merge dev` or PR, triggers CI/CD → "beta" tag
3. **Validate on `stg`** — run full test suite, e2e, manual QA
4. **Release to `master`** — `git merge stg` or PR, triggers CI/CD → "release" tag

### Tagging Convention

- `dev` builds: `v0.1.0-dev.NNN` (auto-increment)
- `stg` builds: `v0.1.0-rc.N` (release candidate)
- `master` releases: `v0.1.0` (semver)

## Tasks

- [ ] Create `dev` branch from current `master`
- [ ] Create `stg` branch from current `master`
- [ ] Update `.github/workflows/ci.yml` to handle three branches
- [ ] Configure branch protection rules (GitHub settings)
- [ ] Update `scripts/worktree.sh` default base branch to `dev`
- [ ] Update `AGENTS.md` to reflect new workflow
- [ ] Update `CONTRIBUTING.md` with branch guidelines
- [ ] Add branch status badges to README
- [ ] Document release process in `docs/meta/release-process.md`
- [ ] Test merge flow: feature → dev → stg → master

## Files to Create

- `docs/meta/release-process.md` — release workflow documentation

## Files to Modify

- `scripts/worktree.sh` — default base branch
- `AGENTS.md` — branch references
- `CONTRIBUTING.md` — contribution guidelines
- `.github/workflows/ci.yml` — branch triggers

## Risk

Medium — requires coordinated branch setup, protection rules, and CI/CD changes. Test thoroughly before deploying.
