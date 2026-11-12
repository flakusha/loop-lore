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

Engine: `src/assistant/macro/engine.ts` — pure, no IO. `expandMacros(input, registry, mode)` with `MacroRegistry = Record<string, MacroValue>` (static string or lazy resolver, invoked only when referenced).

Design decisions:
- Token syntax stays `{{name}}` (innermost match, `[^{}]*`), matching the existing `DOUBLE_BRACE` convention in `src/regex/placeholders.ts`; names are trimmed, case-sensitive.
- Unknown macros stay literal — same contract as `resolveTemplate`'s "leaves unknown tokens unchanged" test.
- Two modes: `"literal"` (default; values never re-scanned — injection-safe for pipes/commands) and `"expand-values"` (bounded re-scan, max 4 passes, for prompt-template values that reference other macros).
- Escaping: one backslash before the token (`\{{name}}`) yields the literal text; even backslash runs stay literal and expand.
- `$`-pattern safe: output built by concatenation, never `String.replace` string replacement.
- Command-path registry: `src/assistant/macro/command-macros.ts` — `char`, `user`, `chat`, `last`, `pipe`, built lazily from `CommandContext` + the running pipe value.
- Nested macros resolve innermost-only in one scan (`{{a{{b}}}}` → expands `{{b}}`).

Deferred: rewiring the two pre-existing template resolvers (`src/generation/prompt-templates/templates.ts resolveTemplate`, `src/assistant/prompt/template-render.ts substituteVars`) onto this engine — their nested-in-value expansion semantics differ from `"literal"` mode and both already behave correctly; migrating `resolveTemplate` is a small follow-up. No prompt-library surface consumes the engine yet.

