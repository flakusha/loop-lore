<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Review — dev 2026-08-26 Late Merges (NSFW Audit Regression + Formatting)

## Status: Proposed

**Priority:** Medium
**Labels:** review, nsfw, testing, tooling

## Summary

Analysis of the commits that landed on `dev` *after* the strict review batch began
(commits `58ba48dd` and `8703abb3`, both post review-start HEAD `a8ef4793`). The
review batch itself (`worlds/timelines` auth, message-search decode, gzip→LLM,
story-mode NSFW gate, db reinit archive) is tracked separately in
`epic-review-dev-2026-08-26-security-data-integrity-merges`.

Both late commits were read directly (diff + full test file). Verdict: one is a
correct, well-structured regression test for a previously-filed NSFW audit bug; the
other is pure dprint formatting with no logic change. No defects found. Two
follow-up TASKs track verification depth and formatting-hygiene, since the underlying
bugfixes are owned by others (not this review's responsibility).

## Overview

Two late dev merges analyzed; both clean. Two follow-up tasks filed (verification + CI hygiene).

## Current State (verified)

| Commit | Verdict | Evidence |
|---|---|---|
| `58ba48dd` fix(nsfw): regression test for soft-delete audit preservation (`BUG-nsfw-moderation-delete-destroys-audit-log`) | ✅ correct — test guards soft-delete audit; fix verified by test | `src/nsfw/moderation-service/data.test.ts` (221 lines). Asserts `moderation_actions` soft-deleted (`deleted_at` set, preserved), user-owned `nsfw_user_preferences` + reporter's own `content_flags` hard-deleted (other reporters' flags retained), `log_entries` audit row written, idempotent re-run leaves `deleted_at` unchanged, `exportUserData` excludes soft-deleted actions |
| `8703abb3` style(test): apply dprint formatting to `data.test.ts` | ✅ style only — no logic change | `git show`: 78 insertions / 78 deletions, same-file dprint reformat of the `58ba48dd` test file |

## Method

- `git show 58ba48dd 8703abb3` and full read of `src/nsfw/moderationa/...` no — of
  `src/nsfw/moderation-service/data.test.ts` (the regression test added in `58ba48dd`).
- Confirmed `8703abb3` is a mechanical dprint reformat (no semantic diff).

## Tickets

| Ticket | Scope |
|---|---|
| `TASK-nsfw-moderation-delete-audit-regression-verify` | confirm regression test (`58ba48dd`) fails on pre-fix code; `BUG-nsfw-moderation-delete-destroys-audit-log` marked fixed/verified |
| `TASK-dprint-formatting-enforced-ci-test-files` | enforce dprint formatting gate for new test files (prevent `8703abb3`-class churn) |

## Non-goals

- Implementing the NSFW audit fix or the dprint CI enforcement — both are owned
  elsewhere (this review only analyzes and tracks).
- Re-reviewing the earlier security/data-integrity batch (separate epic).
