<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: External Harness Integration (ACP)

**Overview:** (see sections below)

**Status:** In Progress
**Status Note:** Core profile-aware selection landed on dev (`c4f23fa56` profile selector/registry/ledger/breaker + `7082da5da` omp integration, both in ancestry; `harness.acp.profiles[]` config; TASK-acp-profile-aware-model-selection Done): adapter matrix stays open — opencode/claude-code adapters live in TASK-acp-profile-harness-adapters (Not Started).
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

- [ ] ACP driver module
- [ ] opencode adapter
- [ ] omp adapter
- [ ] permission/approval flow
- [ ] model discovery + capability enrichment
- [ ] message persistence mapping
- [ ] per-user isolation gate
- [ ] optional-dep packaging
- [ ] fake ACP server test fixture
- [ ] e2e env-gated scenario

## Dependencies

Depends on `epic-harness-integration.md` (internal harness consolidation) and `epic-external-creative-tool-bridge.md` (MCP bridge patterns).

## Related Epics

`epic-harness-integration.md`, `epic-external-creative-tool-bridge.md`, `epic-byok-api-keys.md`, `epic-security-sandboxing.md`, `epic-plugin-system.md`.
