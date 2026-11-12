<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Per-command Valves-like options schema

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Scope:** THEME 3 scripting-lite: shared macro engine, named args, per-command valves, pipe operator, smart-regen decision gate
**Priority:** high
**Effort:** Medium
**Epic:** epic-output-control-transforms

## Summary

Add a per-command options schema (Open WebUI Valves pattern): defaults like summarize count/format, rewrite style, translate lang, editable in chat settings and passed into runX deps. Small, no parser change.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated — valves authoring guide (resolution order, inner-style defaults, rejection contract, migrated-command list) in docs/spec/assistant-commands.md "Per-command valves". The `GET /api/commands` advertisement deferral is RESOLVED in wave-4: descriptors now carry a per-command `valves` summary (name/type/default/enum, derived by `valveSpecs` — no raw TypeBox internals), with route tests and a TUI hint-strip consumer.

## Implementation note (scripting-lite lane, 2026-11-12)

Infra: `src/assistant/commands/valves.ts` — `resolveCommandValves({ command, schema, named })` → `{ ok: true, values } | { ok: false, message }`. Unknown keys are rejected with a structured message that lists the expected args (from schema properties, with literal unions rendered `a|b` and defaults); values go through TypeBox `Value.Convert` (string→number/boolean) and `Value.Default` (defaults filled) before `Value.Check`.

Wiring:
- `CommandOptions.valves?: TObject` (TypeBox via `@sinclair/typebox`; commands author schemas with Elysia `t`), exposed through `getCommandValves`.
- `runCommandStage` (`src/routes/messages/command-run.ts`) resolves valves BEFORE the capability guard runs the handler — the handler never sees rejected args — and attaches resolved values (defaults included) to `ctx.namedArgs`.

Migrated commands: `/rewrite` (style, apply), `/summarize` + `/sum` (format union, count), `/translate` + `/tl` (lang/to). Their legacy in-handler `--flag` scanning was replaced by `ctx.namedArgs`/`ctx.positionalArgs` reads. Direct-call contract after the migration: plain-TEXT arguments still work through the `args` fallback (`runTranslate(["hola to es"], ctx, deps,)`), but legacy FLAG forms in the raw args list (`["--style", "dark"]`) are IGNORED by the migrated handlers — flags must arrive via `ctx.namedArgs` (as the dispatcher populates, or as a direct-call test supplies).

Deferred: chat-settings editing UI for valve values (the Open WebUI panel surface) and rolling schemas out to the remaining ~80 commands stay open; surfacing valve usage in `GET /api/commands` descriptors landed in wave-4 (typed `valves` summary per descriptor, consumed by the TUI completion strip; the WEB command palette does not render argument hints — its description text belongs to the i18n ticket TASK-command-palette-descriptions-…).

Knip note: the `pipeText`/`pipeNone` helpers in `src/assistant/commands/pipe.ts` are part of the emit-contract API but currently have no production callers (tests only) — the `dead - code` finalize gate may flag them; remove or wire a handler if it does.

