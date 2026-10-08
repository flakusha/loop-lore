<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Hidden Carriage — Chat-Includeable Structured Memory Context

**Priority:** medium
**Effort:** Medium
**Type:** epic
**Tags:** carriage, context-injection, toml, structured-output, dedup, shadow-notes, gm
**Related:** epic-memory-knowledge-systems.md, epic-memory-profiling-budgets.md, epic-chat-context-optimization.md, epic-context-injection-templates.md, epic-context-injection-correctness.md, epic-gm-shadow-notes.md, epic-assistant-gm-flows.md, epic-quests-encounters.md
**Overview:** Hidden dev/debug-visible carriage block (flat TOML, `[[characters]]` form) injected alongside the existing memory/context pipeline, with shared heal→validate→size-check→approve utils, single-assembly content-hash dedup, and server-side shadow isolation.


**Status:** Not Started
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
- `TASK-context-injection-dedup.md`
- `TASK-shadow-context-isolation.md`
- `TASK-shadow-visibility-debug-assistant.md`

## Isolation & dedup (normative rules)

- Single assembly: carriage, notes, quest progress, and provisioned
  memory dedup by content hash — no fact injected twice.
- Shadow isolation: `{ system, visibility }` on every entry;
  `gm`-class entries never reach player prompts, and no system reads
  another system's shadow scope (quest × shadow, carriage × shadow).
  Enforcement server-side in the assembler, never UI-only.
- Relaxed only for debug sessions and assistant flows: shadow entries
  included explicitly marked read-only, with a write-back guard
  against player-visible stores.

## Acceptance

- Carriage round-trips through heal → validate → size-check → approve;
  invalid/oversize input cancels with a visible dev warning, never
  injects partial state.

## Implementation Status (2026-10-08 — deferred, record only)

- No ticket work exists in `src/`: no structured-output/healing module
  (`src/utils/content-hash.ts` added as the pure hash substrate only —
  `contentHash` + `dedupeByHash`, no callers wired), no per-chat carriage
  toggle, no single-assembly dedup, no `{ system, visibility }` shadow
  isolation in the assembler.
- Existing neighbours (reuse, do not re-implement):
  `src/memory/injection/` (decide/select/privacy/relevance) +
  `src/memory/provision.ts` + `src/memory/budget.ts` (dedup host +
  budget accounting); `src/assistant/prompt-assembler.ts` +
  `src/assistant/prompt/sections/gm-notes.ts` (section pipeline; shadow
  notes already GM-role-gated server-side);
  `src/chat/service/carriage.ts` (`carriage_records` persistence, admin
  read path only — different carriage sense, not the TOML block);
  `src/routes/gm-notes/` (shadow/whitenote CRUD);
  `src/utils/safe-json.ts` (JSON half of the healing contract);
  `js-yaml` (already a runtime dep); TOML has no runtime parser yet
  (`smol-toml` is a transitive dev dep only — add one when the healing
  util lands).
- Full pipeline (toggle + healing utils + assembler wiring + isolation
  enforcement) stays unchecked below; build it only when the tickets
  are staffed.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| epic-memory-knowledge-systems.md | memory tiers, `src/memory/injection/` + `src/memory/provision.ts` | carriage merges into the existing injection path without double-counting |
| epic-memory-profiling-budgets.md | `src/memory/budget.ts` token budget | deduped entries counted once |
| epic-chat-context-optimization.md | prompt assembly + budget policy | toggle-off baseline must stay byte-identical |
| epic-context-injection-templates.md / epic-context-injection-correctness.md | injection template + correctness contract | carriage block shape + validation rules |
| epic-gm-shadow-notes.md | `shadow_notes`/`whitenotes` tables (`src/db/schema-gm.ts`), `src/routes/gm-notes/`, `src/assistant/prompt/sections/gm-notes.ts` | shadow entries owned here; carriage never ingests shadow content |
| epic-assistant-gm-flows.md | assistant `/continue` + debug flows | relaxed read-only shadow visibility with write-back guard |
| epic-quests-encounters.md | quest progress entries | dedup source + shadow-scope negative reads |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| epic-gm-shadow-notes.md | `{ system, visibility }` isolation + dedup substrate (`src/utils/content-hash.ts`) | prompt-level leak guard shared with notes |
| epic-quests-encounters.md | single-assembly dedup | quest facts injected once even when mirrored in carriage |
| epic-assistant-gm-flows.md | approve-or-cancel healing contract | reusable `json`/`toml`/`yaml` healing for quest/note/scene payloads |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Flat TOML carriage (`[[characters]]` array-of-tables; see example above) | memory injection, debug `?` view | canonical hidden context shape |
| `{ source, id, hash }` injectable entry | memory/provision, notes, quests | content-hash dedup key |
| `{ system, visibility: player \| gm \| debug }` injectable entry | assembler, gm-notes, quests | server-side visibility filter |
| Approve-or-cancel healing result (never silent partial) | carriage, quests, notes, scene transitions | structured LLM output gate |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| dedup merge (dropped duplicate + provenance) | emits to debug view | visible merge log |
| oversize/invalid carriage cancel | emits dev-visible warning | never injects partial state |
| shadow write-back violation | emits dev warning | guards player-visible stores |
