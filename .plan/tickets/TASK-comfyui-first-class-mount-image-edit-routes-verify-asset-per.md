<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI first-class: image-edit route authz + asset persistence pin

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-comfyui-plugin
**Tags:** comfyui, routes

**Summary:** `handleRun` takes a bare `Request` with no auth (IDOR write via foreign `chatId`); fix to `handleImageGeneration` parity, correct stale `/api/*` doc comments to `/api/v1/*`, pin persistence with roundtrip + 401/403 tests.

**Context:** CORRECTION 2026-09-25: Path B IS mounted at `/api/v1/image-edit/*` via the v1 content barrel (`content-surface.ts:44`), consumed by the Elysia app (`elysia-app.ts:206`). The earlier 'zero mounts' claim was wrong (grep excluded the importer). Real Path B gaps: (a) `handleRun` (`routes.ts:61`) takes a bare `Request` with NO `userId`/`checkChatAccess` — compare `handleImageGeneration` (`image-gen-route.ts:55-70`, 401 + chat ownership gate); any caller can attach generated assets to a foreign chat via `chatId`/`messageId` (IDOR write). (b) Doc comments say `/api/image-edit/*`, served prefix is `/api/v1/*` — stale. `ComfyUIEditProvider.execute` (`comfyui-provider.ts:153-197`) DOES download + `createAsset`/`linkAsset` — persistence holds, pin it.

## Implementation

1. Authz `handleRun` like `handleImageGeneration`: require `userId` (401 otherwise), `checkChatAccess` when `chatId` present (same `forbiddenResponse`), `getOwnedTemplate`-style scoping if templates gain owners. Thread the caller through `imageEditRoutes` factory (currently `_opts: { database }` — needs `userId`/`userRole` like the generation controller at `controller.ts:121`).
2. Fix stale doc comments: `/api/image-edit/*` → `/api/v1/image-edit/*` (served prefix via content-surface barrel).
3. Regression tests: (a) execute-then-fetch roundtrip pins persistence; (b) unauthenticated `run` → 401; (c) cross-chat `chatId` → 403 (IDOR write closed).
4. Update `epic-comfyui-plugin.md`: record routes mounted (they are), replace mount gap with authz gap.

**Acceptance Criteria:**

- [ ] `POST /api/v1/image-edit/run` requires auth; foreign chatId rejected (IDOR write closed)
- [ ] execute-then-fetch roundtrip test green (no dangling links)
- [ ] Route smoke tests green (`templates` lists registry, `nodes` proxies `/object_info`, `health` reflects backend)
- [ ] Doc comments say `/api/v1/image-edit/*`
- [ ] Documentation updated
