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

| #  | System A       | System B                    | Current State                                                                                                                                                               | Recommended Action                                                                                              |
| -- | -------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| G1 | **Battle**     | **Items/Inventory**         | Battle uses "Use item" as action type but never references `epic-item-system-extensions` or inventory for loadout/equipment management. No loot-drop-to-inventory pipeline. | Add integration: equipment affects battle stats, loot drops feed inventory, item durability degrades in combat. |
| G2 | **Battle**     | **Social Interaction**      | Social lists "Intimidation in combat" as integration; Battle never mentions social skills as combat options (taunt, negotiate, surrender).                                  | Add integration: social checks during combat for morale breaks, surrender, intimidation effects.                |
| G3 | **Battle**     | **NPC/Actor System**        | Battle has NPC enemies but never references Actor system for personality-driven AI, morale, memory of past defeats.                                                         | Add integration: NPC actors drive enemy decisions, morale system from Social applies in combat.                 |
| G4 | **Battle**     | **Weather/Terrain**         | Weather lists "Combat System" integration; Battle never references weather/terrain modifiers.                                                                               | Add integration: environmental combat modifiers from Weather system, terrain cover from Exploration.            |
| G5 | **Resolution** | **All Combat/Social/Magic** | Resolution claims to unify dice resolution but has no integration section. Never references Battle, Social, Magic, or RPG.                                                  | Add integration section referencing all systems that use dice resolution.                                       |

### 🟡 Medium — One-way links or missing cross-references

| #   | System A     | System B      | Current State                                                                                                         | Recommended Action                                                                                           |
| --- | ------------ | ------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| G6  | **NSFW**     | **Housing**   | NSFW defines NSFWLocation types (bedroom, bath); Housing provides private spaces. Neither references the other.       | Add integration: housing provides private spaces with comfort bonuses for NSFW encounters.                   |
| G7  | **NSFW**     | **Weather**   | NSFW defines location modifiers; Weather defines environmental mood. Neither references the other.                    | Add integration: weather affects NSFW encounter mood and location availability.                              |
| G8  | **NSFW**     | **Social**    | NSFW seduction/reputation overlap with Social's reputation and persuasion. Neither cross-references.                  | Add integration: social skills (persuasion, deception) are seduction prerequisites; shared reputation model. |
| G9  | **NSFW**     | **Disease**   | Pregnancy/reproduction never references Disease for reproductive health ailments.                                     | Add integration: disease system covers reproductive health, STDs from NSFW encounters.                       |
| G10 | **Housing**  | **Companion** | Housing has animal pens but never references Companion for stable mechanics, pet housing, mount stables.              | Add integration: companion housing, pet room bonuses, mount stable from Housing.                             |
| G11 | **Crafting** | **Magic**     | Magic says "Enchanting uses crafting mechanics"; Crafting never mentions Magic for enchanted items.                   | Add integration: enchanting as cross-system feature between Crafting and Magic.                              |
| G12 | **Crime**    | **Economy**   | Crime references Economy (bounties, black market); Economy now references Crime (black market pricing, stolen goods). | **RESOLVED** — bidirectional cross-refs added.                                                               |
| G13 | **Crime**    | **Social**    | Both reference each other: Crime lists Social for reputation flow; Social lists Crime for skill overlap.              | **RESOLVED** — bidirectional cross-refs added.                                                               |

### 🟠 Low — Missing links between peripheral systems

| #   | System A      | System B     | Current State                                                                                         | Recommended Action                                                          |
| --- | ------------- | ------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| G14 | **Faction**   | **Social**   | Both reference each other; Faction now has Integration Points with shared ReputationScore note.       | **RESOLVED** — shared schema documented in Faction integration section.     |
| G15 | **Disease**   | **Weather**  | Weather lists disease (plague zones); Disease now references Weather for transmission conditions.     | **RESOLVED** — Disease epic updated with weather transmission cross-ref.    |
| G16 | **Companion** | **Battle**   | Companion references Battle; Battle now lists Companion in dependents table with participation rules. | **RESOLVED** — Battle epic dependents table includes Companion.             |
| G17 | **RPG**       | **CharCore** | RPG now references Character Core in Related Epics with ownership clarification.                      | **RESOLVED** — RPG epic updated with CharCore cross-ref and ownership note. |

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

These epics have `## Related Epics` but no `## Integration Points`:

| Epic                                | Related Epics Listed                                                     | Missing Integration                         |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| `epic-battle-action-systems.md`     | RPG Mechanics, World & Locations                                         | Items/Inventory, Social, NPC/Actor, Weather |
| `epic-nsfw-game-mechanics.md`       | RPG Mechanics, Battle, World, Logic Reconciliation, Plugin, Assistant/GM | Housing, Weather, Social, Disease           |
| `epic-resolution-system.md`         | (none formal)                                                            | Battle, Social, Magic, RPG                  |
| `epic-companion-pet-mount.md`       | RPG Mechanics, Battle, World, Actor                                      | Housing, Disease, NSFW                      |
| `epic-emergent-narrative-design.md` | (minimal)                                                                | All systems (narrative touches everything)  |

## Recommendations

1. **Battle epic priority** — Most impactful gap. Battle is the hub that touches most systems but references few. Recommend adding full integration section before implementation begins.

2. **NSFW epic** — Second priority. 848 lines of mechanics with no Housing, Weather, Social, or Disease cross-references. These affect encounter design.

3. **Resolution System** — Foundational. If this is truly a unified resolution layer, it MUST reference every system that resolves actions (Battle, Social, Magic, Crime, Exploration).

4. **Standardize templates** — All 17 RPG sub-system epics should use the template above. Current integration sections are bullet lists; the template adds contracts and events.

5. **Shared schemas** — Faction/Social reputation overlap needs resolution. Two systems defining `reputation` differently will cause conflicts at implementation time.

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
