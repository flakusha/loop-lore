# FEAT: Race & Origin (Homeland/Culture) Identity-Aware Lore/Memory Configuration

**Status:** Open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems
**Labels:** lore, memory, identity, race, origin, config, provisioning
**Related:** `FEAT-race-origin-lore-identity-model.md`, `FEAT-character-spec-inclusion-race-origin-culture.md`, `docs/spec/lore.md`, `docs/spec/memory-system.md`, `src/memory/`, `src/assistant/prompt/sections/lore.ts`, `src/assistant/prompt/sections/memories.ts`

## Summary

Make the **lore and memory configuration itself identity-aware**: based on a character/actor/NPC's **race and origin (homeland/culture)**, the lore prioritization, identity framing, and memory budget/weights should differ. This is the _configuration and provisioning_ axis of the race-aware Lore work; the _scoping_ (which entries are visible) and _data capture_ (how origin/culture get set) are separate tickets.

The intent: a dark-elf orphan from the Underdark and a human courtier from the High Court should not just see _different lore_ (that is audience scoping — `FEAT-race-origin-lore-identity-model.md`) — their **identity framing, lore emphasis, and what they are likely to remember** should differ because of who and where they are from.

## Background

Today `docs/spec/lore.md` establishes lore as _shared structural knowledge_ while memory (`docs/spec/memory-system.md`) is _personal experience_. Both feed a character's prompt:

- `src/assistant/prompt/sections/lore.ts` injects audience-scoped world/actor lore slices.
- `src/assistant/prompt/sections/memories.ts` provisions each participant's memories against the speaker as viewer (`ownerId` vs `viewerId`, combined token budget).

Neither path currently varies its **configuration** by the actor's race/origin. The budget logic in `src/memory/` (`budget.ts`, provisioning) applies trust modifiers but has no per-identity dimension. There is no notion of "this race/origin prioritizes these lore topics" or "this culture weights episodic vs semantic memory differently."

## Scope

### 1. Identity-aware lore prioritization

Add an optional per-identity **lore emphasis** configuration that re-orders / weights lore slices for an actor matching a race/origin/culture before the token budget is applied:

```typescript
interface IdentityLoreConfig {
  race?: string; // matches ActorIdentity.race
  origin?: string; // matches homeland
  culture?: string; // matches culture
  priority_topics?: string[]; // subject keywords to rank first for this identity
  emphasize_subjects?: LoreSubjectKind[]; // e.g. ["history", "customs"]
  deemphasis?: LoreSubjectKind[]; // e.g. ["commerce"]
}
```

Resolution order when multiple configs match: **character-specific > race > origin > culture > world default**. This is lookup/config resolution only — it must not weaken the audience gate in `isLoreVisibleTo` (config ranks _visible_ entries; it never reveals hidden ones).

### 2. Identity-aware identity framing

The identity section of the prompt should be assembled from race/origin/culture-informed framing when a config exists (rather than a flat trait dump). Concretely: `src/assistant/prompt/sections/character-traits.ts` or the identity section consumes the resolved origin/culture to compose a coherent "who this character is" framing that surfaces homeland and cultural context as _binding_ identity, matching how the GM authored the lore.

### 3. Identity-aware memory budget / weights

Let `src/memory/` provisioning accept identity context so budget weights per tier (episodic / semantic / procedural) and any retrieval emphasis vary by race/origin/culture:

```typescript
interface IdentityMemoryConfig {
  race?: string;
  origin?: string;
  culture?: string;
  tier_weights?: { episodic?: number; semantic?: number; procedural?: number };
  budget_multiplier?: number; // within hard caps
}
```

Must compose with the existing combined token budget (`selectWithinBudget`, 1024) and per-actor caps in `memorySection` — a config reweights, never exceeds the world's hard cap.

### 4. Config storage

Prefer storing identity configs as data (a `world_lore_entries`-adjacent config table, or a trait-tagged JSON on the world/character) rather than hardcoded. Follow existing entity-route JSON-field handling (`fieldMappings` / `jsonFields`) and the migration pattern from `028_lore_audience_scope`. Keep it optional — no config = current behavior.

## Acceptance Criteria

- [ ] Identity config (race/origin/culture) can be defined and stored per world/character
- [ ] Lore prioritization re-ranks visible lore for matching identities without leaking hidden entries
- [ ] Prompt identity framing uses race/origin/culture-informed framing when configured
- [ ] Memory tier weights / budget multiplier apply per identity and respect hard caps
- [ ] Resolution order (character > race > origin > culture > default) implemented and tested
- [ ] No-config path is byte-identical to today's behavior
- [ ] `docs/spec/lore.md` + `docs/spec/memory-system.md` document the config model
- [ ] Unit tests for resolution order, hard-cap composition, no-config regression
- [ ] `bun run check` + `bun test src/` pass

## Files

- `src/assistant/lore/` — identity lore config resolution (new, mirrors audience.ts style)
- `src/assistant/prompt/sections/lore.ts` — apply priority before budget
- `src/assistant/prompt/sections/character-traits.ts` (or identity section) — framing
- `src/memory/` (`budget.ts`, provisioning) — identity-aware weights / multiplier
- `src/assistant/prompt/sections/memories.ts` — thread identity into provisioning
- migration (new) — optional identity config storage, mirroring `028_lore_audience_scope`

## Notes

- Depends on the identity model in `FEAT-race-origin-lore-identity-model.md` (origin/culture must be resolvable before config can key on them).
- Keep concerns separated: this ticket is **configuration of knowledge**, not **visibility**. Audience scoping stays in `isLoreVisibleTo`; config ranks and weights only the already-visible set.
