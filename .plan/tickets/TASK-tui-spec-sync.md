<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Terminal UI spec sync

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `epic-terminal-ui`
**Tags:** tui, docs
**Summary:** Correct `docs/spec/terminal-ui.md` drift — stale endpoint claims, undocumented harness overlay, broken epic link, and file layout that no longer matches the tree.
**Context:** `docs/spec/terminal-ui.md:15` still claims `/api/assets` and `/api/assistant` integration. The code calls `/api/v1/assets` (`src/tui/asset-view.ts:206`) and `/api/v1/chats/:id/messages` (`src/tui/chat/api.ts:32,77`); `/api/assistant` is called nowhere under `src/tui/`. The `src/tui/harness/` overlay and `/api/v1/harness/runs` exist in code but are absent from the spec. Docs-only: no code changes.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `docs/spec/terminal-ui.md:15` no longer claims `/api/assets` or `/api/assistant` integration; it documents `/api/v1/assets` (`src/tui/asset-view.ts:206`) and `/api/v1/chats/:id/messages` (`src/tui/chat/api.ts:32,77`). Verified: `/api/assistant` has zero call sites under `src/tui/`.
- [ ] The spec documents the `src/tui/harness/` overlay and its `/api/v1/harness/runs` endpoint, which exist in code but were undocumented.
- [ ] The broken `docs/spec/tui.md` link in the epic's Related Epics is corrected to `docs/spec/terminal-ui.md`.
- [ ] The spec's file layout section matches the actual `src/tui/` tree, closing `TASK-update-terminal-ui-spec-to-actual-file-layout.md`.
- [ ] Explicitly OUT of scope: `tui.enabled` / `ENABLE_TUI` config drift. That belongs to `TASK-tui-enabled-config-flag-never-read.md` and is NOT duplicated here — this ticket records the exclusion rather than reopening it.
- [ ] No code files touched; docs-only diff.

## Related Files

- `docs/spec/terminal-ui.md:15`, `src/tui/asset-view.ts:206`, `src/tui/chat/api.ts:32,77`, `src/tui/harness/`
- `.plan/epics/epic-terminal-ui.md` (Related Epics link)
- `TASK-update-terminal-ui-spec-to-actual-file-layout.md`, `TASK-tui-enabled-config-flag-never-read.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

git issue: 769db3d
