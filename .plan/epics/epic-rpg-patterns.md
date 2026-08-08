# EPIC: Flexible RPG Patterns

**Status:** ⬜ Not Started
**Priority:** Medium

## Summary

Design patterns for toggleable, composable, world-configable RPG mechanics.
Ensures subsystems can be disabled per world/setting without code changes.

## Scope

- Toggle pattern for per-world RPG config
- Plugin pattern for RPG subsystem registration
- Resolution chain pattern for action processing
- State machine pattern for player/entity states
- Effect system for temporary/permanent modifiers
- Event-driven inter-subsystem communication

## Related Epics

- `epic-rpg-mechanics.md`
- `epic-plugin-system.md`
- `epic-resolution-system.md`

## Tickets

_TBD — create implementation tickets._

---

## Merged from `.plan/epics/epic-rpg-patterns.md`

# Research-Driven Roadmap (RPG / Text-RPG Prior Art)

> Derived from `.plan/epics/epic-rpg-patterns.md` (historical survey + non-AI mechanics).
> Maps research insights → planning artifacts with priorities. Companion to
> `rpg-implementation-roadmap.md`.

## Priority legend

- **P0** — blocking / must decide before building dependent systems
- **P1** — high-value new capability, schedule next
- **P2** — enrichment / tracking, opportunistic

## P0 — Foundational decisions (do first)

| Item                         | Artifact                                                           | Why                                                                      |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Resolution family decision   | TASK-resolution-family-decision → epic-resolution-system           | Blocks battle-mode + rpg-mechanics resolution work                       |
| Moderation design principles | TASK-ai-dungeon-moderation-lesson → epic-chat-lifecycle-moderation | Privacy-first stance must be set before launch; AI Dungeon 2021 backlash |
| Persistence model            | epic-multi-session (existing) + research §4.3/§7.2                 | MUD1 persistence is the substrate for everything                         |

## P1 — High-value new epics (schedule next)

| Item                                          | Artifact                                               | Value                                                       |
| --------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Factions, reputation, persistent consequences | epic-faction-reputation + TASK-faction-standing-schema | Social layer that predates engines; Undertale-style meaning |
| Player agency (story points)                  | epic-agency-story-points + TASK-story-points-prototype | Chat-RPG agency without over-determining LLM                |
| Emergent narrative design lens                | epic-emergent-narrative-design                         | Cross-cutting principle guarding mode-switch design         |
| Resolution implementation                     | epic-resolution-system (after decision)                | Concrete ruleset for dice/combat                            |

## P2 — Enrichment & tracking (opportunistic)

| Item                                | Artifact                                                    | Value                                       |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Inspiration watch (Voyage)          | TASK-track-voyage-inspiration → epic-platform-research      | Inspiration signal                          |
| Enrich existing epics via cross-ref | rpg-landscape.md §11                                        | Discoverability for 20+ epics               |
| Crafting/economy scaffolding        | epic-crafting-professions + epic-economy-trading (existing) | Research §6.5 → reputation-gated blueprints |
| Local-first ownership principle     | AGENTS / architecture                                       | SillyTavern stance loop-lore inherits       |

## Suggested sequence

1. **Now:** resolve P0 decisions (resolution family, moderation principles).
2. **Next milestone:** ship faction-standing schema + story-points prototype (P1) —
   these are the two most novel, research-unique contributions.
3. **Then:** implement resolution family; apply emergent-narrative lens to mode-switch
   work; track Voyage.

## Open questions carried from research (§10)

- Social-RP vs adventure as primary mode?
- Roguelike mechanics: optional mode switch or core?
- Single unified resolution system or dual-mode?
- Story points: introduce yes/no?
- Crafting scope: full auction house vs lightweight scarcity?


---

## Merged from `.plan/epics/epic-rpg-patterns.md`

# Research: ROGs & Text RPGs — Prior Art Before loop-lore

**Scope:** Survey of text-based roleplay/roleplaying games (ROGs) and text RPGs that
existed or exist, as predecessor context for loop-lore (a SillyTavern-class
reimplementation). Covers: MUD lineage → AI-Dungeon-class LLM RPGs → modern
AI roleplay platforms → roguelike/roguelite design vocabulary.

**Date:** 2026-07-20
**Status:** research-only (no implementation)

---

## 1. Taxonomy of "Text RPG" / "ROG"

The term spans three distinct lineages that all converge on loop-lore's design space:

| Lineage                                  | Era   | Medium            | Key trait                                       |
| ---------------------------------------- | ----- | ----------------- | ----------------------------------------------- |
| **Tabletop RPG** (TTRPG)                 | 1974+ | Physical          | D&D; GM + dice; collaborative storytelling      |
| **Text adventure / Interactive Fiction** | 1975+ | Single-player     | Parser commands; exploration + puzzle           |
| **MUD / MU\*** (multi-user)              | 1978+ | Networked, telnet | Persistent shared worlds; combat OR social RP   |
| **AI-Dungeon-class LLM RPG**             | 2019+ | Cloud/web         | LLM as dungeon master; free-form generation     |
| **AI roleplay chat platforms**           | 2022+ | Cloud/web         | Character cards; lorebooks; group chat          |
| **Roguelike / roguelite**                | 1980+ | Video game        | Permadeath + procedural gen (design vocabulary) |

loop-lore sits at the intersection of **MUD social-RP**, **AI-Dungeon free-form
generation**, and **AI-roleplay-chat** (character cards / lorebooks / group chat),
with optional **roguelike** mechanics (RPG stats, combat, inventory, dice).

---

## 2. Historical Lineage (pre-LLM)

### 2.1 Tabletop origin (1974)

- **Dungeons & Dragons** (Gygax & Arneson, TSR, 1974) — first commercial RPG.
  Established character creation, stats, classes, GM role, campaign settings.
- Directly inspired the naming of MUD ("Multi-User **Dungeon**").

### 2.2 Text adventures / Interactive Fiction (1975–)

- **Colossal Cave Adventure** (Crowther & Woods, 1975) — template for exploration/combat/progression.
- **Zork** (1977), **Planetfall**, **The Hobbit**, **Hitchhiker's Guide** — parser-driven.
- **Akalabeth** (1980) & **Rogue** (1980) — first role-playing video games; Rogue
  spawned the roguelike genre.

### 2.3 MUDs and the MU\* family (1978+)

- **MUD1** (Trubshaw & Bartle, Univ. of Essex, 1978) — first multi-user dungeon.
  Ran on Essex network until 1987, then CompuServe (first commercial online game).
  _Innovation: persistence_ — world state survives across sessions.
- Server families:
  - **LPMud / DikuMUD** — combat-focused games.
  - **TinyMUD family (MU\*)** — social MUDs, role-play, educational; Turing-complete
    in-game languages.
  - **MOO / MUCK / MUSH** — social/virtual-RP environments (Second Life precursors).
- Bartle's Player Types (achievers/explorers/socializers/killers) — foundational
  game-design theory from this era.
- **Design debt inherited by all MMORPGs:** persistence, shared world, scoring,
  quests, combat, community. (Bartle: "MMORPGs are direct descendants of 1980s
  textual worlds.")

### 2.4 Play-by-post / forum / IRC RP

- Human-moderated, async. No engine — reputation + consent systems govern play.
- Variants in East Asia: Japanese _annkosure_, Chinese _national policy_ (国策).
- Relevant to loop-lore: **consent, rules/etiquette, moderation, reputation** are
  social-layer problems predating any engine.

---

## 3. The LLM rupture: AI Dungeon (2019)

**AI Dungeon** (Latitude; Nick Walton) — the first mainstream LLM-powered text RPG.

- **May 2019:** AI Dungeon Classic — GPT-2 (117M params), hackathon project.
- **Dec 2019:** AI Dungeon 2 — full GPT-2 (1.5B); Google Colab; went viral
  (100k+ users week 1).
- **2020:** GPT-3 early access → major coherence jump.
- **2021:** Content-moderation controversy (filter on minor-related content) →
  privacy backlash → pivot to AI21 Labs + clarified consensual-NSFW policy.
  _Directly relevant to loop-lore's NSFW/moderation epic._
- **2022–23:** "Phoenix" rebuild (custom Dragon model, ChatGPT integration).
- **2024–25:** "Renaissance" — Mixtral, Mythomax, DeepSeek V3; larger context windows.
- **2026:** **Voyage** launched — open framework for creators to build worlds with
  sophisticated RPG mechanics + AI narrative. (Latitude's own evolution toward
  loop-lore's "worlds + RPG mechanics + AI" space.)

**AI Dungeon interaction model (predates loop-lore's message actions):**

- `Do` (verb/action), `Say` (dialogue), `Story` (narrate), `See` (perceive → image).
- Undo / redo / modify recent events.
- "Remember" mechanic — explicit memory injection (ancestor of lorebooks/memories).
- **Community Worlds** — user-uploaded shareable frameworks (lore, characters,
  locations, rules). _Direct ancestor of loop-lore Worlds + shareability epic._

**Compute note (Walton):** AI Dungeon ~100× more compute-intensive than AAA game.
Relevant to loop-lore's generation/cancellation/streaming architecture.

---

## 4. AI Roleplay Chat Platforms (2022–2026)

The dominant modern form. loop-lore (SillyTavern reimplementation) competes here.

### 4.1 SillyTavern / TavernAI (the direct ancestor)

- **TavernAI** (Feb 2023) → forked by Cohee1207 → **SillyTavern** (Apr 2023).
- 25k+ GitHub stars, 300+ contributors; v1.17+ (2026).
- **Defined the modern toolkit:** character cards (personality/backstory),
  lorebooks (world context injection), deep prompt control, group chats,
  TTS extensions, conversation branching, import/export.
- Multi-backend: OpenAI, Claude, KoboldAI, Ollama, OpenRouter, local models.
- **Local-first, no content filters on local models** — the philosophical
  position loop-lore inherits (user ownership, self-host).

### 4.2 Hosted competitors (2026 landscape)

| Platform                                                      | Position                                         | Note                |
| ------------------------------------------------------------- | ------------------------------------------------ | ------------------- |
| Character.AI                                                  | Largest library, SFW, text-only                  | Easy entry          |
| Janitor AI                                                    | Browser, NSFW-friendly                           | No install          |
| NovelAI                                                       | Long-form coherent writing + image gen; Lorebook | Story-quality focus |
| Kindroid                                                      | Emotional companion, complex memory              | Relationship RP     |
| DreamGen                                                      | World + story creation, CYOA, lore/rules         | Adventure focus     |
| Friends & Fables                                              | D&D-like, AI GM, 5e stats, real-time combat      | Tabletop bridge     |
| Chub AI / WyvernChat / FictionLab / Replika / Nomi / PolyBuzz | various niches                                   | —                   |
| RPGGO AI                                                      | 2D pixel world creation from NL; smart NPCs      | No-code game maker  |
| Inworld AI                                                    | Developer NPC tool (not a game)                  | Engine middleware   |
| TextRPG / The Asylum (Jenova)                                 | LLM-narrated text adventures, emergent NPCs      | Horror/emergent     |

**Common feature cluster (the category baseline loop-lore must meet):**
character creation + import/export, lorebook/world-info, group/multi-character chat,
memory/continuity, image generation, branching/regeneration, TTS, scenario presets.

---

## 5. Narrative Engine Tooling (adjacent)

For loop-lore's story/multi-LLM-GM layer:

- **Ink** (Inkle) — open-source branching narrative scripting; 80 Days, Heaven's Vault,
  Slay the Spire. Unity/Unreal/Godot. MIT.
- **Yarn Spinner** — screenplay-style dialogue; Night in the Woods, DREDGE. MIT/YSPL.
- **Arcweave** — visual branching, collaborative, AI assistant.
- **Sudowrite** — fiction AI (Story Engine, worldbuilding cards).
- **NovelAI** — Lorebook for world consistency; Text Adventure mode.

These are _authoring_ tools; loop-lore's `src/story/` + `src/turning/` (TurnManager)
is the runtime equivalent — AI-driven rather than pre-scripted.

---

## 6. Roguelike / Roguelite Vocabulary

Relevant if loop-lore adopts RPG combat/inventory/dice mechanics (worlds-extension
epic: chat mode switches → battle/inventory).

- **Roguelike** (Berlin Interpretation, 2008): procedural generation, permadeath,
  turn-based, grid, hack's lineage (Rogue, NetHack, Angband, DCSS, Caves of Qud).
- **Roguelite:** permadeath + proc-gen BUT with meta-progression between runs
  (Hades, Dead Cells, Slay the Spire, Vampire Survivors, Brotato).
- **Sub-genres:** deckbuilders, auto-battlers, action/hack-n-slash, bullet-hell,
  roguevania (Dead Cells), soulslike (not roguelike — no permadeath/proc-gen).
- **Design takeaway for loop-lore:** permadeath + procedural generation + run-based
  progression are the recognizable "rogue" signals; a chat-RPG can borrow
  proc-gen (random encounters/loot) and permadeath (character death = run end)
  without being a grid crawler.

---

## 7. Patterns loop-lore Should Internalize

1. **Persistence** (MUD1, 1978) — world/character state outlives the session.
   → loop-lore DB layer, archival workflow.
2. **Character cards + lorebooks** (SillyTavern) — portable persona + world context.
   → `src/characters`, `src/personas`, world lore.
3. **Explicit memory / "Remember"** (AI Dungeon) — user-controlled context injection.
   → `src/story` memories, memory-system.md (3-tier).
4. **Community Worlds / shareable frameworks** (AI Dungeon, Voyage) — UGC ecosystems.
   → worlds-extension epic (shareability/license/attribution).
5. **Moderation & consent** (forum RP, AI Dungeon 2021) — social-layer safety.
   → chat-lifecycle-moderation epic (bans/NSFW/shadowing).
6. **Multi-character / group chat** (MU\*, SillyTavern) — many actors, turn order.
   → `src/group-chat`, `src/turning`.
7. **Local-first ownership** (SillyTavern) — self-host, no platform filters.
   → loop-lore architecture principle.
8. **RPG mechanics as optional mode** (Friends & Fables, Roguelite) — stats/combat/
   inventory as a _chat mode switch_, not the whole app.
   → worlds-extension epic (mode switches).

---

## 8. Source Index

- Bartle, R. "From MUDs to MMORPGs" (Springer, 2010) — MUD history/theory.
- Wikipedia: Online text-based role-playing game; History of role-playing games;
  Roguelike; AI Dungeon; GPT-3.
- Iron Realms "History of MUD Games" (2026); MassivelyOP "Brief history of MUDs" (2019).
- SillyTavern docs / EveryDev / Grokipedia — SillyTavern history & features.
- Latitude (AI Dungeon, Voyage) — company blog, SimilarLabs, TechCrunch 2026.
- DreamGen "Best AI Roleplay Chatbots 2026"; Cherrypop "18 Best AI Chatbots 2026".
- Agentic Game Development "Best AI Dialogue & Narrative Tools" (Ink/Yarn/Arcweave).
- rpggodotai "Best AI RPG Platforms 2025" (RPGGO, Inworld, Kindroid).
- Rogueliker / Destructoid / ScreenRant — roguelike vs roguelite definitions.
- Jenova "The Asylum" — emergent LLM-narrated text horror.

---

## 9. Non-AI Game Mechanics — Borrowable Systems

loop-lore is fundamentally a _chat_ app, but its RPG layer (stats, combat,
inventory, worlds) can adopt proven mechanics from non-AI games. This section
surveys the canonical systems and which are worth porting.

### 9.1 Core RPG mechanic cluster (the "four pillars")

From RPG design literature (GameDesignSkills, howtomakeanrpg), the irreducible
core of any RPG:

1. **Progression** — XP/levels, exponential curves (Runescape, WoW legacy,
   Diablo 3 formulas). Drives long-term investment.
2. **Combat** — real-time vs turn-based; resource management layered on active
   mechanics (abilities, weapons, enemy AI). Rewards + loot loop.
3. **Items & Inventory** — rarity tiers, encumbrance, item value → economy.
   Forces keep/sell/leave decisions (Fallout 4).
4. **Quests** — main / side / faction / allegiance; branching; meaningful
   rewards (narrative, gameplay, social). Pacing: balance exploration/combat/
   dialogue/downtime (Witcher 3, Skyrim, Mass Effect, Disco Elysium).

**loop-lore mapping:** pillars 1–4 map directly to `rpg-mechanics.md` (stats,
combat, equipment, dice, skills, XP, loot) and worlds-extension epic (mode
switches → battle/inventory). The chat is the _delivery channel_ for these
systems, not a replacement.

### 9.2 Stat systems — base vs derived

- **Base stats:** pure attributes (STR, DEX, CON, INT, WIS, CHA in D&D 5e;
  Agility/Smarts/Spirit/Strength/Vigor in Savage Worlds).
- **Derived stats:** computed from base + equipment + environment (total attack
  power = STR + weapon power). Combat simulation consumes derived stats.
- **Why stats exist:** abstraction to resolve "who wins" without atom-level
  simulation (howtomakeanrpg). loop-lore needs this abstraction for any
  battle mode switch.

### 9.3 Resolution mechanics — how a roll is made

Comparison of TTRPG resolution systems (EN World, TabletopRPGAuthority 2026):

| System               | Mechanic                           | Weight    | Narrative centrality | Genre              |
| -------------------- | ---------------------------------- | --------- | -------------------- | ------------------ |
| D&D 5e               | d20 + mod vs DC                    | Medium    | Medium               | Heroic fantasy     |
| Pathfinder 2E        | d20 + mod vs DC (4-degree)         | Heavy     | Medium-Low           | Tactical fantasy   |
| GURPS 4E             | 3d6 roll-under skill               | Heavy     | Low (simulation)     | Universal          |
| Call of Cthulhu 7E   | Percentile roll-under              | Medium    | Medium-Low           | Cosmic horror      |
| PbtA (Dungeon World) | 2d6 move, 7-9 cost / 10+           | Light     | High                 | Universal          |
| FATE Core            | dF + rating vs opposition          | Light-Med | High                 | Genre-flexible     |
| Savage Worlds        | skill die + wild die, both explode | Medium    | High                 | Universal          |
| Blades in the Dark   | d6 pool, Position/Effect           | Medium    | High                 | Heist/dark fantasy |
| Ironsworn            | d6 + d10 oracle                    | Light-Med | High                 | Solo Norse         |

**Design takeaway:** loop-lore's dice/GM layer (rpg-mechanics, assistant-GM)
should pick ONE resolution family. PbtA/FATE are narrative-light (fit chat-RPG);
GURPS/D&D are simulation-heavy (fit crunchy battle mode). A **dual-mode** (light
narrative default, heavy sim on battle-switch) mirrors the MU\* / AI-Dungeon split.

### 9.4 "Points" economies (meta-currency)

- **Bennies / Fate Points / Inspiration** — earned for good roleplay of traits,
  spent to reroll / invoke aspects / narratively edit story. (Savage Worlds,
  FATE, D&D Inspiration.) → loop-lore: a "story point" the player earns and
  spends to steer generation or retry rolls. Strong fit for chat-RPG agency.
- **Drama tokens** (FFG Narrative Dice) — passed between sides.

### 9.5 Crafting & economy (MMO lineage)

From MMO crafting research (JoyPlayX, MMOBomb, Game-Ace):

- **Recipe-based** (WoW, FFXIV) — gather + follow recipe.
- **Sandbox** (Albion, Star Wars Galaxies) — combine materials/attributes freely.
- **RNG/dynamic** (Black Desert) — roll for perfect stats.
- **Player-economy-driven** — blueprints via quests/reputation; professions/
  skill trees; crafting stations.
- **Auction house** — player-driven market; risks: bots, monopolies, inflation;
  mitigations: dynamic taxation, trade restrictions.
- **Emergent economy** (Ashes of Creation) — resource scarcity triggers economic
  chain reactions; interdependent recipe trees force cross-profession collaboration.
- **EVE Online** — single-shard player-driven economy; building ships is the
  central loop.

**loop-lore mapping:** worlds-extension epic's "location assets/items/resources
gen + tracking" is the primitive for crafting/economy. A full auction house is
out of scope, but **resource scarcity + crafting recipes + reputation-gated
blueprints** are valuable, low-cost additions that make worlds feel alive.

### 9.6 Factions, reputation, territory

- **Factions** control territory, give quests, have own storylines; player
  allegiance shapes experience (MMO template, Summer Engine).
- **Reputation** as social currency (forum RP reputation systems; MMO
  faction standing).
- **Territory control** → persistent geopolitical narrative (Ashes of Creation);
  conquered strongholds become persistent metropolises.
- **loop-lore:** worlds can have factions with standing tracked per character;
  player choices shift faction standing → alters available quests/NPCs. This is
  the _social_ layer that predates engines (see §2.4 consent/reputation).

### 9.7 Emergent gameplay & player agency (the high-value target)

- **Emergence** = complex situations from interaction of simple mechanics
  (Wikipedia; MoldStud; numberanalytics). Intentional since D&D/Cosmic Encounter.
- **Immersive sims** (Deus Ex, System Shock) — give tools + consistent rules,
  no enforced solution; players invent unforeseen solutions.
- **Non-binary mechanics** (Design Lab) — gradations (suspicion meter, gradual
  door) expand possibility space vs binary states.
- **Player-driven emergence** (emergentmind, 2026) — players become causal agents
  producing novel narrative nodes beyond designer baseline; emergence rate
  rᵢ = |Eᵢ| / Nᵢ. Directly analogous to LLM-RPG: the AI + player co-author
  emergent narrative.
- **Dominant strategy problem** (Design Lab, 2026) — one over-effective playstyle
  collapses depth; must avoid in system design.
- **MDA framework** (Hunicke/LeBlanc/Zubek) — Mechanics → Dynamics → Aesthetics.
  Useful lens for loop-lore's mode-switch design.

**loop-lore mapping:** The whole value prop of AI-RPG is _emergent narrative_.
Non-AI emergence teaches loop-lore to: (a) provide simple consistent rules
(stats, dice, faction standing) so emergence has a substrate; (b) prefer
non-binary states (wounds/penalties over binary alive/dead); (c) avoid dominant
strategies; (d) let players earn "story points" to steer. This is the bridge
between MUD persistence + AI generation.

### 9.8 Progression math & Skinner-box caution

- Exponential XP curves common; Runescape/WoW/Diablo formulas differ in shape.
- **Caution (RPG-Progression):** Skinner-box alone burns players out; pair
  mechanics with _narrative reason to invest_. Undertale (pacifist vs genocide
  alters the world) is the exemplar — consequences persist.
- **loop-lore:** permadeath/run-end (roguelite) + persistent world consequences
  (Undertale-style) give progression meaning beyond number-go-up.

---

## 10. Synthesis — What loop-lore Should Borrow

| Mechanic                          | Source lineage                  | Adoption in loop-lore                         |
| --------------------------------- | ------------------------------- | --------------------------------------------- |
| Persistence                       | MUD1 (1978)                     | DB + archival; world state outlives session   |
| Character cards + lorebooks       | SillyTavern                     | `src/characters`, personas, world lore        |
| Explicit memory / Remember        | AI Dungeon                      | 3-tier memory system                          |
| Community worlds + shareability   | AI Dungeon, Voyage              | worlds-extension epic                         |
| Moderation / consent / reputation | Forum RP, AI Dungeon 2021       | chat-lifecycle-moderation epic                |
| Group / multi-actor chat          | MU\*, SillyTavern               | `src/group-chat`, `src/turning`               |
| Local-first ownership             | SillyTavern                     | architecture principle                        |
| Stats: base + derived             | howtomakeanrpg, D&D             | rpg-mechanics (battle mode)                   |
| Resolution: pick ONE family       | TTRPG comparison                | light narrative default / heavy sim on switch |
| Story points (Bennies/Fate)       | Savage Worlds, FATE             | player agency token to steer generation       |
| Quests: main/side/faction         | RPG quest design                | world quest frameworks                        |
| Crafting + resource scarcity      | MMO economy                     | worlds location resources                     |
| Factions + reputation + territory | MMO template                    | world factions, standing per character        |
| Emergent narrative + non-binary   | emergence theory, immersive sim | design lens for mode switches                 |
| Consequences persist (Undertale)  | progression caution             | roguelite run-end + world state               |

---

## 11. Open Questions for loop-lore

- Does loop-lore target **social RP (MU\* style)** or **adventure (AI Dungeon style)**
  as primary mode? SillyTavern is character-chat; AI Dungeon is adventure. The
  `docs/frontend/chat/` spec suggests both (User×Character, User×User, User×Assistant).
- Roguelike mechanics: confirmed optional (mode switch) or core? Worlds-extension
  epic leaves this as a switch, not default.
- **Resolution system:** adopt PbtA/FATE (narrative-light) as default and GURPS/D&D
  (simulation-heavy) only on battle mode switch? Or a single unified system?
- **Story points:** introduce a player-earned token to steer generation/retries?
- **Crafting/economy scope:** full auction house (out of scope) vs lightweight
  resource-scarcity + recipe + reputation-gated blueprints (recommended)?
- Voyage (Latitude, 2026) is the closest commercial cousin to loop-lore's full
  vision (creator worlds + RPG mechanics + AI). Worth tracking as inspiration reference.


---

## Merged from `.plan/epics/epic-rpg-patterns.md`

# RPG & Text-RPG Landscape: Historical Survey & Mechanics

> Reconciled research artifact for `loop-lore` (a clean reimplementation of the
> SillyTavern-class RPG-chat experience). Purpose: map the games and systems — living
> and defunct — that shaped roguelikes, text-based RPGs, MUDs, interactive fiction, and
> the modern LLM-chat RPG era, plus the _non-AI mechanics_ worth borrowing, so we can
> reuse durable design patterns and avoid re-learning old lessons.
>
> Compiled 2026-07-20. Merges two scratchpads: `rpg-landscape.md` (historical survey)
> and `research-rugs-text-rpgs.md` (taxonomy, platform landscape, mechanics deep-dive).
> Raw page bytes were indexed out-of-context; this is the synthesis.

---

## 1. Executive summary

- **Three lineages converge on "text RPG you live inside."** (a) _Procedural
  single-player_ dungeon crawlers → roguelikes (Rogue 1980). (b) _Multiplayer social
  worlds_ → MUDs (MUD1 1978) and their MU\* descendants. (c) _Tabletop_ D&D (1974) →
  GM + dice + collaborative storytelling. Interactive fiction (Adventure 1976) is the
  shared ancestor of (a) and (b).
- **The LLM rupture (AI Dungeon 2019 → SillyTavern 2023)** replaced hand-authored
  world simulation with a generative model as the dungeon master. Hard lessons:
  **content moderation, privacy, local-vs-cloud, context/lore management, and compute
  cost** — exactly the problems loop-lore is built to solve.
- **Non-AI mechanics are reusable substrate.** Persistence, character cards/lorebooks,
  explicit memory, stats (base+derived), a _single_ resolution family, story points,
  factions/reputation, crafting scarcity, and emergent (non-binary) narrative are all
  ported from prior art into loop-lore's RPG layer.

---

## 2. Taxonomy of "Text RPG" / "ROG"

| Lineage                                  | Era   | Medium            | Key trait                                       |
| ---------------------------------------- | ----- | ----------------- | ----------------------------------------------- |
| **Tabletop RPG** (TTRPG)                 | 1974+ | Physical          | D&D; GM + dice; collaborative storytelling      |
| **Text adventure / Interactive Fiction** | 1975+ | Single-player     | Parser commands; exploration + puzzle           |
| **MUD / MU\*** (multi-user)              | 1978+ | Networked, telnet | Persistent shared worlds; combat OR social RP   |
| **Roguelike / roguelite**                | 1980+ | Video game        | Permadeath + procedural gen (design vocabulary) |
| **AI-Dungeon-class LLM RPG**             | 2019+ | Cloud/web         | LLM as dungeon master; free-form generation     |
| **AI roleplay chat platforms**           | 2022+ | Cloud/web         | Character cards; lorebooks; group chat          |

loop-lore sits at the intersection of **MUD social-RP**, **AI-Dungeon free-form
generation**, and **AI-roleplay-chat** (character cards / lorebooks / group chat),
with optional **roguelike** mechanics (RPG stats, combat, inventory, dice).

---

## 3. Consolidated timeline

| Year    | Milestone                                                                        | Lineage               |
| ------- | -------------------------------------------------------------------------------- | --------------------- |
| 1974    | **Dungeons & Dragons** (Gygax & Arneson, TSR) — first commercial RPG             | tabletop              |
| 1975    | `pedit5` — first dungeon crawl (PLATO); `dnd` follows                            | single-player crawler |
| 1976–77 | _Colossal Cave Adventure_ (Crowther & Woods)                                     | interactive fiction   |
| 1978    | **MUD1** (Trubshaw & Bartle, Essex) — first multi-user dungeon                   | MUD                   |
| 1978    | _Moria_ (PLATO), _Avatar_ (PLATO)                                                | single-player crawler |
| 1979    | _Zork_ (Infocom) — ZIL/Z-machine                                                 | interactive fiction   |
| 1980    | **Rogue** (Berkeley) — ASCII, procedural, permadeath                             | roguelike             |
| 1982–85 | _Hack_ → _NetHack_; _Moria_ → _Angband_                                          | roguelike             |
| 1985    | **Ultima IV** — ethics/virtues, no antagonist                                    | Western CRPG          |
| 1987    | _AberMUD_ (Alan Cox) — first popular codebase; _NetHack_ released                | MUD / roguelike       |
| 1988    | _Ultima III_, _Wizardry_ popularize CRPGs                                        | Western CRPG          |
| 1989    | _TinyMUD_ (Aspnes); _LPMud_ (Pensjö, LPC)                                        | MUD / MU\*            |
| 1990    | **DikuMUD** → CircleMUD/Merc/ROM/SMAUG; _Angband_; _MUSH_                        | MUD                   |
| 1993    | _ADOM_ (Ancient Domains of Mystery)                                              | roguelike             |
| 1997    | _Fallout_ (S.P.E.C.I.A.L.); _Ultima Online_ (skill-based sandbox); _Deus Ex_ dev | CRPG / MMO            |
| 1998    | _Baldur's Gate_ (CRTwP, AD&D)                                                    | CRPG                  |
| 2006    | _Dungeon Crawl Stone Soup_ (DCSS); _Dwarf Fortress_                              | roguelike             |
| 2008    | **Berlin Interpretation**; _Spelunky_                                            | roguelike / roguelite |
| 2011    | _The Binding of Isaac_; _Dungeons of Dredmor_                                    | roguelite             |
| 2012    | _FTL_                                                                            | roguelite             |
| 2018    | _Hades_                                                                          | roguelite             |
| 2019    | **AI Dungeon** (Nick Walton, GPT-2)                                              | LLM chat RPG          |
| 2020    | AI Dungeon _Dragon_ (GPT-3); moderation controversy (2021)                       | LLM chat RPG          |
| 2021    | **NovelAI** (Anlatan, SaaS)                                                      | LLM storywriting      |
| 2023    | **TavernAI** frontend; **SillyTavern** forks it (Feb 2023)                       | LLM chat frontend     |
| 2024    | SillyTavern adds RAG/lorebooks, group chats, memory plugins                      | LLM chat frontend     |
| 2025    | SillyTavern v1.15 (Dec 2025); AI Dungeon **Voyage** (creator worlds)             | LLM chat frontend     |

---

## 4. Historical lineages (pre-LLM)

### 4.1 Tabletop origin (1974)

- **Dungeons & Dragons** established character creation, stats, classes, the GM role,
  and campaign settings. Directly inspired the naming of MUD ("Multi-User **Dungeon**").

### 4.2 Text adventures / Interactive Fiction

- **Colossal Cave Adventure** (1976–77, Crowther & Woods) — first well-known IF;
  verb-noun parser ("open mailbox"); established exploration/combat/progression.
- **Zork** (1979+, Infocom) — first widely commercially released text adventure.
  Written in **ZIL** (Zork Implementation Language), compiled to the **Z-machine**
  bytecode VM — port-once-run-anywhere, with a full-sentence parser (not just
  verb-noun). The direct ancestor of the LLM chat interface, but with _matching_
  instead of _generation_.
- **Adventureland** (1978, Scott Adams); **The Hobbit** (1982); **Softporn Adventure**
  (1981, inspired _Leisure Suit Larry_).
- **Development systems**: _Inform_ (Z-machine + later VMs), _TADS_ — still used to
  author parser IF today.
- **Lesson**: the parser was the original natural-language interface.

### 4.3 MUDs and the MU\* family (1978+)

- **MUD1** (Trubshaw & Bartle, Univ. of Essex, 1978) — first multi-user dungeon; ran
  on the Essex network until 1987, then CompuServe (first commercial online game).
  _Innovation: persistence_ — world state survives across sessions. Named after Zork's
  "Dungeon." Written in MUDDL, later BCPL then C++.
- **Codebase family tree**:
  - **AberMUD** (1987, Alan Cox) — first _popular_ codebase; ported to C in 1988,
    spread across Unix; inspired TinyMUD, LPMud, DikuMUD.
  - **TinyMUD** (1989, James Aspnes) — stripped-down social world; spawned TinyMUCK
    (MUF language), TinyMUSH (expanded commands). The "D" distanced from combat.
  - **LPMud** (1989, Lars Pensjö) — combined TinyMUD's flexibility with AberMUD's
    gameplay via an object-oriented C-like language (**LPC**) and a driver/VM.
    Descendants: MudOS. Dominant in early-90s.
  - **DikuMUD** (1990) — combat-focused; explosion of derivatives: **CircleMUD, Merc,
    ROM, SMAUG, GodWars**. Directly influenced early MMORPGs (_EverQuest_).
- **MU\* taxonomy** (what you do when you log in):

  | Label    | Typical focus            | Content source         | Default loop                            |
  | -------- | ------------------------ | ---------------------- | --------------------------------------- |
  | **MUD**  | Mechanics & advancement  | Mostly staff-authored  | hunt, quest, train, optimize            |
  | **MUCK** | Social presence & spaces | Often player-built     | hang out, chat, light RP, customize     |
  | **MUSH** | Collaborative roleplay   | Mixed, plot-driven     | schedule scenes, write RP, pursue plots |
  | **MOO**  | Building & scripting     | Heavily player-created | build, tinker, script, test, iterate    |

  Not strict genres — culture matters more than the acronym; hybrids common.
- **Bartle's Player Types** (achievers/explorers/socializers/killers) — foundational
  game-design theory from this era.
- **Design debt inherited by all MMORPGs:** persistence, shared world, scoring,
  quests, combat, community. (Bartle: "MMORPGs are direct descendants of 1980s
  textual worlds.")
- **Play-by-post / forum / IRC RP**: human-moderated, async, no engine — reputation +
  consent systems govern play. East-Asian variants exist (_kuiaosule_, _guoce_).
  Relevant: **consent, rules/etiquette, moderation, reputation** are social-layer
  problems predating any engine.

### 4.4 Western computer RPGs (context)

- Originated on mainframes in the 1970s; popularized by **Ultima** (Garriott) and
  **Wizardry** in the early–mid 1980s. **Golden Age**: mid–late 1980s (party combat,
  tiled graphics, narrative depth from _Ultima III_ 1983). **Downturn** mid-1990s;
  rescued by isometric Interplay/Blizzard titles. Relevance: the campaign/world/
  character-sheet mental model RPG chat inherits.

### 4.5 Roguelikes

- _Rogue_ (1980, Unix/Berkeley) established the template: ASCII tiles, procedurally
  generated dungeons, turn-based grid movement, permadeath, hack-and-slash loot, single
  quest (steal the Amulet of Yendor). Influenced by _Colossal Cave Adventure_ + D&D.
  PLATO predecessors (1975+): `pedit5`, `dnd`, `moria`, `orthanc`, `avatar`.
- **Family tree**: Hack → NetHack; Moria → Angband; ADOM (1993); Linley's Dungeon
  Crawl → DCSS (2006); modern adherents: Dungeons of Dredmor (2011), Desktop Dungeons
  (2013), DoomRL (2013), Caves of Qud, Cogmind, Brogue, ToME.
- **Berlin Interpretation (2008)** distinguishes "canon" roguelikes (Rogue, NetHack,
  Angband) from edge cases (Diablo). High-value factors: random environment
  generation, permadeath, turn-based, grid-based, hack-and-slash, non-modal, complexity,
  resource management, exploration, discovery.
- **Roguelite split**: keep procedural + permadeath but add real-time action and
  meta-progression (Spelunky 2008/2012, Binding of Isaac 2011, FTL 2012, Crypt of the
  NecroDancer, Slay the Spire, Hades 2018). Sub-genres: deckbuilders, auto-battlers,
  action/hack-n-slash, bullet-hell, roguevania (Dead Cells). (Soulslike ≠ roguelike —
  no permadeath/proc-gen.)
- **Design takeaway**: permadeath + procedural generation + run-based progression are
  the recognizable "rogue" signals; a chat-RPG can borrow proc-gen (random
  encounters/loot) and permadeath (character death = run end) without being a grid
  crawler.

---

## 5. The LLM rupture & AI roleplay platforms

### 5.1 AI Dungeon (2019) — the spark

- **May 2019**: AI Dungeon Classic — GPT-2 (117M), hackathon project.
- **Dec 2019**: AI Dungeon 2 — full GPT-2 (1.5B); Google Colab; viral (100k+ users
  week 1).
- **2020**: GPT-3 early access → major coherence jump. _Dragon_ (July 2020) moved to
  OpenAI GPT-3 (175B) via API; free tier became _Griffin_.
- **2021**: Content-moderation controversy (filter on minor-related content) → privacy
  backlash → pivot to AI21 Labs + clarified consensual-NSFW policy. **Directly relevant
  to loop-lore's NSFW/moderation epic.**
- **2022–23**: "Phoenix" rebuild (custom Dragon model, ChatGPT integration).
- **2024–25**: "Renaissance" — Mixtral, Mythomax, DeepSeek V3; larger context windows.
- **2026**: **Voyage** launched — open framework for creators to build worlds with
  sophisticated RPG mechanics + AI narrative. (Latitude's own evolution toward
  loop-lore's "worlds + RPG mechanics + AI" space — closest commercial cousin to
  loop-lore's full vision.)
- **Interaction model** (predates loop-lore's message actions): `Do` (action), `Say`
  (dialogue), `Story` (narrate), `See` (perceive → image); undo/redo/modify;
  **"Remember"** (explicit memory injection — ancestor of lorebooks/memories);
  **Community Worlds** (user-uploaded shareable frameworks) — ancestor of loop-lore
  Worlds + shareability.
- **Compute note (Walton)**: AI Dungeon ~100× more compute-intensive than a AAA game —
  relevant to loop-lore's generation/cancellation/streaming architecture.

### 5.2 SillyTavern / TavernAI (the direct ancestor)

- **TavernAI** (Feb 2023) → forked by Cohee1207 → **SillyTavern** (Apr 2023). 25k+
  GitHub stars, 300+ contributors; v1.17+ (2026).
- **Defined the modern toolkit**: character cards (personality/backstory), lorebooks
  (world context injection), deep prompt control, group chats, TTS extensions,
  conversation branching, import/export. Multi-backend: OpenAI, Claude, KoboldAI,
  Ollama, OpenRouter, local models.
- **Local-first, no content filters on local models** — the philosophical position
  loop-lore inherits (user ownership, self-host).

### 5.3 Hosted competitors (2026 landscape)

| Platform                                                      | Position                                         | Note                |
| ------------------------------------------------------------- | ------------------------------------------------ | ------------------- |
| Character.AI                                                  | Largest library, SFW, text-only                  | Easy entry          |
| Janitor AI                                                    | Browser, NSFW-friendly                           | No install          |
| NovelAI                                                       | Long-form coherent writing + image gen; Lorebook | Story-quality focus |
| Kindroid                                                      | Emotional companion, complex memory              | Relationship RP     |
| DreamGen                                                      | World + story creation, CYOA, lore/rules         | Adventure focus     |
| Friends & Fables                                              | D&D-like, AI GM, 5e stats, real-time combat      | Tabletop bridge     |
| Chub AI / WyvernChat / FictionLab / Replika / Nomi / PolyBuzz | various niches                                   | —                   |
| RPGGO AI                                                      | 2D pixel world creation from NL; smart NPCs      | No-code game maker  |
| Inworld AI                                                    | Developer NPC tool (not a game)                  | Engine middleware   |
| TextRPG / The Asylum (Jenova)                                 | LLM-narrated text adventures, emergent NPCs      | Horror/emergent     |

**Common feature cluster (category baseline loop-lore must meet):** character
creation + import/export, lorebook/world-info, group/multi-character chat, memory/
continuity, image generation, branching/regeneration, TTS, scenario presets.

### 5.4 Narrative engine tooling (adjacent)

For loop-lore's story/multi-LLM-GM layer:

- **Ink** (Inkle) — open-source branching narrative scripting (80 Days, Heaven's
  Vault, Slay the Spire). Unity/Unreal/Godot. MIT.
- **Yarn Spinner** — screenplay-style dialogue (Night in the Woods, DREDGE). MIT/YSPL.
- **Arcweave** — visual branching, collaborative, AI assistant.
- **Sudowrite** — fiction AI (Story Engine, worldbuilding cards).
- **NovelAI** — Lorebook for world consistency; Text Adventure mode.
  These are _authoring_ tools; loop-lore's `src/story/` + `src/turning/` (TurnManager)
  is the runtime equivalent — AI-driven rather than pre-scripted.

---

## 6. Non-AI game mechanics & valuable additions

loop-lore is fundamentally a _chat_ app, but its RPG layer (stats, combat, inventory,
worlds) can adopt proven mechanics from non-AI games.

### 6.1 The four pillars (core RPG mechanic cluster)

From RPG design literature, the irreducible core of any RPG:

1. **Progression** — XP/levels, exponential curves (Runescape, WoW, Diablo 3 formulas).
   Drives long-term investment.
2. **Combat** — real-time vs turn-based; resource management layered on active
   mechanics (abilities, weapons, enemy AI). Rewards + loot loop.
3. **Items & Inventory** — rarity tiers, encumbrance, item value → economy. Forces
   keep/sell/leave decisions (Fallout 4).
4. **Quests** — main / side / faction / allegiance; branching; meaningful rewards
   (narrative, gameplay, social). Pacing: balance exploration/combat/dialogue/downtime
   (Witcher 3, Skyrim, Mass Effect, Disco Elysium).

> loop-lore mapping: pillars 1–4 map to `rpg-mechanics.md` (stats, combat, equipment,
> dice, skills, XP, loot) and the worlds-extension epic (mode switches → battle/
> inventory). The chat is the _delivery channel_, not a replacement.

### 6.2 Stat systems — base vs derived

- **Base stats:** pure attributes (STR/DEX/CON/INT/WIS/CHA in D&D 5e; Agility/Smarts/
  Spirit/Strength/Vigor in Savage Worlds).
- **Derived stats:** computed from base + equipment + environment (total attack power =
  STR + weapon power). Combat simulation consumes derived stats.
- **Why stats exist:** abstraction to resolve "who wins" without atom-level simulation.
  loop-lore needs this abstraction for any battle mode switch.

### 6.3 Resolution mechanics — how a roll is made

Comparison of TTRPG resolution systems:

| System               | Mechanic                           | Weight    | Narrative centrality | Genre              |
| -------------------- | ---------------------------------- | --------- | -------------------- | ------------------ |
| D&D 5e               | d20 + mod vs DC                    | Medium    | Medium               | Heroic fantasy     |
| Pathfinder 2E        | d20 + mod vs DC (4-degree)         | Heavy     | Medium-Low           | Tactical fantasy   |
| GURPS 4E             | 3d6 roll-under skill               | Heavy     | Low (simulation)     | Universal          |
| Call of Cthulhu 7E   | Percentile roll-under              | Medium    | Medium-Low           | Cosmic horror      |
| PbtA (Dungeon World) | 2d6 move, 7-9 cost / 10+           | Light     | High                 | Universal          |
| FATE Core            | dF + rating vs opposition          | Light-Med | High                 | Genre-flexible     |
| Savage Worlds        | skill die + wild die, both explode | Medium    | High                 | Universal          |
| Blades in the Dark   | d6 pool, Position/Effect           | Medium    | High                 | Heist/dark fantasy |
| Ironsworn            | d6 + d10 oracle                    | Light-Med | High                 | Solo Norse         |

**Design takeaway:** loop-lore's dice/GM layer should pick **ONE** resolution family.
PbtA/FATE are narrative-light (fit chat-RPG); GURPS/D&D are simulation-heavy (fit
crunchy battle mode). A **dual-mode** (light narrative default, heavy sim on battle
switch) mirrors the MU\* / AI-Dungeon split.

### 6.4 "Points" economies (meta-currency)

- **Bennies / Fate Points / Inspiration** — earned for good roleplay of traits, spent
  to reroll / invoke aspects / narratively edit story (Savage Worlds, FATE, D&D
  Inspiration). → loop-lore: a "story point" the player earns and spends to steer
  generation or retry rolls. Strong fit for chat-RPG agency.
- **Drama tokens** (FFG Narrative Dice) — passed between sides.

### 6.5 Crafting & economy (MMO lineage)

- **Recipe-based** (WoW, FFXIV) — gather + follow recipe.
- **Sandbox** (Albion, SWG) — combine materials/attributes freely.
- **RNG/dynamic** (Black Desert) — roll for perfect stats.
- **Player-economy-driven** — blueprints via quests/reputation; professions/skill
  trees; crafting stations.
- **Auction house** — player-driven market; risks: bots, monopolies, inflation;
  mitigations: dynamic taxation, trade restrictions.
- **Emergent economy** (Ashes of Creation) — resource scarcity triggers economic chain
  reactions; interdependent recipe trees force cross-profession collaboration.
- **EVE Online** — single-shard player-driven economy; building ships is the central
  loop.

> loop-lore mapping: the worlds-extension epic's "location assets/items/resources gen +
> tracking" is the primitive for crafting/economy. A full auction house is out of scope,
> but **resource scarcity + crafting recipes + reputation-gated blueprints** are
> valuable, low-cost additions that make worlds feel alive.

### 6.6 Factions, reputation, territory

- **Factions** control territory, give quests, have own storylines; player allegiance
  shapes experience (MMO template).
- **Reputation** as social currency (forum RP reputation; MMO faction standing).
- **Territory control** → persistent geopolitical narrative (Ashes of Creation);
  conquered strongholds become persistent metropolises.

> loop-lore: worlds can have factions with standing tracked per character; player
> choices shift faction standing → alters available quests/NPCs. This is the _social_
> layer that predates engines (see §4.3 consent/reputation).

### 6.7 Emergent gameplay & player agency (high-value target)

- **Emergence** = complex situations from interaction of simple mechanics; intentional
  since D&D/Cosmic Encounter.
- **Immersive sims** (Deus Ex, System Shock) — tools + consistent rules, no enforced
  solution; players invent unforeseen solutions.
- **Non-binary mechanics** — gradations (suspicion meter, gradual door) expand the
  possibility space vs binary states.
- **Player-driven emergence** — players become causal agents producing novel narrative
  nodes beyond designer baseline (emergence rate rᵢ = |Eᵢ| / Nᵢ). Directly analogous to
  LLM-RPG: the AI + player co-author emergent narrative.
- **Dominant strategy problem** — one over-effective playstyle collapses depth; must
  avoid in system design.
- **MDA framework** (Hunicke/LeBlanc/Zubek) — Mechanics → Dynamics → Aesthetics. Useful
  lens for loop-lore's mode-switch design.

> loop-lore mapping: the whole value prop of AI-RPG is _emergent narrative_. Non-AI
> emergence teaches loop-lore to: (a) provide simple consistent rules (stats, dice,
> faction standing) so emergence has a substrate; (b) prefer non-binary states
> (wounds/penalties over binary alive/dead); (c) avoid dominant strategies; (d) let
> players earn "story points" to steer.

### 6.8 Progression math & Skinner-box caution

- Exponential XP curves common; Runescape/WoW/Diablo formulas differ in shape.
- **Caution:** Skinner-box alone burns players out; pair mechanics with _narrative
  reason to invest_. **Undertale** (pacifist vs genocide alters the world) is the
  exemplar — consequences persist.

> loop-lore: permadeath/run-end (roguelite) + persistent world consequences
> (Undertale-style) give progression meaning beyond number-go-up.

### 6.9 Roguelike mechanics specifics

- **Item identification** (Rogue → NetHack): items start opaque ("pink potion",
  "scroll TEMOV"); identity learned by use/experiment, then applies to all copies — a
  knowledge-game layered on combat.
- **Conducts** (NetHack): _voluntary_ self-restrictions (vegetarian, atheist, no-wish,
  pacifist) tracked by the game and shown at death — first systemic "self-defined
  challenge modes."
- **Deities & sacrifice** (NetHack): alignment + god favor/revenge as a resource.
- **Knowledge-at-death**: "Do you want your possessions identified?" — death is also a
  teaching moment; integrated dead levels persist.
- **Depth-scaled difficulty** (Angband): challenge scales with dungeon depth; long-term
  gear progression and class/skill builds.
- **Emergent simulation** (Dwarf Fortress): _no win condition_; geology/biology/economy/
  psychology interact to produce stories players narrate ("Boatmurdered"). Influenced
  Minecraft, RimWorld, Caves of Qud, Terraria.
- **Mutations & factions** (Caves of Qud, ToME): body-part mutation systems and faction
  reputation that changes how the world reacts.

### 6.10 CRPG mechanics specifics

- **Ethics over evil** (Ultima IV, 1985): first RPG with _no antagonist_ — the quest is
  the player's moral self-improvement via Eight Virtues / Three Principles; introduced
  **reputation** as a mechanic. Landmark "valuable addition."
- **S.P.E.C.I.A.L. + traits** (Fallout, 1997): 7 primary stats, 18 percentage skills,
  **traits with paired positive/negative effects** — built-in build tradeoffs. Plus
  **karma**, branching **dialogue trees** with talking heads, barter economy (bottle
  caps).
- **Augmentation & player freedom** (Deus Ex, 2000): cybernetic augmentations; creed
  "problems, not puzzles," "no forced failure," multiple entrances/exits, **choice →
  consequence** across story and gameplay (RPG + FPS + stealth hybrid).
- **Skill-based, no classes** (Ultima Online, 1997): advancement by _doing_; player-
  driven **sandbox economy**, housing, and the **Felucca/Trammel** split (PvP vs
  carebear) — early attempt to serve both playstyles in one world.
- **Real-time-with-pause + faithful ruleset** (Baldur's Gate): AD&D adapted to CRTwP;
  **companion-driven narrative** — NPCs with personal quests, romances, plot twists
  gated on party membership.

### 6.11 MUD mechanics

- **Advancement systems**: levels, skills, classes/professions; PvE/PvP combat as core
  pillar; loot + crafting + resource loops.
- **Social structures**: guilds, clans, factions with reputation.
- **Player economy**: vendor pricing, crafting markets, rare-item scarcity.
- **Online creation (OLC) / building**: players author rooms, objects, mobs, scripts
  (LPC in LPMud, MUF in TinyMUCK) — original UGC + in-world programming.
- **Systems-first vs story-first axis**: the single design question predicting a
  world's entire loop (MUD = mechanical; MUSH = scene RP; MOO = build/script).

### 6.12 The "valuable additions" ledger

| Title                 | Valuable addition                                                |
| --------------------- | ---------------------------------------------------------------- |
| D&D (1974)            | stats, classes, GM role, campaign settings                       |
| Rogue (1980)          | procedural gen + permadeath + item discovery                     |
| NetHack (1987)        | deep item simulation, identification minigame, conducts, deities |
| Angband (1990)        | depth-scaled difficulty, long-term gear builds                   |
| MUD1 (1978)           | persistent multiplayer world + avatar + typed commands           |
| LPMud / DikuMUD       | codebases, player scripting (LPC/MUF), OLC                       |
| TinyMUD / MUSH / MOO  | social RP, scene posing, programmable worlds                     |
| Ultima IV (1985)      | ethics/virtues, no antagonist, reputation                        |
| Fallout (1997)        | S.P.E.C.I.A.L., trait tradeoffs, karma, dialogue trees           |
| Deus Ex (2000)        | augmentations, player freedom, choice → consequence              |
| Ultima Online (1997)  | skill-based (no class), player economy, sandbox, PvP split       |
| Dwarf Fortress (2006) | simulation > objectives, emergent narrative, no win              |
| Baldur's Gate (1998)  | CRTwP, faithful D&D, companion-driven narrative                  |
| AI Dungeon (2019)     | LLM as DM, "Remember" memory, Community Worlds                   |
| SillyTavern (2023)    | character cards, lorebooks, multi-backend, local-first           |

---

## 7. Cross-cutting patterns that persist

1. **Procedural / generative worlds** — from Rogue's RNG dungeons to the LLM as DM.
2. **Persistence** — permadeath (roguelikes) vs. persistent characters/worlds (MUDs) vs.
   conversation memory (LLM chat). Stakes + continuity are the eternal tension.
3. **Player authorship** — MUD building/scripting → character cards → lorebooks.
4. **Community & fork culture** — codebases since 1987; open-source frontends since 2023.
5. **Local vs. cloud & moderation** — AI Dungeon's 2021 backlash is the warning: privacy
   and filtering are first-class product concerns, not afterthoughts.
6. **Natural-language interface** — IF parser → LLM chat. The interface got smarter; the
   job (inhabit a world through text) is unchanged since 1976.

---

## 8. Patterns loop-lore should internalize

1. **Persistence** (MUD1, 1978) — world/character state outlives the session → loop-lore
   DB layer, archival workflow.
2. **Character cards + lorebooks** (SillyTavern) — portable persona + world context →
   `src/characters`, `src/personas`, world lore.
3. **Explicit memory / "Remember"** (AI Dungeon) — user-controlled context injection →
   `src/story` memories, 3-tier memory system.
4. **Community Worlds / shareable frameworks** (AI Dungeon, Voyage) — UGC ecosystems →
   worlds-extension epic (shareability/license/attribution).
5. **Moderation & consent** (forum RP, AI Dungeon 2021) — social-layer safety →
   chat-lifecycle-moderation epic (bans/NSFW/shadowing).
6. **Multi-character / group chat** (MU\*, SillyTavern) — many actors, turn order →
   `src/group-chat`, `src/turning`.
7. **Local-first ownership** (SillyTavern) — self-host, no platform filters → loop-lore
   architecture principle.
8. **RPG mechanics as optional mode** (Friends & Fables, Roguelite) — stats/combat/
   inventory as a _chat mode switch_, not the whole app → worlds-extension epic.

---

## 9. Synthesis — what loop-lore should borrow

| Mechanic                          | Source lineage                  | Adoption in loop-lore                         |
| --------------------------------- | ------------------------------- | --------------------------------------------- |
| Persistence                       | MUD1 (1978)                     | DB + archival; world state outlives session   |
| Character cards + lorebooks       | SillyTavern                     | `src/characters`, personas, world lore        |
| Explicit memory / Remember        | AI Dungeon                      | 3-tier memory system                          |
| Community worlds + shareability   | AI Dungeon, Voyage              | worlds-extension epic                         |
| Moderation / consent / reputation | Forum RP, AI Dungeon 2021       | chat-lifecycle-moderation epic                |
| Group / multi-actor chat          | MU\*, SillyTavern               | `src/group-chat`, `src/turning`               |
| Local-first ownership             | SillyTavern                     | architecture principle                        |
| Stats: base + derived             | howtomakeanrpg, D&D             | rpg-mechanics (battle mode)                   |
| Resolution: pick ONE family       | TTRPG comparison                | light narrative default / heavy sim on switch |
| Story points (Bennies/Fate)       | Savage Worlds, FATE             | player agency token to steer generation       |
| Quests: main/side/faction         | RPG quest design                | world quest frameworks                        |
| Crafting + resource scarcity      | MMO economy                     | worlds location resources                     |
| Factions + reputation + territory | MMO template                    | world factions, standing per character        |
| Emergent narrative + non-binary   | emergence theory, immersive sim | design lens for mode switches                 |
| Consequences persist (Undertale)  | progression caution             | roguelite run-end + world state               |

---

## 10. Open questions for loop-lore

- Does loop-lore target **social RP (MU\* style)** or **adventure (AI Dungeon style)**
  as primary mode? SillyTavern is character-chat; AI Dungeon is adventure. The
  `docs/frontend/chat/` spec suggests both (User×Character, User×User, User×Assistant).
- Roguelike mechanics: confirmed optional (mode switch) or core? Worlds-extension epic
  leaves this as a switch, not default.
- **Resolution system:** adopt PbtA/FATE (narrative-light) as default and GURPS/D&D
  (simulation-heavy) only on battle mode switch? Or a single unified system?
- **Story points:** introduce a player-earned token to steer generation/retries?
- **Crafting/economy scope:** full auction house (out of scope) vs lightweight
  resource-scarcity + recipe + reputation-gated blueprints (recommended)?
- **Voyage** (Latitude, 2026) is the closest commercial cousin to loop-lore's full
  vision (creator worlds + RPG mechanics + AI). Worth tracking as inspiration reference.

---

## 11. Epic cross-reference (enrichment map)

This research is prior-art fuel for the following epics/tasks. Section numbers refer to
this document.

| Epic (`.plan/epics/`)               | Enriched by                         | Why                                                                           |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `epic-worlds-extension.md`          | §2, §5.1, §6.5, §6.6, §8.4, §9, §10 | Community Worlds/Voyage, resource gen, factions, shareability                 |
| `epic-rpg-mechanics.md`             | §6.1, §6.2, §6.3, §6.9, §6.10, §9   | four pillars, base/derived stats, resolution families, virtues/S.P.E.C.I.A.L. |
| `epic-battle-action-systems.md`     | §6.1.2, §6.3, §6.9, §6.10           | combat loop, resolution systems, Angband depth, Deus Ex freedom               |
| `epic-item-system-extensions.md`    | §6.1.3, §6.9                        | inventory/rarity, NetHack identification minigame, loot                       |
| `epic-crafting-professions.md`      | §6.5                                | recipe/sandbox/RNG crafting, reputation-gated blueprints                      |
| `epic-economy-trading.md`           | §6.5                                | auction-house risks, EVE single-shard economy, emergent economy               |
| `epic-social-interaction.md`        | §4.3, §6.6, §8.6                    | MU\* social RP, Bartle types, factions/reputation/territory                   |
| `epic-chat-lifecycle-moderation.md` | §5.1, §8.5                          | AI Dungeon 2021 backlash, forum-RP consent/moderation                         |
| `epic-nsfw-game-mechanics.md`       | §5.1, §5.2                          | consensual-NSFW policy, local-first no-filters stance                         |
| `epic-plugin-system.md`             | §7.4, §8.7                          | MUD codebase fork culture, OLC, extensibility                                 |
| `epic-config-extensions.md`         | §6.2, §6.3                          | extensible enums as stat/resolution families (ECE)                            |
| `epic-multi-session.md`             | §4.3, §7.2                          | MUD1 persistence, world state outlives session                                |
| `epic-platform-research.md`         | §5.3, §5.4                          | hosted-competitor landscape, narrative tooling (Ink/Yarn)                     |
| `epic-exploration-discovery.md`     | §4.5                                | procedural generation, roguelike exploration                                  |
| `epic-housing-base-building.md`     | §6.10                               | Ultima Online housing/sandbox                                                 |
| `epic-companion-pet-mount.md`       | §6.10                               | Baldur's Gate companion-driven narrative                                      |
| `epic-stealth-crime.md`             | §6.10                               | Deus Ex stealth/emergent solutions                                            |
| `epic-magic-spell-systems.md`       | §6.3, §6.10                         | resolution families, augmentations as "magic"                                 |
| `epic-user-stories.md`              | §2, §10                             | taxonomy, open questions                                                      |
| `epic-tooling-improvement.md`       | §5.4, §6.11                         | narrative engines, MUD OLC as build tooling                                   |

> To fold a specific insight into an epic, lift the relevant subsection above and add it
> as a "Prior art" note in that epic. The raw scratchpad
> `research-rugs-text-rpgs.md` is preserved alongside this file as source material.

## 12. Sources

- Bartle, R. "From MUDs to MMORPGs" (Springer, 2010) — MUD history/theory.
- Wikipedia: Online text-based role-playing game; History of role-playing games;
  Roguelike; List of roguelikes; AI Dungeon; NovelAI; MUD1; LPMud; TinyMUD; NetHack;
  Angband; Ultima IV; Fallout; Deus Ex; Ultima Online; Dwarf Fortress; Baldur's Gate;
  History of Western role-playing video games; Interactive fiction; GPT-3.
- Iron Realms "Types of MUDs" / "History of MUD Games" (2026); MassivelyOP "Brief
  history of MUDs" (2019).
- SillyTavern docs / EveryDev / Grokipedia — SillyTavern history & features.
- Latitude (AI Dungeon, Voyage) — company blog, SimilarLabs, TechCrunch 2026.
- DreamGen "Best AI Roleplay Chatbots 2026"; Cherrypop "18 Best AI Chatbots 2026";
  rpggodotai "Best AI RPG Platforms 2025" (RPGGO, Inworld, Kindroid).
- Rogueliker / Destructoid / ScreenRant — roguelike vs roguelite definitions.
- Jenova "The Asylum" — emergent LLM-narrated text horror.
- HowToMakeAnRPG; GameDesignSkills — four pillars, stat systems.
- EN World; TabletopRPGAuthority (2026) — TTRPG resolution system comparison.
- JoyPlayX; MMOBomb; Game-Ace — MMO crafting/economy research.
- MDA framework (Hunicke/LeBlanc/Zubek); emergence theory (MoldStud, numberanalytics,
  Design Lab 2026, emergentmind 2026).
- Gubell "How the Roguelike Genre Originated" (2026).

