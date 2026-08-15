# Cross-Mechanics Integration Matrix

**Created:** 2026-07-27
**Purpose:** Audit and document cross-system integration points across all RPG sub-system epics. Identifies gaps where two systems should interact but neither epic references the other.

## 0.1.0 Alignment (2026-08-05)

> **Priority mapping**: the 17 RPG sub-systems below (and their integration gaps G1–G17) are **P6+ deferred** under the 0.1.0 value alignment (see `backlog.md` `## P6+`) — none block P3–P5. The **NSFW** system is the sole exception: NSFW is a **P3/P4 0.1.0 value feature** (features/prompting/opt-in/sfw-nsfw caps). Its matrix gaps are **cross-enhancements with deferred siblings**:
>
> - **G6 NSFW↔Housing**, **G7 NSFW↔Weather**, **G8 NSFW↔Social** (seduction/reputation prerequisite) — blocked on their P6+ peers; do NOT gate 0.1.0. NSFW's standalone runtime config + live enforcement is already shipped (P0/P1).
> - **G9 NSFW↔Disease** (reproductive health) — P6+, not 0.1.0.
>
> **What does block P3–P5 (0.1.0 cross-integrations, outside this RPG matrix)** — these are tracked in `backlog.md` P4/P5 and `immediate.md` P4/P5:
>
> - NSFW × chat (opt-in + sfw/nsfw capability toggles at chat/generation boundary)
> - gallery/assets × chat (in-chat asset preview + linkage side panel, P4/P5)
> - IO × character/world/location/story (export/import wiring, P4/P5)
> - LLM support × chat/captioning/intent/embeddings (P3 #15)
> - assistant tooling × character/world/location/item/image creation wizards (P4)
> - memory + template injection × chat (P4 — high priority)
>
> Revisit G1–G17 when P6+ RPG work starts; the resolution-system gap (G5) is the highest-impact one for a future unified dice layer.

## Integration Matrix

Legend:

- ✅ = Both epics reference each other
- ➡️ = Row system references Column system (one-way)
- ⬅️ = Column system references Row system (one-way)
- ❌ = Neither references the other (gap)
- 🚫 = No meaningful interaction expected

| System            | RPG | Battle | Magic | Crafting | Companion | Housing | Disease | Social | Weather | Exploration | Economy | Crime | Faction | NSFW | CharCore | Resolution | Narrative |
| ----------------- | --- | ------ | ----- | -------- | --------- | ------- | ------- | ------ | ------- | ----------- | ------- | ----- | ------- | ---- | -------- | ---------- | --------- |
| **RPG Mechanics** | —   | ✅     | ✅    | ➡️        | ➡️         | —       | ➡️       | ✅     | —       | ✅          | ➡️       | —     | —       | ➡️    | —        | —          | —         |
| **Battle**        | ✅  | —      | ✅    | —        | ❌        | 🚫      | ❌      | ❌     | ❌      | ➡️           | —       | —     | —       | —    | 🚫       | —          | —         |
| **Magic**         | ✅  | ✅     | —     | ⬅️        | 🚫        | —       | ➡️       | 🚫     | ✅      | ➡️           | 🚫      | 🚫    | 🚫      | 🚫   | 🚫       | —          | —         |
| **Crafting**      | ⬅️   | —      | ❌    | —        | 🚫        | ✅      | ⬅️       | 🚫     | ⬅️       | ✅          | ✅      | 🚫    | 🚫      | 🚫   | 🚫       | 🚫         | 🚫        |
| **Companion**     | ⬅️   | ❌     | 🚫    | 🚫       | —         | ❌      | 🚫      | 🚫     | 🚫      | ✅          | 🚫      | 🚫    | 🚫      | —    | ✅       | 🚫         | 🚫        |
| **Housing**       | —   | 🚫     | 🚫    | ✅       | ❌        | —       | 🚫      | ➡️      | 🚫      | 🚫          | ✅      | 🚫    | 🚫      | ❌   | 🚫       | 🚫         | 🚫        |
| **Disease**       | ⬅️   | ❌     | ⬅️     | ⬅️        | 🚫        | 🚫      | —       | 🚫     | ⬅️       | 🚫          | 🚫      | 🚫    | 🚫      | ❌   | 🚫       | 🚫         | 🚫        |
| **Social**        | ✅  | ❌     | 🚫    | 🚫       | 🚫        | ⬅️       | 🚫      | —      | 🚫      | 🚫          | ✅      | ❌    | ✅      | ❌   | ✅       | —          | —         |
| **Weather**       | —   | ❌     | ✅    | ✅       | 🚫        | 🚫      | ➡️       | 🚫     | —       | ✅          | 🚫      | 🚫    | 🚫      | ❌   | 🚫       | 🚫         | 🚫        |
| **Exploration**   | ✅  | ⬅️      | ⬅️     | ✅       | ✅        | 🚫      | 🚫      | 🚫     | ✅      | —           | 🚫      | 🚫    | 🚫      | 🚫   | 🚫       | 🚫         | 🚫        |
| **Economy**       | ⬅️   | 🚫     | 🚫    | ✅       | 🚫        | ✅      | 🚫      | ✅     | 🚫      | 🚫          | —       | ❌    | ✅      | 🚫   | 🚫       | 🚫         | 🚫        |
| **Crime**         | ⬅️   | 🚫     | 🚫    | 🚫       | 🚫        | 🚫      | 🚫      | ❌     | 🚫      | 🚫          | ❌      | —     | ✅      | 🚫   | 🚫       | 🚫         | 🚫        |
| **Faction**       | —   | 🚫     | 🚫    | 🚫       | 🚫        | 🚫      | 🚫      | ✅     | 🚫      | 🚫          | ✅      | ✅    | —       | 🚫   | ✅       | 🚫         | ✅        |
| **NSFW**          | ⬅️   | —      | 🚫    | 🚫       | 🚫        | ❌      | ❌      | ❌     | ❌      | 🚫          | 🚫      | 🚫    | 🚫      | —    | ✅       | 🚫         | ✅        |
| **CharCore**      | ❌  | 🚫     | 🚫    | 🚫       | ✅        | 🚫      | 🚫      | ✅     | 🚫      | 🚫          | 🚫      | 🚫    | ✅      | ✅   | —        | 🚫         | ✅        |
| **Resolution**    | —   | ❌     | ❌    | 🚫       | 🚫        | 🚫      | 🚫      | ❌     | 🚫      | 🚫          | 🚫      | 🚫    | 🚫      | 🚫   | 🚫       | —          | 🚫        |
| **Narrative**     | —   | 🚫     | 🚫    | 🚫       | 🚫        | 🚫      | 🚫      | —      | 🚫      | 🚫          | 🚫      | 🚫    | ✅      | ✅   | ✅       | 🚫         | —         |

## Identified Gaps (by severity)

### 🔴 High — Missing bidirectional links between major systems

> **Doc-level status 2026-08-15:** G1–G5 integration **sections** now exist in the target
> epics (`epic-battle-action-systems.md`, `epic-resolution-system.md`). The remaining work
> is **implementation** (runtime cross-links), tracked P6-A (battle hub) + P6-0 (resolution)
> in `backlog/priority.md`. Rows below keep the original audit text for history.

| #  | System A       | System B                    | Current State                                                                                                                                                               | Recommended Action                                                                                              |
| -- | -------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| G1 | **Battle**     | **Items/Inventory**         | ✅ doc-resolved (Battle Integration Points deps: Item + Inventory; loot pipeline + equipment stat effects spec'd). Runtime wiring open → P6-A. | Add integration: equipment affects battle stats, loot drops feed inventory, item durability degrades in combat. |
| G2 | **Battle**     | **Social Interaction**      | ✅ doc-resolved (Battle deps: Social; negotiate/surrender/morale-break spec'd). Runtime wiring open → P6-A. | Add integration: social checks during combat for morale breaks, surrender, intimidation effects.                |
| G3 | **Battle**     | **NPC/Actor System**        | ✅ doc-resolved (Battle dependents: NPC/Actor — enemy AI, morale, personality). Runtime wiring open → P6-A. | Add integration: NPC actors drive enemy decisions, morale system from Social applies in combat.                 |
| G4 | **Battle**     | **Weather/Terrain**         | ✅ doc-resolved (Battle deps: Weather; `weather.changed` event subscribed). Runtime wiring open → P6-A. | Add integration: environmental combat modifiers from Weather system, terrain cover from Exploration.            |
| G5 | **Resolution** | **All Combat/Social/Magic** | ✅ doc-resolved (Resolution Integration Points: deps RPG/Config, dependents Battle/Social/Crime/Exploration/Magic/Disease/NSFW, `DiceRoll` contract, `resolution.roll` event). Runtime unification open → P6-0. | Add integration section referencing all systems that use dice resolution.                                       |

### 🟡 Medium — One-way links or missing cross-references

> **Doc-level status 2026-08-15:** G6–G9 integration sections now exist in
> `epic-nsfw-game-mechanics.md` (deps: Housing/Weather/Social/Disease; contracts
> `ReputationScore`/`Relationship`). G10 covered by Companion Integration Points (Housing).
> G11 (Crafting↔Magic enchanting) doc-resolved 2026-08-15 — Crafting Integration Points
> depend on Magic + subscribe `magic.enchantment_applied`. Remaining work is implementation,
> tracked P6-B (NSFW) + P6-C (housing/crafting) in `backlog/priority.md`.

| #   | System A     | System B      | Current State                                                                                                         | Recommended Action                                                                                           |
| --- | ------------ | ------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| G6  | **NSFW**     | **Housing**   | ✅ doc-resolved (NSFW deps: Housing — private spaces, comfort modifiers). Runtime open → P6-B. | Add integration: housing provides private spaces with comfort bonuses for NSFW encounters.                   |
| G7  | **NSFW**     | **Weather**   | ✅ doc-resolved (NSFW deps: Weather — encounter mood/location availability). Runtime open → P6-B. | Add integration: weather affects NSFW encounter mood and location availability.                              |
| G8  | **NSFW**     | **Social**    | ✅ doc-resolved (NSFW deps: Social; shared `ReputationScore` contract). Runtime open → P6-B. | Add integration: social skills (persuasion, deception) are seduction prerequisites; shared reputation model. |
| G9  | **NSFW**     | **Disease**   | ✅ doc-resolved (NSFW deps: Disease — reproductive health, STDs). Runtime open → P6-B. | Add integration: disease system covers reproductive health, STDs from NSFW encounters.                       |
| G10 | **Housing**  | **Companion** | ✅ doc-resolved (Companion Integration Points: Housing — stables, pet rooms, mount housing). Runtime open → P6-C. | Add integration: companion housing, pet room bonuses, mount stable from Housing.                             |
| G11 | **Crafting** | **Magic**     | ✅ doc-resolved 2026-08-15 — Crafting Integration Points deps include Magic (enchanting recipes/materials); subscribes `magic.enchantment_applied` event. Runtime wiring open → P6-C. | Add integration: enchanting as cross-system feature between Crafting and Magic.                              |
| G12 | **Crime**    | **Economy**   | Crime references Economy (bounties, black market); Economy now references Crime (black market pricing, stolen goods). | **RESOLVED** — bidirectional cross-refs added.                                                               |
| G13 | **Crime**    | **Social**    | Both reference each other: Crime lists Social for reputation flow; Social lists Crime for skill overlap.              | **RESOLVED** — bidirectional cross-refs added.                                                               |

### 🟠 Low — Missing links between peripheral systems

| #   | System A      | System B     | Current State                                                                                         | Recommended Action                                                          |
| --- | ------------- | ------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| G14 | **Faction**   | **Social**   | Both reference each other; Faction now has Integration Points with shared ReputationScore note.       | **RESOLVED** — shared schema documented in Faction integration section.     |
| G15 | **Disease**   | **Weather**  | Weather lists disease (plague zones); Disease now references Weather for transmission conditions.     | **RESOLVED** — Disease epic updated with weather transmission cross-ref.    |
| G16 | **Companion** | **Battle**   | Companion references Battle; Battle now lists Companion in dependents table with participation rules. | **RESOLVED** — Battle epic dependents table includes Companion.             |
| G17 | **RPG**       | **CharCore** | RPG now references Character Core in Related Epics with ownership clarification.                      | **RESOLVED** — RPG epic updated with CharCore cross-ref and ownership note. |
| G24 | **Memory**    | **CharCore** | Memory has `emotional_valence` field but no structured emotion-impact; CharCore has coping/mood but no memory integration. | 🟡 tracked — `TASK-memory-emotion-impact.md` (exists); P6-0 |
| G25 | **Memory**    | **Time Scale** | Memory has real-time timestamps; Time Scale has game-time progression but no memory integration.    | 🟡 tracked — `TASK-memory-timescape.md` (exists); P6-0 |
| G26 | **Memory**    | **Timeline** | Memory has no `timeline_id`; Timeline has timeline branching but no memory integration.              | 🟡 tracked — `TASK-timeline-id-world-timeline-events.md` + `TASK-timeline-memory-injection.md` (exist); P6-0 |

## Standardized Integration Template

Every epic file should have this section. Copy-paste and customize:

```markdown
## Integration Points

### Systems This Epic Depends On

<!-- Systems whose output this epic consumes -->

| System        | What It Provides       | How Used         |
| ------------- | ---------------------- | ---------------- |
| RPG Mechanics | Stats, dice resolution | [specific usage] |
| ...           | ...                    | ...              |

### Systems That Depend On This Epic

<!-- Systems that consume this epic's output -->

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| ...    | ...              | ...      |

### Shared Data Contracts

<!-- Types, interfaces, or schemas shared between this and other systems -->

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| ...      | ...         | ...     |

### Cross-System Events

<!-- Events this system emits or subscribes to from other systems -->

| Event | Direction          | Purpose |
| ----- | ------------------ | ------- |
| ...   | emits / subscribes | ...     |
```

## Related Epics Without Formal Integration Sections

> **Updated 2026-08-15:** 4/5 epics below gained formal `## Integration Points` sections
> (deps/dependents/contracts/events) since this table was written. Remaining gap: none —
> `epic-emergent-narrative-design.md` got its section 2026-08-15. Table kept for audit trail;
> the sections themselves are the source of truth now.

| Epic                                | Related Epics Listed                                                     | Missing Integration                         | Status |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- | ------ |
| `epic-battle-action-systems.md`     | RPG Mechanics, World & Locations                                         | Items/Inventory, Social, NPC/Actor, Weather | ✅ RESOLVED — full Integration Points (deps incl. Item/Inventory/Weather/Social/Resolution; dependents incl. NPC/Actor/Companion; contracts `StatusEffect`/`DiceRoll`; events `battle.victory`/`battle.defeat`) |
| `epic-nsfw-game-mechanics.md`       | RPG Mechanics, Battle, World, Logic Reconciliation, Plugin, Assistant/GM | Housing, Weather, Social, Disease           | ✅ RESOLVED — full Integration Points (deps incl. Housing/Weather/Social/Disease; shared contracts `ReputationScore`/`Relationship`) |
| `epic-resolution-system.md`         | (none formal)                                                            | Battle, Social, Magic, RPG                  | ✅ RESOLVED — full Integration Points (dependents Battle/Social/Crime/Exploration/Magic/Disease/NSFW; contracts `DiceRoll`/`SkillCheck`/`SaveType`; event `resolution.roll`) |
| `epic-companion-pet-mount.md`       | RPG Mechanics, Battle, World, Actor                                      | Housing, Disease, NSFW                      | ✅ RESOLVED — Integration Points covers Actor/RPG/Combat/Inventory/World/Housing (Disease/NSFW intentionally out of scope; see P6-C) |
| `epic-emergent-narrative-design.md` | (minimal)                                                                | All systems (narrative touches everything)  | ✅ RESOLVED — Integration Points added 2026-08-15 (deps RPG/Social/World/Memory/StoryPoints; contract `StoryPoint`; events `narrative.principle_check`) |

## Recommendations

> **Status 2026-08-15:** recs 1–3 ✅ doc-resolved (Battle, NSFW, Resolution all gained
> formal `## Integration Points` sections). Rec 4 (standardize templates) ✅ **17/17
> full-template as of 2026-08-15** — the 9 bullet-style epics converted same day
> (magic, companion, disease, social, weather, exploration, economy, stealth-crime,
> faction-reputation) and charcore gained a section (was missing). Crafting was already
> full-template (deps incl. Magic; `magic.enchantment_applied` event) — G11 doc-resolved.

1. **Battle epic priority** — Most impactful gap. Battle is the hub that touches most systems but references few. ✅ RESOLVED — full Integration Points added (deps: Item/Inventory/Weather/Social/Resolution; dependents: NPC/Actor/Companion/Crime/Disease/NSFW; contracts `StatusEffect`/`DiceRoll`/`CharacterStats`; events `battle.victory`/`battle.defeat`).

2. **NSFW epic** — Second priority. ✅ RESOLVED — full Integration Points added (deps: Housing/Weather/Social/Disease; contracts `ReputationScore`/`Relationship`).

3. **Resolution System** — Foundational. ✅ RESOLVED — full Integration Points added (dependents: Battle/Social/Crime/Exploration/Magic/Disease/NSFW; contracts `DiceRoll`/`SkillCheck`/`SaveType`; event `resolution.roll`).

4. **Standardize templates** — All 17 RPG sub-system epics should use the template above. ✅ 17/17 full — rpg-mechanics, battle, crafting, housing, nsfw, resolution, emergent-narrative converted 2026-08-15; remaining 9 bullet-style converted same day (magic, companion, disease, social, weather, exploration, economy, stealth-crime, faction-reputation); charcore added (was missing).

5. **Shared schemas** — Faction/Social reputation overlap needs resolution. ✅ RESOLVED 2026-08-15 — canonical `ReputationScore` enforced in `src/schemas/reputation.ts`, consumed by Social (`src/nsfw/social-integration.ts`), Faction + NSFW (`src/rpg/integration-registry/edges/*`), and referenced in Faction/Social/Crime Integration Points; `ConsentState` + `NSFWContentRating` enforcement also live (`src/schemas/consent.ts`, `src/schemas/nsfw-rating.ts`). Tests added 2026-08-15: 49 tests across `src/schemas/*.test.ts` + `src/nsfw/social-integration.test.ts` + `src/middleware/nsfw-gate/consent.test.ts` (schema calc, consent transitions, rating enforcement, Social+NSFW reputation, DB-backed gate). Migration tests N/A — in-memory schemas (see epic-shared-schemas). Type dedup done 2026-08-15: divergent `src/nsfw/integration-schemas/` cluster + housing/weather/disease scaffolding deleted (zero importers, divergent shapes); `applyReputationChange`/`applyReputationDecay` moved to canonical schema; `social-integration.ts` now consumes canonical types only.

## Cross-Cutting Capabilities from Emergent Platforms (2026-08-14)

> Extension of the matrix beyond the 17 RPG sub-systems, informed by the **emergent
> rpg/agentic/creative platform sweep** (inspiration sources, not competitors — see
> `docs/ideas/emergent-platform-landscape-2026.md` and `epic-platform-research.md`
> candidates 13–18). These are **cross-cutting capabilities** that touch several matrix
> systems rather than single pairwise gaps. All are **P6+ deferred** under the 0.1.0
> alignment unless marked; none block P3–P5. Revisit when P6+ RPG work starts.

| # | Capability | Touches matrix systems | Inspiration source | Recommended action | Severity |
| -- | ---------- | ---------------------- | ------------------ | ------------------ | -------- |
| G18 | **Agentic NPC autonomy** (memory + goals + emotion + autonomous action) | Battle, Social, Narrative, CharCore, Companion | Inworld AI, Convai, generative-agents | Turn `npcs`/`battle` NPC-AI from scripted toward goal/memory-driven. P6+, fold into existing actor/NPC epics (no new epic). | 🔴 High (future) |
| G19 | **Agent-memory scoring** (recency×importance×relevance + reflection) | RPG, Social, Narrative, CharCore | generative-agents, RisuAI HypaMemory, Kindroid | Upgrade `memory` purge/decay toward a scored model shared by all character-facing systems. P6+. | 🟡 Medium (future) |
| G20 | **Living-world persistence across time + between sessions** | Weather, Economy, Faction, Social, Narrative, Exploration | AI Town, Nomi, AI Dungeon | Extend `world_events`/`timeline` + "world continues without you" (#14). P6+. | 🟡 Medium (future) |
| G21 | **Asset-consistency generation** (reference conditioning + in-chat edit) | CharCore, Exploration, Narrative, Housing, Weather | Luma, Runway, Krea, RisuAI dynamic-assets | Keep a character/scene's look across generated images; in-chat img-edit. **Med difficulty, do not defer** — clean pull candidate. | 🟢 Low |
| G22 | **Event-driven automation** (Quick-Replies / auto-execute on startup/user/ai) | All (cross-cutting) | SillyTavern Quick Replies, RisuAI dynamic-* | Event-triggered slash-command/regex automation — cheap, pure frontend, 0.1.0 quick-win candidate. | 🟢 Low |
| G23 | **Dynamic memory/messages** (assistant writes memory notes mid-response; multi-message) | CharCore, Memory, Narrative | RisuAI | Extend the shipped tool-call SSE toward durable in-chat memory writes — 0.1.0 quick-win candidate. | 🟢 Low |

**0.1.0 note:** G21, G22, G23 are the only rows with **no P6+ blocker** — they are the
emergent-sweep quick wins achievable during 0.1.0 (see `backlog/priority.md` quick-win
section). G18–G20 are P6+ cross-enhancements with deferred siblings.

---

## Pre-Compiled Hot Binary Modules Integration

### Systems This Epic Depends On

| System                        | What It Provides                               | How Used                    |
| ----------------------------- | ---------------------------------------------- | --------------------------- |
| Testing & Benchmarking        | Performance benchmarks for native modules      | Measure native vs JS speed  |
| Multi-Instance Reconciliation | Native module initialization in multi-instance | Binary loading per instance |

### Systems That Depend On This Epic

| System                           | What It Consumes          | How Used                         |
| -------------------------------- | ------------------------- | -------------------------------- |
| Headless & Alternative Frontends | SDK distribution strategy | Native modules in SDK packages   |
| Testing & Benchmarking           | Native module benchmarks  | Performance regression detection |

### Shared Data Contracts

| Contract       | Shared With    | Purpose                                   |
| -------------- | -------------- | ----------------------------------------- |
| ModuleManifest | Security audit | Binary verification + capability checking |

### Cross-System Events

| Event           | Direction | Purpose                                 |
| --------------- | --------- | --------------------------------------- |
| binary.loaded   | emits     | Notify system when native module loaded |
| binary.fallback | emits     | Notify system when falling back to JS   |

## Research-Driven Integration Gaps (2026-08-14)

> Gaps identified from research on agentic NPC systems (Inworld AI, generative-agents, Convai, RisuAI). All are **P6+ deferred** under 0.1.0 alignment. Revisit when P6+ RPG work starts.

| #  | System A                    | System B                    | Current State                                                                                                    | Recommended Action                                                                                              | Severity |
| -- | --------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| G27 | **BDI Planning**            | **Character Internal Traits** | BDI planning loop (`TASK-npc-bdi-planning.md`) needs aspiration data; internal traits (`epic-character-internal-traits.md`) defines aspirations but no planning integration.     | Aspirations drive daily planning; trait values affect plan priorities. Bidirectional cross-ref needed.           | 🟡 Medium |
| G28 | **BDI Planning**            | **Mood/Happiness**          | BDI planning loop needs mood data for plan priorities; mood system (`TASK-character-mood-happiness.md`) exists but no planning integration.                                      | Mood affects plan priorities and reaction mode selection. Cross-ref needed.                                     | 🟡 Medium |
| G29 | **NPC-to-NPC Social**       | **Relationships**           | NPC-to-NPC social sim (`TASK-npc-to-npc-social.md`) needs relationship strength; relationship system (`TASK-character-relationships.md`) exists but no NPC-to-NPC integration. | Relationship strength drives interaction probability; conversations affect relationship evolution.               | 🟡 Medium |
| G30 | **NPC-to-NPC Social**       | **Memory Architecture**     | NPC-to-NPC social sim needs episodic memory for conversation topics; memory system exists but no social integration.                                                            | Episodic memories provide conversation topics; conversations generate new episodic memories.                     | 🟡 Medium |
| G31 | **Agent Memory Scoring**    | **Emotion Impact**          | Agent memory scoring (`TASK-agent-memory-scoring.md`) needs emotional valence; emotion impact (`TASK-memory-emotion-impact.md`) exists but no scoring integration.               | Emotional memories get importance boost in scoring model. Cross-ref needed.                                     | 🟡 Medium |
| G32 | **Living-World Persistence** | **BDI Planning**           | Living-world persistence (`TASK-living-world-persistence.md`) needs NPC schedules; BDI planning (`TASK-npc-bdi-planning.md`) provides daily plans but no between-session integration. | NPC daily plans advance between sessions; world events interrupt plans.                                         | 🟡 Medium |
| G33 | **Living-World Persistence** | **Relationships**          | Living-world persistence needs relationship drift; relationship system exists but no between-session integration.                                                               | Relationships drift over elapsed time; catch-up summary includes relationship changes.                           | 🟡 Medium |
| G34 | **Voice Profile**           | **Mood/Happiness**          | Voice profile system (`TASK-character-voice-profile.md`) needs mood data; mood system exists but no voice integration.                                                          | Mood modulates voice parameters (verbosity, pace, formality). Cross-ref needed.                                 | 🟡 Medium |
| G35 | **Voice Profile**           | **Character Growth**        | Voice profile system needs growth data; character growth (`TASK-character-growth-development.md`) exists but no voice integration.                                               | Voice evolves with character growth; milestones can unlock new speech patterns.                                 | 🟠 Low |
| G36 | **Character Growth**        | **Internal Traits**         | Character growth system needs trait data; internal traits exist but no growth integration.                                                                                      | Personality maturation affects trait values; growth events trigger trait shifts.                                 | 🟡 Medium |
| G37 | **Character Growth**        | **Relationships**           | Character growth system needs relationship data; relationship system exists but no growth integration.                                                                          | Relational milestones drive growth events; growth affects relationship dynamics.                                | 🟡 Medium |

### Research Cross-Reference Map

| Research Extension                    | Platform Candidate | Maps to Gap(s)     | Related Tickets                              |
| ------------------------------------- | ------------------ | ------------------ | -------------------------------------------- |
| PAD Emotional Model                   | E1                 | G28, G34           | TASK-character-mood-happiness.md             |
| Memory Architecture (4-tier)          | E2                 | G30, G31           | TASK-agent-memory-scoring.md, FEAT-memory-systems-three-tier.md |
| NPC-to-NPC Social Sim                 | E1                 | G29, G30           | TASK-npc-to-npc-social.md                    |
| BDI Goal-Pursuit Loop                 | E1                 | G27, G28, G32      | TASK-npc-bdi-planning.md                     |
| Voice & Speech Profiles (D10)         | E5                 | G34, G35           | TASK-character-voice-profile.md              |
| Dynamic Relationship Evolution        | E1                 | G29, G33, G37      | TASK-character-relationships.md              |
| Character Growth & Development        | E1                 | G35, G36, G37      | TASK-character-growth-development.md         |
| Living-World Between-Session          | E3                 | G32, G33           | TASK-living-world-persistence.md             |
| AI Director / Narrative Pacing        | E1                 | (in epic-assistant-gm-flows.md) | N/A (deferred)                  |
| Proactive Messaging (Nomi.ai)         | E7                 | G38, G39           | TASK-proactive-messaging.md                |
| Keyphrase-Triggered Recall (Kindroid) | E7                 | G40                | TASK-keyphrase-recall.md                   |
| Quiet Hours & Anti-Spam (Nomi.ai)     | E7                 | G39                | TASK-quiet-hours.md                        |
| Inner Monologue (Convai)              | E10                | G41                | TASK-inner-monologue.md                    |
| Tool-Calling / MCP Agents (Convai)    | E8                 | G42                | TASK-tool-calling-agents.md                |
| Emotional Pattern Tracking (Kindroid) | E2                 | G31                | TASK-memory-happiness-patterns.md          |
| Reflection Synthesis (Stanford)       | E2                 | G19, G31           | TASK-agent-memory-scoring.md               |

> **0.1.0 note for G38–G42:** **G38–G40 pulled forward to 0.1.0 Quick Wins (2026-08-15)**
> per the agentic-features addendum below ("Quick win (0.1.0)") — proactive messaging,
> quiet hours, keyphrase recall all have tickets and build on shipped memory/notification
> infra; tracked in `backlog/priority.md` § 0.1.0 Quick Wins items 13–14. **G41 (inner
> monologue) + G42 (tool-calling) remain P6+ deferred** — they depend on completed
> memory/assistant architecture. G42 has the broadest impact (touches all systems) and
> should be revisited first when P6+ agentic work begins. G31 emotional-pattern tracking
> now has ticket `TASK-memory-happiness-patterns.md` (created 2026-08-15); G27/G36
> internal-traits dep now has `TASK-character-internal-traits.md`.

| #  | System A                    | System B                    | Current State                                                                                                    | Recommended Action                                                                                              | Severity |
| -- | --------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| G38 | **Proactive Messaging**     | **Memory**                  | Proactive messaging (`TASK-proactive-messaging.md`) needs memory for topic selection, relevance scoring; memory system has no proactive integration. | Proactive selects topics from high-importance recent memories; memory salience drives proactive trigger. Bidirectional cross-ref needed. | 🟡 Medium |
| G39 | **Proactive Messaging**     | **Time Scale**              | Proactive messaging needs game-time for quiet hours, world-event awareness; time scale has no proactive integration. | Game-time drives quiet hours (night = low frequency); world events as proactive triggers. Cross-ref needed. | 🟡 Medium |
| G40 | **Keyphrase Recall**        | **Chat**                    | Keyphrase-triggered recall (`TASK-keyphrase-recall.md`) needs chat context for trigger detection; chat has no keyphrase integration. | Chat service emits token stream for keyphrase matching; matched keyphrases inject journal memories into context. Cross-ref needed. | 🟡 Medium |
| G41 | **Inner Monologue**         | **Narrative** × **Memory**  | Inner monologue (`TASK-inner-monologue.md`) needs episodic memory for reflection and narrative voice for tone; neither system has inner-monologue integration. | Inner monologue reflects on recent episodic memories; narrative voice modulates internal narration. Cross-ref needed. | 🟠 Low |
| G42 | **Tool-Calling / MCP**      | **All RPG Systems**         | Tool-calling agents (`TASK-tool-calling-agents.md`) need structured access to inventory, combat, quest, social; no MCP/tool schema exists. | Define tool schemas for each RPG subsystem; tool-calling agent invokes RPG actions via structured interface. Broadest integration gap — touches entire matrix. | 🔴 High (future) |

### Research Cross-Reference Map (Agentic Features Addendum)

| Feature | Source Platform(s) | Priority | Maps to Gap(s) | Related Tickets |
| --- | --- | --- | --- | --- |
| Proactive messaging (4 freq levels + quiet hours) | Nomi.ai | Quick win (0.1.0) | G38, G39 | TASK-proactive-messaging.md, TASK-quiet-hours.md |
| Keyphrase-triggered journal recall | Kindroid | Quick win (0.1.0) | G40 | TASK-keyphrase-recall.md |
| Reflection / memory synthesis | Stanford generative-agents, RisuAI | P6+ | G19, G31 | TASK-agent-memory-scoring.md |
| Emotional pattern tracking | Kindroid | Medium | G31 | TASK-memory-happiness-patterns.md |
| Inner monologue (dual-mind) | Convai | P6+ | G41 | TASK-inner-monologue.md |
| Tool-calling via MCP connectors | Convai | P6+ | G42 | TASK-tool-calling-agents.md |
