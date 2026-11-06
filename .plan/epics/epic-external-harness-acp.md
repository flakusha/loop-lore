<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: External Harness Integration (ACP)

**Overview:** (see sections below)

**Status:** In Progress
**Status Note:** Landed on dev: ACP driver module (`34a018b09` HarnessDriver + session/cancel + permission approval), opencode adapter (`410954c39`, plus codex on the shared `GenericAcpAdapter` engine), omp adapter (original adapter in ancestry of `src/integrations/harness/omp.ts`; migrated onto the generic engine by `410954c39`), claude-code adapter (`516ecb808`), fake ACP server test fixture (fixture landed through `6ba944b5a` and earlier fixture commits), profile-aware model selection (`c4f23fa56` + `7082da5da`), the per-user isolation gate (`84b4ad10`), the ToS acknowledgement config flag (`AcpProfileConfig.tosGrayzoneAcknowledged` validated by `validateAcpProfiles`), the ToS dispatch guard (`profile-selector.ts` `tos_unacknowledged` skip), and the e2e env-gated ACP scenario (`tests/e2e/flows/harness-acp.test.ts` behind `HARNESSE2E=1`). TASK-acp-driver-module, TASK-acp-profile-harness-adapters, TASK-acp-claude-code-adapter, TASK-fake-acp-server-test-fixture, TASK-e2e-env-gated-scenario, TASK-harness-tos-acknowledgement-config-flag and TASK-harness-tos-acknowledgement-dispatch-guard Done. TASK-harness-provider-tos-usage-class-matrix and TASK-harness-tos-acknowledgement-frontend-confirmation land with the `feat-tos-frontend` branch — done-if-landed: static provider ToS usage-class matrix rendered in the admin harness panel, plus the settings enable toggle + confirmation modal persisting `tosGrayzoneAcknowledged` through `validateAcpProfiles`. Open: message persistence mapping (TASK-message-persistence-mapping). Optional-dep packaging landed on this branch (TASK-optional-dep-packaging, `d3f8ead7e`): the epic's npm peerDependencies framing is a recorded no-op (no optional npm dep is imported anywhere under `src/integrations/harness/`), so packaging is the binary-probe concern — `availability.ts` probes each profile's configured argv lazily (PATH resolve + bounded `--version` spawn, fail-soft `{available,version}|{available:false,reason}` verdict, per-process cache with `?refresh=1` and a `__reset` seam), surfaced per profile on the admin-gated `GET`/`PUT /api/v1/harness/settings`; no binary is bundled, downloaded, or auto-installed. Model discovery + capability enrichment landed on this branch (TASK-model-discovery-capability-enrichment): `discoverHarnessModels` reads EXISTING `ProfileRegistry` connections only (never spawns to list), degrades fail-soft to static tier config, and enriches ids from `src/admin/model-capabilities.ts` via the `provider/id` prefix; exposed admin-gated at `GET /api/v1/harness/models`. Message persistence mapping landed on this branch (TASK-message-persistence-mapping): an ACP turn now persists as chat rows — one assistant row (text, `tool_calls`, `thinking`, harness metadata) plus one `tool_result` row per finished tool call, written in one transaction and idempotent on the `idempotency_key` column — and the same transcript maps onto live chat frames (`harness-chunk`, `harness-thinking`, `harness-tool-call`, `harness-tool-result`, `harness-turn-end`). The rows follow the shapes `src/routes/messages/helpers.ts` already parses, so the chat timeline renders a harness turn like an LLM turn. The harness is still not reachable from the chat route: the production dispatch path stays open.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** acp, harness, external-harness, opencode, omp, permissions, model-discovery, message-persistence, isolation, testing
**Depends on:** epic-harness-integration.md, epic-external-creative-tool-bridge.md
**Related Epics:** epic-harness-integration.md, epic-external-creative-tool-bridge.md, epic-byok-api-keys.md, epic-security-sandboxing.md, epic-plugin-system.md

## Summary

Bring external agent harnesses (opencode, omp, and others speaking ACP/JSON-RPC over stdio) into loop-lore as first-class drivers under `src/integrations/harness/`. Unlike the internal harness consolidation epic (`epic-harness-integration.md`), this epic drives *external* binaries via the Agent Client Protocol: spawn the official binary, speak ACP, map turns to loop-lore `Messages`, surface permissions for user approval, and enrich discovered models from the existing capability table. Credentials are never read by our code; binaries run under the user's own auth.

## Design

### Module layout

- `src/integrations/harness/` with `HarnessDriver` interface: `discoverModels`, `runPrompt`, `cancel`, `approvePermission`.
- Adapters: `opencode.ts`, `omp.ts`, registered via `src/integrations/registry`.
- Reuse `createMessageBridge` moderation gate.

### Per-user isolation

Harnesses run only for solo/admin user. Gate behind `isAdminRole`, not `auth.required`. Never share one subscription across users. Store config per-user or server-wide admin config. Spawn official binary only.

### Model routing

Reuse `TaskSignal`/`TaskType` + `ModelRouter`. Add `TaskType "harness"` or map to existing. Capability enrichment from static map merged with harness-reported id/name/effort.

### Storage

Persist harness turns as `Messages` rows: assistant rows with `tool_calls`, `thinking`; `tool_result` rows with `MessageContentType.ToolResult` and `metadata.tool_call_id`. Map ACP `session/update` to SSE frames.

### Permission / approval

Client-side approval authority (ACP bidirectional). Auto-allow read-only tools in sandboxed cwd; require user approval for write/exec; reuse plugin tool-policy tags.

### Packaging

Optional deps via `peerDependencies` + dynamic-import capability probe (mirror `src/native/loader.ts`). In-repo optional modules with `isAvailable` probe. Never bundle harness binaries.

### TOS guardrails

Spawn official binary only; never extract credentials; single-user/single-machine; log usage per session.

## Tasks

- [x] ACP driver module
- [x] opencode adapter
- [x] omp adapter
- [x] claude-code adapter
- [x] permission/approval flow
- [x] model discovery + capability enrichment
- [ ] message persistence mapping
- [x] per-user isolation gate
- [x] optional-dep packaging
- [x] fake ACP server test fixture
- [x] e2e env-gated scenario
- [x] ToS acknowledgement config flag
- [x] ToS dispatch guard
- [x] ToS provider usage-class matrix (done-if-landed: feat-tos-frontend)
- [x] ToS acknowledgement frontend confirmation (done-if-landed: feat-tos-frontend)

## Dependencies

Depends on `epic-harness-integration.md` (internal harness consolidation) and `epic-external-creative-tool-bridge.md` (MCP bridge patterns).

## Related Epics

`epic-harness-integration.md`, `epic-external-creative-tool-bridge.md`, `epic-byok-api-keys.md`, `epic-security-sandboxing.md`, `epic-plugin-system.md`.


git issue: 253e7e4
