# Handoff: feat-bug-triage-batch-2

**Worktree**: `tree/feat-bug-triage-batch-2` (branch `feat-bug-triage-batch-2`)
**Base**: dev `17d261e3`
**Goal**: Triage and resolve the next batch of BUG tickets from `.plan/backlog/open-unbugged.md` and the categorized `.tmp/ticket-categorization.json`.

## Available triage data

**`.tmp/ticket-categorization.json`** has the full 104 VALID_FIXABLE BUGs grouped:
- `VALID_FIXABLE` (104): open, fixable in this codebase
- `VALID_FIXED_RESOLVED` (15): already on dev from prior batches (do not re-fix)
- `VALID_FIXED_WORKTREE` (15): already in worktrees (e.g. fix-character-xss-batch-doc, fix-character-avatar-idor, fix-csrf-hardening-batch, fix-chat-routes-batch, fix-command-dispatch-async-safety, fix-middleware-async-cancellation) — do not re-fix; finalize those worktrees first if the user says to
- `DUPLICATE` (15): skip
- `STALE_INVALID` (8): skip
- `NOT_BUG` (12): skip
- `FEDERATION_NOT_IMPLEMENTED` (13): skip — spec gap
- `R-NSFMW9` (1): skip

## Suggested 3-5 bug batches

Pick BUGs that:
1. Have clear root cause in code
2. Touch isolated files (no cross-cutting refactor)
3. Are medium-effort (1-3 file changes per BUG)
4. Already have working test infrastructure for the touched area

Read `.tmp/bugfix-batch-2026-09-01-report.md` for the prior batch's pattern (3 worktrees, agent-per-bug).

### Candidate bugs (review each ticket first)

From `.tmp/ticket-categorization.json` `VALID_FIXABLE` keys:

**High-priority short-list** (read full ticket, validate reproduction, then fix):
- `BUG-alpine-init-crash-chat-view-store-undefined` — frontend init order bug, likely small
- `BUG-chat-history-truncates-to-oldest-messages-drops-recent-turns` — chat history query, medium
- `BUG-example-dialogue-mes-example-few-shot-never-injected-include` — example parser, medium
- `BUG-chat-mention-silent-error-no-swall-all-clear` — chat mention, small
- `BUG-chat-fts-encrypt-mismatcher` — encryption bug, small
- `BUG-character-creation-wizard-unused` — wizard cleanup, small
- `BUG-emotion-mood-stale-llm-javadoc` — stale doc only (skip if just docs)
- `BUG-factories-reset-deletes-tables-without-transaction-silent-perm` — DB safety, medium
- `BUG-html-handler-csp-xss-headers-not-set` — security, medium
- `BUG-encrypted-payload-sniffing-misclassifies-user-json-as-pre-enc` — security, medium
- `BUG-getclientip-trusts-spoofable-proxy-headers-unconditionally` — security, small

## Process per bug

1. `bun run scripts/worktree/ new fix-<bug-slug>` (if not already in a shared batch)
2. Read full ticket from `.plan/tickets/BUG-<slug>.md`
3. Locate code via `grep` / `lsp`
4. Reproduce with minimal test or `bun test` snippet
5. Implement fix
6. Add regression test
7. Update ticket Status `[OK] Done` + Acceptance Criteria
8. Commit GPG-signed: `fix(<area>): <one-line summary>`
9. `bun run scripts/worktree/ finalize fix-<slug> --force`
10. Update `.tmp/bugfix-batch-2026-09-01-report.md` or write successor report

## Constraints

- **NEVER run `bun run check`** — system OOM (per memory)
- **NEVER bypass GPG signing** — stop on pinentry timeout
- Use `--force` on finalize to skip `bun run check`
- Run `bun test src/<area>/` only (not full suite)
- Follow `.agents/references/recommendations.md` patterns

## Output

When done:
- `.tmp/bugfix-batch-2026-09-01-batch-2-report.md` — list of fixed BUGs + commit SHAs
- All touched worktrees finalized and merged
- Updated `bugfix-batch-2026-09-01-report.md` triage list with status

Start by reading the ticket-categorization.json VALID_FIXABLE keys and the previous batch report `.tmp/bugfix-batch-2026-09-01-report.md`.
