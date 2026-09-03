<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(worktree): assert GPG unlocked on every signing path; surface unlock command on failure

**Status:** Done
**Priority:** high
**Effort:** Medium

## Summary

Several scripts/worktree/* flows either skip the GPG unlock pre-check or fail opaquely on a cold gpg-agent cache, letting merges and squashes land unsigned in violation of AGENTS.md L279-286. Two complementary fixes close the gap: (1) scripts/worktree/utils/gpg.ts exports assertGpgUnlocked/assertAgentGpgUnlocked and replaces inline pre-checks in commit/agent-commit/sign/merge/finalize (direct + squash). Three failure modes distinguished by stderr hint prefix: key-not-in-keyring, key-not-unlocked, invalid-key; all exit 1. No --allow-unsigned escape hatch. (2) scripts/check-parallel.mjs runs ensureGpgWarm() pre-flight before runAllChecks (L162-168). --ci prolongs via PRESET_PASSPHRASE and refuses to start on cold cache; --plain/--fix on TTY falls through to loopback pinentry inherited from parent. .tmp/check-report.json provenance records warm/cold state. Full design: tree/worktree-investigate-gpg-unlock-ergonomics/.tmp/gpg-unlock-ergonomics-design.md (237 lines, all cited line numbers verified against current tree). Investigation on branch worktree/investigate-gpg-unlock-ergonomics; implementation requires a separate worktree.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Resolved by `8b3656db fix(worktree): assertGpgUnlocked on every signing path; pre-flight in check runner`. Implements:

1. `scripts/worktree/utils/gpg.ts` — new helpers `assertGpgUnlocked(keyId)` (config-driven key, used by `commit.ts`/`sign.ts`) and `assertAgentGpgUnlocked()` (reads `AGENT_GPG_KEY_ID` from `.credentials.env`, used by `merge.ts`/`finalize.ts`). Both exit with `hint: gpg-cold-cache / Run: bun run scripts/gpg-unlock.mjs`.
2. `commit.ts` + `agent-commit.ts` + `sign.ts` — replace inline `gpg --list-secret-keys` blocks with `assertGpgUnlocked(config.agentGpgKeyId)`.
3. `merge.ts` — inserts `assertAgentGpgUnlocked()` before merge; converts silent `[]` from `gpgMergeFlags` into a hard fail.
4. `finalize.ts` — inserts `assertAgentGpgUnlocked()` before both direct-branch and `--squash` paths; both squash branch and merge branch now hard-fail on cold cache instead of producing unsigned commits.
5. `scripts/check-parallel.mjs` — pre-flight at runner start: tries `prolongCachedPassphrase` (silent), falls through to `warmCache` (loopback pinentry, TTY only) or `exit 1` with `hint: gpg-cold-cache`. State reflected in the check-report provenance (`warm`/`cold`/`skipped`).
6. `scripts/gpg-unlock.mjs` — minor refactor (32L diff) to be the canonical cold-cache helper surfaced by all 5 call sites.

The design note from the prior session lives at `tree/worktree-investigate-gpg-unlock-ergonomics/.tmp/gpg-unlock-ergonomics-design.md` (worktree-isolated, not merged to dev; the ticket was the user-facing deliverable per the user's request).
