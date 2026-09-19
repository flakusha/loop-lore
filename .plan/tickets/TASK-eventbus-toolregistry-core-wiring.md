<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: EventBus + ToolRegistry Core Wiring

**Status:** ✅ Resolved (already on dev, 2026-09-19)
**Priority:** high
**Effort:** Large
**Summary:** EventBus + ToolRegistry Core Wiring
**Context:** Epic epic-plugin-extension-points; tags plugins, events.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-plugin-extension-points
**Tags:** plugins, events

## Summary

Wire core EventBus + ToolRegistry so plugin extension points actually fire; src/plugins/events.ts + src/plugins/tools.ts.
Source: docs/meta/code-practices-improvements/README.md + 08-plugins-hooks-integration.md.

## Resolution

Already implemented on dev — verified 2026-09-19 docs-gap reconcile audit (epic-docs-vs-plan-gap-audit-2026-09-19.md):

- src/plugins/event-bus.ts
- src/plugins/tool-executor.ts

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
