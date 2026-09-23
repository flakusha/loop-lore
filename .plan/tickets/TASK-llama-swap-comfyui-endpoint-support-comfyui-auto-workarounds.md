<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: llama-swap /comfyui endpoint support (comfyui_auto + workarounds)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Done
**Priority:** medium
**Effort:** Small

## Summary

Adopt upstream llama-swap /comfyui compatibility endpoint (merged PR #1002, issue #1001). Upstream facts (server.go main): /comfyui + /comfyui/{path} passthrough bound to FIXED model id comfyui_auto (NOT ls_comfyui; GET /ws never starts unloaded model); model.workarounds.ignoreWebsockets=true removes ws from swap/TTL/concurrency accounting (replaces per-model websocket.ignore draft); upstream.ignorePaths comfyui example: ^/ws(\/|$) + ^/api/jobs$ for /upstream serving. Our state: ComfyUIClient (src/generation/providers/comfyui.ts) polls /prompt + /history/{id} + /view only, never touches /ws — so ws-blocking never fires today, but browser/LoRA discovery via /object_info + bulk /view downloads may count as inflight. Scope: comfyui_auto swap-recipe entry (cmd: comfyui main.py --port, ttl 0, persistent helpers member), adoption doc (route image-gen through proxy /comfyui vs direct baseUrl), decide per-endpoint routing (prompt/history/view via proxy? ws ignore always on).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

`comfyui_auto` recipe entry uses `compatibility.ignoreWebsockets: true` + `checkEndpoint: /system_stats` (upstream schema keys verified against `internal/config` + `internal/server/comfyui.go` — the field group is `compatibility`, not `workarounds`). Per-endpoint routing decision: route all of prompt/history/view/upload/object_info through the proxy — `ComfyUIClient` never touches `/ws`, so `ignoreWebsockets` fully covers today's client. Adoption doc in `docs/spec/integrations/llm-serving.md` (ComfyUI via the `/comfyui` Passthrough). Regression test pins the pathed baseUrl (`http://host:port/comfyui/prompt`) in `src/generation/providers/comfyui.test.ts`.
