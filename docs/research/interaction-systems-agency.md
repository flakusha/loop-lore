<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Interaction Systems Research: Autonomy, Agency, and Human<->Item Interactions

Research synthesis for loop-lore. Goal: ground the existing
`epic-actor-autonomy-story-drive.md` (scheduler/governance) and
`epic-agency-story-points.md` (player meta-currency) with **decision-making
models**, **action-parser/affordance design**, and **agency-as-quality
metrics** - the three pieces those epics reference but do not spec.

Scope: web research only. No code changes in this worktree. All artifacts
persist under `.plan/` as draft epics + draft tickets.

## 1. Scope vs. Existing Epics

| Concern                                  | Owner (today)                                 | Gap covered here                            |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| When NPCs act (tick, due-actor)          | `epic-actor-autonomy-story-drive.md`           | -                                           |
| Cost governor (budget, kill switch)      | `epic-actor-autonomy-story-drive.md`           | -                                           |
| What NPCs decide to do                   | (referenced but absent)                        | **EPIC-RESEARCH-AGENCY-DECISION**            |
| What NPCs *can* do (verb x item matrix)  | (implicit in `actor_items`)                   | **EPIC-RESEARCH-AGENCY-AFFORDANCE**         |
| Player perception of agency             | (claimed by `epic-agency-story-points.md`)     | **EPIC-RESEARCH-AGENCY-QUALITY**             |
| Free-form user -> typed action           | `src/regex/intent.ts` (keyword routing only)  | covered in **EPIC-RESEARCH-AGENCY-AFFORDANCE** |

## 2. NPC Decision-Making Models (Authoritative Sources)

### 2.1 Goal-Oriented Action Planning (GOAP)

- Orkin, J. (F.E.A.R., 2005): NPC action chains composed at runtime from a world-state pre-condition/effect graph; produces emergent flank/cover behaviour without scripting.
- Excalibur.js walkthrough (2024): re-implementation shows ~3-actor plans in ~ms.
- Tono Game Consultants (2025): GOAP vs Utility vs Behavior Trees - GOAP excels when the world has many reachable goals with combinatorial preconditions; degenerate when state space is shallow.

**Adoption heuristic (GDC tradition, distilled):** GOAP for *combat/tactical* scenes where action ordering matters; Utility AI for *everyday/routine* decisions where the priority order is fluid; Behavior Trees for *deterministic designer-authored* flows. Most shipped games mix all three.

**Loop-lore fit:** `epic-actor-autonomy-story-drive.md` enumerates `BDI plan due | reaction pending | movement tick due` - three distinct decision surfaces. Per surface:
- Movement -> Behavior Tree (deterministic path; `src/rpg/npc-navigation/` already does this).
- Reaction -> Utility AI (a small set of `chat | wait | do_other | flee | attack | ignore` candidates, scored).
- Daily plan / aspiration pursuit -> BDI-lite (beliefs = memory+relationships; desires = aspirations from `epic-character-internal-traits`; intentions = step queue - the schema is already drafted in `epic-agency-story-points.md` NPC Goal-Pursuit Loop section).

GOAP is **NOT** in the recommended primary stack. Rationale: most loop-lore scenes are conversational, the world-state graph (locations x items x NPCs x time) is shallow per-scene, and a full STRIPS-style planner is over-budget for the token economy. Revisit only if tactical combat grows into a primary genre surface.

### 2.2 Utility AI (The Sims lineage)

- The Sims (Wright, 2000) - needs-based utility scoring (Hunger, Social, Hygiene, Fun, Energy, Bladder). Each NPC scores every action on every need; highest weighted score wins. Cheap, deterministic, scales to 100+ NPCs per tile.
- saumyaparmar/SchedulerUtilityAIBehaviorTrees (2024) - Sims needs x RDR2 time-based scheduling x Unreal Behavior Trees. Demonstrates the modern hybrid.

**Loop-lore fit:** `epic-character-internal-traits` already gives us `autonomy` (D9), `coping` (D7), `approach` (D8) - three continuous axes that *are* utility weights. A `PersonalityModifierResolver` (or equivalent in `src/characters/services/personality-service/`) becomes the utility scorer for the reaction step. No new data model required to prototype.

### 2.3 BDI (Belief-Desire-Intention) - Stanford Generative Agents

- Park et al., *Generative Agents: Interactive Simulacra of Human Behavior* (2023): 25 agents in Smallville, memory stream + reflection + planning. Daily plan -> hourly schedule -> task decomposition -> reaction -> revision loop. The reference architecture for "NPCs that pursue aspirations".
- `epic-agency-story-points.md` already adapts the data shape (`DailyPlan`, `PlannedActivity`, `ReactionDecision`, `PlanRevision`).

**Adoption heuristic:** BDI is **the right answer** for aspiration-driven NPCs but is also the **most expensive** architecture (one LLM call per day-plan regeneration, plus per-reaction calls). Treat it as a **per-actor nightly job**, not a per-tick driver; pair with Utility AI for per-tick reactions. The cost guardrail `epic-actor-autonomy-story-drive.md` already mandates (governor, jitter, hard-gated unlimited mode) is what makes BDI affordable here.

### 2.4 Long-horizon agentic LLM planning (cross-domain)

- "Long-Horizon Planning and Goal Decomposition in AI Agents" (Zylos, 2026): goal drift + replanning are the dominant failure modes past ~hundreds of steps. Solutions are checkpoint memories + periodic reflection, not bigger context windows.
- This validates `memory/` budgeting (`memory-budget`, `memory-provisioning`, `memory-purge`) as the right primary control point for NPC planning depth.

### 2.5 NPC Schedule / Routine Frameworks

- NPC Daily Routine System (Fab, 2026): 24-hour timeline editor; Data-Asset driven; Unreal BP-free.
- Routine Driven NPC Framework (Hyper, 2026): modular UE5 framework separating population, routines, perception, combat.
- NPC Behavior Scheduling (joshualee): time-of-day + stimuli-driven believable behavior.

**Loop-lore fit:** schedule data shape (`wake_time`, `activities[]`, `current_activity_index`, `status`) is identical to what `epic-agency-story-points.md` NPC Goal-Pursuit Loop section already drafts. New tickets can reference the draft types verbatim - no schema divergence.

## 3. Player Agency - Quality Dimensions (Design Theory)

### 3.1 Murray's Agency (1997, *Hamlet on the Holodeck*)

Foundational definition: the satisfying power to take meaningful action and see the results of our choices and decisions. Three required conditions:
1. The action must be **possible** (the system exposes it).
2. The action must be **effective** (it changes state).
3. The player must **perceive** the change (feedback loop intact).

These map directly to loop-lore's existing primitives:
- Possible -> `interaction_log.interaction_type` (the verb set the system supports).
- Effective -> `interaction_log.effect` (state delta) and the structured `DiceResult` (math ticket from the prior research batch).
- Perceived -> chat narrative + assistant generation confirms the consequence.

### 3.2 Wardrip-Fruin & Mateas, *Agency Play* (AAAI 2009)

Frames agency as **multiple dimensions** engaged *expressively* during run-time, not a single dial. Authors enumerate: spatial, temporal, manipulation, social, narrative, ludic, etc. The frame's value for loop-lore: agency is **multi-axis**, and improving one axis (e.g. spatial) without the others does not raise overall perception. Suggests an **agency-quality dashboard** rather than a single "agency score".

### 3.3 Cairns et al., *Naked and on Fire* (CHI 2021)

Interview study: agency perception depends on **meanings ascribed to choices**, not on the raw count. A choice between two equally-costed options is *less* agentic than a costly, irreversible choice between meaningfully-different options.

**Adoption heuristic:** designing more choices is not enough - design **consequential asymmetry**. Loop-lore currently has high choice-count (chat is open-ended) but low consequence asymmetry (LLM can narratively walk back most things). The structured `DiceResult` and `Position/Effect` columns (math tickets 3 and 5) directly address this by making outcomes **non-revisable** by the LLM.

### 3.4 Redefining Play: Agency vs Autonomy (DiGRA 2025)

Proposes a **single-experience** model distinguishing Agency (player-driven) from Autonomy (system-driven). Critical insight: **autonomous NPCs can erode player agency** when their decisions pre-empt player choices (the NPC sells the magic sword before the player meets the merchant). This is the open coordination problem between `epic-actor-autonomy-story-drive.md` and player agency.

**Adoption heuristic:** the autonomy scheduler must check `pending_player_intent` before dispatching an autonomous NPC action that would foreclose a player choice. New ticket: **TASK-agency-coordination-priority** - autonomy defers one tick when a player message is in flight against the same scene.

### 3.5 Player Agency Under Constraint (ACM 2025)

Forced-choice scenes (binary cliffhangers) under-measure agency vs free-choice scenes; designers need explicit "forced choice" metadata to be honest about what they are offering.

**Adoption heuristic:** add an `agency_mode: free | forced | blocked | skipped` field on the `interaction_log` row (covered by `epic-actor-turn-skip.md`'s `TurnSkip` contract - coordinate, do not duplicate).

## 4. Human<->Item Interactions - Affordance & Action Parsing

### 4.1 Affordance theory (Gibson 1979; Norman 1988)

An **affordance** is the action potential between an actor and an object, perceived by the actor given its capabilities. In RPGs this collapses to: `Affordance = (actor.capabilities) x (item.properties) x (context.state)`. The cross-product is what determines "can X use Y here?" without hard-coding verb lists per item.

### 4.2 Open-vocabulary Human-Object Interaction (HOI) - modern ML

- OpenHOI (arXiv 2505.18947, 2025): long-horizon manipulation sequences for novel objects from free-form language; relevant for **out-of-vocabulary items** (a "plasma coil" the item DB has never seen should still resolve to "use").
- HOI-PAGE (ICML 2026): part-level affordance reasoning -> 4D HOI generation. Demonstrates that **part-of-object** affordances matter (a sword's hilt affords `grip`, its blade affords `cut`, its pommel affords `pound`).
- HOI-CL (Compositional Learning): zero-shot HOI category generalization. Validates the cross-product math: compositional `verb x object x context` generalizes.

**Loop-lore fit:** our `items` table is *static*, but user input is *open vocabulary*. The IntentVLM/IntentGPT line of work (arXiv 2508.11093, 2604.24002) shows VLM-as-action-model is the current SOTA for free-form -> typed action. The current `src/regex/intent.ts` is a *keyword router*, not a verb+target parser - an order-of-magnitude gap.

### 4.3 Natural-language command parsers (text RPG lineage)

- studyraid (text-RPG NL parser walkthrough): verb + object + (optional) instrument. `"/open door with key"` -> `{verb: open, target: door, instrument: key}`. Simple, deterministic, fast.
- Twine / Inform 7 / ADRIFT lineage: rule-based verb grammars. Bounded vocabulary; loss of fidelity on novel inputs.
- Intent Recognition (Rhasspy): JSON intent payload `{intent, slots, confidence}` post-STT - the canonical contract for downstream dispatch.

**Adoption heuristic (loop-lore):** a **two-stage** parser - (1) regex/keyword first-pass covers ~85% of common verbs at <1ms; (2) LLM fallback with a **constrained JSON schema** (verb in enum, target in inventory union room, instrument in inventory) for the remainder. Stage 1 is auditable; Stage 2 is novel-input-safe. Slot enumeration already exists in `actor_items`; the gap is **verb enumeration** (currently only implicit in regex `intents`).

### 4.4 Foundry VTT - LLM <-> game-state bridge (precedent)

Foundry VTT modules (`foundryvtt-ask-chatgpt`, `phils-ai-assistant`) demonstrate the canonical pattern: the LLM is fed **structured game state** (Actors, Items, Journals) and returns a constrained action that the engine executes. This validates loop-lore's `ai-bridge` epic from the prior research batch: contract-first, not prose-first.

### 4.5 SillyTavern / Character Card / Lorebook (persistence + affordance surface)

The character-card/lorebook pattern (`lorebook_entries`) is loop-lore's primary **world-affordance surface**: lorebook entries are triggered by keywords in context, gating which facts/items/characters the LLM "knows" in a given scene. This is already wired (`actor-lore-entries`, `actor-memories-*`). The followup gap is **state-aware triggers**: lorebook activation should consider actor capabilities and item state, not just keywords. (Deferred to a followup ticket - not in scope for this batch.)

### 4.6 Item economy - rarity x level x budget (D&D 5e, Sane Magical Prices)

- 5e Magic Item Prices (saga20, 2026) - Sane Magical Prices system: rarity x level-band pricing. Existing `item.rarity` enum + character level -> price calculator.
- D&D 5e Magic Item Rarity by Level (rechner-hub, 2026) - soft level-rarity band: Common L1+, Uncommon L5+, Rare L9+, Very Rare L13+, Legendary L17+.
- D&D Magic Item Distribution Table (Reddit /DnDBehindTheScreen) - treasure budget by encounter CR.

**Loop-lore fit:** the prior research batch's `TASK-math-position-effect-columns` is the encounter-side budget; this batch's recommended `TASK-item-affordance-table` is the item-side budget. Together they let a single encounter roll be reconciled: `drop_budget <= sum(rarity x quantity for items dropped)` and `loot_pickups x affordance_matrix <= party_capabilities`.

## 5. Applicability Matrix - Loop-lore Surfaces

| Loop-lore surface                         | Authoritative model          | Adoption priority | Source-of-truth tickets                |
| ----------------------------------------- | ---------------------------- | ----------------- | -------------------------------------- |
| NPC reaction per turn                     | Utility AI                   | **P0**            | new: `TASK-agency-utility-scorer`      |
| NPC daily plan / aspiration pursuit       | BDI-lite                     | P1                | `epic-agency-story-points.md` tasks    |
| NPC tactical action chains (combat)       | Behavior Tree (existing)     | -                 | `src/rpg/npc-navigation/` (done)       |
| NPC multi-step plans (long-horizon)       | BDI + reflection checkpoints | P2                | new: `TASK-agency-bdi-reflection-cycle` |
| Free-form user message -> typed action    | Two-stage parser             | **P0**            | new: `TASK-affordance-action-parser`    |
| Item capability lookup                    | Affordance matrix (3-tuple)  | **P0**            | new: `TASK-affordance-lookup-table`    |
| Player-agency quality telemetry           | Murray x agency-play x DiGRA | P1                | new: `TASK-agency-quality-metrics`     |
| Autonomy <-> agency coordination          | DiGRA single-experience      | P1                | new: `TASK-agency-coordination-priority` |
| Encounter loot budget x affordance gates  | 5e x Sane Prices             | P2                | new: `TASK-loot-budget-affordance-gate` |

## 6. New Epics (Drafts - Persisted Below)

1. **EPIC-RESEARCH-AGENCY-DECISION** - Decision-making stack (Utility + BDI-lite). Scope: scorer wiring, BDI reflection cycle, plan visibility.
2. **EPIC-RESEARCH-AGENCY-AFFORDANCE** - Verb x target x context action parser + affordance table. Scope: verb enum, two-stage parser, affordance lookup, lorebook state-aware triggers (deferred).
3. **EPIC-RESEARCH-AGENCY-QUALITY** - Agency-quality telemetry + coordination rules. Scope: agency-mode column, dashboard dimensions, autonomy defers-on-pending-intent rule.

Each is a **research epic** (this batch) - concrete implementation tickets sit underneath.

## 7. Recommended Ticket Order (Lazy Ladder)

One rung at a time, ship the smallest that yields an observable win:

1. **`TASK-affordance-action-parser`** (2-3 days) - verb enum + two-stage parser. Immediate win: turns free-form chat into structured `interaction_log.action_type` rows that the math tickets can react to.
2. **`TASK-affordance-lookup-table`** (1-2 days) - `(actor_caps, item_props, context_state) -> boolean + reason`. Hook into `actor_items.equip` / `use` paths so unsupported actions are *explained*, not silently dropped.
3. **`TASK-agency-utility-scorer`** (2 days) - wire personality traits as utility weights for the reaction step. Reuses existing `personality-service` types - no schema work.
4. **`TASK-agency-quality-metrics`** (1-2 days) - extend `interaction_log` with `agency_mode: free | forced | blocked | skipped` + per-dimension counters; surface in admin telemetry.
5. **`TASK-agency-coordination-priority`** (1 day) - autonomy scheduler defers one tick when a player message is in flight on the same scene.
6. **`TASK-agency-bdi-reflection-cycle`** (P2 / week+) - full BDI nightly job with reflection checkpoints; budget-gated; defer until 1-5 ship and cost telemetry is real.
7. **`TASK-loot-budget-affordance-gate`** (P2) - encounter loot reconciled against `affordance-lookup-table`; depends on (2) and the prior math tickets.

## 8. Out of Scope (Deliberately Deferred)

- GOAP-style tactical planners (over-engineered for chat-RPG).
- LLM fine-tuning for action parsing (the constrained-schema fallback is sufficient; tune only when telemetry shows a real gap).
- Lorebook state-aware triggers (separate epic if user requests).
- VLM-based scene understanding (loop-lore is text-first; revisit if/when image inputs become first-class).
- Full Sims-style need systems (5+ continuous need axes) - overkill for chat-RPG; the 3-trait utility scorer is the test point.

## 9. Sources (Primary, Cited Above)

1. Orkin, J. - *Three States and a Plan: The A.I. of F.E.A.R.* (GDC 2005, AI Summit) - GOAP primary reference.
2. Park, J. S. et al. - *Generative Agents: Interactive Simulacra of Human Behavior* (Stanford, 2023, arXiv:2304.03442) - BDI-lite for NPCs.
3. Wright, W. - *The Sims: Influencing Gameplay with Agentic AI* (GDC 2000) - Utility AI founding.
4. Murray, J. - *Hamlet on the Holodeck* (1997) - Agency-as-power-to-act.
5. Wardrip-Fruin, N. & Mateas, M. - *Agency Play: Dimensions of Agency for Interactive Narrative Design* (AAAI 2009, SS-09-06).
6. Cairns, P. et al. - *Naked and on Fire: Examining Player Agency Experiences in Narrative-Focused Games* (CHI 2021).
7. Smith, H. & Anderson, R. - *Redefining Play: A Framework for Differentiating Agency and Autonomy* (DiGRA 2025).
8. Norman, D. - *The Design of Everyday Things* (1988/2013) - Affordance theory.
9. Gibson, J. J. - *The Ecological Approach to Visual Perception* (1979) - Original affordance.
10. OpenHOI (arXiv:2505.18947, 2025) - Open-world HOI synthesis.
11. HOI-PAGE (ICML 2026) - Part-level affordance reasoning.
12. Wang, Z. et al. - *Utilizing Vision-Language Models as Action Models for Intent Recognition and Action Assistance* (arXiv:2508.11093, 2025).
13. Excalibur.js - *NPC AI planning with GOAP* (2024). [Walkthrough]
14. Tono Game Consultants - *Game AI Planning: GOAP, Utility, and Behavior Trees* (2025).
15. Foundry VTT modules: `foundryvtt-ask-chatgpt`, `phils-ai-assistant` - LLM-as-game-bridge precedent.
16. SillyTavern `lorebook` / `world info` documentation - affordance surface for narrative context.
17. Zylos Research - *Long-Horizon Planning and Goal Decomposition in AI Agents* (2026).
18. NPC Daily Routine System (Fab, 2026), Routine Driven NPC Framework (Hyper, 2026).
19. rechner-hub - *D&D 5e Magic Item Rarity by Level* (2026).
20. saga20 - *D&D 5e Magic Item Prices: Sane Magical Prices system* (2026).
