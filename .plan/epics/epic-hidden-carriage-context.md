# EPIC: Hidden Carriage — Chat-Includeable Structured Memory Context

**Status:** Proposed
**Area:** Chat config + system-template injection + structured-output utils

## Scope

- Hidden (dev/debug-visible via `?`) carriage block: LLM-estimated
  additional memory context injected alongside the existing
  context/memory injection system. Per-chat config toggle + system
  template message injection instruction.
- Canonical shape is a flat TOML document (episode counters, title,
  setting, string lists). Character state MUST be `[[characters]]`
  array-of-tables (name + status fields), never bare strings — the flat
  `characters = [...]` form caused the LLM to append stray per-character
  records elsewhere.
- Companion utils (new `src/utils/structured-output.ts` or equivalent,
  one format module each for `json`/`toml`/`yaml`): deterministic healing
  (salvage parseable prefix), revalidation against a declared schema,
  byte/size cap check, final approve-or-cancel gate before injection.
  No silent truncation; oversize or invalid carriage cancels the
  injection and surfaces a dev-visible warning.

## Example carriage (normative shape, `[[characters]]` form)

```toml
episode = 4
title = "The Sleeper's Warning"
setting = "Ruin on largest island, Archipelago of Whispers"

[[characters]]
name = "K"
status = "Inside the ruin, fate unknown"

[[characters]]
name = "G"
status = "With party, outside"

[[characters]]
name = "First Elder"
status = "Voice only"

artifacts = ["The Key (inserted into ruin)"]
locations_discovered = ["Interior of the ruin (K has entered)"]
elders_awakened = 1
primal_aura_intensity = 10
companions = ["G"]
next_episode = 5
```

## Tickets

- `TASK-hidden-carriage-toml-context.md`
- `TASK-structured-llm-output-healing-utils.md`

## Acceptance

- Carriage round-trips through heal → validate → size-check → approve;
  invalid/oversize input cancels with a visible dev warning, never
  injects partial state.
