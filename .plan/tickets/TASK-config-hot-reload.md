<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Per-Domain Config Hot-Reload

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Epic:** EPIC-2026-39 (Config File Separation)

## Summary

Enable hot-reload of individual domain config files without restarting the application. Changed domain configs are picked up and applied at runtime.

## Features

- Watch domain config files for changes
- Reload changed domain config without restart
- Graceful handling of invalid changes (revert to last valid)
- Notification when domain config is reloaded
- Support for selective domain reload

## Acceptance Criteria

- [ ] Domain config changes detected
- [ ] Reloaded without application restart
- [ ] Invalid changes reverted gracefully
- [ ] Reload notification logged

## Linked Epics

- `epic-config-file-separation.md`
