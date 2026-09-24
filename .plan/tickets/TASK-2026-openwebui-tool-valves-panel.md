<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-tool-valves-panel: Per-Tool User Valves Configuration Panel

**Status:** ⬜ Not Started
**Priority:** medium
**Labels:** frontend, tools, controls

## Summary

Add a Chat Controls collapsible Alpine section that lets users pick a tool and override its per-tool parameter fields (valves) declared by the tool's `valvesSpec`. Changes debounce-save to a new endpoint `PATCH /api/tools/:id/valves`. On generation, overrides are injected so tools receive user-customized values.

## Context

Tools in loop-lore already declare per-tool parameter schemas (`valvesSpec`) consumed at generation time. There is no UI for users to set them per-session. Open-webui ships exactly this in `open-webui/src/lib/components/chat/Controls/Valves.svelte:41–50` — a per-tool, per-user, debounced-save panel that overrides default values.

Loop-lore already has Alpine + htmx controls in `src/views/chat.html`; this ticket extends the chat composer area with a new collapsible Valves section, a new Alpine component for the field UI, a new REST endpoint to persist overrides, and a small injection point in the prompt-build pipeline so the values reach the tool.

## Description

Frontend additions:

1. New partial `src/partials/chat/valves-controls.html` rendered inside the existing chat composer area, collapsible via Alpine `x-show`. Lists available tools (selector) and renders fields dynamically from the tool's `valvesSpec`.
2. New Alpine component `src/frontend/alpine/chat-types/valves-render.ts` with `getFields(toolId)` and `debouncedSave(toolId)` (350 ms debounce on `input`).
3. `src/views/chat.html` references the new partial with `hx-get="/partials/chat/valves-controls.html"` mounted in the existing collapsible.

Partial sketch:

```html
<section x-data="valvesRender(currentTool)" x-init="loadSpec()">
  <select x-model="currentTool" @change="loadSpec()">
    <template x-for="t in tools"><option x-text="t.name"></option></template>
  </select>
  <template x-for="f in fields">
    <label><span x-text="f.label"></span>
           <input :type="f.type" x-model="values[f.key]"
                  @input.debounce.350ms="save()"></label>
  </template>
</section>
```

Server additions:

1. New route in `src/routes/tools/valves.ts` exposing `PATCH /api/tools/:id/valves` that accepts `{ values: Record<string, unknown> }` and persists per-user overrides.
2. New injection helper in `src/generation/generate-route/build-prompt.ts` (or the equivalent prompt-assembly site already in use) that resolves tool valves in this order: user-override → tool default → unset. This runs on each generation, not at tool registration.

## Acceptance Criteria

- [ ] New partial `src/partials/chat/valves-controls.html` exists and renders inside the existing chat composer area in `src/views/chat.html`.
- [ ] New Alpine component `src/frontend/alpine/chat-types/valves-render.ts` exposes a reactive `values` store and a 350 ms debounced `save()`.
- [ ] When a user types into a valve field, `PATCH /api/tools/:id/valves` fires after 350 ms of inactivity with the current `values`.
- [ ] The endpoint is user-scoped (overrides do not leak across users) and persists to the DB.
- [ ] When a generation runs, the prompt assembly in `src/generation/generate-route/build-prompt.ts` receives the merged valve values for every selected tool (override > default > unset).
- [ ] Tools receive the merged values via the existing tool-execution context (no tool-side code change required beyond reading the context field).
- [ ] Selectors for empty `valvesSpec` render an empty-state message ("This tool exposes no parameters") and do not show the save button.

## Notes

- This is **not** an upgrade to Svelte. Everything stays in Alpine + htmx; the partial is htmx-loaded, the form state is Alpine-reactive.
- Debounce is critical or every keystroke writes a row.
- Override storage should use the existing per-user preferences table or a new minimal `tool_user_valves(tool_id, user_id, values JSON)` table; the chosen location is a wiring detail left to the implementer.

## References

- loop-lore `src/views/chat.html` — host page; add a new collapsible slot for the controls partial
- loop-lore `src/frontend/alpine/chat-types/` — directory for new `valves-render.ts` Alpine component
- loop-lore `src/generation/` — `build-prompt.ts` (or equivalent) injection point for merged valve values
- loop-lore `src/routes/tools/` — new `valves.ts` route file for `PATCH /api/tools/:id/valves`
- open-webui `src/lib/components/chat/Controls/Valves.svelte:41–50` — per-tool, per-user, debounced-save pattern
