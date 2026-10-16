<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Plugin System Specification

Status: Post-MVP (v0.2+). Plugin skeleton (`src/plugins/`) loads core/community/local plugins but has NO management API, NO sandbox, NO examples.

## Implemented

- Plugin types: core (`plugins/core/`, bundled read-only), community (`plugins/community/`, signature required), local (`plugins/local/`, no verification).
- Plugin manifest: `plugin.ts`/`.js` exporting the `Plugin` interface; `PluginContext` provided on `onLoad()`.
- Naming: plugins kebab-case, tools snake_case, agent roles kebab-case, events dot-separated (`chat.message.created`).
- UI component mount points: web-capable components (`type` `web`/`both`) render as inert host containers (`data-plugin-component` / `data-plugin-location` plus HTML-escaped `props` JSON) at `chat.header` / `chat.sidebar` / `chat.composer` (`src/views/chat.html`) and `admin.dashboard` (`src/views/admin.html`); `GET /api/plugins/ui-components` (admin) lists them with an optional `?location=` filter. TUI-only components are never mounted into web views.

## Extension points (design)

- Tools (AI-executable functions), agent roles, API routes, UI components, event handlers, DB migrations.

## Tool policy tags

`ToolDefinition.policy` (`src/plugins/tool-policy.ts`) is a **process requirement**, not isolation.
The only tag is `requires-strict-codegen`: the tool refuses to run unless the
process was started with Bun's `--disallow-code-generation-from-strings=strict`,
which closes the string-to-code escape (`eval`, `new Function`, `node:vm`,
run-time `data:` imports) for the whole process. `executePluginTool` re-evaluates
the tag on every invocation, so a tool cannot be grandfathered in by having run
before it was tagged.

Plugin tools still run in-process with full filesystem and network access. The
tag is neither a sandbox nor a boundary; stronger isolation is future work
(gated on `Bun.ModuleGraph` leaving `experimental`).

## Not implemented / aspirational

- Registry API: `GET /api/plugins`, `POST /api/plugins/install`, `DELETE /api/plugins/:name`, enable/disable, manifest/config get/put.
- Security model: sandboxing (Firecracker/WASM), network/file allowlists, per-execution resource limits, declared-permission grants, signed community publishers.
- Standard tool categories.

## Epics

- `.plan/epics/epic-plugin-system.md`
- `.plan/epics/epic-plugin-extension-points.md`
- `.plan/epics/epic-plugin-management-ui.md`
