<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP config section ([mcp.servers.*])

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** `epic-harness-integration`
**Depends on:** `TASK-harness-mcp-client-wrapper`
**Related:** docs/meta/research/harness-mcp-wiring.md

**Summary:**

Declarative `[mcp]` / `[mcp.servers.*]` config section shaped like omp's `mcp.json`: `loadConfig()` round-trips stdio and http entries, `validate()` rejects a server with both `command` and `url` or neither, `enabled = false` keeps a server out of the registry.

**Context:**

The config schema generator + class layers already exist for every other section (`src/config/schema/*`, `src/config/schema-class/*` with `envMap()` + JSON Schema generation); an MCP section is one more module in that pattern, not a new loader. Operators need one declarative surface before any MCP tool can be configured in production.

**Acceptance Criteria:**

- [ ] `McpConfig` type + defaults at `src/config/schema/mcp.ts` + `schema-class/mcp.ts`; `configs/config.mcp.example.toml` example committed
- [ ] `validate()` rejects both-or-neither of `command`/`url`; `envMap()` + generated JSON Schema include the new keys
- [ ] `enabled = false` keeps the server out of the tool registry — no partial registration
- [ ] Unit tests: round-trip both transport shapes, rejection cases, disabled-server skip
- [ ] `bun run check` green

## Technical Notes

- OAuth 2.1 discovery/PKCE stays out (headers-only) until a real remote server needs it — doc §Deliberately skipped.
