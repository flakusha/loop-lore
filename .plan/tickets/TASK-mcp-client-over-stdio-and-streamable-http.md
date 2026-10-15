<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP client over stdio and streamable-http

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-external-creative-tool-bridge

**Summary:**

Build src/integrations/mcp/client.ts speaking MCP spec revision 2026-07-28 over both transports, using the official TS SDK.

**Context:**

Verified 2026-10-15: no MCP client exists in `src/` (three independent confirmations — `docs/research/harness-mcp-wiring.md:301`, `docs/research/roadmap-tracker.md:75`, `docs/research/doc-00-index.md:40`). `docs/spec/integrations-architecture.md:86` already reserves `src/integrations/mcp/` as the bridge home. MCP spec revision is **2026-07-28** (JSON-RPC 2.0, stateless, per-request capability negotiation).

This ticket **rewrites** `TASK-2026-openwebui-mcp-client-skeleton`, whose design is a closed connection pool built around a Python `AsyncExitStack` — a Python asyncio idiom. The TS SDK's `stdio` transport already takes an `onclose` callback and kills the child itself, so the rewrite delegates lifecycle to the SDK rather than re-implementing it.

Alternatives rejected: hand-rolled JSON-RPC transport (duplicates the SDK); http-only (loses every local-MCP-server case).

**Acceptance Criteria:**

- [ ] **Behaviour:** connects over `stdio` and `streamable-http`; the same client test suite passes against both transports.
- [ ] **Behaviour:** lifecycle is delegated to the SDK — `onclose` fires on child exit and the transport is torn down exactly once; no custom `AsyncExitStack`-style pool.
- [ ] **Tests:** handshake against a stub server; unknown-method error surfaces as a typed error, not an unhandled crash; malformed JSON response rejected.
- [ ] **Edge cases:** server writes to stderr on startup (must not be treated as a protocol error); child exits mid-handshake; connection idle past a timeout; a single message larger than the read buffer; unicode in tool names and arguments.
- [ ] **Concurrency / TOCTOU:** concurrent connect to the same server spawns exactly one child; connect-after-close must not resurrect a child.
- [ ] **Security:** no secrets (API keys, tokens) in log output or error messages; the spawned child's environment is explicitly filtered, not inherited wholesale; no server-controlled value is used as a spawn path or cwd.
- [ ] **Security:** spec's own position honoured and quoted in the module docstring — *"Tools represent arbitrary code execution and must be treated with appropriate caution"*.
- [ ] **Regressions:** no existing route or plugin test changes behaviour; `bun test src/` green for touched packages.
- [ ] **Repo gates:** `bun run check` green.
- [ ] **Docs:** `docs/spec/integrations-architecture.md` updated from "reserved" to "shipped" with the transport matrix.
