<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: By-Role, By-Capability Assistant Capability Disclosure

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Type:** Feature Task
**Tags:** assistant, capability-disclosure, role-aware, introspection, by-role
**Epic:** epic-assistant-gm-flows.md

## Summary

Add a `getAssistantCapabilities(ctx)` API that returns, for the calling user+chat, exactly which tools the assistant can invoke, why each tool is or isn't available, and the role/capability ceiling. Powers the assistant's own self-disclosure response ("I have these capabilities in this chat: ...") and surfaces as a `/capabilities` slash command + admin/moderator tooling UI.

## Why this task exists (the gap)

The user explicitly asked: "by-role, by-capability assistant responses ('i have following capabilities - estimated from access permissions, server setup for assistant allowed tooling')". Today `src/assistant/commands/registry.ts:listCommands()` returns command names only; there is no:

- Per-user / per-chat capability lookup
- Reason ("denied: role=observer required=owner", "review: aux-llm judge pending", "sandbox limit exceeded")
- Role ceiling ("you are observer; owner can additionally delete assets")
- Server-side capability ceiling ("embedding model not configured; extraction tools disabled")

## Design

### API

```ts
// src/assistant/capabilities-disclosure.ts
export interface AssistantCapabilityView {
  tool: string;
  status: "available" | "review" | "denied" | "unconfigured";
  /** Why this status (human-readable; safe to display). */
  reason: string;
  /** Tags that drove the decision. */
  tags: CapabilityTag[];
  /** Required role to invoke; null = open to any participant. */
  requiredRole?: ChatParticipantRole;
  /** Per-tool resource limits when invoked. */
  limits: { timeoutMs: number; memoryMb: number };
}

export interface AssistantCapabilitiesReport {
  chatId: string;
  userId: string;
  userRole: ChatParticipantRole;
  /** Aggregate ceiling; tools at or below this are available. */
  ceiling: { canRead: string[]; canWrite: string[]; canDelete: string[] };
  tools: AssistantCapabilityView[];
  /** Capabilities denied globally (server-level, not role-level). */
  globalDenials: { tag: CapabilityTag; reason: string }[];
}

export async function getAssistantCapabilities(
  ctx: CommandContext,
  config: Config,
  db: Kysely<DB>,
): Promise<AssistantCapabilitiesReport>;
```

### Slash command + chat response

- `/capabilities` (member+ role) — returns a formatted markdown list grouped by status (`available`, `review`, `denied`, `unconfigured`) with reasons. Streams as a system message.
- `!capabilities` natural-language trigger ("what can you do?", "what are your capabilities here?") — routes to the same handler via `intent.ts` classifier.
- Assistant prompt-injected snippet: when a chat is opened, inject `getAssistantCapabilities()` into the system prompt under `<assistant_capabilities>` so the LLM knows its own scope and refuses outside its ceiling.

### Admin/moderator UI

- Admin page: `/admin/assistant/capabilities` — lists all 36 commands with current capability tags, allows editing tags + per-tool limits, shows audit-log roll-up.
- Moderator page: `/moderator/assistant/capabilities` — read-only view; surfaces recent denials + sandbox metric averages.
- Both reuse `src/frontend/alpine/` patterns; HTMX partials for the tool table.

## Files

- `src/assistant/capabilities-disclosure.ts` — `getAssistantCapabilities`, `AssistantCapabilitiesReport`
- `src/assistant/commands/capabilities.ts` — `/capabilities` command handler
- `src/assistant/intent.ts` — extend with `capabilities` intent class
- `src/assistant/prompt/sections/assistant-capabilities.ts` — new prompt section
- `src/assistant/prompt/registry.ts` — register new section
- `src/routes/admin/assistant-capabilities.ts` — admin endpoints (GET/PATCH tool capabilities)
- `src/routes/moderator/assistant-capabilities.ts` — moderator endpoints (GET roll-up)
- `src/frontend/pages/admin-assistant-capabilities.ts` — admin page
- `src/frontend/pages/moderator-assistant-capabilities.ts` — moderator page
- `src/validation/schemas.ts` — `AssistantCapabilitiesReport` schema (TypeBox)
- Tests: `capabilities-disclosure.test.ts`, `commands/capabilities.test.ts`

## Acceptance Criteria

- [ ] `getAssistantCapabilities` returns deterministic, role-aware report for every registered tool
- [ ] Report explains "denied" vs "review" vs "unconfigured" with concrete reason strings
- [ ] `/capabilities` slash command renders the report as a system message
- [ ] `!what can you do?` natural-language intent routes to the same handler
- [ ] System prompt is injected with `<assistant_capabilities>` section; LLM refuses outside ceiling
- [ ] Admin UI allows editing per-tool capability tags + limits
- [ ] Moderator UI surfaces recent denials + sandbox metrics (read-only)
- [ ] All existing prompt section tests still pass

## Dependencies

- Builds on: `TASK-assistant-tool-injection-guard.md` (capability matrix + tags)
- Builds on: `src/assistant/commands/registry.ts:listCommands`
- Bridges: `TASK-admin-assistant-tooling-allowlist.md` (admin tooling UI extends this)
