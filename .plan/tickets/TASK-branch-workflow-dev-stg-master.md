# TASK: Branch Workflow — dev → stg → master

**Status:** [OK] Documented in `docs/meta/workflow.md` (Branch tiers section)
**Priority:** Low
**Effort:** Med

> The three-tier dev → stg → master promotion convention is now documented at
> `docs/meta/workflow.md#branch-tiers`. This ticket is closed; future work on
> branch automation (CI gating, branch protection rules, tag-bot) is tracked
> separately if/when it becomes a priority.


## Proposed Workflow

```
dev    ← most changes land here, default integration branch, can be unstable
  ↓
stg    ← stable checkpoint on top of dev; patch-level hotfixes + vetted subset
  ↓
master ← finalized releases only (signed tags); never direct commits
```

**stg is a stable SUBSET of dev, not a superset.** Fast-forwarding stg to dev is
expected behavior when stg has no divergent hotfixes. See `docs/meta/workflow.md`
for the full Branch tiers definition.

### Branch Protection Rules

| Branch   | Protected | Force Push | Direct Commits | CI Gate  | Merge Required |
| -------- | --------- | ---------- | -------------- | -------- | -------------- |
| `dev`    | No        | Yes        | Yes            | Optional | No             |
| `stg`    | Yes       | No         | No             | Required | PR from `dev`  |
| `master` | Yes       | No         | No             | Required | PR from `stg`  |

### Release Flow

1. **Feature complete on `dev`** — merge feature branches via worktree
2. **Promote to `stg`** — `git merge dev` or PR, triggers CI/CD → "beta" tag
3. **Validate on `stg`** — run full test suite, e2e, manual QA
4. **Release to `master`** — `git merge stg` or PR, triggers CI/CD → "release" tag

### Tagging Convention

- `dev` builds: `v0.1.0-dev.NNN` (auto-increment)
- `stg` builds: `v0.1.0-rc.N` (release candidate)

## Current State (2026-08-23)

Inverted relative to the proposed model — `stg` was checked out as a sibling
directory (`/home/flak/git-ai/loop-lore-stg/`) and accumulated 26 commits that
bypassed the dev → stg → master flow. After audit, all 19 non-merge stg-only
commits were parallel refactors of work already on `dev`. `stg` has been reset
to match `dev` and recreated as a proper worktree under `tree/stg/`. Workflow is
now documented in `docs/meta/workflow.md` (Branch tiers section).

## Tasks

Branch setup (done):
- [x] Create `dev` branch from current `master` (2026-08-21)
- [x] Create `stg` branch from current `master` (2026-08-21)

Documentation (done):
- [x] Document release process in `docs/meta/release-process.md`
- [x] Document branch tiers + promotion flow in `docs/meta/workflow.md` (2026-08-23)

Still pending (out of scope for this ticket — track separately if needed):
- [ ] Update `.github/workflows/ci.yml` to handle three branches
- [ ] Configure branch protection rules (GitHub settings)
- [ ] Update worktree CLI default base branch to `dev` (currently `master`)
- [ ] Update `AGENTS.md` to reference the dev → stg → master flow
- [ ] Add branch status badges to README
- [ ] Test full merge flow: feature → dev → stg → master (manual release)

## Files to Create

- `docs/meta/release-process.md` — release workflow documentation

## Files to Modify

- `scripts/worktree.sh` — default base branch
- `AGENTS.md` — branch references
- `CONTRIBUTING.md` — contribution guidelines
- `.github/workflows/ci.yml` — branch triggers

## Risk

Medium — requires coordinated branch setup, protection rules, and CI/CD changes. Test thoroughly before deploying.
