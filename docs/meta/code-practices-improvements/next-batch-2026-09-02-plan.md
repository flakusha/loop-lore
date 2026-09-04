<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Bug resolution planning — for 2026-09-02 session

> **Status:** planning only, no code changes. Tracks newly filed + reopened BUGs
> surfaced during the 2026-09-01 dev-fix review + 5fa0b7d7 close-tickets sweep.
> This doc is the entry point for the next bug-resolution worktree(s).

## Newly filed (Not Started)

### 1. BUG-account-tier-custom-instructions-render-as-system-message-wi

**Priority:** medium · **Effort:** Medium
**Path:** `.plan/tickets/BUG-account-tier-custom-instructions-render-as-system-message-wi.md`

**Issue:** account-tier custom instructions render as system message without
injection preamble — **GM override vector**. Per the linked two-tier-custom-instructions
task, the system-message location lets the GM persona's system prompt override
account-tier instructions. Needs to inject a preamble marker (or move to user-context)
so account-tier precedence is preserved.

**Files likely involved (verify with grep):**
- `src/prompts/two-tier-system.ts` (if exists)
- `src/assistant/prompt-assembler.ts` (where tier injection happens)
- `src/characters/persona/` or `src/personas/`

**Suggested worktree:** `fix-account-tier-preamble` from `dev`
**Pre-work:** grep for "account.*tier" + "system.*message" to find the injection site;
read `TASK-two-tier-custom-instructions.md` to confirm precedence model.

### 2. BUG-dh-ratchet-regression-tests-lack-out-of-order-delivery-acros

**Priority:** medium · **Effort:** Medium
**Path:** `.plan/tickets/BUG-dh-ratchet-regression-tests-lack-out-of-order-delivery-acros.md`

**Issue:** DH-ratchet regression tests do not cover out-of-order delivery across the
ratchet boundary. Without this, a missed message after a key rotation could go
undetected or cause decryption failures on the next boundary.

**Files likely involved:**
- `src/crypto/dh-ratchet.ts`
- `src/crypto/dh-ratchet.test.ts` (add cases)
- Possibly `src/crypto/message-keys.ts`

**Suggested worktree:** `fix-dh-ratchet-out-of-order-tests`
**Pre-work:** read existing `dh-ratchet.test.ts`; identify the ratchet boundary
trigger; design 3-5 cases: (a) skip-1, (b) skip-many, (c) boundary-crossing skip,
(d) replay-with-skip, (e) store-and-forward replay.

## Reopened (production wiring coverage)

### 3. BUG-idempotency-cache-key-lacks-user-scope-cross-user-response-r

**Priority:** **high** · **Effort:** Medium
**Path:** `.plan/tickets/BUG-idempotency-cache-key-lacks-user-scope-cross-user-response-r.md`

**Issue:** Reopened (dev-fix review 2026-09-01). Production wiring coverage was
deleted by `f68a7321`. The idempotency cache key does not include `userId`, so
User A could be served User B's cached response on a replay. This is a **HIGH**
priority because it's a security boundary breach under concurrency.

**Files likely involved:**
- `src/middleware/idempotency/` (verify current state)
- `src/generation/idempotency-cache.ts` (key derivation)
- The git issue 6361c0d referenced in the ticket
- PR / commit f68a7321 to understand what wiring was deleted

**Suggested worktree:** `fix-idempotency-user-scope` from `dev`
**Pre-work:** **REQUIRED** read git log for f68a7321 to recover the deleted wiring;
read the linked git issue for the original incident context; understand the cache
key schema and where it's hashed/salted.

## Pre-validated fixes (already in worktrees from prior sessions, awaiting finalize)

These are from the `VALID_FIXED_WORKTREE` group identified in
`.tmp/ticket-categorization.json`:

| Branch / worktree | BUG(s) fixed | Status |
|---|---|---|
| `fix-character-avatar-idor` | `BUG-character-internal-traits-idor-cross-user-read-write-delet...` etc. | ⚠️ 2 dirty files (schemas/loop-lore-config.schema.json, src/assistant/prompt-assembler.ts) — needs agent commit + finalize |
| `fix-character-xss-batch-doc` | xss + doc BUGs | clean |
| `fix-chat-routes-batch` | chat routes BUGs | clean |
| `fix-command-dispatch-async-safety` | command dispatch BUGs | clean |
| `fix-csrf-hardening-batch` | CSRF hardening BUGs | clean |
| `fix-middleware-async-cancellation` | middleware async BUGs | clean |

**Recommendation for tomorrow:** fast-forward or drop the 6 stale worktrees first
(they predate today's merges and may be cleanly superseded by today's dev), then
pick up the 3 new/reopened BUGs above.

## Already-fixed-on-dev (no action)

These were filed during review but were found already resolved by recent merges.
Listed for completeness; do **not** re-open:

- BUG-bug-chat-seen-stopseenpolling-is-never-called (`11c88484`)
- BUG-bug-csrf-cookie-secure-flag-hardcoded-true (`ccac5b9d`)
- BUG-bug-csrf-verification-accepts-cookie-only-token (`ccac5b9d`)
- BUG-bug-logout-route-exempt-from-csrf-verification (`ccac5b9d`)
- BUG-e2e-test-client-never-sends-x-csrf-token (`fix-review-quickwins`)
- BUG-htmx-partials-403-after-csrf-hardening (`fix-review-quickwins`)
- BUG-promptoverride-schema-has-no-maxlength (`fix-review-quickwins`)

## Recommended tomorrow order (no code today)

1. **Survey** — read `git worktree list` and check head commits of the 6 stale
   worktrees; drop any that are now no-ops against `dev` (use
   `git worktree remove --force <path>` after confirmation).
2. **High priority first** — `BUG-idempotency-cache-key-lacks-user-scope` (high,
   security boundary).
3. **Medium** — `BUG-account-tier-custom-instructions-render-as-system-message-wi`
   (GM override vector — important but lower priority than the security boundary).
4. **Medium** — `BUG-dh-ratchet-regression-tests-lack-out-of-order-delivery-acros`
   (test coverage only, lower risk).
5. **Followup** — Alpine chat-view init crash (`BUG-alpine-init-crash-chat-view-store-undefined`)
   if a reproducible browser log becomes available; otherwise leave in
   `open-untriaged.md`.

## Tools / handoff

- Handoff doc pattern: `.tmp/feat-<slug>-handoff.md`
- Triage doc pattern: `.tmp/bugfix-batch-<date>-report.md`
- Each BUG in its own worktree: `bun run scripts/worktree/ new fix-<slug>`
- NEVER run `bun run check` (system OOM)
- NEVER bypass GPG signing
- Finalize: `bun run scripts/worktree/ finalize fix-<slug> --force`
