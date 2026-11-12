<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Pipe operator chaining slash commands

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Scope:** THEME 3 scripting-lite: shared macro engine, named args, per-command valves, pipe operator, smart-regen decision gate
**Priority:** medium
**Effort:** Medium
**Epic:** epic-workflow-engine

## Summary

Add the | operator passing one command output as the next command input via {{pipe}} (SillyTavern piping pattern). Closures and loops explicitly out of scope; workflow-runner owns multi-step server-side.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated — user-facing pipe syntax doc written as docs/spec/assistant-commands.md "Pipe operator" (chain syntax, split-before-expansion, MAX_PIPE_STAGES cap, emit contract, pre-run validation, abort behavior, cycle-safety argument, workflow-runner boundary). Wave-4, scripting-lite lane.

## Implementation note (scripting-lite lane, 2026-11-12)

Module: `src/assistant/commands/pipe.ts` — `splitPipeChain` (quote-aware top-level `|` split, runs BEFORE macro expansion so a macro value can never open a new stage), `MAX_PIPE_STAGES = 8`, and the typed emit contract.

Pipe contract: `CommandResult.pipe?: PipeEmit` — `{ kind: "text"; text } | { kind: "none" }`. `pipeTextOf(result)`: explicit emit wins, otherwise the systemMessage pipes through (empty when none). A stage's emit becomes the next stage's `{{pipe}}` macro value.

Orchestration: `src/routes/messages/command-pipe.ts` (stages validated BEFORE any run — all segments must be registered commands, ≤ 8 stages, else a structured `**Pipe failed:** ...` error with no side effects), `command-run.ts` (shared per-stage role gate → valves → capability guard → handler → audit), `command.ts` (entry: single path or chain). A runtime failure/denial/unhandled stage aborts the chain — later stages never run — and the abort message joins the combined system message. One combined system message is inserted per chain; audit events stay per stage (observability caveat).

Cycle safety: a chain is linear and resolved once; handlers cannot invoke commands; macro values are never re-scanned (`expandMacros` literal mode), so a pipe value cannot smuggle a new `|` split or nested `{{pipe}}` — the depth cap is the only guard needed.

Deferred: workflow-runner multi-step composition remains the server-side path for loops/closures (explicitly out of scope here); no frontend affordance for chains yet.

