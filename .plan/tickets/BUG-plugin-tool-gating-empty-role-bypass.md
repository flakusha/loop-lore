<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gatePluginToolsByRole exposes ALL tools when role declares an empty allowlist (privilege escalation vs unassigned)

**Status:** Not Started
**Severity:** high
**Priority:** high
**Effort:** small
**Type:** BUG
**Epic:** epic-plugin-system, epic-plugin-extension-points
**Files:** src/generation/generate-route/tool-execution.ts:29-40; src/generation/generate-route/handler.ts:166-183; src/plugins/registry.ts:113-115

## Issue

`gatePluginToolsByRole` documents three paths:

1. `agentRole === null` → return `pluginTools` (all).
2. role not registered → return `pluginTools` (all).
3. role registered with `tools.length === 0` → return `pluginTools` (all) — `if (!role?.tools?.length) return pluginTools`.

Path 3 is counter-intuitive: an actor explicitly assigned to a "restricted" role whose tools list is empty gets **more tool surface than an actor with no role at all**. Plugin authors will write roles with empty `tools` arrays to mean "this role shouldn't call tools", and the system will grant tool access anyway.

Additionally, `handler.ts:172` swallows actor-lookup errors via bare `try { ... } catch {}` and falls back to `roleRow?.agent_role ?? null` (null → all tools). A transient DB blip on the actor lookup silently un-restricts every role — fail-OPEN instead of fail-closed.

## Why it matters

Security. The plugin/role system is the privilege boundary for LLM-driven tool execution. Empty-allowlist bypass means a careful admin who configures a `readonly` role and forgets to enumerate allowed tools (a reasonable starting point for a new role) actually gives the actor the full tool surface. DB-error fallback opens the same hole during outages.

## Evidence

- `src/generation/generate-route/tool-execution.ts:29-40`:

  ```
  if (!agentRole) { return pluginTools; }
  const role = registry.getAgentRole(agentRole,);
  if (!role?.tools?.length) { return pluginTools; }
  ```

- `src/generation/generate-route/handler.ts:166-183` — actor lookup wrapped in bare `try { ... } catch { roleRow = null; }` returning `roleRow?.agent_role ?? null` (null path → all tools).
- `src/generation/generate-route/tool-execution.test.ts:60` — existing test only covers "all tools when agentRole is null".

## Concrete fix

1. Invert the empty-check: if `role` exists and `role.tools.length === 0`, return `[]`. Only fall back to all tools when `role === null | undefined` (i.e. role is **unconfigured**).
2. Distinguish the "no role set" path from the "role set with empty allowlist" path explicitly in the docstring.
3. In `handler.ts`: on actor-lookup error, log a warning (`log.warn("agent_role lookup failed; failing closed", err)`) and treat as if the actor had `agent_role = null` (i.e. fail closed to `[]` until admin sets it).
4. Add tests:
   - role registered with `tools: []` → `gatePluginToolsByRole` returns `[]`.
   - actor lookup throws → handler logs warning, returns no tools.
   - role not registered → still all tools (documented default).
   - `agentRole = ""` (empty string) → treat as null/unconfigured → all tools.

## Tests

- `bun test src/generation/generate-route/tool-execution.test.ts` — add the four cases.
- `bun test src/generation/generate-route/handler.test.ts` — add a "DB throws on actor lookup → no tools" test.

## Related

- `TASK-tool-call-user-text-sanitization`, `BUG-tool-call-arg-parse-silent-fallback` — same tool-execution hardening slice.
- `epic-plugin-system.md`, `epic-plugin-extension-points.md`.
