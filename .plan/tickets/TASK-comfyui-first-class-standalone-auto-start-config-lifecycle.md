<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI first-class: standalone auto-start config + lifecycle

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-comfyui-plugin
**Tags:** comfyui, config, autostart

**Summary:** Standalone ComfyUI auto-start: `ComfyUIAutoStartConfig` + spawner so ComfyUI runs as a first-class citizen alongside sd-server, with a documented standalone-vs-proxy baseUrl contract.

**Context:**

llama-swap config supports ComfyUI two ways: proxied (`comfyui_auto` model id → `/comfyui` passthrough, landed) and now standalone (this task). Standalone avoids swap/TTL/VRAM accounting entirely — ComfyUI owns its GPU budget, loop-lore just points `baseUrl` at it directly. This mirrors how `SdCppAutoStartConfig` already spawns sd-server (src/config/schema/auto-start.ts:90-166, spawner src/services/server-external-manager/start-sd.ts).

## Implementation

1. `src/config/schema/auto-start.ts`: add `ComfyUIAutoStartConfig` (`enabled`, `pythonPath` default `python3`, `mainPath` path to ComfyUI `main.py`, `port` default 8188, `extraArgs?: string[]`, `vramMode?: 'auto' | 'lowvram' | 'novram' | 'cpu'`) + `comfyUI?: ComfyUIAutoStartConfig` on `AutoStartConfig`.
2. `src/services/server-external-manager/start-comfy.ts`: spawn `python main.py --port {port} {vramFlag} {extraArgs}`, mirror start-sd.ts lifecycle (spawn/kill/restart). Ready probe: `GET {base}/system_stats` (lightweight, no `/health` on ComfyUI — same probe the swap recipe uses).
3. Wire into `src/server/init-background-services.ts` next to sd-cpp startup; surface status in `src/routes/admin/sd-status.ts` (or rename surface if it hardcodes sd).
4. Config templates: `configs/config.generation.example.{toml,yaml}` + `src/config/sections/generation/` loader support for the new block.
5. Mode contract (document in ticket + docs): standalone → provider `baseUrl=http://localhost:{port}` (no prefix); proxy → `baseUrl=http://{swap-host}:{port}/comfyui`. `ComfyUIClient` already strips trailing slashes; both shapes must be accepted and covered by test.

**Acceptance Criteria:**

- [ ] `ComfyUIAutoStartConfig` typed, loaded from config file, example configs updated
- [ ] Spawner starts ComfyUI, `system_stats` probe gates readiness, graceful shutdown on server stop
- [ ] Admin status surface reports ComfyUI state
- [ ] Tests: spawn arg assembly (incl. vram flags), probe success/fail, both baseUrl shapes accepted by client
- [ ] Documentation updated (llm-serving.md standalone subsection)
