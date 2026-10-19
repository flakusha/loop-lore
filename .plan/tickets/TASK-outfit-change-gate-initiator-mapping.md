<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Outfit-change gate initiator mapping

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Caveats:** Security: the wrong initiator silently disables the fiction audit — this is a correctness-of-authorization bug, not a style choice. Rollback: none needed; the mapping is a constant. Stale state: none. Idempotency: pure. Observability: log the initiator with every gate call. Partial failure: a gate throw propagates by design (`requestOutfitChange` documents it at `src/characters/services/wardrobe/change-gate.ts:69`); the caller decides the fallback, and the hook must swallow it.

**Summary:**

Route extracted narration through the change gate with `initiator: "gm"` — never
`"npc"`. This is a one-line mapping whose wrong value is invisible to every
existing test.

**Context:**

`requestOutfitChange` (`src/characters/services/wardrobe/change-gate.ts:71-79`)
routes `npc` and `world_rule` **around** the gate unconditionally:

```ts
if (request.initiator === OutfitChangeInitiator.Npc || request.initiator === OutfitChangeInitiator.WorldRule) {
  return { allowed: true, bypassed: true };
}
return await gate.review(request);
```

**The trap.** An extracted "Mira shed her cloak" is a **GM-driven** change, so
`initiator: "gm"`. An implementer reaching for `"npc"` because "Mira is an NPC"
gets a change that **bypasses the fiction audit the seam exists for** — and no
test fails, because `change-gate.test.ts` *asserts* that `Npc` bypasses. The
existing tests bless the wrong choice.

The module header states the intent plainly: *"player-initiated wardrobe changes
are REVIEWED by an OutfitChangeGate; NPC and world-rule binding changes BYPASS
it entirely (deterministic world state, no fiction break to audit)"*
(`src/characters/services/wardrobe/change-gate.ts:9-11`). An extracted narration
change is **neither** player-initiated **nor** deterministic world state — it is
the narrator deciding what a character did, which is precisely the fiction-audit
case.

The one existing production caller maps
`actors.actor_type === "user" ? Player : Npc`
(`src/routes/wardrobe-overrides.ts:89-91`). That is **correct for a
user-initiated HTTP change** and **wrong for a narrated one** — the same
predicate cannot serve both call sites. This ticket must not change the HTTP
caller's mapping; it adds the second mapping for the hook path.

The predecessor epic flagged the gate as unbuilt: *"The immersion gate itself
does not exist yet — the change gate is an injectable seam"*
(`epic-wardrobe-avatar-variants.md:121-122`). The default gate is allow-all
(`src/characters/services/wardrobe/change-gate.ts:56-58`), so routing correctly
today costs nothing and is the only way to be correct when the real gate lands.

**Acceptance Criteria:**

- [ ] The narrative path calls `requestOutfitChange` with
      `initiator: OutfitChangeInitiator.Gm` for every extracted change
- [ ] A test asserts an extracted change is **reviewed** by the gate — i.e. the
      gate's `review` is invoked and a refusal produces `allowed: false`
- [ ] A test asserts the narrative path never produces
      `bypassed: true`
- [ ] A test asserts `Npc` still bypasses, pinning the existing contract
      (`src/characters/services/wardrobe/change-gate.ts:75-77`) so a future
      refactor does not quietly flip it
- [ ] The HTTP override caller keeps its `Player | Npc` mapping unchanged
      (`src/routes/wardrobe-overrides.ts:89-91`)
- [ ] The initiator constant is a named import of `OutfitChangeInitiator`, never
      a string literal
- [ ] `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- The bypass branch: `src/characters/services/wardrobe/change-gate.ts:75-77`
- The initiator union: `src/characters/services/wardrobe/change-gate.ts:16-27`
  (`player | gm | npc | world_rule`)
- The default allow-all gate: `src/characters/services/wardrobe/change-gate.ts:56-58`
- The module's own statement of intent: `src/characters/services/wardrobe/change-gate.ts:9-11`
- The only production caller, and its mapping:
  `src/routes/wardrobe-overrides.ts:100-106` (call) and `:89-91` (mapping)
- The gate-throws contract: `src/characters/services/wardrobe/change-gate.ts:69`
- The predecessor's own note that the real gate does not exist:
  `epic-wardrobe-avatar-variants.md:121-122`
- The gate's motivating epic: `epic-immersion-consistency-gate.md`