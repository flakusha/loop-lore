<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shared macro engine for templates and commands

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Scope:** THEME 3 scripting-lite: shared macro engine, named args, per-command valves, pipe operator, smart-regen decision gate
**Priority:** medium
**Effort:** Medium
**Epic:** epic-workflow-engine

## Summary

One {{macro}} resolver (char, user, chat, last, pipe) used by both the prompt library templates and slash commands, mirroring STscript macros. Unifies TASK-prompt-library variables with command input.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated (deferred: docs/spec walkthrough of the macro syntax)

## Implementation note (scripting-lite lane, 2026-11-12)

Engine: `src/assistant/macro/engine.ts` — pure, no IO. `expandMacros(input, registry, options)` with `MacroRegistry = Record<string, MacroValue>` (static string or lazy resolver, invoked only when referenced).

Design decisions:
- Token syntax stays `{{name}}` (innermost match, `[^{}]*`), matching the existing `DOUBLE_BRACE` convention in `src/regex/placeholders.ts`; names are trimmed, case-sensitive.
- Unknown macros stay literal — same contract as `resolveTemplate`'s "leaves unknown tokens unchanged" test.
- Two modes: `"literal"` (default; values never re-scanned — injection-safe for pipes/commands) and `"expand-values"` (bounded re-scan, max 4 passes, for prompt-template values that reference other macros).
- Escaping: one backslash before the token (`\{{name}}`) yields the literal text; even backslash runs stay literal and expand.
- `$`-pattern safe: output built by concatenation, never `String.replace` string replacement.
- Command-path registry: `src/assistant/macro/command-macros.ts` — `char`, `user`, `chat`, `last`, `pipe`, built lazily from `CommandContext` + the running pipe value.
- Nested macros resolve innermost-only in one scan (`{{a{{b}}}}` → expands `{{b}}`).

Options (wave-3): `expandMacros(input, registry, options)` now takes an options object — `{ mode, trimNames, escapes }` (defaults keep the command-path semantics: literal mode, name trimming, backslash escaping), plus the exported `LEGACY_TEMPLATE_MACRO_OPTIONS` preset (`expand-values`, exact names, no escapes) that reproduces the pre-engine template behavior.

## Legacy resolver rewiring (wave-3, 2026-11-12)

The two pre-existing template resolvers now delegate to the engine (previously deferred here):

- `src/generation/prompt-templates/templates.ts` `resolveTemplate` (image prompts) — fixed tokens + `ctx.extra` become the macro registry; the hand-rolled `replaceAll` sweep and the `TOKENS` constant are gone.
- `src/assistant/prompt/template-render.ts` `substituteVars` (LLM template static sections) — scalars + builtin aliases/names become the registry; the two hand-rolled `replaceAll` loops are gone.

Behavior deltas (all deliberate, all covered by tests — the pre-existing suites run unchanged and green):
- Dollar-pattern corruption fixed: the old `substituteVars` scalar loop used STRING replacement, so a scalar value containing `$&`/`$'`/`$$` corrupted the output; the engine builds output by concatenation, so values now insert verbatim.
- Nested expansion is order-independent: the legacy sweep expanded a value's tokens only when the referenced key came LATER in its fixed iteration order; `expand-values` mode expands any order (bounded at 4 passes vs the sweep's arbitrary forward-depth chains).
- Both resolvers keep exact-token-name matching (`{{ charName }}` stays literal) and expand through a preceding backslash (no escape syntax), via the `LEGACY_TEMPLATE_MACRO_OPTIONS` preset — observable output for existing templates is unchanged.
- `src/regex/placeholders.ts` `DOUBLE_BRACE` remains the shared pattern constant (test-pinned; no production consumer substitutes with it — the engine owns scanning now). `src/generation/modality-templates/shared.ts` `resolveModalityTemplate` (audio/video single sweep, no nesting) is a third resolver deliberately NOT rewired — its freeform-variable registries have no nested semantics to unify and its contract is pinned by its own suites.

Deferred: rewiring the two pre-existing template resolvers (`src/generation/prompt-templates/templates.ts resolveTemplate`, `src/assistant/prompt/template-render.ts substituteVars`) onto this engine — their nested-in-value expansion semantics differ from `"literal"` mode and both already behave correctly; migrating `resolveTemplate` is a small follow-up. No prompt-library surface consumes the engine yet.

