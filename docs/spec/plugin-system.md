<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Plugin System Specification

Status: Post-MVP (v0.2+). Plugin skeleton (`src/plugins/`) loads core/community/local plugins but has NO management API, NO sandbox, NO examples.

## Implemented

- Plugin types: core (`plugins/core/`, bundled read-only), community (`plugins/community/`, signature required), local (`plugins/local/`, no verification).
- Plugin manifest: `plugin.ts`/`.js` exporting the `Plugin` interface; `PluginContext` provided on `onLoad()`.
- Naming: plugins kebab-case, tools snake_case, agent roles kebab-case, events dot-separated (`chat.message.created`).

## Extension points (design)

- Tools (AI-executable functions), agent roles, API routes, UI components, event handlers, DB migrations.

## Not implemented / aspirational

- Registry API: `GET /api/plugins`, `POST /api/plugins/install`, `DELETE /api/plugins/:name`, enable/disable, manifest/config get/put.
- Security model: sandboxing (Firecracker/WASM), network/file allowlists, per-execution resource limits, declared-permission grants, signed community publishers.
- Standard tool categories.

## Epics

- `.plan/epics/epic-plugin-system.md`
- `.plan/epics/epic-plugin-extension-points.md`
- `.plan/epics/epic-plugin-management-ui.md`
