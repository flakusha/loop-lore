<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI first-class: standalone auto-start config + lifecycle

**Status:** Not Started
**Priority:** high
**Effort:** Medium (config schema + spawner + admin status endpoint)
**Summary:** `ComfyUIAutoStartConfig` + `start-comfy.ts` spawner probing `/system_stats` for readiness + admin status surface; defines the standalone-vs-proxy baseUrl contract consumed by the rest of the first-class program.
**Context:** First-Class Program step 1 (`epic-comfyui-plugin.md` § First-Class Program, 2026-09-25). Standalone mode is new; llama-swap `comfyui_auto` passthrough already landed. Auto-start must be opt-in via config and report health through the admin surface.

**Acceptance Criteria:**
- [ ] `ComfyUIAutoStartConfig` in config schema: enabled, baseUrl, binary/launch args, readiness timeout.
- [ ] `start-comfy.ts` spawner launches the process, polls `GET /system_stats` until ready, and surfaces failures as admin-visible status (not silent catch).
- [ ] Admin status endpoint reports standalone state (starting/ready/failed/stopped) + baseUrl.
- [ ] Standalone-vs-proxy baseUrl contract documented: which component owns URL resolution in each mode.
- [ ] Unit tests cover config parsing, readiness polling, and failure surfacing.
- [ ] `bun run check` green.

**Epic:** epic-comfyui-plugin
**Tags:** comfyui, standalone, auto-start, lifecycle, spawner
**Related:** epic-comfyui-plugin.md § First-Class Program, TASK-comfyui-first-class-client-id-websocket-progress-in-comfyuic


git issue: 5bd5c7e
