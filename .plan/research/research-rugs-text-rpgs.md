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
