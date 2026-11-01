<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: claude-code ACP adapter

**Status:** Done (landed in worktree feat-acp-harness-adapters; commit recorded below)
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

**Context:**

Split out of `TASK-acp-profile-harness-adapters` after that ticket's wire-casing
caveat flagged Claude Code's non-standard model surface; tracked separately so the
shared `GenericAcpAdapter` engine does not grow special cases for an `unstable_`
upstream API that can still change.

**Acceptance Criteria:**

- [x] claude-code adapter (`src/integrations/harness/claude-code.ts`) on the
      `GenericAcpAdapter` engine, mapping the `models` field / model-switch method of the
      then-current stable ACP surface onto `enumerateModels` / `setModel`

- [x] Model ids normalized to the core's `provider/id` shape (namespace bare Anthropic
      model ids, mirroring the codex adapter's prefix mapping)

- [x] Fake-fixture suite mirroring the omp/opencode/codex suites (canned claude-code
      flavor; one subprocess per test, afterEach hard-kill)

- [x] No omp/opencode/codex-specific assumptions outside their own files

- [x] `bun test src/integrations/harness/` green with the new suite

**Status Note:** Implemented on the generic engine via two new documented override
hooks (`advertisedModelIds` / `applySessionModel`, default behavior unchanged — the
stable select-configOption path still covers omp/opencode/codex). Wire surface
verified against the adapter's published docs (zed-industries/claude-code-acp wiki:
`SessionModelState` rides `session/new.models.availableModels[].modelId`; switching is
`unstable_setSessionModel` `{sessionId, modelId}`; bare Anthropic ids) and pinned in
fake-acp-server via `FAKE_MODELS_FIELD` + an `unstable_setSessionModel` handler. The
declared `unstable_` prefix remains the volatility caveat: if a released v2 renames
the method, only `claude-code.ts` constants change. Core-facing ids are namespaced
`claude/<modelId>`; slash-containing wire ids pass through verbatim. No quota surface
over ACP → `fetchUsageReports` resolves null (fixture-verified).

**Negative-path follow-ups (same branch, second commit):** fixture gained
`FAKE_MALFORMED` (garbage NDJSON before a never-answered initialize), `FAKE_HANG`
(unanswered initialize), and `FAKE_EXIT_ON_PROMPT` (child exits code=1 on a matching
prompt text). `generic-acp-negative.test.ts` asserts: malformed noise → typed
`initialize` timeout (no crash, no hang); handshake hang → typed `initialize` timeout
(`/initialize timed out/`); mid-prompt child exit → typed `prompt` error whose message
carries `code=1` (transport detail), then a fresh prompt respawns a new child and
succeeds. The respawn case closed the zombie-session gap in `GenericAcpAdapter`: the
transport `onExit` now clears the memoized session/rpc so a dead child can never pin
"connection closed" onto later calls. `JsonRpcProcess` itself was left untouched —
line classification is shared and the engine-side fix is smaller and adapter-scoped.

**Dependency:** unblock when claude-agent-acp serves model selection through a stable
(v1 or released v2) ACP method — config-option select with `session/set_config_option`,
or a stabilized `setSessionModel` — verified against the adapter's published source, not
assumed.
