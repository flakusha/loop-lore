<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Terminal UI spec sync

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-terminal-ui
**Tags:** tui, docs
**Summary:** Correct `docs/spec/terminal-ui.md` drift — stale endpoint claims, undocumented harness overlay, broken epic link, and file layout that no longer matches the tree.
**Context:** `docs/spec/terminal-ui.md:19` still claims `/api/assets` and `/api/assistant` integration. The code calls `/api/v1/assets` (`src/tui/asset-view.ts:228-230`) and `/api/v1/chats/:id/messages` (`src/tui/chat/api.ts:59,123`); `/api/assistant` is called nowhere under `src/tui/`. The `src/tui/harness/` overlay and `/api/v1/harness/runs` exist in code but are absent from the spec. Docs-only: no code changes.
**Acceptance Criteria:** All met — verified in `docs/spec/terminal-ui.md` by review-plan worker (confirmed routes corrected, harness overlay documented, file layout matched, nsfw-filter removed, asset/assistant handlers removed, F1/F3/F6/slash-completion/provider-health documented).

## Acceptance Criteria

- [x] `docs/spec/terminal-ui.md:19` no longer claims `/api/assets` or `/api/assistant` integration; it documents `/api/v1/assets` (`src/tui/asset-view.ts:228-230`) and `/api/v1/chats/:id/messages` (`src/tui/chat/api.ts:59,123`). Verified: `/api/assistant` has zero call sites under `src/tui/`.
- [x] The spec documents the `src/tui/harness/` overlay and its `/api/v1/harness/runs` endpoint, which exist in code but were undocumented.
- [x] The broken `docs/spec/tui.md` link in the epic's Related Epics is corrected to `docs/spec/terminal-ui.md`.
- [x] The spec's file layout section matches the actual `src/tui/` tree, closing `TASK-update-terminal-ui-spec-to-actual-file-layout.md`.
- [x] Explicitly OUT of scope: `tui.enabled` / `ENABLE_TUI` config drift. That belongs to `TASK-tui-enabled-config-flag-never-read.md` and is NOT duplicated here — this ticket records the exclusion rather than reopening it.
- [x] No code files touched; docs-only diff.

## Related Files

- `docs/spec/terminal-ui.md:19`, `src/tui/asset-view.ts:228-230`, `src/tui/chat/api.ts:59,123`, `src/tui/harness/`
- `.plan/epics/epic-terminal-ui.md` (Related Epics link)
- `TASK-update-terminal-ui-spec-to-actual-file-layout.md`, `TASK-tui-enabled-config-flag-never-read.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

git issue: 769db3d
