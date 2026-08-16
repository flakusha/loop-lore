<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Plugin Marketplace & Community Sharing

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-plugin-system
**Tags:** plugin, marketplace, sharing, community, extensibility

## Description

Add a plugin marketplace and community sharing system to the Plugin System & Extensibility epic — players and creators can share, rate, and install community plugins. Extends the plugin system from internal extensibility to a community ecosystem.

## How It Extends Existing Work

Builds on the Plugin System epic's plugin architecture and extensibility hooks. Adds marketplace, sharing, and community discovery on top of the existing plugin infrastructure.

## Acceptance Criteria

- [ ] Plugin marketplace UI — browse, search, filter community plugins
- [ ] Plugin rating and review system
- [ ] Plugin install/enable/disable from marketplace
- [ ] Plugin sharing — export/import plugin configs
- [ ] Plugin compatibility checking (version, dependencies)
- [ ] Featured/plugins spotlight section
- [ ] `GET/POST /api/plugins/marketplace` routes
- [ ] `POST /api/plugins/:id/install` route
- [ ] Frontend marketplace with search, categories, and ratings
- [ ] Frontend plugin detail page with install button

## Technical Notes

- Plugin marketplace uses existing asset storage (Epic: Asset Support Expansion)
- Plugin configs stored as JSON blobs with version and dependency metadata
- Compatibility checking validates against current server/plugin API versions
- Integrates with Context-Based Feature Permissions (TASK-chat-context-feature-permissions) for marketplace UI gating
