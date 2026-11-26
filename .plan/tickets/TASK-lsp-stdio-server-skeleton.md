<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: lsp-stdio-server-skeleton

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-editor-lsp-integration.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

New in-repo `loop-lore-lsp` stdio binary: LSP `initialize`/`shutdown` handshake, `textDocument/didOpen`+`didChange` document tracking, and `textDocument/completion` returning a stub single-item list.

**Description:**

Scaffold the server transport and protocol shell with no model calls yet: stdio JSON-RPC framing, capability advertisement (`completionProvider`, no resolve), open-document store keyed by URI with version tracking, graceful shutdown. Completion handler returns one static placeholder item so editor wiring can be smoke-tested end to end before the harness slice lands.

**Context:**

Per `.tmp/research/editor-lsp-integration.md` minimal proposal step 1: `textDocument/completion` first (works in helix/mitos/nvim); `inlineCompletion`, resolve, codeAction all deferred. Transport must be stdio so stock editor configs can spawn it.

**Acceptance Criteria:**

- [ ] `loop-lore-lsp --stdio` answers `initialize` with completion capability and `shutdown` cleanly
- [ ] `didOpen`/`didChange` update tracked documents; `completion` returns a one-item list
- [ ] Malformed frames do not crash the server (error response, connection stays up)
- [ ] Tests passing
- [ ] Documentation updated
