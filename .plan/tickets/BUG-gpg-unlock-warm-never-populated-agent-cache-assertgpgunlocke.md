<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gpg-unlock warm never populated agent cache; assertGpgUnlocked cache-blind

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (already on dev, 2026-09-14)
**Priority:** high
**Effort:** Medium

## Summary

Two coupled bugs on gpg 2.5.21. (1) scripts/gpg-unlock.mjs prolong sent PRESET_PASSPHRASE --preset <grip> -1 <hex-timestamp>: the agent answers OK but only creates a phantom cache entry (KEYINFO cached=1, real sign still fails), so the CLI printed "Cache TTL refreshed" and exited 0 without ever warming; the real passphrase-preset form answers ERR 67108933 Not implemented. KEYINFO therefore cannot distinguish warm from phantom. (2) scripts/worktree/utils/gpg.ts assertGpgUnlocked gated commit/agent-commit/sign/merge/finalize on gpg --list-secret-keys, which reads the keyring and succeeds on a cold cache, so git commit -S spawned pinentry-tty and locked agent harnesses. Fix: cancel-mode trial sign as the only honest probe (never prompts, never hangs), warm via agent pinentry (TTY) or batch loopback passphrase (GIT_GPG_PASSPHRASE / ~/.gpg-passphrase), effectiveCacheTtl = min(default-cache-ttl, max-cache-ttl), regression tests in scripts/gpg-unlock.test.ts against a temp GNUPGHOME pinning the phantom-preset and no-op-warm failure modes.

## Resolution

Already fixed in dev by `efcbf6940` (fix(scripts): honest gpg cache probe + cold-cache signing preflight) and `dbb3bcc4f` (fix: corretly prolong cache). Verified 2026-09-14 against `dev` HEAD `0f1e8539`:

- `scripts/gpg-unlock.mjs:129-137` — `probeCachedPassphrase` is a cancel-mode trial sign (`--pinentry-mode cancel`, 15s cap): cannot prompt or hang; KEYINFO is no longer consulted, so phantom `PRESET_PASSPHRASE` entries cannot read as warm.
- `scripts/gpg-unlock.mjs:144-147,155-158` — warm via loopback batch passphrase (`warmCacheViaPassphrase`) or agent pinentry (`warmCacheViaPinentry`); the CLI re-probes after every warm path before reporting success (kills the historic no-op warmup).
- `scripts/gpg-unlock.mjs:80-85` — `effectiveCacheTtl()` = min(default-cache-ttl, max-cache-ttl), read from gpg-agent.conf (last occurrence wins, as in gpg).
- `scripts/gpg-unlock.mjs:165-175` — passphrase source: `GIT_GPG_PASSPHRASE` or `~/.gpg-passphrase`; absent + no TTY → explicit exit-1 with the warm hint instead of silent success.
- `scripts/worktree/utils/gpg.ts:136-148` — `assertGpgUnlocked` no longer trusts `--list-secret-keys` for cache state: after keyring checks it runs the cancel-mode probe and exits 1 with `hint: key-not-unlocked` on a cold cache, gating commit/agent-commit/sign/merge/finalize.
- `scripts/gpg-unlock.test.ts` — regression tests against a real gpg-agent in a temp GNUPGHOME pin both historic failure modes (phantom `PRESET_PASSPHRASE` entry; warm that does not populate the cache). Live run 2026-09-14: 6 pass, 0 fail. Live probe same day: "Cache is warm (verified by silent sign)".

No code change required.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
