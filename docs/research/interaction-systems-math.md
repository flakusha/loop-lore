<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Mathematical Representation of Game Systems' Interactions

> Research synthesis for loop-lore. Goal: ground the existing
> `TASK-interaction-service-foundation` and adjacent epics in the established
> mathematics and patterns of tabletop RPG resolution, action economies,
> and event-sourced ledger design. Scope is interaction-only — combat,
> quests, and broader simulation mechanics are out of scope unless they
> share the same math (dice, modifiers, state deltas).

## 1. Authoritative Models

### 1.1 D&D 5e — d20 + ability modifier vs. difficulty class

- Single uniform die of size `s = 20`.
- Resolution: `total = d_20 + Σ modifiers`, compared against `DC`.
- Outcome tiers: `total ≥ DC` (success), `total < DC` (failure),
  `d_20 == 20` (critical success regardless of modifiers),
  `d_20 == 1` (critical failure).
- Advantage / disadvantage (D&D 5e): roll 2d20 and keep `max` (advantage)
  or `min` (disadvantage). They do **not** stack; if multiple sources apply,
  they cancel.
- Probability (Andrew Gelman, 2014; Cambridge dropbears notes):
  - `P(roll ≥ n)` normal = `(21 - n) / 20`.
  - Advantage: `P(roll ≥ n)` = `(21 - n)^2 / 400` for `n ≤ 20`,
    derived from `1 - P(both < n)^2`.
  - Disadvantage: `P(roll ≥ n)` = `1 - (n - 1)^2 / 400`.
- Variance reduction: advantage's max-of-2 lifts the median by `+0.83`
  and reduces variance; disadvantage does the inverse.

### 1.2 Powered by the Apocalypse — 2d6 + stat

- `total = d_6 + d_6 + stat`, where `stat ∈ [-1, +2]` typically.
- Outcome bands: `total ≥ 10` (full), `7 ≤ total ≤ 9` (partial),
  `total ≤ 6` (miss).
- Distribution (Wikipedia, Lumpley Games):
  - `P(full)` rises from `~16.7%` at `stat = 0` to `~58.3%` at `stat = +3`.
  - `P(partial)` peaks at `stat = 0` (~41.7%).
  - `P(miss)` falls from `~41.7%` at `stat = 0` to `~2.8%` at `stat = +3`.
- Mathematical property: 2d6 is triangular, less variance than d20.

### 1.3 Blades in the Dark — Position × Effect dice pool

- Pool: `n` d6 (skill + bonuses); keep the single highest die.
- Tier compare: 1–3 (bad), 4/5 (mixed), 6 (full).
- **Position** (`controlled`, `risky`, `desperate`) modulates consequences
  on a miss; it does **not** change the die pool.
- **Effect** (`limited`, `standard`, `great`) modulates how much you
  achieve on a success.
- Probability: `P(max ≥ k)` for `n` dice = `1 − ((k - 1)/6)^n`.
- Two-axis model (risk × outcome) — significantly more expressive than
  a single scalar DC for an LLM narrator.

### 1.4 Savage Worlds — exploding die + Benny economy

- Trait and wildcard dice explode on max face.
- Success on `trait ≥ TN`; raises at `+4`, `+8`.
- Bennies: meta-currency for reroll/soak/Edge; GM Bennies refresh.
- Exploding dice have a long-tailed distribution — expected value
  diverges for unbounded `d_face`; SWADE caps explosions.

### 1.5 Foundry VTT — composable dice AST

- `Roll.parse(formula, data)` produces an ordered array of `RollTerm`:
  `NumericTerm`, `DieTerm`, `OperatorTerm`, `FunctionTerm`,
  `StringTerm`, `PoolTerm`.
- Each term carries `results`, `total`, and `evaluate()`.
- A sound implementation treats a roll as a tree, not a string.

### 1.6 Event sourcing for chat / game ledgers

- Pattern (Azure Architecture Center, Baytech 2025): every state change
  is an immutable event; current state is a projection.
- For RPG chat: `interaction_log` is the source of truth;
  `character_relationships`, `character_stats`, `inventory` are projections.
- Replayable: rebuild any snapshot by replaying events up to a sequence.
- loop-lore's `008_game_interactions` migration implements exactly this.

## 2. Applicability to loop-lore

loop-lore is an LLM-driven narrative RPG chat platform. Its interactions
are *narrated* by an LLM but *resolved* by deterministic math when the
user issues a slash command. That places it at the intersection of:

| Source model     | Direct fit                          | Why                                                                  |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------- |
| D&D 5e (d20)     | The existing `interaction` resolver | Already implemented: 1d20 + Σ modifiers vs difficulty, natural crits |
| PbtA 2d6         | Possible new resolver                | Triangular distribution; partial-success is the natural LLM cue     |
| Blades pool      | Possible "consequence layer"         | Position/Effect as the narrative envelope around a single roll     |
| Savage Worlds    | Partial                             | Exploding dice is performative but hard to ground in LLM           |
| Foundry VTT AST  | Internal modeling reference         | Treat roll as a tree, not a string — same as Kysely query AST       |

### 2.1 What the existing system already covers

- `src/rpg/interaction/service.ts` is a faithful 5e d20 implementation:
  ability modifier from `character_stats`, blocked-material gate,
  roll → outcome → state-change callback → persistence.
- Modifier provenance is logged (`modifiers: JSON`) and surfaced in
  `src/assistant/prompt/sections/interaction-context.ts` so the LLM can
  narrate with full reasoning.
- The ledger (`interaction_logs`) is event-sourced: append-only, indexed
  by `(chat_id, created_at)`, joined via FK.

### 2.2 What is intentionally absent

| Gap                                       | Why it's a gap                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| No `position`/`effect` axis               | A failure and a *consequence-laden* failure are the same row. The LLM cannot ground "controlled miss" vs "desperate miss" without it. |
| No multi-die pools                        | Blades-style checks (skill + bonuses) cannot be expressed — only flat Σ modifiers.                        |
| No 2d6 resolution                         | PbtA-style partial success (which maps very cleanly to "yes, but…") is impossible.                         |
| No dice tree / AST                        | Formulas like `4d6kh3` (advantage in d6-keep terms) are unparseable; only flat `{source,value}` works.      |
| Modifier budget per actor per turn        | Action economy (one roll vs many, limited resources, cooldown) is tracked nowhere.                         |
| Event replay / snapshot                   | `interaction_logs` cannot rebuild a `relationships` row at time T without re-evaluating every event in order; downstream consumers must trust the latest write. |

## 3. Limitations & Failure Modes

- **d20 variance is dramatic in low-roll regions**: a single nat-1/nat-20
  is a 5% chance, but the LLM often narrates it as 100% certain. The
  ledger records `roll.raw_total` but the prompt should make this visible.
- **Advantage / disadvantage non-stacking** is a hard 5e rule frequently
  violated by LLM agents that pile modifiers. A canonical cancel rule
  (multi-source → cancel entirely, not sum) is missing.
- **Modifier provenance** is currently JSON; the prompt section joins
  it as a string. A structured table (`modifiers` + `modifier_sources`)
  would let the LLM cite and the analyst audit.
- **Position/Effect** would require a schema change but adds the most
  narrative signal for an LLM cost that is much lower than a full dice AST.
- **Replay / projection**: event sourcing is great for auditability, but
  the `relationship_opinion` projection is a single row that overwrites;
  history is lost. A `relationship_change_events` table is the proper fix.

## 4. Applicability Rating (loop-lore)

| Model / Pattern          | Applicability | Effort  | Comment                                                                 |
| ------------------------ | ------------- | ------- | ----------------------------------------------------------------------- |
| d20 + ability vs DC     | **Done**      | —       | Already shipped in `008_game_interactions`                              |
| Modifier provenance      | **Done (JSON)** → **structured next** | Low    | Move to `modifiers` + `modifier_sources` tables; FKs + audit            |
| Advantage / disadvantage | **Done** (cancel rule missing)        | Low    | Add `interaction_modifier_cancel` rule + tests                          |
| Position / Effect        | **Not implemented**                   | Medium | Two extra columns on `interaction_logs`; LLM prompt section            |
| Dice pool (Blades)       | **Not implemented**                   | High   | New resolver + AST; mostly valuable for "risk-magnitude" rolls         |
| 2d6 (PbtA)               | **Not implemented**                   | Medium | New resolver; partial-success mapping reads cleanly to the LLM         |
| Exploding dice (Savage)  | **Not recommended**                   | —      | Long tail hurts the LLM's narrative commitment; not worth the schema   |
| Foundry AST              | **Partial** (flat list, not a tree)   | Medium | Add `roll_terms` table with `kind`, `sides`, `count`, `modifier`       |
| Event sourcing           | **Partial** (interaction logs only)   | Medium | Add `relationship_change_events`, `inventory_change_events`             |

## 5. Proposed Epics

### EPIC-RESEARCH-MATH-RESOLUTION — Math models behind roll resolution

- Scope: extend `src/rpg/interaction` to support Blades (dice pool),
  PbtA (2d6), and structured modifier rows; add Position/Effect axes.
- Outcome: a single resolver that takes a `roll_kind` and dispatches to
  the right math, with the same ledger persistence and prompt surface.

### EPIC-RESEARCH-MATH-LEDGER — Event-sourced projections

- Scope: split `relationship_change_events`, `inventory_change_events`,
  and `character_state_change_events` from the existing JSON columns
  on `interaction_logs`. Build projection rebuilders that can recompute
  any row at any past sequence number.
- Outcome: replayable audit trail; new "what did the world look like at
  scene start?" feature; defensible answer to "did the LLM change a
  relationship on its own?".

### EPIC-RESEARCH-MATH-AI-BRIDGE — LLM ↔ math contract

- Scope: structured `DiceResult` and `InteractionResult` JSON for the
  LLM; prompt sections that show math *and* narrative; ban `assistant`
  text overriding recorded outcomes.
- Outcome: the LLM can no longer "decide" the outcome — it can only
  narrate the recorded one.

### EPIC-RESEARCH-MATH-ECONOMY — Action & resource economy

- Scope: per-actor turn budget (one major + one minor + reactions),
  cooldown rows, Bennies-like meta-currency table for rerolls.
- Outcome: the user can't spam `attack` indefinitely; the LLM has a
  principled reason to refuse a command.

## 6. Proposed Tickets

- `TASK-math-resolver-blades-pool` — implement dice-pool resolution
  (`n`d6 keep highest) with Position/Effect axes; FK to `interaction_logs`.
- `TASK-math-resolver-pbta-2d6` — implement 2d6 + stat resolution with
  full/partial/miss bands; narrative hint to LLM.
- `TASK-math-modifier-source-table` — normalize modifier breakdown into
  a `interaction_modifiers` table with FK to a `modifier_sources` enum;
  update prompt section.
- `TASK-math-advantage-cancel-rule` — enforce 5e-style advantage cancel:
  if any source grants advantage and any source grants disadvantage,
  the roll is plain; add tests for two-of-each cancel.
- `TASK-math-position-effect-columns` — add `position` and `effect` enum
  columns to `interaction_logs`; surface in prompt section.
- `TASK-math-event-rebuild-relationships` — introduce
  `relationship_change_events` projection;
  `RelationshipsService.rebuild(chatId, atSeq)` returns the canonical state.
- `TASK-math-structured-llm-dice-result` — emit `DiceResult` as a typed
  JSON for the LLM; prompt section renders it.
- `TASK-math-turn-budget` — per-actor `turn_budget` with major/minor/reaction
  slots; commands consume slots; tests + audit.
- `TASK-math-bennies-meta-currency` — `bennies` table per actor;
  spend/refund API; used to allow one reroll per turn.
- `TASK-math-roll-formula-ast` — parse and store `RollTerm[]` for any
  interaction; supports formulas like `4d6kh3` and `2d20kh1`.

## 7. Recommended ordering (lazy ladder)

The smallest contract that meaningfully extends the existing system:

1. `TASK-math-modifier-source-table` (1 day, low risk, audit win)
2. `TASK-math-advantage-cancel-rule` (½ day, fixes a known bug)
3. `TASK-math-position-effect-columns` (1 day, biggest LLM signal boost)
4. `TASK-math-structured-llm-dice-result` (1 day, contract fix)
5. `TASK-math-resolver-pbta-2d6` (2 days, opens partial-success)

Stop after (5) unless usage data shows the higher-effort items are worth
their complexity. The Blades pool resolver and event-rebuild projections
are valuable but each opens a second schema surface; ship them only when
the simpler model has been measured.

## 8. References (primary)

- Andrew Gelman — *D&D 5e: Probabilities for Advantage and Disadvantage* (2014).
  https://statmodeling.stat.columbia.edu/2014/07/12/dnd-5e-advantage-disadvantage-probability/
- University of Cambridge — *D&D Probability distributions* (RMK35).
  https://www.cl.cam.ac.uk/~rmk35/dropbears.html
- Blades in the Dark — *Action Roll* & *Setting Position & Effect*.
  https://bladesinthedark.com/action-roll
  https://bladesinthedark.com/setting-position-effect
- Vincent Baker (Lumpley Games) — *Powered by the Apocalypse, part 11: Dice*.
  https://lumpley.games/2024/04/29/powered-by-the-apocalypse-part-11-dice
- Wikipedia — *Powered by the Apocalypse*.
  https://en.wikipedia.org/wiki/Powered_by_the_Apocalypse
- Foundry VTT — `Roll` API documentation (v14).
  https://foundryvtt.com/api/classes/foundry.dice.Roll.html
- Foundry VTT Wiki — *Roll* (terms, parsing, evaluation).
  https://foundryvtt.wiki/en/development/api/roll
- Microsoft Azure Architecture Center — *Event Sourcing pattern*.
  https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing/
- Bayer, M. — *Beyond the Hype: Event Modeling, Event Sourcing, and Real Choices*.
  https://ricofritzsche.me/beyond-the-hype-event-modeling-event-sourcing-and-real-choices/
- Savage Worlds — *Rules Quick-Reference* (Bennies, exploding dice).
  http://savage-worlds.wikidot.com/rules-quick-reference
