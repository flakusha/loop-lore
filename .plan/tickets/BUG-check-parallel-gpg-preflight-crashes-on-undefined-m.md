<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: check-parallel GPG preflight crashes on undefined m

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Dev HEAD regression from 8b3656db (fix(worktree): assertGpgUnlocked on every signing path; pre-flight in check runner). scripts/check-parallel.mjs line 173: const keyId = m?.[1]... reads m which is never defined - the AGENT_GPG_KEY_ID match line was dropped. ensureGpgWarm() is awaited in main() (line 700), so every bun run check from a clean worktree dies immediately with 'Check runner failed: m is not defined' before any check starts. Dev checkout masked it (report predates the merge). Repro: bun run scripts/worktree/ new any-name; cd tree/any-name; cp ../../.credentials.env .; bun run check -> instant crash. Proposed one-line fix inside ensureGpgWarm after readFileSync: const m = content.match(/^AGENT_GPG_KEY_ID=(.*)$/m); Owner: worktree/gpg tooling session. Documented interim workaround: CHECK_SKIP_GPG_PRECHECK=1 (sets state skipped, provenance reflects it).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
