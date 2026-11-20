<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP session/new MCP handoff and fs write file

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Pass configured MCP servers through ACP `session/new` and implement `fs/write_text_file` behind the existing reader/capability pattern.

**Context:** `src/integrations/harness/generic-acp.ts:408` still sends `mcpServers: []`; no `write_text_file` handler exists. Gaps G1/G3 in `.tmp/research/harness-parity/21-parity-gap-ranked.md`. G2/G4/G9/G10 already landed; re-verify line refs and capability advertisement at implementation time.

**Acceptance Criteria:**

- [ ] `session/new` carries configured servers; capabilities are advertised only when handlers exist.
- [ ] `fs.writeTextFile` is advertised only with a working handler; writes stay inside the sandbox root.
- [ ] Fake-ACP fixture covers the handoff and the writer.
