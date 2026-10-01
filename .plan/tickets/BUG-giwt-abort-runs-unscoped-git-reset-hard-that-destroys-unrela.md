<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt abort runs unscoped git reset --hard that destroys unrelated tracked work

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

## What

`giwt abort`'s conflicted-pop recovery path runs an **unscoped** `git reset --hard HEAD` on the dev checkout. No pathspec is supplied, so the reset is repo-wide and destroys tracked work that has nothing to do with the stash being popped — including work belonging to other live agents sharing the same dev checkout.

`scripts/worktree/commands/abort.ts:199-203`:

```ts
log("warn", `${entry.ref} pop conflicted — preserving stash, cleaning tree`,);
const head = gitSyncQuiet(repoRoot, "rev-parse", "HEAD",);
const reset = Bun.spawnSync(
  ["git", "-C", repoRoot, "reset", "--hard", head,],
  { stdout: "pipe", stderr: "pipe", env: isolatedGitEnv(), },
);
```

There is no `--` separator and no pathspec argument, and the reset carries **no comment at all** explaining its scope. The nearest merge-state rationale is at `abort.ts:48-51` — "Order matters: abort merge before pop stash, so a stash entry created for a merge doesn't get pulled onto a conflicted tree" — which covers the in-progress-merge abort loop at `abort.ts:163-178`, *not* the post-conflict reset. Step 2's own comment at `abort.ts:180-182` says only that the pure helpers keep stash selection testable. So the reset is repo-wide with nothing claiming otherwise.

> **Correction (2026-10-02).** An earlier revision of this ticket claimed the reset's intent was documented at `abort.ts:180-182`. That was wrong: `:180-182` is the step-2 stash-selection comment and says nothing about merge state. The technical claim is unchanged — the reset still has no pathspec and is still repo-wide — only the provenance of the "documented intent" was misattributed.

## Why it is worse than expected

The failure is not a partial revert of the conflicted paths. It is **repo-wide destruction, and files are REMOVED rather than merely reverted**.

Reproduced in a throwaway repo by the investigating agent, verbatim result:

- A staged brand-new file `unrelated.txt` was **DELETED outright** (staged adds are not preserved by `reset --hard`).
- Unstaged modifications to `other.txt` and `tracked.txt` were wiped.
- Only the untracked `extra.md` survived (untracked files are outside `reset --hard`'s scope by design).

So the blast radius of one `abort` invocation is *every tracked path in the repository*, not the paths involved in the conflict.

## Why it triggers at all

Stash selection is a bare, unanchored substring match with no identity binding.

`scripts/worktree/commands/abort.ts:47`:

```ts
export const FINALIZE_STASH_PREFIX = "worktree-finalize-";
```

`scripts/worktree/commands/abort.ts:146-148`:

```ts
export function selectFinalizeStashes(entries: StashEntry[]): StashEntry[] {
  return entries.filter((e) => e.message.includes(FINALIZE_STASH_PREFIX));
}
```

`includes()` with no anchoring. Nothing binds a selected entry to a branch name, a base HEAD sha, a PID, a run token, or recency. **Any stash whose message happens to contain the phrase `worktree-finalize-` is eligible**, and `abort.ts:191-192` pops every selected entry:

```ts
const pop = Bun.spawnSync(
  ["git", "-C", repoRoot, "stash", "pop", entry.ref],
  { stdout: "pipe", stderr: "pipe", env: isolatedGitEnv() },
);
```

## Second failure mode: silent stash destruction on a clean tree

When the dev tree is clean the pop **succeeds**, and there is no warning path at all. Observed:

- exit code `0`
- stdout `Dropped stash@{0} (<sha>)`
- stash count goes `1 -> 0` — the entry is gone
- the stashed untracked files land in dev as `??`

This is silent, unrecoverable loss of the finalize snapshot. The message logged is `success`, so the operator has no signal at all.

By contrast, on the *conflict* path the pop exits `1` with `The stash entry is kept in case you need it again`, and the stash **count is unchanged** — so the stash itself does survive that path. The `reset --hard` it then triggers is the actual destructive element, not the pop.

## Real occurrence on this repo

A finalize run on `~/git-ai/loop-lore` was reaped mid-flight and left two `worktree-finalize-*` stashes on the dev checkout:

- `stash@{0} 3e8c9d014062050ce798c34f31cb0d4c2b4efbc8 worktree-finalize-mupj74pc`
- `stash@{1} 5f1d374fb91fee9e4dc718cbd3ac750861637071 worktree-finalize-mupiyn2l`

`giwt abort --dry-run` proposed:

```
Restoring stash@{0}...
Restoring stash@{1}...
```

`stash@{1}` held a **stale** `.plan/tickets/index.json` plus a half-written `src/assistant/prompt-assembler.ts` edit. Diffing that stashed `index.json` against the dev HEAD gave **-13 / +26**: running `abort` would have regressed landed work by **reopening 13 already-closed wardrobe/moderation tickets**. The `abort` run was avoided.

## Documentation discrepancy

`AGENTS.md` states that `giwt abort` "NEVER deletes user-authored stashes, force-deletes branches, or resets to a remote ref". That much is technically true — the selected stashes are finalize-created, not user-authored. The gap is that the doc does **not** disclose the unscoped `reset --hard`, and does not say stash selection is a message substring rather than an ownership check. An operator following the documented recovery path reasonably assumes it is non-destructive.

## Acceptance Criteria

1. **Destruction is pinned by a test.** With unrelated dirty and staged files present in the repo plus a conflicting finalize stash, `abort` must leave those unrelated files byte-identical afterward.
2. **Stash selection is anchored to the owning finalize run**, not a message substring. A test with a decoy stash whose message merely contains the phrase `worktree-finalize-` must not be selected.
3. **Clean-tree pop behavior is decided and pinned.** A pop that would drop a stash entry either warns or is suppressed; a test pins whichever behavior is chosen.
4. **`AGENTS.md`'s `giwt abort` section documents the real behavior**, including that it is not safe to run against a dev checkout holding other agents' uncommitted work.

## Suggested fix shape (proposal only — NOT applied here)

- Anchor stash selection to identity the finalize run actually owns (branch name + base HEAD, or a run token embedded in the stash message) instead of a bare `includes()` substring.
- Replace the unscoped `reset --hard HEAD` with a pathspec-scoped reset limited to the merge being undone, or drop the reset entirely and leave the conflicted stash in place for a human to resolve.
- Decide and document whether a clean-tree pop should be suppressed or warned on.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
