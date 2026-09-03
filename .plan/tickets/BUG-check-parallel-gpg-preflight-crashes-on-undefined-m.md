<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: check-parallel GPG preflight crashes on undefined m

**Status:** Done
**Priority:** high
**Effort:** Medium

## Summary

Dev HEAD regression from 8b3656db (fix(worktree): assertGpgUnlocked on every signing path; pre-flight in check runner). scripts/check-parallel.mjs line 173: const keyId = m?.[1]... reads m which is never defined - the AGENT_GPG_KEY_ID match line was dropped. ensureGpgWarm() is awaited in main() (line 700), so every bun run check from a clean worktree dies immediately with 'Check runner failed: m is not defined' before any check starts. Dev checkout masked it (report predates the merge). Repro: bun run scripts/worktree/ new any-name; cd tree/any-name; cp ../../.credentials.env .; bun run check -> instant crash. Proposed one-line fix inside ensureGpgWarm after readFileSync: const m = content.match(/^AGENT_GPG_KEY_ID=(.*)$/m); Owner: worktree/gpg tooling session. Documented interim workaround: CHECK_SKIP_GPG_PRECHECK=1 (sets state skipped, provenance reflects it).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Resolved by `b58a75f1 chore(format): dprint fmt on 20 files (assistant commands, config schema-class, async apply, middleware lifecycle, generation post-store, chat seen, scripts)` — the dprint run re-emitted `const m = /^AGENT_GPG_KEY_ID\s*=\s*["']?([^"'\n]*)["']?/m.exec(content,)` at `scripts/check-parallel.mjs:173` (git blame confirms). The pre-flight now successfully reads `keyId` from `.credentials.env` and exits with the `hint: gpg-no-key-id` or `hint: gpg-cold-cache` guidance instead of crashing. Interim workaround `CHECK_SKIP_GPG_PRECHECK=1` remains valid for worktrees without `.credentials.env` (sets `state: "skipped"` in the check report).
