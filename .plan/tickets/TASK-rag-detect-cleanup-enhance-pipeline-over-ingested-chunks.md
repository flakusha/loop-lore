<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RAG detect-cleanup-enhance pipeline over ingested chunks

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-rag-extract-link
**Tags:** rag, extraction, cleanup

## Summary

Stage-2 pipeline src/rag/enrich/: per-chunk detect (format/language/PII/NSFW flags via existing moderation+aux classifiers), cleanup (hash dedup, boilerplate strip, normalize; idempotent re-run), enhance (embedding backfill + stale refresh). Stage watermark per chunk; cron/scheduler background job. Acceptance: re-run is no-op (test); flags persist on chunk rows; check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
