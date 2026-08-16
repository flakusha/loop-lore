<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Plugin Discovery & Loading

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-plugin-system

## Summary

Plugin discovery, validation, installation, and lifecycle management. Handles plugin dependency resolution, versioning, compatibility checks, and the full install/enable/disable/uninstall cycle. From `epic-plugin-system.md` — Plugin Lifecycle section.

## Scope

- Plugin discovery from filesystem/registry
- Plugin validation and compatibility checks
- Plugin dependency resolution
- Plugin installation and activation
- Plugin deactivation and uninstallation
- Plugin updates

## Linked Epics

- `epic-plugin-system.md`

## Acceptance Criteria

- [ ] `PluginLifecycle` interface implemented (discover, validate, install, enable, disable, uninstall, update)
- [ ] Plugin discovery scans configured directories for valid plugins
- [ ] Plugin validation checks required fields, permissions, and compatibility
- [ ] Dependency resolution handles required and optional dependencies
- [ ] Version compatibility checking works (semver or custom scheme)
- [ ] Plugin state tracking (installed, enabled, version, config, storage, errors, warnings)
- [ ] Plugin enable/disable toggles without full reinstall
- [ ] Plugin uninstall cleans up state and storage
- [ ] Unit tests for discovery, validation, and lifecycle operations
- [ ] Integration tests for full plugin install → enable → disable → uninstall cycle

## Notes

- Reference `epic-plugin-system.md` for `PluginLifecycle`, `PluginState` interfaces
- Consider plugin sandboxing during discovery (don't execute untrusted code)
- Plugin manifest should declare dependencies and compatibility ranges
- Loading order should respect dependency graph
