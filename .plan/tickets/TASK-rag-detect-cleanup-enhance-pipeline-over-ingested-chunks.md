<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RAG detect-cleanup-enhance pipeline over ingested chunks

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-rag-extract-link
**Tags:** rag, extraction, cleanup

**Summary:** Stage-2 pipeline src/rag/enrich/: per-chunk detect (format/language/PII/NSFW flags via existing moderation+aux classifiers), cleanup (hash dedup, boilerplate strip, normalize; idempotent re-run), enhance (embedding backfill + stale refresh). Stage watermark per chunk; cron/scheduler background job.

**Context:** Ingested chunks carry no quality flags and accumulate boilerplate/duplicates; re-running cleanup over the corpus must be safe. Detection reuses existing moderation + aux-pipeline classifiers, no new model infra.

**Acceptance Criteria:**

- [ ] Re-running extraction over the same corpus is a no-op (test).
- [ ] Detection flags persist on chunk rows.
- [ ] `bun run check` green.
