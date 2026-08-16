<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Config Backward Compatibility Layer

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** EPIC-2026-39 (Config File Separation)

## Summary

Maintain backward compatibility with the existing monolithic `configs/config.toml` and `configs/config.yaml` formats. The system should detect and support both old and new config formats.

## Features

- Detect monolithic config file presence
- Parse monolithic config and map to domain configs
- Warn if monolithic config is used (deprecation notice)
- Auto-split monolithic config into domain files on first run
- Preserve all existing behavior

## Acceptance Criteria

- [ ] Monolithic config still loads
- [ ] Deprecation warning emitted
- [ ] Auto-split works on first run
- [ ] All existing functionality preserved
- [ ] No breaking changes for existing users

## Linked Epics

- `epic-config-file-separation.md`
