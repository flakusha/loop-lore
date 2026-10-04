<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness ledger v2 (kinds + slot claims)

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Additive ledger v2 entry (`kind/prev/deps/gate`) + finalize slot-claim protocol with PID-liveness stale-reap. No distributed consensus, no CRDT — manual order via ledger + CONCERNS docs.
**Context:** Ledger today (`scripts/worktree/utils/ledger.ts:1-234`) is `{v,ts,pid,cmd,branch,msg}`, 50-record ring, CLI-scope only. Finalize lock (`finalize.ts`) already does O_CREAT|O_EXCL + `kill -0` stale-reap + ≤50 retries; history is linear stash-merge-pop onto dev.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Entry gains `kind: 'intent'|'outcome'|'gripe'|'signal'|'claim'`, `prev?` (sha chain), `deps?` (["GL-01"]), `gate?`; grep-compatible with v1 readers; `ledger.ts` dump supports `--last N --json` unchanged.
- [ ] Slot claim: append `{"kind":"claim","cmd":"finalize",branch,slot,by}` before finalizing; scan pending same-lineage claims first (wait/abort, never proceed blind); stale claims reaped by PID liveness.
- [ ] Conflict weighting: later claim wins by ledger ts; loser rebases + re-claims; unmerged paths → gripe record + exit 1 (no auto-resolution); generated files regenerate post-merge.
- [ ] Unit tests for claim scan/stale-reap/weighting. Cross-host DB externalization (nsfw_consent_state INSERT+UPDATE pattern) explicitly deferred.

## Related Files

- `scripts/worktree/utils/ledger.ts`, `commands/ledger.ts`, `commands/finalize.ts`, `merge.ts`, `rebase.ts`
- `src/middleware/nsfw-gate/consent-ledger.ts` (deferred cross-host pattern)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 9154b20
