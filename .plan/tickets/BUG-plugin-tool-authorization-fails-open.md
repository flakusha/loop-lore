<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Plugin tool authorization fails open

**Status:** Not Started
**Priority:** high
**Epic:** epic-security-sandboxing
**Effort:** Medium

**Summary:**

**Problem.** `gatePluginToolsByRole` returns the full, unfiltered plugin tool list on every path where it cannot resolve the actor's role. An unresolvable role — a typo, a stale id, a role deleted while a request is in flight — yields *more* tools, not fewer. Behaviour confirmed in source before writing this ticket.

**Evidence.** `src/generation/generate-route/tool-execution.ts:74-87`:

```ts
export function gatePluginToolsByRole(agentRole: string | null): ToolDefinition[] {
  const pluginTools = registry.getAllTools();
  if (!agentRole) { return pluginTools; }        // :76 — no role => everything

  const role = registry.getAgentRole(agentRole);
  if (!role) { return pluginTools; }            // :79 — unresolvable role => everything
  if (!role.tools?.length) { return []; }       // :80 — the one fail-closed path
```

The asymmetry is visible on adjacent lines: `:80` treats *no tools configured* as deny-all, while `:79` treats *role not found* as allow-all. The same function has no `try`/`catch` and no deny-list fallback.

**Impact.** A role id that does not resolve is an authorization bypass, not a degradation. Any caller whose role lookup fails gets every tool every registered plugin exposes, including tools that plugin declares `permissions` (`src/plugins/types.ts:110`) which this gate never reads. Route access control being load-bearing makes the tool path the remaining unguarded surface.

**Fix direction.** Fail closed on an unresolvable role: `registry.getAgentRole(agentRole)` returning undefined should return `[]` (or a logged deny-all), matching the `:80` convention already in the function. Decide explicitly and document the `!agentRole` branch at `:76` too — that one is a different question (unauthenticated vs. no-role-assigned) and should be justified rather than inherited, since it currently returns everything as well. Log the deny so a misconfigured role is diagnosable instead of silent.

**Verification.** A unit test asserting that an unknown role id yields no tools, and that the `:76` branch behaves as documented.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
