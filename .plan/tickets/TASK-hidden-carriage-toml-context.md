# TASK: Hidden carriage TOML context block (chat config + injection)

**Epic:** epic-hidden-carriage-context.md
**Status:** Open
**Priority:** High

## Scope

- Per-chat config flag enabling the hidden carriage + system template
  message carrying the injection instruction; carriage hidden in normal
  UI, visible in dev/debug (`?` affordance).
- `[[characters]]` array-of-tables as canonical character state (name +
  status); flat `characters = [...]` string lists rejected at validation
  with a repair hint (see TASK-structured-llm-output-healing-utils).
- Injection merges with existing context/memory system without
  double-counting budget; oversize/invalid carriage cancels injection.

## Acceptance

- Toggle on → carriage injects; toggle off → byte-identical prompt to
  pre-feature baseline.
- Flat character list fails validation with actionable repair message.
