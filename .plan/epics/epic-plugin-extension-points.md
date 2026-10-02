<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Plugin Extension Points

**Overview:** (see sections below)


**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** plugins, extensibility, eventbus, tool-executor

## Overview

Wire up registered-but-unwired plugin extension points. The plugin system has types and registry but lacks EventBus, ToolExecutor, and UI mounting.

## Reference

- Spec: `docs/spec/plugin-system.md`
- Future features plan: `.plan/future-features-plan.md` (Tier 2)

## Features

| Feature               | ID           | Effort | Description                                              |
| --------------------- | ------------ | ------ | -------------------------------------------------------- |
| EventBus              | FEA-2026-048 | Med    | `src/plugins/events.ts` — pub/sub for loose coupling     |
| ToolExecutor          | FEA-2026-049 | Med    | `src/plugins/tools.ts` — AI-executable function registry |
| UI component mounting | FEA-2026-050 | Low    | `GET /api/plugins/ui-components` route                   |
| Config merge          | FEA-2026-051 | Low    | Wire `configSchema` from plugins into config loader      |

## Acceptance Criteria

- [ ] EventBus implemented with pub/sub pattern
- [ ] ToolExecutor registry functional
- [ ] UI component mounting route works
- [ ] Config merge from plugins works

## Dependencies

- Plugin system types (`src/plugins/types.ts`)
- Plugin registry (`src/plugins/registry.ts`)

## Linked Tasks (2026-10-02 research pass)

- `TASK-plugin-host-contract-for-third-party-integration-plugins` — extends this epic's wiring for integration plugins: declared capabilities (adapter, webhook-receiver), granted scopes (channels), egress allowlist, secret-access tokens, background timers, ui-components route (docs/spec/integrations-architecture.md §9)
