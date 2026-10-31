<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: claude-code ACP adapter

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, partial failure, rollback, dependency

**Summary:**

Add a claude-code adapter to the harness ACP family (`TASK-acp-profile-harness-adapters`
landed opencode + codex on the shared `GenericAcpAdapter` engine). Claude Code's ACP
adapter (`@agentclientprotocol/claude-agent-acp`, formerly zed-industries/claude-code-acp)
does not expose model selection through stable ACP v1 `configOptions`:

- Available models ride a non-standard `models` field on the session/new response
  (`SessionModelState`: `availableModels` + `currentModelId`), not a select config option.
- Switching uses the `unstable_setSessionModel` extension method
  (`{sessionId, modelId}` → SDK `query.setModel`), not `session/set_config_option`.
- The method name is literally prefixed `unstable_`; the draft ACP v2 surface can still
  change it.

This is exactly the divergence the parent ticket's caveat calls out: do not guess wire
casing — split out until the surface stabilizes.

**Acceptance Criteria:**

- [ ] claude-code adapter (`src/integrations/harness/claude-code.ts`) on the
      `GenericAcpAdapter` engine, mapping the `models` field / model-switch method of the
      then-current stable ACP surface onto `enumerateModels` / `setModel`

- [ ] Model ids normalized to the core's `provider/id` shape (namespace bare Anthropic
      model ids, mirroring the codex adapter's prefix mapping)

- [ ] Fake-fixture suite mirroring the omp/opencode/codex suites (canned claude-code
      flavor; one subprocess per test, afterEach hard-kill)

- [ ] No omp/opencode/codex-specific assumptions outside their own files

- [ ] `bun test src/integrations/harness/` green with the new suite

**Dependency:** unblock when claude-agent-acp serves model selection through a stable
(v1 or released v2) ACP method — config-option select with `session/set_config_option`,
or a stabilized `setSessionModel` — verified against the adapter's published source, not
assumed.
