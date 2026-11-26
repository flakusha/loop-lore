<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Assistant Commands Specification

## Command Parser

Location: src/assistant/command-parser.ts

```typescript
export interface ParsedCommand {
  command: string;
  /** Every token: flags and their consumed values included (legacy handlers scan this). */
  args: string[];
  /** Flags and their consumed values removed. */
  positional: string[];
  /** Parsed named arguments, keys lowercased. */
  named: Record<string, string>;
  raw: string;
}

export function parseCommand(input: string,): ParsedCommand | null;
```

The tokenizer is quote-aware (double/single quotes, mid-word quotes like
`--style="a b"`); an unterminated quote consumes the rest of the input.

### Named arguments

`ParsedCommand.named`/`.positional` are exposed to handlers as
`ctx.namedArgs`/`ctx.positionalArgs` per pipe stage.

- `--key value` — a bare `--key` consumes the next token as its value,
  unless that token starts another `--` flag; `--flag` alone yields `""`.
- `--key=value` — inline form.
- `--key "quoted value"` — quotes group words and are stripped.
- Keys are lowercased; the `--` prefix is REQUIRED.

The no-dash form (`name="quoted value"`) is deliberately NOT accepted: a
non-flag token containing `=` stays positional, so dice notation (`4d6-2`)
and free-text arguments (`/whatif 1+1=2`) can never parse as arguments.

`args` keeps EVERY token (flags and consumed values included) so legacy
handlers that scan the raw list keep working unchanged.

## Macro engine

Location: src/assistant/macro/engine.ts — one `{{macro}}` resolver shared by
prompt templates and slash commands. Pure: no IO, no globals.

```typescript
expandMacros(input, registry, options,);
// MacroRegistry = Record<string, string | (() => string)> — lazy resolvers
// run only when referenced.
```

- Token syntax `{{name}}`, innermost match first (`{{a{{b}}}}` expands
  `{{b}}`); names are trimmed and case-sensitive on the command path.
- Unknown macro names stay literal — same contract as the template
  resolvers' "leaves unknown tokens unchanged".
- Modes: `"literal"` (default) inserts values verbatim and NEVER re-scans
  them — author-controlled pipe values cannot inject macros.
  `"expand-values"` re-scans results with a bounded number of passes, for
  prompt-template values that reference other macros.
- Escaping: one backslash before the token (`\{{name}}`) yields the literal
  text; even backslash runs stay literal and expand.
- Output is built by concatenation, never string replacement, so `$`-pattern
  characters in values insert verbatim.
- Options: `{ mode, trimNames, escapes }`; the `LEGACY_TEMPLATE_MACRO_OPTIONS`
  preset (expand-values, exact names, no escapes) reproduces the pre-engine
  template behavior for `resolveTemplate` and `substituteVars`, which now
  delegate to the engine.
- Command-path registry: src/assistant/macro/command-macros.ts builds `char`,
  `user`, `chat`, `last` and `pipe` lazily from the `CommandContext` plus the
  running pipe value.


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
- `valves` — a TypeBox object schema (authored with Elysia `t`) the
  dispatcher resolves the parsed named arguments against; see
  [Per-command valves](#per-command-valves) below.

## Per-command valves

Location: src/assistant/commands/valves.ts (resolution),
src/routes/messages/command-run.ts (dispatch wiring)

A command that declares `valves` gets its named arguments validated and
completed before the handler runs — the Open WebUI Valves pattern. The
schema's keys are the `--key` names (without dashes).

Resolution order, run by the dispatcher BEFORE the capability guard (a
rejected call never reaches the handler):

1. Unknown-key rejection — a named argument the schema does not declare is
   rejected with a structured message listing the expected arguments.
2. `Value.Convert` — numeric/boolean strings coerce (`--count 5` → `5`).
3. `Value.Default` — schema defaults fill in, so handlers read complete
   values from `ctx.namedArgs` without fallback chains.
4. `Value.Check` — type violations are rejected with per-field messages.

### Authoring guide

```typescript
registerCommand("summarize", handler, {
  capabilities: ["read-chat", "network"],
  valves: t.Object({
    format: t.Optional(t.Union([
      t.Literal("concise"), t.Literal("tldr"),
      t.Literal("bullets"), t.Literal("detailed"),
    ], { default: "concise" }),),
    count: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  }),
});
```

- Author defaults INSIDE the inner schema
  (`t.Optional(t.Union([...], { default: "x" }))`), not on the
  `t.Optional(...)` wrapper — outer-style options do not surface the
  default to the resolver or the advertised summaries.
- Literal unions render as `a|b|c` in rejection messages and become the
  advertised `enum` vocabulary.
- A command WITHOUT valves still receives raw `ctx.namedArgs`; the valve
  contract (unknown-key rejection, defaults) applies only where declared.
- Migrated commands: `/rewrite` (style, apply), `/summarize` + `/sum`
  (format, count), `/translate` + `/tl` (lang, to). Their legacy raw-args
  FLAG forms are ignored by the migrated handlers — flags must arrive via
  `ctx.namedArgs` (as the dispatcher populates it, or as a direct-call test
  supplies); plain positional text still works through `args`.

### Advertisement

`GET /api/commands` carries a `valves` summary per command that declares
one — each argument reduced to display fields (`name`, `type`, `default`,
`enum` vocabulary) derived by `valveSpecs`. Consumers (command palette, TUI
hint strip) render usage hints from it; the response never exposes raw
TypeBox internals.

## Pipe operator

Location: src/assistant/commands/pipe.ts (split + emit contract),
src/routes/messages/command-pipe.ts (chain orchestration)

`/cmd1 | /cmd2 | /cmd3` runs a chain where each stage's emitted text feeds
the next stage's `{{pipe}}` macro (the SillyTavern piping pattern).

- The chain splits on top-level `|` (quote-aware) BEFORE macro expansion,
  so a macro value can never open a new stage.
- Chains are capped at `MAX_PIPE_STAGES` stages, and every segment must be
  a registered command — validation happens BEFORE any stage runs, so a
  bad chain is a structured `**Pipe failed:**` error with no side effects.
- Emit contract: a stage's `result.pipe` (`{ kind: "text"; text }` or
  `{ kind: "none" }`) wins; otherwise the system message pipes through
  (empty when none).
- Per stage: role gate → valves → capability guard → handler → audit. One
  combined system message is inserted per chain; audit events stay per
  stage.
- A runtime failure, denial or unhandled stage ABORTS the chain — later
  stages never run — and the abort message joins the combined system
  message.
- Cycle safety: a chain is a linear list resolved once; handlers cannot
  invoke commands; macro values are never re-scanned (literal mode), so a
  pipe value cannot smuggle a new split or a nested `{{pipe}}`.
- Closures and loops are out of scope — the workflow-runner owns multi-step
  server-side composition.

## Smart-regen decision gate

Location: src/assistant/commands/regen-gate.ts (pure decision),
src/assistant/commands/regen.ts (`/regen` call site)

`/regen <action>` regenerates the last assistant message. Explicit,
recognized actions — `try-again`, `add-details`, `more-concise` — always
dispatch directly. For an unqualified `/regen`, the decision gate chooses:

- Gate OFF (the default, `assistant.smartRegenGate: false`): everything
  lands on the usage menu listing the available actions — the legacy
  behavior, unchanged.
- Gate ON: a message-size heuristic picks the route — a long target
  regenerates in a condensing style, a short one in an expanding style, a
  mid-sized one re-rolls plainly. A typed-but-unknown action id still lands
  on the menu so the typo stays visible.

The gate is a pure, typed decision step; it does not fire automatically
mid-pipeline — it only shapes what an explicit `/regen` invocation does.

The AUX GM-tool detection call is fronted by a keyword pre-gate controlled by
`assistant.gmToolKeywordGate` (default `true`, config-file only). The gate
suppresses only that AUX detection call when the message cannot name a GM
tool; on gate error it fails open (the AUX call proceeds). The slash-command
GM-tool path is never suppressed.


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
