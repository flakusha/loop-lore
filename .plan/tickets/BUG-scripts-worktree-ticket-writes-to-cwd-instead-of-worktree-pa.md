# BUG: scripts/worktree ticket writes to CWD instead of worktree path

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** small

## Summary

The `ticket` subcommand of `scripts/worktree/` resolves the ticket file path relative to CWD rather than the worktree path.\n\nReproduction:\n1. Run `bun run scripts/worktree/ new my-feature` from the parent dev checkout (/home/flak/git-ai/loop-lore/tree/browser-randomuuidv7) — creates tree/my-feature/\n2. Run `bun run scripts/worktree/ ticket TASK 'Title' 'Body'` from the parent dev checkout (still in CWD=parent).\n3. Observe: the new ticket file lands in the parent's .plan/tickets/ as untracked, NOT in tree/my-feature/.plan/tickets/.\n4. AGENTS.md's 'Mutating operations are worktree-only' rule is silently violated because the CLI auto-writes to CWD.\n\nExpected: `ticket` either (a) detects an active worktree from CWD and writes into that worktree's tree, or (b) errors out asking the user to cd into the worktree first, or (c) accepts a `--worktree <name>` flag.\n\nActual: silently writes to CWD regardless of worktree context.\n\nWorkaround in the meantime: after running `ticket` from the parent, copy the file into tree/<name>/.plan/tickets/ and delete the parent's stray copy. Confirmed during the browser-randomuuidv7 worktree bootstrap (2026-08-27).\n\nAcceptance:\n- `scripts/worktree ticket` writes the file into the active worktree's working tree (or refuses with a clear message).\n- Documented in scripts/worktree/index.mjs help text.\n- AGENTS.md 'worktree-only' rule remains enforceable without manual cleanup.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
