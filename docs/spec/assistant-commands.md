<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Assistant Commands Specification

## Command Parser

Location: src/assistant/command-parser.ts

```typescript
export interface ParsedCommand {
  command: string;
  args: string[];
  raw: string;
}

export function parseCommand(input: string,): ParsedCommand | null;
```

## Built-in Commands

### Text Improvement

/improve [text]

- Reviews, checks, parses, fixes, improves current text
- LLM returns improved version with suggestions

### Dice Rolling

/dice `<notation>`

- /dice 2d6+3 -> rolls 2d6, adds 3
- Returns result with individual rolls

### Stats Display

/stats [actor_id]

- Shows character sheet
- Includes derived stats, equipment

### Image Generation

/image <prompt> [--style <style>]

- Triggers image generation
- Styles: anime, photorealistic, sketch, etc.

### Quest Management

/quest create <name> - create quest
/quest update <quest_id> <progress> - update progress
/quest list - list active quests

### Combat

/attack <target> [weapon] - attack action
/damage <amount> <target> - apply damage
/heal <amount> <target> - heal target

### Entity Modification & Addition

```
/apply <world|location|item|character> <id> <key=value>...
/modify <world|location|item|character> <id> <request...>
/add <location|item> <name> [world] [key=value]...
/clone <location|item> <source-id> [key=value]...
/import character <asset-id|file>
```

- `/apply` applies a direct field-level patch (no LLM)
- `/modify` asks the model for updated fields, then runs the quality gates
  (schema validation is a hard reject, duplicate and consistency are warnings)
- `/add` creates a new location/item in an existing world
- `/clone` copies an entity and applies `key=value` overrides to the copy
- `/import` imports a character card (PNG/YAML/TOML/JSON/CHARX) from an asset

All five are preview-only: the request is parsed and checked, and the user
confirms the preview before the real HTTP route is called. The ownership
checks are the routes' own guards (`requireWorldOwner`, `checkWorldOwnership`,
`checkActorOwnership`) - there is no separate access layer.

Source: `src/assistant/commands/{apply,modify,import,clone}.ts`,
`entity-patch.ts` (patch grammar), `entity-patch-spec.ts` (per-kind fields).

## Command Access Tiers

Commands have access tiers based on world rules:

| Command  | Default Tier | GM Override         |
| -------- | ------------ | ------------------- |
| /improve | all          | whitelist/blacklist |
| /dice    | all          | whitelist/blacklist |
| /stats   | all          | whitelist/blacklist |
| /attack  | member       | whitelist/blacklist |
| /damage  | gm           | whitelist/blacklist |
| /heal    | gm           | whitelist/blacklist |
| /quest   | gm           | whitelist/blacklist |
| /image   | member       | configurable cost   |

## Command Registration

Location: src/assistant/commands/registry.ts

```typescript
export type CommandHandler = (args: string[], ctx: CommandContext,) => CommandResult | Promise<CommandResult>;

registerCommand(name, handler, options?: CommandOptions,);
```

`CommandOptions`:

- `requiredRole` — minimum participant role (`observer` < `member` < `owner`);
  omitted means any participant who can message may run the command.
- `available` — `false` hides a stub command from `GET /api/commands` and the
  palette while keeping it callable by direct input.
- `capabilities` — the capability tags the guard checks (see below).
- `limits` — per-command resource ceilings; defaults to `DEFAULT_LIMITS`.
- `allowedNetworkHosts` — hosts the command may reach over the network. The
  guard's effective network allowlist for one call is the union of this
  declaration and the instance's configured provider hosts; an empty union
  reaches no host at all.

`CommandContext` carries `chatId`, `roleInChat`, `userId`, `userRole`, `db`,
`config`, `activeChat`, `currentCharacter` and `messages`. `CommandResult`
carries `systemMessage`, `action`, `actionPayload` and `handled`.

## Capability Declaration and the Tool Guard

Location: src/assistant/capabilities.ts, src/assistant/guard/

Every command declares the capabilities it needs. The declaration IS the
security contract — a command that declares none is denied. "Every command
declares its capabilities" is enforced by
src/assistant/commands/capability-coverage.test.ts, which walks the command
modules and the live registry (stubs included, since a stub stays callable by
direct slash input).

```typescript
registerCommand("world-delete", handler, {
  requiredRole: "member",
  capabilities: ["delete-world", "irreversible", "destructive"],
});
```

Tag policy (`CAPABILITY_POLICY` in src/assistant/capabilities.ts):

| Tags | Policy | Lifted by |
|------|--------|-----------|
| `read-*` | allow | — |
| `write-*`, `delete-*`, `network`, `cross-user`, `irreversible` | review | the Layer 2 judge (natural-language path) |
| `admin-only` | deny | a site administrator |
| `moderator-only` | deny | an elevated site role or the chat owner |
| `destructive` | deny | a site administrator or the chat owner |

A deny-tier tag is not an absolute ban: the Layer 1 matrix LIFTS it for a
privileged caller — `admin-only` for a site administrator, `moderator-only`
for an elevated site role or the chat owner, `destructive` for a site
administrator or the chat owner. Without that privilege the call is denied.

`capabilities` is an axis of its own: `requiredRole` answers "may this
participant run the command", the capabilities answer "what does the command
do".

Every tool call — slash input and natural-language GM tool requests alike —
runs through `runGuardedToolCall`:

1. `matrix.ts` — deterministic capability check (allow / review / deny),
   no LLM. It fails closed: a command that declares no capabilities is
   denied. The deny-tier tags are LIFTED for a privileged caller -
   `admin-only` needs a site administrator, `moderator-only` an elevated site
   role or the chat owner, `destructive` a site administrator or the chat
   owner.
2. `judge.ts` — the auxiliary-LLM judge reviews review-tier calls on the
   natural-language path. It fails closed: no answer, an unparsable answer,
   or a confidence below 0.7 denies the call.
3. `sandbox.ts` — the handler runs under a per-call scope that carries the
   call's allowlists. The sandbox is IN-PROCESS, scoped by
   `AsyncLocalStorage` — it is NOT a Bun Worker: a `Kysely<DB>` handle cannot
   cross a worker boundary (it clones into an empty object and loses its
   session), and Bun exposes no `ResourceLimits` equivalent, so neither the DB
   handle nor a memory ceiling could live inside a worker. `timeoutMs` IS
   enforced (the call is aborted and rejected on expiry); `memoryMb` is
   DECLARED ONLY and cannot be enforced in-process - the upgrade path is a
   worker-side DB RPC layer, if per-call memory isolation ever matters.
   The effective network allowlist for one call is the union of the
   instance's configured provider hosts and the command's own declared
   `allowedNetworkHosts`. The filesystem scope is split into a READ scope (the
   asset upload directory) and a WRITE scope (the upload directory plus the
   JSONL log directory). BOTH the network and the filesystem allowlist fail
   closed: an empty allowlist denies everything. A refusal is reported as
   `403 Forbidden in sandbox`.
4. `audit.ts` — every call is recorded in `tool_call_audit` (best-effort: a
   failed insert is logged, never thrown). The row carries the verdict, the
   rationale, the capability tags, the command's required role and the call
   duration.

The sandbox polices the filesystem by patching the CJS module objects that
`require("node:fs")` and `require("node:fs/promises")` return, so it reaches
a consumer that uses the default-import form (`import fs from "node:fs"`).
A static named import (`import { readFileSync } from "node:fs"`) binds the
function at ESM link time and can never be intercepted — such a module sits
outside the file allowlist with no error and no log line. Production modules a
command handler can reach must use the default-import form;
`src/assistant/guard/fs-import-ratchet.test.ts` fails the build when one adds
a named import.

## UI Integration

- Slash triggers autocomplete dropdown
- Arrow keys navigate suggestions
- Enter executes command
- Shift+Enter for multi-line commands
