<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Plugin Management UI

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** plugins, management, ui, frontend

## Summary

Complete plugin management interface including plugin marketplace, configuration, and enable/disable toggles.

## Core Features

### Plugin Marketplace

- Plugin browser
- Plugin search
- Plugin categories
- Plugin ratings
- Plugin installation

### Plugin Configuration

- Plugin settings
- Plugin dependencies
- Plugin permissions
- Plugin updates

### Plugin Management

- Enable/disable plugins
- Plugin status
- Plugin logs
- Plugin removal

## UI Components

### Plugin Marketplace Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Plugin Details Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Plugin Configuration Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Installed Plugins Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

## Integration Points

### Backend Dependencies

| Backend System | What It Provides        | How Used           |
| -------------- | ----------------------- | ------------------ |
| Plugin System  | Plugin CRUD, management | Plugin management  |
| Config System  | Plugin configuration    | Plugin settings    |
| Auth System    | Plugin permissions      | Plugin permissions |

### Shared Components

| Component     | Used By            | Notes                |
| ------------- | ------------------ | -------------------- |
| Card grid     | Plugin, World, NPC | Reusable card layout |
| Toggle switch | Plugin, Settings   | Reusable toggle      |
| Settings form | Plugin, World      | Reusable form        |

## Acceptance Criteria

- [ ] Plugin browser with categories
- [ ] Plugin search
- [ ] Plugin ratings and reviews
- [ ] Plugin installation
- [ ] Plugin configuration
- [ ] Plugin dependencies
- [ ] Plugin permissions
- [ ] Plugin updates
- [ ] Enable/disable plugins
- [ ] Plugin status display
- [ ] Plugin logs
- [ ] Plugin removal
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Screen reader support

## Implementation Phases

### Phase 1: Plugin Browser

- Plugin list
- Plugin search
- Plugin categories

### Phase 2: Plugin Management

- Install/uninstall
- Enable/disable
- Plugin status

### Phase 3: Configuration

- Plugin settings
- Permissions
- Dependencies

### Phase 4: Polish

- Mobile responsive
- Keyboard accessible
- Screen reader support

## Tasks

| Task                      | Priority | Status         |
| ------------------------- | -------- | -------------- |
| TASK-plugin-browser.md    | P0       | ⬜ Not Started |
| TASK-plugin-details.md    | P0       | ⬜ Not Started |
| TASK-plugin-config.md     | P0       | ⬜ Not Started |
| TASK-installed-plugins.md | P0       | ⬜ Not Started |
| TASK-plugin-alpine.md     | P0       | ⬜ Not Started |

## Files to Create

- `src/frontend/plugins/plugin-browser.ts` — Plugin marketplace
- `src/frontend/plugins/plugin-details.ts` — Plugin details
- `src/frontend/plugins/plugin-config.ts` — Plugin configuration
- `src/frontend/plugins/installed-plugins.ts` — Installed plugins
- `src/frontend/alpine/plugins.ts` — Alpine.js plugin logic

## Related Epics

- **Epic Plugin System** — Backend plugin system
- **Epic Plugin Extension Points** — Backend plugin extensions
