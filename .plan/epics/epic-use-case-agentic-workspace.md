<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Use Case: Agentic Workspace

**Effort:** Medium
**Type:** epic
**Tags:** agent, tooling, docs
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Implementation epic for Use Case: Agentic Workspace. See `docs/spec/use-case-agentic-workspace.md` for specification.

## Scope

Repo-aware code-dev copilot (chat + agent-loop) built on the assistant substrate. Product surface: repo-aware `/fix` command with scoped file context (smallest shippable slice), inline-complete vs chat vs agent-loop surfaces in `src/frontend`/`src/tui`, repo-map/file-ranking plugged into prompt-budget/compactor paths, minimal safe tool set pre-sandbox drawn from the existing tool registry. Assumes giwt guarantees (worktree isolation, signed finalize); raw shell + network stay forbidden until A2 sandbox lands. Copilot-UX research only — sandbox infra already covered elsewhere.

## Related Epics

- `docs/spec/use-case-agentic-workspace.md`
- `epic-harness-integration.md` — harness + routing substrate the copilot drives
- `epic-recursive-self-improvement.md` — agent-dev-loop / RSI payoff
- `epic-provider-plugin-ecosystem.md` — provider surface for copilot backends
- `epic-external-tooling-build.md` — external tooling the copilot shells out to

## Tickets

_TBD — create implementation tickets. First slice: repo-aware `/fix` with scoped file context + acceptance test._
