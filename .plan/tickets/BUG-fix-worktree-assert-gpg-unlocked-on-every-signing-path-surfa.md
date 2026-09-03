<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(worktree): assert GPG unlocked on every signing path; surface unlock command on failure

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Several scripts/worktree/* flows either skip the GPG unlock pre-check or fail opaquely on a cold gpg-agent cache, letting merges and squashes land unsigned in violation of AGENTS.md L279-286. Two complementary fixes close the gap: (1) scripts/worktree/utils/gpg.ts exports assertGpgUnlocked/assertAgentGpgUnlocked and replaces inline pre-checks in commit/agent-commit/sign/merge/finalize (direct + squash). Three failure modes distinguished by stderr hint prefix: key-not-in-keyring, key-not-unlocked, invalid-key; all exit 1. No --allow-unsigned escape hatch. (2) scripts/check-parallel.mjs runs ensureGpgWarm() pre-flight before runAllChecks (L162-168). --ci prolongs via PRESET_PASSPHRASE and refuses to start on cold cache; --plain/--fix on TTY falls through to loopback pinentry inherited from parent. .tmp/check-report.json provenance records warm/cold state. Full design: tree/worktree-investigate-gpg-unlock-ergonomics/.tmp/gpg-unlock-ergonomics-design.md (237 lines, all cited line numbers verified against current tree). Investigation on branch worktree/investigate-gpg-unlock-ergonomics; implementation requires a separate worktree.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
