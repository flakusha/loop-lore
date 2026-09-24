<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-tool-access-grants: Per-Tool Access Grants Beyond Role Gating

**Status:** open
**Priority:** high
**Effort:** Medium
**Labels:** generation, tools, security, access-control
**Summary:** Extend `executeToolCalls()` to enforce per-tool `access_grants` (`resource_type='tool'`, `resource_id=toolName`, `permission='execute'`) before invoking any tool. Tools the actor lacks a grant for must return an error tool result — never throw and never silently skip.

**Context:** Loop-lore's existing gating (`gatePluginToolsByRole`) only checks the agent role's tool allowlist. Open-webui adds a second layer: `AccessGrants.has_access(user, "tool", tool_name, "execute")` consulted inside `process_tool_result` / `execute_tool`. Without it, role-shared tools with sensitive actions leak to any agent that inherits the role. The `access_grants` table already exists for `character` / `knowledge`; adding a `tool` `resource_type` closes the gap.

**Acceptance Criteria:**

- [ ] `executeToolCalls()` consults `access_grants` for each tool before invocation.
- [ ] Missing grant → tool result with `isError: true` and a descriptive message; no exception thrown, no tool execution.
- [ ] Existing role-allowlist filtering (`gatePluginToolsByRole`) still applies as the first pass.
- [ ] At least one integration test (or smoke check) verifies that an actor without a grant for `dangerous_tool` receives an `isError` tool result instead of execution.
- [ ] New `resource_type='tool'` rows are insertable via the existing `access_grants` migration flow.

**Description:**

Insert the access check at the top of the loop body in `src/generation/generate-route/tool-execution.ts:73–86`:

```ts
for (const call of toolCalls) {
  const granted = await accessGrants.hasAccess({
    userId: actor.id,
    resourceType: "tool",
    resourceId: call.name,
    permission: "execute",
  });
  if (!granted) {
    results.push({
      toolCallId: call.id,
      role: "tool",
      content: `Access denied: tool "${call.name}" not granted to ${actor.handle}`,
      isError: true,
    });
    continue;
  }
  // ...existing invocation path
}
```

The deny path returns a normal tool result flagged `isError: true` so the model
can surface it conversationally rather than aborting the whole round.
Successful invocations proceed through the existing path unchanged. The
`access_grants` table already exists; only the new `resource_type='tool'` rows
and the corresponding `hasAccess` switch arm are needed.

**Acceptance Criteria:**

- [ ] `executeToolCalls()` consults `access_grants` for each tool before invocation.
- [ ] Missing grant → tool result with `isError: true` and a descriptive message; no exception thrown, no tool execution.
- [ ] Existing role-allowlist filtering (`gatePluginToolsByRole`) still applies as the first pass.
- [ ] At least one integration test (or smoke check) verifies that an actor without a grant for `dangerous_tool` receives an `isError` tool result instead of execution.
- [ ] New `resource_type='tool'` rows are insertable via the existing `access_grants` migration flow.

**Notes:**

- Deny messages intentionally name the tool and actor so model-side reasoning can ask for explicit grant elevation.
- ponytail: an in-memory cache for `hasAccess` lookups is deferred until profiling shows round-trip latency — single SQL hit per tool per round is fine for now.
- This ticket does NOT add admin UI for managing tool grants; that's a separate follow-up.

**References:**

- loop-lore: `src/generation/generate-route/tool-execution.ts:73–86` — `executeToolCalls` loop body.
- loop-lore: `src/db/schema/access-grants.ts` — existing grants table.
- loop-lore: `src/generation/generate-route/gatePluginToolsByRole` — role-allowlist pass that runs first.
- open-webui: `open-webui/backend/open_webui/utils/tools.py:267–300` — `AccessGrants.has_access` for tool execution.


git issue: 9327317
