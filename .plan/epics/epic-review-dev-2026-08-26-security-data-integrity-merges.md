<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Strict Review — dev 2026-08-26 Merges (Security & Data-Integrity)

## Status: Proposed

**Priority:** High
**Labels:** review, security, data-integrity, auth, nsfw

## Summary

Strict (zero-trust) review of every `src/`-touching commit merged to `dev` on
2026-08-26. The day's merges are a security/data-integrity hardening batch:
world-timeline auth gating, message-search/content read-path leak fixes,
gzip/plaintext decode for LLM + exports, NSFW age-gate enforcement on story-mode
generation, and DB reinit archival.

Every claim was verified against the actual implementation (not intent) and backed
by an executed regression test or a direct read of the helper source. Backend
`tsc --noEmit` passed (whole-surface type consistency after the
`resolveMessageContent` signature change). See "Current State (verified)" and the
linked tickets. No source code was modified — this epic is review-only.

## Overview

Five changes verified correct; one data-loss defect and four follow-up tasks tracked as linked tickets.

## Current State (verified)

| Area | Verdict | Evidence |
|---|---|---|
| worlds/timelines auth (GET list / POST / GET one / DELETE) | ✅ fixed — 401 unauth, 404 hide, 403 owner | `src/routes/worlds/timelines.ts` + `timelines.test.ts` (pass) |
| message-search read-path leak (ciphertext / base64) | ✅ fixed — `resolveMessageContent` decodes before serialize | `src/routes/message-search/index.ts` + test (pass) |
| messages gzip decode → LLM + exports | ✅ fixed — central `resolveMessageContent` (identity / gzip / encrypted) | `src/routes/messages/helpers.ts`, `decodeContent` → `safeDecompress`; `chat-history.test.ts` (pass) |
| NSFW age-gate on story-mode generation | ✅ fixed — reuses `runContentHooks` (gate + emotion + mood + moderation) | `src/generation/auto-gen/{content-hooks,story-mode}.ts` + `content-hooks-nsfw-gate.test.ts` (pass) |
| `canAccessNsfw` default-deny | ✅ verified — disabled / no-auth / no-age-gate / underage all deny | `src/middleware/nsfw-gate/access.ts` |
| `isNsfwRating` canonical helper | ✅ verified — SFW actors never false-negative | `src/middleware/nsfw-gate/constants.ts` |
| `unauthorizedResponse` = 401 | ✅ verified | `src/routes/http-utils/responses.ts` + `status.ts` |
| `extractAuth` null userId when unauth | ✅ verified (code + test) | `src/routes/http-utils/status.ts` |
| db reinit archives previous DB | ⚠️ partial — archives, but destroys DB on rename failure | `src/db/reinit.ts` → `BUG-db-reinit-archive-destroys-previous-db-on-rename-failure` |
| backend typecheck (whole merge) | ✅ green | `bun run typecheck:tsc` |
| regression suite (4 files) | ✅ 29 pass / 0 fail | `bun test src/routes/worlds/timelines.test.ts src/routes/message-search.test.ts src/assistant/prompt/sections/chat-history.test.ts src/generation/auto-gen/content-hooks-nsfw-gate.test.ts` |

## Method

- Diffs read for every `src/` commit dated 2026-08-26 (88544034, e8e7a23d, dedcc7c1,
  19d136b8, 0e682a38, a7a444c0, plus the formatting/size commits 7517c79c / 2803cebb
  verified as non-logic).
- Helper implementations read directly: `resolveMessageContent`, `decodeContent`,
  `safeDecompress`, `canAccessNsfw`, `isNsfwRating`, `requireWorldAccess/Owner`,
  `unauthorizedResponse`, `extractAuth`, `archiveFile`.
- Regression tests executed as evidence (29 pass).
- `bun run typecheck:tsc` executed for whole-surface consistency (the
  `resolveMessageContent(database, message)` signature change is exercised across all
  call sites, including untested files).

## Tickets

| Ticket | Scope |
|---|---|
| `BUG-db-reinit-archive-destroys-previous-db-on-rename-failure` | cross-device / permission rename → `unlinkSync` → silent data loss |
| `TASK-message-search-cannot-index-compressed-or-encrypted-content` | FTS indexes base64 / envelope → large + encrypted messages unsearchable |
| `TASK-story-mode-runcontenthooks-integration-test` | assert blocked/false → not persisted; emotion propagated |
| `TASK-harden-canaccessnsfw-require-birth-date` | null `birth_date` bypasses hard age check |
| `TASK-resolve-message-content-unit-test-all-encodings` | cover brotli / zstd / encrypted error paths |

## Non-goals

- Re-litigating accepted policy: FTS indexing of compressed content is documented as a
  known limitation in `message-search.test.ts`, not a regression.
- Fixing the db reinit defect here — tracked as a BUG; this epic is review-only, code
  unchanged.
