<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Plugin API System

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High
**Epic:** epic-plugin-system

## Summary

Full Plugin API providing TypeScript/JavaScript, REST, WebSocket, and CLI interfaces for plugins to interact with all major systems (chat, RPG, world, battle, trading). From `epic-plugin-system.md` — Plugin API section.

## Scope

- TypeScript/JavaScript API for in-process plugins
- REST API for external plugins
- WebSocket API for real-time plugins
- CLI API for command-line plugins
- API versioning and compatibility guarantees

## Linked Epics

- `epic-plugin-system.md`

## Acceptance Criteria

- [ ] Plugin API interface defined with all system access points (chat, rpg, world, battle, trading, state)
- [ ] System APIs implemented (database, filesystem, network, crypto)
- [ ] Utility APIs implemented (logger, config, events, storage)
- [ ] REST API endpoints for external plugin interaction
- [ ] WebSocket API for real-time plugin communication
- [ ] API versioning scheme established
- [ ] API documentation generated
- [ ] Unit tests for all API methods
- [ ] Integration tests for plugin → system communication

## Notes

- Reference `epic-plugin-system.md` for `PluginAPI` interface definition
- APIs should respect plugin permission system (see TASK-plugin-security-sandboxing)
- Consider rate limiting and resource quotas per plugin
