<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: assistant /doctor command rendering setup-state checks

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## What

Assistant slash command /doctor: registerCommand("doctor", ...) with declared capabilities (["read-chat"]; an admin variant may use requiredRole + admin-only capability tags), rendering the setup-state endpoint checks (GET /api/v1/setup/state) as targeted questions / next steps via systemMessage. Add a TOOL_COMMANDS detector entry (gm-tool-execution.ts:50-56) for natural-language triggering; optionally a setup prompt section in PROMPT_SECTIONS (src/assistant/prompt/registry.ts).

Distribution is free: registered commands appear in the TUI completer via GET /api/v1/commands (src/tui/chat/commands.ts:5-14) and the web GM/Assistant panel (src/views/chat.html:76-77) with zero UI work.

## Why

Research round 3 candidate C3 (effort S, depends on the setup-state endpoint ticket): the assistant is the cheapest guided-setup surface — every seam exists (declarative registry with mandatory capabilities and a fail-closed guard matrix, prompt sections, free TUI+web distribution) and no onboarding-shaped flow exists anywhere in src/.

Scope boundary vs existing ticket 276a41d (feat(config): config doctor with example-drift CI, Not Started, blocked-by T19/T21/T27): that ticket is a CI/docs doctor (bun run config:doctor validating example files, ENV_MAP resolution, knob coherence, CI-enforced drift test). THIS ticket is the runtime assistant command over live server state. They share only the name — keep them separate, cross-referencing; neither subsumes the other.

## Scope

- src/assistant/commands/doctor.ts — command registration + rendering of checks
- TOOL_COMMANDS entry for natural-language entry
- optional: setup prompt section (PROMPT_SECTIONS builder)
- tests: guard pass for the declared capability, rendering of ok:false checks

## Do NOT touch

- Do NOT implement a doctor CLI binary or headless proxy (single machine-readable source stays the setup-state endpoint)
- Do NOT widen the command registry options contract (capabilities stay mandatory and fail-closed)
- Do NOT absorb the 276a41d CI example-drift scope

## Acceptance Criteria

- [ ] /doctor appears in the TUI completer and web panel without UI changes
- [ ] guard fail-closed pass for the declared capability (guard/matrix.ts:89-134) — undeclared tool use stays denied
- [ ] e2e flow: fresh instance -> doctor reports provider missing -> admin adds provider via the existing admin route (src/routes/admin/providers.ts:33-64) -> doctor reports ok
- [ ] natural-language entry triggers the doctor flow via TOOL_COMMANDS detection

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
