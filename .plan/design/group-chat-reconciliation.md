# Group Chat Reconciliation — Design & Gaps

> **Status:** Draft — design document for reconciling group chat turn ordering,
> talkativity, and silence mechanics with the implemented codebase.

---

## 1. Gap Summary

| #  | Gap                                 | Severity | Where                                    |
| -- | ----------------------------------- | -------- | ---------------------------------------- |
| G1 | Spec vs DB enum mismatch            | Medium   | `group-chat.md` lines 31–34              |
| G2 | Talkativity invisible to LLM prompt | **High** | `group-participants.ts`                  |
| G3 | overview.md stale claim             | Low      | `overview.md` lines 35–36                |
| G4 | Cascade fallback bypasses strategy  | Medium   | `turn-manager.ts` selectNextActor()      |
| G5 | Initiative scene_id hardcoded       | Low      | `turn-manager.ts` line 102               |
| G6 | No silence/pass mechanic            | Medium   | `turn-strategies.ts`, `turn-selector.ts` |

---

## 2. G1 — Spec vs DB Enum Mismatch

### Problem

`docs/frontend/chat/group-chat.md` lines 31–34 list **FIXED / ROTATE / RANDOM** as
"configurable mode" options. But:

- The actual DB column `chats.turn_strategy` is a `TurnStrategy` enum with values:
  `round_robin | scene_based | initiative | quest_driven | hybrid`
- All five strategies are implemented in `src/turning/turn-strategies.ts`
- The spec acknowledges the mismatch ("should be reconciled with that enum") but never does it

### Fix

Replace the spec's `FIXED / ROTATE / RANDOM` section with a reference to the
actual enum. The mapping is:

| Spec concept                    | Actual strategy | Notes                                 |
| ------------------------------- | --------------- | ------------------------------------- |
| `FIXED` (order static by score) | `round_robin`   | Fixed order, cycle through            |
| `ROTATE` (cycle each message)   | `round_robin`   | Same as above — one rotation per turn |
| `RANDOM` (random per message)   | `initiative`    | Weighted random by talkativity score  |

The actual enum offers more granularity than the spec anticipated.

### Files to change

- `docs/frontend/chat/group-chat.md` — replace configurable modes section

---

## 3. G2 — Talkativity Invisible to LLM Prompt

### Problem

This is the biggest gap. `groupParticipantsSection` in
`src/assistant/prompt/sections/group-participants.ts` passes:

- `display_name`
- `description`
- `personality`

It does **NOT** pass:

- `talkativity` score
- Any guidance on _how much_ to speak

Talkativity only biases **which** LLM gets selected (via `weightedRandomSelect`),
but once selected, the LLM has no idea it's supposed to be brief or verbose.
A `talkativity: 1` character generates the same wall of text as `talkativity: 10`.

### Design

Add talkativity-derived prompt instructions to the generating LLM's system prompt.

#### 3.1 Talkativity-to-Prompt Mapping

| talkativity score | Prompt label | Instruction                                                                                                                                             |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2               | `reserved`   | "You are reserved. Respond briefly — a short sentence or reaction. Let others speak. Only elaborate if directly addressed or the situation demands it." |
| 3–4               | `quiet`      | "You are somewhat quiet. Keep responses concise — a few sentences at most. Contribute when you have something meaningful to add."                       |
| 5–6               | `moderate`   | (no extra instruction — default behavior)                                                                                                               |
| 7–8               | `chatty`     | "You are talkative. Feel free to elaborate, share thoughts, react to what others say, and drive the conversation forward."                              |
| 9–10              | `outgoing`   | "You are very outgoing. Take initiative, express opinions, ask questions, and fill comfortable silences. You enjoy being the center of attention."      |

#### 3.2 Implementation

**Option A — Inline in `groupParticipantsSection` (simple)**

Extend the existing section builder to include talkativity instructions when
the generating actor is part of a group chat:

```typescript
// In build(), when building the generating actor's self-awareness:
if (generatingActorTalkativity != null) {
  const label = talkativityLabel(generatingActorTalkativity,);
  if (label.instruction) {
    parts.push(`\n[Your temperament: ${label.name}] ${label.instruction}`,);
  }
}
```

**Option B — New `SectionBuilder` (clean separation)**

Create `src/assistant/prompt/sections/group-talkativity.ts` — a dedicated
section that only fires in group chats and reads the generating actor's
`talkativity` from `chat_participants`.

```typescript
export const groupTalkativitySection: SectionBuilder = {
  name: "groupTalkativity",
  enabled: (ctx,) =>
    ctx.params.isGroupChat === true &&
    ctx.params.generatingActorTalkativity != null,
  build: async (ctx,) => {
    const talkativity = ctx.params.generatingActorTalkativity!;
    const label = talkativityLabel(talkativity,);
    if (!label.instruction) { return []; }
    return [{
      role: "system",
      content: `[Your temperament: ${label.name}]\n${label.instruction}`,
    },];
  },
};
```

**Recommendation: Option B** — keeps concerns separated, is independently
testable, and follows the existing pattern of one-section-per-concern.

#### 3.3 Data flow

1. `selectNextGroupActor()` returns the selected actor ID
2. Caller fetches that actor's `talkativity` from `chat_participants`
3. Caller passes it as `generatingActorTalkativity` in the prompt context
4. `groupTalkativitySection` emits the instruction

#### 3.4 Files to change

- **New:** `src/assistant/prompt/sections/group-talkativity.ts`
- **Modify:** `src/assistant/prompt/sections/index.ts` (register section)
- **Modify:** `src/group-chat/turn-selector.ts` (return talkativity alongside actorId)
- **Test:** `src/assistant/prompt/sections/group-talkativity.test.ts`

---

## 4. G3 — overview.md Stale Claim

### Problem

`docs/frontend/chat/overview.md` lines 35–36 say:

> Talkativity — multiple AI characters taking turns — requires the generation
> path to select more than one participant (today it replies as only the first
> non-user actor).

But `selectNextGroupActor()` IS implemented with strategy-based multi-actor
selection. The claim is factually wrong.

### Fix

Replace lines 35–36 with:

```markdown
- **Talkativity** — multiple AI characters taking turns via strategy-based
  selection (`round_robin`, `initiative`, `scene_based`, etc.). Talkativity
  scores bias _which_ actor is selected (see [group-chat.md](./group-chat.md)).
  Gap: talkativity does not yet influence _how much_ the selected actor says
  (see `.plan/design/group-chat-reconciliation.md` G2).
```

### Files to change

- `docs/frontend/chat/overview.md` lines 35–36

---

## 5. G4 — Cascade Fallback Bypasses Strategy

### Problem

In `TurnManager.selectNextActor()`, the strategy returns an actorId. But
`selectNextGroupActor()` (the caller) doesn't check if that actor is the
same one who just spoke. If it is, the LLM will produce back-to-back
messages from the same character, which looks unnatural.

The fallback **does** exist — but in a different code path. `triggerGroupCascade()`
in `src/generation/auto-gen.ts` (lines 724–728) has:

```typescript
if (nextActorId === previousActorId) {
  const others = aiParticipants.filter(p => p.actor_id !== previousActorId);
  nextActorId = others[0]!.actor_id;
}
```

This picks the first participant by array order — not by strategy — making
strategy advisory, not authoritative, during cascade.

Meanwhile `selectNextGroupActor()` in `turn-selector.ts` has **no** guard at all.

The real gap: neither code path re-runs the strategy with exclusion.

### Design

Add a **consecutive-turn guard** to the strategy layer:

```typescript
// In selectNextActor() after strategy call:
if (selectedId === this.state.currentActorId && participants.length > 1) {
  // Re-run strategy excluding the just-spoke actor
  const excluded = participants.filter(p => p.actorId !== selectedId);
  const retryFn = STRATEGY_MAP[resolvedStrategy];
  selectedId = retryFn(excluded, null, this.state.currentTurn, this.state.turnOrder, context,);
}
```

This is cleaner than a hardcoded fallback — the strategy itself picks the
next-best candidate, respecting talkativity weights.

### Files to change

- `src/turning/turn-manager.ts` — add consecutive-turn guard in `selectNextActor()`
- `src/generation/auto-gen.ts` — remove redundant `others[0]` fallback in `triggerGroupCascade()` (lines 724–728), rely on strategy-layer guard instead

---

## 6. G5 — Initiative scene_id Hardcoded

### Problem

`turn-manager.ts` line ~102:

```typescript
const currentScene = "main"; // TODO: detect actual current scene from story_state
```

All initiative scores are queried for scene `"main"` regardless of actual
story state. This means initiative points don't reset on scene transitions.

### Design

The `story_state` JSON column already stores turn manager state. Extend it
with a `currentSceneId` field:

```typescript
interface TurnManagerState {
  // ... existing fields
  currentSceneId: string; // default "main"
}
```

Story mode's scene detection (when implemented) updates `currentSceneId`.
For group chat, it stays `"main"` — group chats don't have scene transitions
unless they're story-mode groups.

**This is low priority** — the scene system doesn't exist yet. Mark as
a future integration point.

---

## 7. G6 — No Silence/Pass Mechanic

### Problem

The turn selector **always** picks an actor to generate. There's no concept
of an LLM choosing not to respond. In a real group conversation:

- A shy character might stay quiet
- A character who just spoke might not immediately jump in again
- A character with nothing relevant to add should yield

Without this, every turn generates a response, creating forced contributions
and unnatural conversation flow.

### Design

#### 7.1 Silence as a First-Class Outcome

After the strategy selects an actor, the system can allow the actor to
"pass" — skip generating a response and move to the next actor.

**Two approaches:**

**A. Prompt-based (LLM decides)**

The LLM can return a special sentinel (e.g., `[PASS]` or empty response)
to indicate it has nothing to say. The system detects this and re-selects.

Pros: LLM has full agency, realistic decision.
Cons: Wastes an LLM call per pass, inconsistent detection.

**B. Probabilistic pre-filter (system decides)**

Before calling the LLM, the system rolls against a "silence probability"
derived from talkativity:

| talkativity     | silence chance per turn |
| --------------- | ----------------------- |
| 1–2 (reserved)  | 40%                     |
| 3–4 (quiet)     | 20%                     |
| 5–6 (moderate)  | 5%                      |
| 7–8 (chatty)    | 0%                      |
| 9–10 (outgoing) | 0%                      |

If the roll passes, skip this actor and re-select (up to N skips per round).

Pros: No wasted LLM calls, deterministic.
Cons: Less realistic, random frustration.

**Recommended: Hybrid** — use probabilistic pre-filter for the first pass,
but always allow the LLM to explicitly pass via `[PASS]` response (which
the prompt instructs as an option for reserved/quiet characters). Both
paths feed the same re-selection logic.

#### 7.2 Implementation

```typescript
// In turn-selector.ts after actor selection:
const silenceChance = getSilenceChance(selectedActorTalkativity,);
const maxSkips = 2; // Don't skip more than twice per round

for (let skips = 0; skips < maxSkips; skips++) {
  if (Math.random() > silenceChance) { break; // Actor speaks
   }
  // Re-select excluding the silent actor
  selectedId = await selectNextGroupActor({
    ...options,
    excludeActorIds: [...(options.excludeActorIds ?? []), selectedId,],
  },);
}
```

On the prompt side, add to `groupTalkativitySection` for reserved/quiet actors:

```
You MAY choose not to respond if you have nothing meaningful to add.
If so, reply with exactly [PASS] and nothing else.
```

#### 7.3 Files to change

- `src/group-chat/turn-selector.ts` — silence skip loop
- `src/turning/types.ts` — add `excludeActorIds` to `TurnSelectorOptions`
- `src/assistant/prompt/sections/group-talkativity.ts` — add `[PASS]` instruction
- `src/group-chat/turn-selector.ts` — detect `[PASS]` response in caller

---

## 8. Integration Points (from integration-registry.ts)

These gaps connect to the existing integration graph:

| System                 | Edge                | Relevance                                                    |
| ---------------------- | ------------------- | ------------------------------------------------------------ |
| `social` ↔ `companion` | `Relationship`      | Companion talkativity should reflect relationship state      |
| `social`               | `SocialState` layer | Group chat context affects social state                      |
| `character_core`       | `PlayerState`       | Mental state (confident, anxious) could modulate talkativity |

Future: talkativity should be **dynamic** — affected by:

- Relationship with other participants (companion system)
- Current mental state (character core)
- Scene context (combat → quiet, campfire → chatty)
- Recent events (just witnessed death → likely silent)

This is beyond current scope but should be kept in mind when designing
the talkativity prompt mapping (G2).

---

## 9. Implementation Priority

| Priority | Gap                       | Effort  | Reason                                                            |
| -------- | ------------------------- | ------- | ----------------------------------------------------------------- |
| **1**    | G2 (talkativity → prompt) | Medium  | Biggest UX impact — characters are indistinguishable in verbosity |
| **2**    | G1 (spec reconciliation)  | Trivial | Eliminates confusion for anyone reading the spec                  |
| **3**    | G3 (overview.md fix)      | Trivial | Corrects misinformation                                           |
| **4**    | G6 (silence/pass)         | Medium  | Improves group chat realism                                       |
| **5**    | G4 (consecutive guard)    | Small   | Prevents unnatural back-to-back messages                          |
| **6**    | G5 (scene_id)             | Small   | Only matters when scene system exists                             |

---

## 10. File Change Summary

| File                                                      | Change                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `docs/frontend/chat/group-chat.md`                        | Replace FIXED/ROTATE/RANDOM with actual enum reference     |
| `docs/frontend/chat/overview.md`                          | Fix stale talkativity claim (lines 35–36)                  |
| `src/assistant/prompt/sections/group-talkativity.ts`      | **New** — talkativity prompt section                       |
| `src/assistant/prompt/sections/index.ts`                  | Register new section                                       |
| `src/group-chat/turn-selector.ts`                         | Return talkativity, add silence skip loop, exclude support |
| `src/turning/types.ts`                                    | Add `excludeActorIds` to options                           |
| `src/turning/turn-manager.ts`                             | Add consecutive-turn guard                                 |
| `src/assistant/prompt/sections/group-talkativity.test.ts` | **New** — tests                                            |
| `src/group-chat/turn-selector.test.ts`                    | **New** — tests for silence/selection                      |

---

## 11. Test Strategy

| Test                                                                           | Covers     |
| ------------------------------------------------------------------------------ | ---------- |
| `groupTalkativitySection` — score 1 emits "reserved" instruction               | G2         |
| `groupTalkativitySection` — score 6 emits nothing (moderate default)           | G2         |
| `groupTalkativitySection` — score 9 emits "outgoing" instruction               | G2         |
| `selectNextGroupActor` — excludes actor via `excludeActorIds`                  | G6         |
| `selectNextGroupActor` — silence skip respects maxSkips                        | G6         |
| `selectNextActor` — consecutive guard re-runs strategy                         | G4         |
| `groupParticipantsSection` — still passes display_name/description/personality | Regression |
