<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Plugin-host contract for third-party integration plugins

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-plugin-extension-points

**Summary:**

Adopted component: ground-up (host contract). Seam: src/plugins/types.ts (PluginManifest + PluginContext) + src/plugins/loader.ts. Extends the plugin runtime for integration plugins: declared capabilities beyond the 6 extension points (adapter, webhook-receiver), granted scopes (channels), egress allowlist (hosts), secret-access tokens (host-resolved credentials), background timer registration, and a GET /api/plugins/ui-components serving route. Current runtime already provides: 6 extension points, onLoad/onLoad lifecycle, event bus wired to chat lifecycle, tool executor, config merge, mount-point lookup, admin enable/disable API. AC: manifest validation rejects undeclared scopes; egress allowlist enforced; timer registration works; ui-components route serves; docs/spec/plugin-system.md updated. Epic: epic-plugin-extension-points.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
