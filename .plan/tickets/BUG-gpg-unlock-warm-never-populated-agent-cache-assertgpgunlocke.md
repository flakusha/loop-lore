<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gpg-unlock warm never populated agent cache; assertGpgUnlocked cache-blind

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Two coupled bugs on gpg 2.5.21. (1) scripts/gpg-unlock.mjs prolong sent PRESET_PASSPHRASE --preset <grip> -1 <hex-timestamp>: the agent answers OK but only creates a phantom cache entry (KEYINFO cached=1, real sign still fails), so the CLI printed "Cache TTL refreshed" and exited 0 without ever warming; the real passphrase-preset form answers ERR 67108933 Not implemented. KEYINFO therefore cannot distinguish warm from phantom. (2) scripts/worktree/utils/gpg.ts assertGpgUnlocked gated commit/agent-commit/sign/merge/finalize on gpg --list-secret-keys, which reads the keyring and succeeds on a cold cache, so git commit -S spawned pinentry-tty and locked agent harnesses. Fix: cancel-mode trial sign as the only honest probe (never prompts, never hangs), warm via agent pinentry (TTY) or batch loopback passphrase (GIT_GPG_PASSPHRASE / ~/.gpg-passphrase), effectiveCacheTtl = min(default-cache-ttl, max-cache-ttl), regression tests in scripts/gpg-unlock.test.ts against a temp GNUPGHOME pinning the phantom-preset and no-op-warm failure modes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
