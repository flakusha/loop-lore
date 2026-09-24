<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Archive retention hardcoded 30 days — should be configurable 90-day default

**Status:** done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-archival-workflow
**Summary:** Make the chat-archive purge cutoff configurable via `archive_retention_days` admin setting; default 90 days instead of the hardcoded 30.
**Context:** gap-audit 2026-09-23 of `epic-archival-workflow` flagged the hardcoded 30-day literal at `src/routes/messages/archiving.ts:94`; the spec calls for a 90-day default configurable through admin settings.
**Acceptance Criteria:** The `30 * 24 * 60 * 60 * 1000` literal is removed; `archive_retention_days` defaults to 90 when unset; unit test asserts config-driven cutoff; no behavior change for callers other than the retention window.

## Summary

## What

The chat-message archive purge cutoff is hardcoded to 30 days at src/routes/messages/archiving.ts:94:

```ts
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
```

The 30-day window is a magic number baked into the purge handler, not sourced from admin configuration. There is no way for operators to tune retention without editing code and redeploying.

## Why

- gap-audit (2026-09-23) for epic-archival-workflow flagged the hardcoded literal as a bug-shape gap: the spec calls for a **configurable 90-day default**, not a 30-day hardcode.
- src/admin/config.ts already exposes related retention knobs (e.g. log_retention_days) — the chat archive retention should follow the same admin-config pattern, not diverge with a literal in a route file.
- Hardcoded retention values are an audit risk: changing the retention policy requires a code change rather than a config update, and the drift between the literal (30) and the spec (90) shows the code is already out of sync.

## Scope

**Touch:**
- src/routes/messages/archiving.ts — replace the 30-day literal at line 94 with a read from admin config; default to **90 days** when the config key is missing or unset.
- src/admin/config.ts — add (or extend) an admin setting such as `archive_retention_days` with a documented default of 90, alongside the existing `log_retention_days`.
- Tests that exercise the purge handler — add or update a test that asserts retention is driven by config and that the default is 90 when no override is set.

**Do NOT touch:**
- The purge route signature, auth checks, or response shape.
- Other message routes (archive, restore).
- The chat-level archival flow (covered by separate tickets: purge route, retention config key, GC job, asset cascade, notifications).
- Schema migrations — config keys live in the existing admin config table; no DDL change required.

## Acceptance Criteria

1. The literal `30 * 24 * 60 * 60 * 1000` no longer appears at src/routes/messages/archiving.ts:94; the cutoff is computed from a config read.
2. When the `archive_retention_days` config key is unset, the purge cutoff equals `now - 90 * 24 * 60 * 60 * 1000` (the documented default).
3. Setting `archive_retention_days` to a different value (e.g. 7, 180) causes the purge cutoff to use that value instead — verified by a unit test.
4. A regression test asserts the wiring: stubbed config → handler uses the stubbed value; missing config → handler uses 90-day default.
5. No behavior change for callers other than the retention window: status codes, auth, and response payload remain unchanged.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
