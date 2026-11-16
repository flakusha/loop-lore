<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: lsp-client-configs-docs

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-editor-lsp-integration.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Stock helix `languages.toml`, mitos config, and nvim `vim.lsp` client snippets plus a docs page, smoke-tested with no per-editor plugins.

**Description:**

Ship copy-paste client configs that spawn `loop-lore-lsp --stdio`: a helix `languages.toml` `language-server` entry, the mitos equivalent, and an nvim `vim.lsp` (nvim ≥0.11) snippet passing the token via `initializationOptions`. Add a docs page (install, token setup, per-language scoping) and smoke-test each config against the real server. No per-editor plugins are built — snippets only.

**Context:**

Research takeaway: stock configs are the survival trait (hexai/helix path); `textDocument/completion` works everywhere while `inlineCompletion` is nvim-only garnish and out of scope. Depends on `TASK-lsp-stdio-server-skeleton` and `TASK-lsp-completion-via-harness`.

**Acceptance Criteria:**

- [ ] helix stock config yields a completion from the server in a smoke test
- [ ] mitos and nvim snippets verified against the server
- [ ] Docs page covers install, token setup, and language scoping
- [ ] No editor-plugin code added to the repo
- [ ] Tests passing
- [ ] Documentation updated
