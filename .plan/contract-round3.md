# Contract: Round-3 deep-split (dev `d67ed641`)

Worktree: `tree/file-split-round3`, branch `file-split-round3`.

## Goal

Round-1 splits were shallow — sub-files still exceed the 250L soft ceiling.
Close the remaining oversized split artifacts (target <250L, prefer <200L):

1. `src/generation/auto-gen/auto-generation.ts` (588L) — single `triggerAutoGeneration`
   orchestration function. Extract cohesive pipeline steps into sibling files; thread
   shared state explicitly (options-object with the `d: GenDeps` + resolved context).
2. `src/chat/service/chats.ts` (352L) — 7 flat fns → `crud.ts` (create/get/update/delete)
   - `batch.ts` (batchArchiveChats/batchDeleteChats/batchExportChats).
3. `src/chat/service/messages.ts` (335L) — 7 flat fns → `read.ts`
   (getMessageWithAccess/listMessages/getMessageVariants) + `write.ts`
   (selectVariant/regenerateMessageVariant/deleteMessage/editMessage).
4. `src/chat/service/transitions.ts` (369L) — single `migrateChat` with 6 self-contained
   carry blocks → extract each carry into a sibling helper file (participants/memory/
   history/state/pins/world-state), keep `migrateChat` as the orchestrator.

`src/routes/messages/` is already clean (all files ≤201L) — no work needed.

## Golden rules

- **Pure refactor, ZERO behavior change.** Do not edit any `*.test.ts` to force green.
- **Public surface preserved exactly.** The barrel `src/chat/service/index.ts` and
  `src/generation/auto-gen/index.ts` must continue to export the same names with the
  same signatures (knip `dead:code` exit 0 is the proof). If a function is private
  (module-local, not exported from the barrel), it may move to a sibling file and be
  imported directly — but must NOT be added to the barrel unless it was there before.
- **File paths**: sub-splits live as SIBLING files next to the current file
  (e.g. `src/chat/service/crud.ts`, `src/chat/service/read.ts`). The current file
  becomes either a barrel re-export or a slim orchestrator that imports siblings.
  All existing import paths stay valid (they import from the file's path, which the
  barrel/orchestrator preserves).
- **Files < 250L** (250 hard ceiling, 200 preferred). Use `// ── Domain ────` headers
  as natural domain boundaries.
- **Worktree path**: `write`/`edit` tools with relative paths resolve to the MAIN repo
  on dev. ALWAYS prefix `tree/file-split-round3/` or `cd` into the worktree. Verify
  every file op lands in the worktree.
- Commit via `./scripts/worktree.sh agent-commit file-split-round3 "<msg>"` (GPG,
  never push).

## Verification gates (before "done")

- `bun run typecheck` exit 0 (from worktree)
- `bunx eslint` on touched files: 0 errors
- `bun run dead:code` exit 0 (direct `./node_modules/.bin/knip` if wrapper PATH issue)
- `bun test src/chat/ src/generation/` — impacted suites pass
- `bun scripts/check-file-size.ts --strict` — target files no longer listed
