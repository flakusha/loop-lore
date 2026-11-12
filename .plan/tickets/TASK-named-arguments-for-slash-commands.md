<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Named arguments for slash commands

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Scope:** THEME 3 scripting-lite: shared macro engine, named args, per-command valves, pipe operator, smart-regen decision gate
**Priority:** medium
**Effort:** Medium
**Epic:** epic-workflow-engine

## Summary

Extend the command parser with --key value named args (SillyTavern namedArgumentList pattern), keeping positional args working. /rewrite --style and /summarize --format become first-class.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated — named-arg syntax and the no-dash rejection rationale documented in docs/spec/assistant-commands.md ("Command Parser" + "Named arguments"). The palette-help-text deferral: the WEB palette does not render argument hints (its description text is the Not-Started i18n ticket TASK-command-palette-descriptions-… scope), so the interactive surface for this landed where a client renders usage — `GET /api/commands` now advertises valve summaries and the TUI completion strip renders the named-arg usage line (src/tui/chat/commands.ts). Wave-4, scripting-lite lane.

## Implementation note (scripting-lite lane, 2026-11-12)

Parser: `src/assistant/command-parser.ts` — `ParsedCommand` gained `named: Record<string, string>` and `positional: string[]`; `args` keeps EVERY token (flags and consumed values included) so legacy handlers that scan the raw list (`/rewrite`'s old `parseStyle`, audit hashing) keep working unchanged.

Syntax: `--key value`, `--key=value`, `--key "quoted value"` (quotes group words, stripped), `--flag` → `""`. Keys are lowercased.

Design decisions:
- Named keys REQUIRE the `--` prefix: a non-flag token containing `=` stays positional, so dice notation (`4d6-2`) and `/whatif` free text (`1+1=2`) can never parse as arguments. The brief's `name="quoted value"` no-dash form was deliberately dropped for this reason.
- A bare `--key` consumes the next token as its value unless that token starts another `--` flag.
- Tokenizer is quote-aware (double/single, mid-word quotes like `--style="a b"`), unterminated quote consumes the rest.
- Dispatch attaches `ctx.namedArgs` (valve-resolved when the command declares valves) and `ctx.positionalArgs` to the `CommandContext` per stage.

