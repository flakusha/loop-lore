<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Plugin tool authorization fails open

**Status:** Done
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

Resolved in `src/generation/generate-route/tool-execution.ts` —
`gatePluginToolsByRole` now returns `[]` and calls `auditUnresolvedRole()`
(getLogger child, `module: "authz"`, best-effort try/catch like
`auditDenial` in `src/plugins/route-access.ts:104`) when
`registry.getAgentRole()` returns undefined.

**The `!agentRole` branch was investigated and deliberately LEFT allow-all.**
Callers: exactly one production call site, `provider-request.ts:56`
(`gatePluginToolsByRole(roleRow?.agent_role ?? null,)`). Reasoning from that
call site rather than the ticket's wording:

- `actors.agent_role` is a per-character plugin persona, not an authz
  principal. It is written by the actor's owner at character create/update
  (`src/routes/characters/create.ts:76`, `update.ts:184`) and injected as a
  system-prompt section by `pluginAgentRoleSection`.
- The caller runs inside `buildProviderRequest`, downstream of
  `checkChatAccess` in `validate.ts:68`. **That bullet was wrong and has
  been refuted.** `checkChatAccess` authorized `chatId` ONLY; `actorId` was
  never checked against chat participation, so a caller authorized for chat A
  could name any actor in the deployment — yielding a missing `actors` row and
  therefore `roleRow === undefined` and `agentRole === null`, i.e. an
  UNAUTHORIZED actor reaching the allow-all branch. The `!agentRole` branch is
  safe only once `actorId` itself is authorized server-side.
- **Now fixed upstream.** `validateGenerateRequest`
  (`src/generation/generate-route/validate.ts`) rejects any `actorId` that is
  not a participant of the very chat being generated — the same shape
  `recordTurnSkip` uses (`src/chat/service/crud/turn-skip.ts:93-102`) —
  returning 404 `"Actor is not a participant of this chat"`. With that in
  place the `actors` lookup in the sole caller can only MISS for a character
  that genuinely has no plugin persona: the benign case. `buildProviderRequest`
  additionally distinguishes a FAILED lookup from an absent row and denies
  (`[]`) on the former, so the only remaining path to `null` is
  `agent_role IS NULL`.
- Every chat flow was verified to carry participant rows for its actors before
  that check landed: `createChat` inserts the owner and every `participantIds`
  entry (`src/chat/service/crud/create.ts:48-65`); branch chats
  (`src/chat/service/split-utils.ts:58-63`) and chat migration
  (`src/chat/service/transitions.ts:120-122` → `carryParticipants`) do the
  same; `chat_participants` has existed since the initial schema
  (`src/db/migrations/001_init.ts:1706`) so no pre-existing chat predates it.
  Solo mode is unaffected — it authenticates as a super-user but still creates
  chats through the same route and service.
- Failing closed there would return no tools for every character that has no
  role assigned — which is the default state (`schema-core.ts:412`,
  nullable, no default). Four shipped plugins register tools
  (`plugins/core/card-battle`, `plugins/core/rps`,
  `plugins/community/trivia`, `plugins/community/nsfw-cards`); the change
  would silently disable their entire tool surface for every unassigned
  character. That is a functional regression, not a security fix.
- This matches the codebase's established convention for the sibling gate:
  a plugin route declaring neither `requiresAuth` nor `permissions` stays
  public (`src/plugins/route-access.ts:14-16`). "Declared nothing" means
  unrestricted; "declared something that does not resolve" means deny.

Both branches are now pinned by tests, so a future flip is a deliberate edit.

**`ToolDefinition.permissions` was deliberately NOT honored here.** It is a
separate concern, not a one-line filter: no shipped plugin declares it
(`grep -rn 'permissions:' plugins/` returns nothing), the gate has no access
to the caller's `userRole` (it receives only an agent-role id, and the RBAC
check needs `hasAll(userRole, perms)` from `src/users/permissions.ts:119`),
so honoring it would require threading the caller's user role through
`buildProviderRequest` — a signature change with its own design questions
(which user? the actor's owner? the requesting user?). Filed as follow-up
work, not smuggled into this fix.

Verification: `src/generation/generate-route.test.ts`, `describe("gatePluginToolsByRole")`, plus `src/generation/generate-route/actor-authorization.test.ts` for the upstream `actorId` authorization the `!agentRole` branch now depends on.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
