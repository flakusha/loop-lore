<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: lsp-completion-via-harness

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-editor-lsp-integration.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Debounced `textDocument/completion` answered by a read-only `dispatchHarnessTurn` prompt returning a one-item completion list, per-profile in-flight 1 via the harness queue.

**Description:**

Wire the skeleton's completion handler to the harness: on request, debounce, build a read-only prompt from the tracked document (whole-file context scoped through sandboxed readers, rootUri → principal-scope root), call `dispatchHarnessTurn`, and return the turn text as a single completion item (no resolve). Reuse harness `queue.ts` per-profile in-flight-1 so rapid typing collapses to the latest request; stale turns are dropped, never applied.

**Context:**

Research verdict: provider fan-out, debounce/queue, and gitignore scoping are all subsumed by the harness (`dispatchHarnessTurn` + profile allowlist, `queue.ts`, `readSandboxedText` + `classifyPermission`). Depends on `TASK-lsp-stdio-server-skeleton`.

**Acceptance Criteria:**

- [ ] Completion returns harness-generated text as a one-item list
- [ ] Rapid typing issues at most 1 in-flight turn per profile; stale results dropped
- [ ] Completion path performs no repo writes (read-only prompt only)
- [ ] Tests passing
- [ ] Documentation updated
