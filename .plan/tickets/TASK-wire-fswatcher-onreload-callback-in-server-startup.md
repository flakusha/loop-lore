<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire FSWatcher onReload callback in server startup

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-config-file-separation.md

## Summary

`src/config/hot-reload.ts` constructs an FSWatcher over `configs/*.toml|*.yaml` and calls a user-supplied `onReload(domain, config)` callback, but `src/server/start.ts` never registers the callback — the watcher is started but does nothing observable. Fix: register an `onReload` in start.ts (or in `src/app/start.ts` if that is where the app boots) that:

1. Updates the in-app `Config` instance with the new values (`mergeInPlace` or equivalent)
2. Logs reload at info level with `domain` + diff summary
3. Triggers re-registration of any registered handlers (provider list, cron schedules) per the rules documented in the audit
4. Emits an event the admin UI can subscribe to (so an admin who edits a config file on disk sees a 'reloaded' toast, not a stale read)

Acceptance: edit `configs/config.logging.toml` with the app watching → the bun process applies the new log level without restart; existing log entries reflect the new level after the watcher's debounce window (200ms). Test: write a temp config file, expect a reload log line within 500ms.

## Acceptance Criteria

- [ ] `onReload` callback registered in `src/server/start.ts` (or appropriate boot file)
- [ ] In-memory `Config` instance updated on file change
- [ ] Domain-specific reload handlers (provider list, cron re-read) executed
- [ ] Structured log emission with `domain` + diff summary
- [ ] Admin UI subscription hook exposed
- [ ] Test: edits to a temp config file trigger reload within 500ms
- [ ] Documentation updated
