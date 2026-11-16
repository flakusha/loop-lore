<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Editor LSP: harness completions in helix, mitos, and nvim

`loop-lore-lsp` is a stdio LSP server that answers `textDocument/completion`
with one harness-backed suggestion. Setup is stock client config only — no
per-editor plugins exist or are needed. Every snippet below was checked
against the server contract in `src/integrations/lsp/handler.ts` and the
framed handshake in the smoke test noted at the end.

## Install

`bun install` exposes the `loop-lore-lsp` binary (`package.json` `bin` →
`bin/loop-lore-lsp.ts`). Confirm it resolves from your editor's `PATH`:

```sh
command -v loop-lore-lsp
```

The server refuses to boot unless `harness.acp` is enabled with at least one
profile: it exits `1` with a stderr diagnostic and serves nothing
unauthenticated.

## Token setup

Mint an integration token as an admin (raw value is returned **once**):

```sh
curl -s -X POST "$LOOP_LORE/admin/integration-tokens" \
  -H 'content-type: application/json' \
  -d '{"name": "editor-lsp", "scopes": "read"}'
```

List tokens with `GET /admin/integration-tokens`, revoke with
`DELETE /admin/integration-tokens/:id`. Any admin-class caller can mint,
list, and revoke; tokens never mint or revoke other tokens. The raw value
starts with `llri_` — paste it into the `token` field of your editor
snippet below and `chmod 600` any file that holds it.

## Server contract (source of truth)

`initialize` params must carry `initializationOptions.token`. A missing,
unknown, revoked, or expired token fails `initialize` with code `-32803`
(`RequestFailed`). The handshake answers:

```json
{
  "capabilities": {
    "textDocumentSync": 1,
    "completionProvider": { "triggerCharacters": [".", ":", "(", " "] }
  },
  "serverInfo": { "name": "loop-lore-lsp" }
}
```

- `textDocumentSync: 1` is Full sync: the client sends the whole document
  on `didOpen`/`didChange` (last text wins). `completion` for a URI the
  server has not seen fails — clients always send `didOpen` first.
- Trigger characters are `.`, `:`, `(`, and space. Completions fire
  automatically after these; do not configure client-side trigger
  overrides — the server list above wins, including the trailing space
  (prose completions trigger after a space).
- `completion` returns at most **one** item:
  `{ "label": "<first line, max 60 chars>", "kind": 1, "detail": "loop-lore", "insertText": "<full text>" }`
  with `isIncomplete: false`; empty harness text answers `items: []`.
  There is no `completionItem/resolve` step.
- `shutdown` and `exit` behave per spec (`exit` without `shutdown` exits `1`).

## helix (`~/.config/helix/languages.toml`)

`config` is passed through as `initializationOptions`:

```toml
[language-server.loop-lore-lsp]
command = "loop-lore-lsp"
args = ["--stdio"]
config = { token = "PASTE_LLRI_TOKEN_HERE" }

[[language]]
name = "typescript"
language-servers = ["loop-lore-lsp"]
```

Per-language scoping: add one `[[language]]` block per language you want
completions in (helix merges these with its built-ins by name, so other
settings are preserved). Omit a language to keep it on its default servers.

## nvim ≥ 0.11 (stock `vim.lsp`, no plugins)

`init_options` is sent as `initializationOptions`:

```lua
vim.lsp.start({
  name = "loop-lore-lsp",
  cmd = { "loop-lore-lsp", "--stdio" },
  filetypes = { "typescript", "python", "rust" },
  root_dir = vim.fs.root(0, { ".git" }),
  init_options = {
    token = "PASTE_LLRI_TOKEN_HERE",
  },
})
```

Per-language scoping is the `filetypes` list — edit it to taste. Wrap the
call in a `FileType` autocmd if you want it started lazily per buffer.

## mitos

Gap, stated plainly: no mitos config schema is pinned anywhere in this repo,
so there is no verified mitos snippet — only the transport contract any
client must satisfy, verified against the server in the smoke test below:

| Field | Value |
| --- | --- |
| command | `loop-lore-lsp` with arg `--stdio` (Content-Length-framed stdio) |
| init option | `token`: an `llri_...` integration token (`initializationOptions.token`) |
| sync | Full (`textDocumentSync: 1`): whole document on open/change |
| completion | `textDocument/completion` → ≤1 item; triggers `.`, `:`, `(`, space |

If your mitos build accepts a helix-style `language-server` table, the
helix snippet above is the closest starting point. A tested mitos snippet
is follow-up work once its config shape is confirmed against a real client.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `initialize` fails `-32803` “requires `initializationOptions.token`” | `token` missing from `config` / `init_options`; re-paste the snippet |
| `-32803` “unknown, revoked, or expired token” | Re-mint via `POST /admin/integration-tokens` |
| `-32803` “no harness profile configured” | Enable `harness.acp` with at least one profile server-side |
| Server exits `1`, stderr “harness.acp is disabled” | Same as above: the server never serves without the harness runtime |
| `completion` fails “unknown document … send `textDocument/didOpen` first” | Client never opened the URI; stock LSP clients always send `didOpen` |
| `items: []` every time | Harness returned empty text; check the configured profile answers at all |

Smoke test: a framed `initialize` (bad token → `-32803`; good token →
capabilities above) plus `didOpen` + `completion` (single `loop-lore` item)
was driven through the real handler graph over split Content-Length frames
with a stub turn dispatch — real dispatch, not stubbed, is covered by
`src/integrations/lsp/stdio-server.test.ts`.
