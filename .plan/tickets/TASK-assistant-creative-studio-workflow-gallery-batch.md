# TASK: Assistant Creative Studio — Gallery Batch Operations

**Status:** 📝 Draft
**Priority:** Medium (post-Gate C, with parent epic)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows` (§7.7)
**Depends on:** `epic-assistant-creative-studio-workflows` (runner/loader),
`epic-creative-studio.md` (gallery UI surface),
existing asset routes (`/api/assets/:id/...`)

## Summary

Implement **gallery batch selection + batch download** for the creative studio gallery.
Today the gallery sidebar (`src/frontend/…/gallery-sidebar.html`,
`partials/gallery/preview-modal.html`) renders `galleryAssets[]` with per-item
click-to-preview, copy-URL, download, delete — but there is **no selection state**.
This task adds a selection layer and a server-zip batch download, plus v1 batch
delete, with NSFW/ownership gating.

## Design (from epic §7.7)

- **Selection model** — `selectedAssetIds: Set<string>` in the chat Alpine store
  (peer to `galleryAssets` in `src/frontend/alpine/chat-types/core.ts` /
  `chat-utils/gallery.ts`); toggled via checkbox, shift-click range, "select all
  visible". UI-only; not persisted server-side by default.
- **Batch download** — collect selected IDs → `POST /api/assets/batch-download`
  (new handler in the asset routes) returns a zip stream. Server-side zip keeps
  auth + bandwidth local. Client-side zip only as fallback.
- **v1 batch actions: download + delete** — move-to-world / attach-to-message / tag
  / export are explicitly out of scope for v1 (future selection workflows).
- **Gates** — batch download honors NSFW rating visibility (omit/restrict
  un-consented NSFW) and asset ownership/scope.

Step schema (optional `gallery-batch` workflow): selection source (current gallery /
search results / world), filters (type, date, rating), action.

## Acceptance Criteria

- [ ] `selectedAssetIds` store added to chat Alpine state; checkbox + shift-range +
      select-all toggle wired in gallery UI (`gallery-sidebar.html` / grid).
- [ ] `POST /api/assets/batch-download` handler streams a zip of selected assets;
      honors auth + ownership; 404s/omits assets the user cannot access.
- [ ] NSFW gating: batch download omits or restricts un-consented NSFW assets per
      visibility policy.
- [ ] v1 batch delete over the selection set, with confirmation.
- [ ] Client-side zip fallback only when the server endpoint is unavailable.
- [ ] Unit test: selection toggle + batch-download auth/NSFW filtering; integration:
      select N assets → zip contains exactly N authorized, non-restricted assets.

## Files

| File                                         | Action                                    |
| -------------------------------------------- | ----------------------------------------- |
| `src/frontend/alpine/chat-types/core.ts`     | modify (add `selectedAssetIds`)           |
| `src/frontend/alpine/chat-utils/gallery.ts`  | modify (selection helpers)                |
| `src/frontend/…/gallery-sidebar.html` / grid | modify (checkboxes, select-all)           |
| asset routes (e.g. `src/routes/assets.ts`)   | modify (`batch-download` handler)         |
| `src/assistant/workflow-runner.ts`           | reuse (optional `gallery-batch` workflow) |

## Related

- `epic-assistant-creative-studio-workflows.md` §7.7
- `epic-creative-studio.md` (gallery UI surface)
- `TASK-assistant-creative-studio-workflow-gallery-edit.md` (separate scope)
- `TASK-assistant-creative-studio-workflows.md` (parent task)
