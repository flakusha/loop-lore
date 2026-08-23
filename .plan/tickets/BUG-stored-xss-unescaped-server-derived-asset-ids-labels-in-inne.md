<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Stored XSS — unescaped server-derived asset IDs/labels in innerHTML

**Status:** ✅ Fixed (uncommitted — XSS escapes applied to 5 files; `frontend - innerHTML xss` gate now 0 findings)
**Priority:** high
**Effort:** medium
**Type:** Bug
**Area:** frontend, security
**Epic:** epic-frontend-gallery.md
**Tags:** xss, frontend, security, innerHTML, assets
**Source:** OpenAgent frontend review (existing-code audit, 2026-08-23)
**Related:** `BUG-gallery-openAssetPreview-context-safety.md` (distinct — that is a ReferenceError, not XSS)

## Summary

Server-derived asset identifiers and labels (`id`, `assetId`, `label`, `filename`)
returned from API JSON are interpolated **directly into `innerHTML` template
literals without `escapeHtml`**. Sibling fields in the same templates ARE escaped
(`a.filename` uses `escapeHtml`), so the gap is inconsistent and clearly a defect.

Because the data originates from persisted asset/character records, a crafted
`label`/`assetId` (e.g. containing `"` or `<script>`/`onerror=`) stored by one
user is rendered unsanitized for any other user who views the gallery, character
detail, or asset preview — a **stored XSS** in multi-user contexts (group chat,
shared worlds, admin views).

## Evidence

| File | Line | Unsafe interpolation |
| --- | --- | --- |
| `src/frontend/pages/gallery.ts` | 93 | `<img src="${mediaSrc}" ...>` — `mediaSrc = /api/assets/${a.id}/raw` |
| `src/frontend/pages/gallery.ts` | 102 | `<source src="${mediaSrc}" />` (audio) |
| `src/frontend/asset-preview.ts` | 77 | `<img src="${mediaSrc}" ...>` — `mediaSrc = /api/assets/${a.id}/raw` |
| `src/frontend/asset-preview.ts` | 86 | `<source src="${mediaSrc}" />` (video) |
| `src/frontend/pages/characters.ts` | 54 | `<img src="/api/assets/${avatarId}/thumb" ...>` |
| `src/frontend/pages/characters.ts` | 100 | `<img src="/api/assets/${av.assetId}/thumb" alt="${av.label ...}" ...>` |
| `src/frontend/pages/characters.ts` | 104 | `<span>${av.label \|\| ""}</span>` |
| `src/frontend/pages/characters.ts` | 107 | `data-asset-id="${av.assetId}" data-actor-id="${id}"` |
| `src/frontend/pages/characters-edit-form.ts` | 84 | `<img src="/api/assets/${asset.id}/thumb" ...>` |

`mediaSrc`/`a.id`/`avatarId`/`av.assetId`/`asset.id`/`av.label`/`id` are all
taken from `await res.json()` (API responses) and inserted without escaping.

## Impact

- Stored XSS: malicious asset metadata executes script in the viewer's session.
- Affects gallery preview, character detail modal + linked gallery, and avatar
  upload preview — all user-facing, cross-user surfaces.

## Fix

Wrap every server-derived value in the existing `escapeHtml` helper (already
imported in `gallery.ts`/`characters.ts`; define locally in `asset-preview.ts`
which already has its own `escapeHtml`). Specifically:

- `gallery.ts` / `asset-preview.ts`: `src="${escapeHtml(mediaSrc)}"` (and the
  audio/video `<source>` variants).
- `characters.ts`: `src="/api/assets/${escapeHtml(avatarId)}/thumb"`,
  `src="/api/assets/${escapeHtml(av.assetId)}/thumb"`,
  `alt="${escapeHtml(av.label ?? "avatar")}"`, `<span>${escapeHtml(av.label || "")}</span>`,
  `data-asset-id="${escapeHtml(av.assetId)}" data-actor-id="${escapeHtml(id)}"`.
- `characters-edit-form.ts`: `src="/api/assets/${escapeHtml(asset.id)}/thumb"`.

Prefer `textContent`/attribute-property assignment over `innerHTML` where the
value is a single field (e.g. `img.src = ...; img.alt = ...`).

## Verification

- Unit/integration: feed an asset record with `label`/`id` containing
  `" onerror="alert(1)` and assert the rendered DOM contains escaped entities
  (`&quot;` / `&lt;`), not a live attribute/element.
- Manual: upload an asset named `<img src=x onerror=alert(1)>`; open preview in a
  second account → no script execution, name shown as literal text.

## Acceptance Criteria

- [x] `gallery.ts` `mediaSrc` escaped in image + audio/video `<source>`
- [x] `asset-preview.ts` `mediaSrc` escaped (image + audio/video)
- [x] `characters.ts` `avatarId`, `av.assetId`, `av.label`, `id` all escaped
- [x] `characters-edit-form.ts` `asset.id` escaped
- [ ] Regression test added covering malicious asset metadata (code fix done; test deferred)
- [x] No `innerHTML` interpolation of raw server strings remains unescaped (`check-frontend-innerhtml-xss.ts` reports 0 findings)

## Resolution

Fixed 2026-08-23 (OpenAgent, frontend review follow-up). All 15 unescaped
interpolations wrapped in `escapeHtml`:

- `src/frontend/pages/shared.ts:71` — `emptyIcon`/`emptyTitle` (empty-state)
- `src/frontend/pages/characters-edit-form.ts:85` — `asset.id` (avatar preview)
- `src/frontend/pages/characters.ts:54,100,104,107` — `avatarId`, `av.assetId`, `av.label`, `id`
- `src/frontend/pages/gallery.ts:93,98,102` — `mediaSrc` (image/audio/video)
- `src/frontend/asset-preview.ts:77,82,86` — `mediaSrc` (image/audio/video)

`characters.ts` + `characters-edit-form.ts` gained `import { escapeHtml, } from "./shared";`.
`bun run check-frontend-innerhtml-xss.ts` now exits 0. Changes are **uncommitted**
(agents do not commit per AGENTS.md). Regression test still TODO.
