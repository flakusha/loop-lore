<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Editor LSP Integration

**Overview:** Serve loop-lore harness completions to helix/mitos/nvim through a stdio LSP server.

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** lsp, editor, helix, mitos, nvim, harness
**Related:** `epic-external-harness-acp.md`, `epic-harness-integration.md`, `epic-browser-editor-support.md`

## Summary

A new in-repo `loop-lore-lsp` stdio binary speaks plain LSP (`initialize`/`shutdown`,
`textDocument/didOpen`+`didChange` tracking, `textDocument/completion`) and
answers completions via a read-only `dispatchHarnessTurn` call, so stock editor
configs (no per-editor plugins) get harness-backed completions. Auth is a token
in `initializationOptions` mapping to a userId; every turn is audited and repo
writes stay behind the repo-access escalation gate (deny on the completion path).
Background: `.tmp/research/editor-lsp-integration.md`.

## Verdict

| | helix/mitos path | vim/nvim path |
|---|---|---|
| Transport | `loop-lore-lsp` stdio server, stock `languages.toml` entry | same server, stock nvim `vim.lsp` client config |
| Protocol first | `textDocument/completion` (single list, no resolve) | same; `inlineCompletion` second, nvim-only |
| Auth/perms | token → userId; isolation-gate; completion read-only → auto-allow; edits/exec → approval + repo-access gate | identical |
| Context | rootUri → principal-scope root; sandboxed readers only | identical |

## Minimal slices

1. `loop-lore-lsp` stdio skeleton: `initialize`/`shutdown`, `didOpen`/`didChange` doc tracking, single-item `completion` list plumbed to a stub turn.
2. Completion via harness: debounce → read-only `dispatchHarnessTurn` prompt → one-item completion list; per-profile in-flight 1 via harness queue.
3. Token auth + permissions: `initializationOptions.token` → userId; isolation-gate (master switch + admin role + profile allowlist); `classifyPermission` auto-allow for the read-only path; every turn in `tool_call_audit`.
4. Stock client configs + docs: helix `languages.toml`, mitos config, nvim `vim.lsp` snippet; docs page; no per-editor plugins.

## Explicitly NOT building

- Per-editor plugins (docs snippets only).
- Draft `textDocument/inlineCompletion` before plain completion lands (nvim-only garnish, follow-up).
- `completionItem/resolve`, `codeAction`/chat, `workspace/executeCommand` in v1.
- Chat UI in the server; second model router (harness profiles own it).
- Local-model hosting; repo mutations from the completion path.

## Acceptance Criteria

- [ ] `loop-lore-lsp` answers `initialize`/`shutdown` and tracks open docs
- [ ] Typing in helix with the stock config yields a harness-backed completion
- [ ] Bad/missing token is rejected; every turn is audited
- [ ] helix/mitos/nvim stock configs documented and smoke-tested
- [ ] Tests passing, docs updated

## Tickets

- `TASK-lsp-stdio-server-skeleton`
- `TASK-lsp-completion-via-harness`
- `TASK-lsp-token-auth-permissions`
- `TASK-lsp-client-configs-docs`
