<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Wire intent output to workflow-runner.startWorkflow

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-workflow-engine
**Tags:** assistant, workflow, intent

**Summary:** classifyIntent (src/generation/auto-gen/classify-intent.ts) and regex INTENT_PATTERNS (src/regex/intent.ts) produce intent+target but no caller routes to startWorkflow (src/assistant/workflow-runner.ts) — only workflow-session.ts calls it. Entity-generation YAML templates (configs/templates/workflows/entities.yaml) are dead dispatch.

**Context:** The workflow engine (runner, routing, session store, YAML loader) is shipped but unreachable from intent classification; wiring one call unlocks all entity-generation workflows. Verified 2026-09-26: only workflow-session.ts imports startWorkflow; classifyIntent has no workflow-routing import.

**Acceptance Criteria:**

- [ ] /create char via intent starts a workflow run; unmatched intents unchanged (test).
- [ ] `bun run check` green.
