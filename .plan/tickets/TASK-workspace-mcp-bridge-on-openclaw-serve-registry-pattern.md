<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Workspace MCP bridge on OpenClaw serve/registry pattern

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-tool-calling-mcp.md
**Tags:** tool-calling-mcp

## Summary

Design workspace-to-external-tool MCP bridge following OpenClaw mcp serve (conversations_list/get, messages_read/send, events_poll/wait) plus client registry verbs (add/configure/login, status/doctor/probe). Covers epic-assistant-gm-flows API-call integration framework gap. Acceptance: design noted in epic with registry verbs mapped.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Trust boundary explicit: stdio transport = local-user boundary (no network auth); any HTTP transport is loopback-only or authenticated — never exposed unauthenticated (`docs/spec/integrations-architecture.md` §3)
