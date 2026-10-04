<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness commit grounding (unify + diff warns)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Unify the 3 commit-format layers on one type/scope table + advisory diff-derived grounding warns (scope-vs-paths, batch size, sign-remediation hint). Anti-hallucination primitive for agent-authored commits.
**Context:** Layers: SKILL.md prose (7 types, ≤50/72, batching ≤15, anti-patterns) → `message.ts validateMessage()` (shape only: SUBJECT_RE + no-trailing-period, accepts ANY lowercase type) → `commit-check.ts` CI (hardcoded VALID_TYPES/RECOMMENDED_SCOPES, fails unknown type; scope/length warnings-only; `.commitlint.yaml` orphaned — no reader). Message passes through verbatim (no diff cross-check). Flow: `commit.ts`/`commit-branch.ts` (validate → staged/dep guards → agent-key sign → verify → ledger); hooks do NOT gate giwt commits (`--no-verify`). GPG policy: never bypass, `giwt gpg-unlock`, stop-and-report.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] One table: export `VALID_TYPES` + scope list from `commit-check.ts` (or shared `commit-conventions.ts`), import in `validateMessage()`, generate `.commitlint.yaml` enums from it. Kills accept-here-fail-in-CI + yaml drift.
- [ ] Grounding (advisory first): after validate, `git diff --cached --name-only` → top dirs; WARN when `(scope)` matches none + `did-you-mean: <top-dir>`; WARN when staged > 15 files; WARN when subject tokens match no changed stem. Promote to error only after false-positive measurement. Reuses isolatedGitEnv + staged listing.
- [ ] `verify-commit` warn branch prints `hint: key-not-unlocked → run: giwt gpg-unlock` (reuses existing hint strings). Signing policy otherwise unchanged.
- [ ] Unit tests for table import + grounding warns on fixture diffs. NOT in scope: LLM messages, interactive prompts, new lint deps.

## Related Files

- `src/scripts/commit-check.ts`, `scripts/worktree/utils/message.ts`, `commands/commit.ts`, `commit-branch.ts`, `.commitlint.yaml`, `.agents/skills/commit-message/SKILL.md`
- `scripts/gpg-unlock.mjs`, `scripts/check-changelog.ts` (derive-from-artifact precedent)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: f279c9f
