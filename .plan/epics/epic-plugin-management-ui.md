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

```
┌─────────────────────────────────────────────────────────────┐
│ Plugins                                             [🔍]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Categories ─────────────────────────────────────────────┐│
│ │ [All] [Generation] [Tools] [Themes] [Integrations]      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Plugin List ────────────────────────────────────────────┐│
│ │                                                          ││
│ │ ┌─ Plugin Card ─────────────────────────────────────────┐││
│ │ │ 🧩 Image Generator                                     │││
│ │ │ by: Community                                          │││
│ │ │ ⭐ 4.5 (120 reviews) | 📥 5,000 installs             │││
│ │ │                                                        │││
│ │ │ Generate images using Stable Diffusion, DALL-E, or   │││
│ │ │ ComfyUI. Integrates with chat for visual content.     │││
│ │ │                                                        │││
│ │ │ [Install] [Details]                                    │││
│ │ └────────────────────────────────────────────────────────┘││
│ │                                                          ││
│ │ ┌─ Plugin Card ─────────────────────────────────────────┐││
│ │ │ 🧩 Voice Synthesis                                     │││
│ │ │ by: AI Labs                                            │││
│ │ │ ⭐ 4.2 (89 reviews) | 📥 3,200 installs              │││
│ │ │                                                        │││
│ │ │ Convert text to speech using various voice models.    │││
│ │ │ Supports multiple languages and emotions.             │││
│ │ │                                                        │││
│ │ │ [Install] [Details]                                    │││
│ │ └────────────────────────────────────────────────────────┘││
│ │                                                          ││
│ │ ┌─ Plugin Card ─────────────────────────────────────────┐││
│ │ │ 🧩 Weather Effects                                     │││
│ │ │ by: World Building Team                                │││
│ │ │ ⭐ 4.8 (45 reviews) | 📥 2,100 installs              │││
│ │ │                                                        │││
│ │ │ Dynamic weather effects for immersion. Includes       │││
│ │ │ rain, snow, fog, and atmospheric sounds.              │││
│ │ │                                                        │││
│ │ │ [Installed ✓] [Configure] [Disable]                    │││
│ │ └────────────────────────────────────────────────────────┘││
│ │                                                          ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Plugin Details Layout

```
┌─ Plugin Details ───────────────────────────────────────────────┐
│                                                               │
│ 🧩 Image Generator                                            │
│ ─────────────────────────────────────────────────────────────│
│                                                               │
│ by: Community                                                 │
│ Version: 2.1.0                                                │
│ License: MIT                                                  │
│                                                               │
│ ⭐ 4.5 (120 reviews) | 📥 5,000 installs                     │
│                                                               │
│ Description:                                                  │
│ Generate images using Stable Diffusion, DALL-E, or ComfyUI.  │
│ Integrates with chat for visual content.                      │
│                                                               │
│ Features:                                                     │
│   - Multiple model support (SD, DALL-E, ComfyUI)             │
│   - Custom style presets                                      │
│   - Batch generation                                          │
│   - Gallery integration                                       │
│                                                               │
│ Requirements:                                                 │
│   - API key for DALL-E or ComfyUI server                     │
│   - 4GB+ RAM for local models                                 ││
│                                                               │
│ Permissions:                                                  │
│   - Access chat messages                                      ││
│   - Generate images                                           ││
│   - Access gallery                                            ││
│                                                               │
│ [Install Plugin]  [View Reviews]  [Report Issue]              │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Plugin Configuration Layout

```
┌─ Plugin Configuration: Image Generator ────────────────────────┐
│                                                               │
│ General Settings:                                             │
│   Plugin Name: Image Generator                                ││
│   Version: 2.1.0                                              ││
│   Status: ✅ Enabled                                          ││
│                                                               │
│ API Settings:                                                 │
│   Provider: [DALL-E ▼]                                       ││
│   API Key: [••••••••••••••••] [Show] [Test]                  ││
│   Model: [dall-e-3 ▼]                                        ││
│   Quality: [Standard ▼]                                       ││
│   Size: [1024x1024 ▼]                                        ││
│                                                               │
│ Generation Settings:                                          │
│   Default Style: [Vibrant ▼]                                  ││
│   Max Resolution: [2048x2048 ▼]                               ││
│   Batch Size: [4]                                             ││
│   Auto-save: [✅]                                             ││
│                                                               │
│ Permissions:                                                  ││
│   [✅] Access chat messages                                   ││
│   [✅] Generate images                                        ││
│   [✅] Access gallery                                         ││
│   [ ] Access filesystem                                       ││
│                                                               │
│ [Save Settings]  [Reset to Defaults]  [Uninstall Plugin]      ││
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Installed Plugins Layout

```
┌─ Installed Plugins ────────────────────────────────────────────┐
│                                                               │
│ ✅ Image Generator (v2.1.0)                                   ││
│    Status: Enabled | Last used: 2 hours ago                   ││
│    [Configure] [Disable] [Uninstall]                          ││
│                                                               │
│ ✅ Weather Effects (v1.3.0)                                   ││
│    Status: Enabled | Last used: 1 day ago                     ││
│    [Configure] [Disable] [Uninstall]                          ││
│                                                               │
│ ⚠️ Voice Synthesis (v1.0.0)                                  ││
│    Status: Disabled | Last used: Never                        ││
│    [Configure] [Enable] [Uninstall]                           ││
│                                                               │
│ ─────────────────────────────────────────────────────────────│
│                                                               │
│ Plugin Stats:                                                 ││
│   Total: 3                                                    ││
│   Enabled: 2                                                  ││
│   Disabled: 1                                                 ││
│   Updates available: 1                                        ││
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

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
