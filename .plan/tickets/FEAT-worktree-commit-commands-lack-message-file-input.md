# FEAT: Worktree commit commands lack message file input

**Status:** ✅ Done (2026-09-02 — `-F`/`--message-file` shipped in `scripts/worktree/utils/message.ts`, wired into `commit`/`agent-commit`)
**Priority:** low
**Effort:** low

## Summary

## Problem

`worktree commit <message>` (`scripts/worktree/commands/commit.ts:16`) and `worktree agent-commit <branch> "<message>"` (`agent-commit.ts:25-26`) accept the commit message only as joined positional argv. No `-F <file>` / `--message-file` / stdin path.

## Impact

- Multi-paragraph messages require fragile shell quoting through the CLI; agents hit escaping failures and cannot pass generated commit bodies reliably (git itself supports `-F -`/`-s` but the CLI argv-joins everything before invoking).
- Body/subject separation, bullet lists, and non-ASCII are error-prone.

## Expected

Both commands accept either an inline message or `-F <path>` / `-` (stdin) for the message, e.g. `worktree agent-commit <branch> -F .tmp/msg.txt`. Precedence: message file > positional. Document in usage output.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
