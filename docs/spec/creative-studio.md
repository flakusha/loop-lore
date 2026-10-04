<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Creative Studio Specification

> **Status:** Not yet specified as a standalone module (checked 2026-10-02). Grounded in `src/`:
> there is no dedicated `src/studio/` — creative-studio capability is implemented across existing
> subsystems. Authoritative state lives in the owner epic `.plan/epics/epic-creative-studio.md`
> (Status Note: 🟡 In Progress, MVP scoped) and
> `.plan/epics/epic-assistant-creative-studio-workflows.md`.

## Overview

Unified creative tools for assistant chat — context menus, modals for locations/worlds/notes/items,
a creative toolbar, and "book" compilation; intent detection, command sandboxing, and unified
search.

## Current State

- The workflow-template layer of this domain is shipped:
  `src/assistant/workflow-runner.ts`, `src/assistant/workflow-session.ts`,
  `src/assistant/workflow-session-store.ts`, and `src/config/sections/templates-workflow.ts`.
- The remaining scope (modals, unified search, toolbar) is tracked as implementation gaps in
  `epic-creative-studio.md`; it is not described here because no `src/` module owns it yet.

## Integration Points

- `src/assistant/workflow-runner.ts` — multi-step generation workflow state machine.
- `src/config/sections/templates-workflow.ts` — assistant workflow template config.

## Related Epics

- `.plan/epics/epic-creative-studio.md` — owner (In Progress, MVP scoped)
- `.plan/epics/epic-assistant-creative-studio-workflows.md`
