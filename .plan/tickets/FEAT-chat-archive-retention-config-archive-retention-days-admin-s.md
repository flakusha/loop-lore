<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Chat archive retention config — archive_retention_days admin setting

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-archival-workflow
**Summary:** Add `archive_retention_days` admin setting (default 90) to `system_config`; refactor the chat-archive purge path to read it.
**Context:** gap-audit 2026-09-23 of `epic-archival-workflow` found only `log_retention_days` (audit-log scope) and the chat purge path hardcoded at 30 days; spec calls for a configurable 90-day chat-archive default.
**Acceptance Criteria:** `system_config.archive_retention_days` seeded at 90; `log_retention_days` unchanged; admin route allows read/update with non-positive integer validation; purge handler reads the value; existing tests still pass; epic retention policy bullet flips to ✅.

## Summary

## What

Chat archive retention is not configurable. The spec calls for a per-tenant admin-tunable retention window (90-day default) that governs when archived chats/messages become eligible for the daily GC sweep, but the only retention key today (`log_retention_days`) is audit-log scope and the chat purge path hardcodes 30 days.

## Why

- `src/admin/config.ts:144` seeds `log_retention_days = 90` with the description "Audit log retention in days". That key is owned by the logging module and is NOT a chat-archive retention knob.
- `src/routes/messages/archiving.ts:94` computes the purge cutoff with a literal `30 * 24 * 60 * 60 * 1000` constant. This contradicts the spec's 90-day default and ignores any admin override entirely.
- `.plan/epics/epic-archival-workflow.md` §Retention Policy lists "Default: 90 days in archived state" + "Configurable by admin in system settings", which is unimplemented.

## Scope

In scope:
- Add a new `archive_retention_days` key to `system_config` (default 90, description: "Chat archive retention in days before GC purge").
- Seed the key from `seedDefaults` in `src/admin/config.ts` alongside (not replacing) `log_retention_days`.
- Expose read + update through the existing admin config route (`GET/PATCH /api/admin/config` or equivalent).
- Refactor `src/routes/messages/archiving.ts:94` to read `archive_retention_days` from `system_config` instead of the hardcoded 30.
- Surface the value in any admin settings view that already lists retention knobs.

Out of scope:
- Replacing or renaming `log_retention_days` (audit log retention is a separate concern).
- Implementing the GC job itself — that is a separate ticket (`Chat archive GC job`).
- Per-chat retention overrides — the spec only requires a single global default for now.

## Acceptance Criteria

- [ ] `system_config.archive_retention_days` exists with default value `90` on fresh installs and is skipped if already present.
- [ ] `log_retention_days` remains unchanged (audit-log scope) and is not repurposed.
- [ ] Admin route allows reading and updating `archive_retention_days`; validation rejects non-positive integers.
- [ ] `src/routes/messages/archiving.ts` purge handler reads the retention window from config; no `30` literal remains.
- [ ] Existing tests still pass; new unit test asserts the purge cutoff honors the config override.
- [ ] Docs: `.plan/epics/epic-archival-workflow.md` §Retention Policy bullet becomes ✅ instead of pending; spec cross-link added.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
