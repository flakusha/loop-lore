# Voting & @Mention Expansion — Design Document

> **Status:** Design only — no implementation.
> **Replaces:** No existing doc (greenfield).
> **Related:** `docs/frontend/chat/group-chat.md`, `TASK-housing-neighborhood.md`,
> `TASK-chat-context-feature-permissions.md`, `docs/frontend/chat/multi-llm-story.md`

---

## 1. Overview

Two interaction systems for group chats and collaborative contexts:

1. **Polls / Voting** — structured decision-making within chats, worlds, and events
2. **@Mention Expansion** — extend the existing `mention-parser.ts` with autocomplete,
   multi-actor targeting, role-based mentions, and context-aware resolution

Both follow the existing interaction pattern established by `message_reactions`
and `chat_pins` (migration 022): lightweight user_id + target_id + metadata tables
with chat-scoped queries.

---

## 2. Voting / Poll System

### 2.1 Use Cases

| Context         | Example                               | Voters                          |
| --------------- | ------------------------------------- | ------------------------------- |
| **Group chat**  | "Where should we go next?"            | All participants (users + LLMs) |
| **Story mode**  | GM creates a decision point           | All actors in the story         |
| **Housing**     | Decoration contest                    | Visitors to the neighborhood    |
| **Faction**     | Leadership election                   | Faction members                 |
| **World event** | Community vote on world event outcome | All world participants          |
| **Loot split**  | Party votes on who gets the drop      | Party members                   |
| **Exploration** | Team votes on expedition direction    | Expedition members              |

### 2.2 Core Design Principles

- **Polls are chat-scoped by default** — a poll exists in the context where it was
  created (chat, world, faction, housing contest)
- **LLM actors can vote** — AI characters participate in polls based on their
  personality, relationships, and current state
- **Votes are weighted** — not just yes/no; supports point distribution, ranked choice,
  and weighted voting
- **Results are events** — poll completion emits events that other systems can react to
  (quest progression, faction decisions, world state changes)

### 2.3 Poll Types

| Type         | ID         | Mechanic                               | Use Case                       |
| ------------ | ---------- | -------------------------------------- | ------------------------------ |
| **Simple**   | `simple`   | Single choice from N options           | "Go left or right?"            |
| **Multiple** | `multiple` | Select K of N options                  | "Pick 2 skills to train"       |
| **Ranked**   | `ranked`   | Rank options 1..N (Borda count)        | "Preferred leadership order"   |
| **Points**   | `points`   | Distribute N points across options     | "Allocate 10 influence points" |
| **Yes/No**   | `yes_no`   | Binary with optional abstain           | "Accept the treaty?"           |
| **Veto**     | `veto`     | Anyone can block (consensus model)     | "Should we enter the dungeon?" |
| **Weighted** | `weighted` | Votes weighted by stat/role/reputation | Faction elections              |

### 2.4 Poll Lifecycle

```
draft → active → closed → resolved
                  ↓
               cancelled
```

| State       | Description                   | Transitions to               |
| ----------- | ----------------------------- | ---------------------------- |
| `draft`     | Created but not yet visible   | `active`, `cancelled`        |
| `active`    | Accepting votes               | `closed` (timeout or manual) |
| `closed`    | No more votes, tallying       | `resolved`                   |
| `resolved`  | Final outcome determined      | (terminal)                   |
| `cancelled` | Abandoned by creator or admin | (terminal)                   |

### 2.5 LLM Voting Behavior

When a poll is active in a group chat or story, LLM actors automatically vote
based on their character:

```typescript
interface LLMVoteStrategy {
  /** Character personality influences vote (e.g., cautious character avoids risk) */
  personalityWeight: number;
  /** Relationship with other voters influences alignment */
  relationshipWeight: number;
  /** Current state (mental, physical) influences preference */
  stateWeight: number;
  /** Random factor for variety */
  randomnessWeight: number;
}
```

The LLM receives a prompt like:

```
[POLL ACTIVE: "Where should we go next?"]
Options: Forest | Cave | Village
Your character: {personality}, {description}
Current mood: {mental_state}
Relationships: {other_voters_and_standing}

Vote based on your character's nature. Reply with your choice and a brief reason.
```

The system captures the LLM's vote + reason and stores it alongside human votes.

### 2.6 Poll Resolution

| Method            | Description                                     |
| ----------------- | ----------------------------------------------- |
| **Majority**      | Most votes wins (default)                       |
| **Plurality**     | Most votes wins even if < 50%                   |
| **Unanimous**     | All must agree (veto model)                     |
| **Supermajority** | Requires 2/3 or 3/4                             |
| **Borda count**   | Ranked choice — points for rank position        |
| **GM decides**    | GM sees votes, makes final call (advisory vote) |
| **Weighted sum**  | Points × voter weight = final score             |

### 2.7 Database Schema

```sql
CREATE TABLE polls (
  id            TEXT PRIMARY KEY,
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  creator_id    TEXT NOT NULL,  -- user or actor who created the poll
  poll_type     TEXT NOT NULL,  -- 'simple' | 'multiple' | 'ranked' | 'points' | 'yes_no' | 'veto' | 'weighted'
  question      TEXT NOT NULL,
  description   TEXT,
  options       TEXT NOT NULL,  -- JSON: [{ id, label, description, emoji }]
  config        TEXT,           -- JSON: { max_choices, total_points, min_rank, ... }
  resolution    TEXT NOT NULL DEFAULT 'majority',
  status        TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'active' | 'closed' | 'resolved' | 'cancelled'
  result        TEXT,           -- JSON: { winner_id, tally, margin, ... }
  context_type  TEXT NOT NULL DEFAULT 'chat',  -- 'chat' | 'world' | 'faction' | 'housing_contest'
  context_id    TEXT NOT NULL,  -- chat_id, world_id, faction_id, contest_id
  llm_vote      INTEGER NOT NULL DEFAULT 1,  -- 1 = LLM actors vote automatically
  expires_at    TEXT,           -- NULL = no expiry
  closed_at     TEXT,
  resolved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE poll_votes (
  id            TEXT PRIMARY KEY,
  poll_id       TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_id      TEXT NOT NULL,  -- user_id or actor_id
  voter_type    TEXT NOT NULL,  -- 'user' | 'actor'
  choice        TEXT NOT NULL,  -- JSON: option_id(s), ranked list, point distribution. Abstain = literal 'abstain' (not NULL, so UNIQUE constraint holds)
  reason        TEXT,           -- LLM-generated reason or user comment
  weight        REAL NOT NULL DEFAULT 1.0,  -- vote weight (for weighted polls)
  changed_from  TEXT,           -- previous choice if vote was changed
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(poll_id, voter_id)
);

CREATE TABLE poll_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  poll_type     TEXT NOT NULL,
  config        TEXT NOT NULL,  -- JSON default config
  resolution    TEXT NOT NULL,
  context_type  TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_polls_chat ON polls(chat_id);
CREATE INDEX idx_polls_context ON polls(context_type, context_id);
CREATE INDEX idx_polls_status ON polls(status);
CREATE INDEX idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX idx_poll_votes_voter ON poll_votes(voter_id);
```

### 2.8 Schema in Kysely Types

```typescript
export interface Polls {
  id: Generated<string>;
  chat_id: string;
  creator_id: string;
  poll_type: PollType;
  question: string;
  description: string | null;
  options: string; // JSON
  config: string | null; // JSON
  resolution: PollResolution;
  status: PollStatus;
  result: string | null; // JSON
  context_type: PollContext;
  context_id: string;
  llm_vote: Generated<number>; // boolean
  expires_at: string | null;
  closed_at: string | null;
  resolved_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface PollVotes {
  id: Generated<string>;
  poll_id: string;
  voter_id: string;
  voter_type: "user" | "actor";
  choice: string; // JSON
  reason: string | null;
  weight: Generated<number>;
  changed_from: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface PollTemplates {
  id: Generated<string>;
  name: string;
  description: string | null;
  poll_type: PollType;
  config: string; // JSON
  resolution: PollResolution;
  context_type: PollContext;
  created_by: string;
  created_at: Generated<string>;
}
```

### 2.9 Event Integration

Polls emit events that connect to the integration registry:

| Event                                    | Source System | Target System      | Trigger                 |
| ---------------------------------------- | ------------- | ------------------ | ----------------------- |
| `poll.created`                           | social        | chat               | New poll created        |
| `poll.vote_cast`                         | social        | chat               | Vote submitted          |
| `poll.closed`                            | social        | chat               | Poll closed             |
| `poll.resolved`                          | social        | varies             | Outcome determined      |
| `poll.resolved → faction.decision`       | social        | faction            | Faction leadership vote |
| `poll.resolved → housing.contest_winner` | social        | housing            | Decoration contest      |
| `poll.resolved → quest.choice`           | social        | rpg_mechanics      | Story decision point    |
| `poll.resolved → world.event_outcome`    | social        | emergent_narrative | Community world event   |

### 2.10 API Endpoints

```
POST   /api/polls                          # Create poll
GET    /api/polls/:id                      # Get poll detail + votes
POST   /api/polls/:id/vote                 # Cast vote
PUT    /api/polls/:id/vote                 # Change vote
DELETE /api/polls/:id/vote                 # Withdraw vote
POST   /api/polls/:id/close                # Close poll (creator/admin)
POST   /api/polls/:id/resolve              # Resolve with outcome
GET    /api/polls/:id/results              # Get tally + breakdown
GET    /api/chats/:chatId/polls            # List polls in chat
GET    /api/worlds/:worldId/polls          # List polls in world
POST   /api/polls/templates                # Create template
GET    /api/polls/templates                # List templates
POST   /api/polls/from-template/:templateId # Create from template
```

### 2.11 Feature Gating

Uses the planned `create_poll` feature permission:

| Context         | Default                | Override                     |
| --------------- | ---------------------- | ---------------------------- |
| Group chat      | Allowed                | Chat admin can disable       |
| Story mode      | GM only                | GM configures who can create |
| Direct chat     | Disabled               | N/A (no audience)            |
| World           | Role-based             | World admin configures       |
| Housing contest | Auto-created by system | Not user-creatable           |

---

## 3. @Mention Expansion

### 3.1 Current State

`src/group-chat/mention-parser.ts` handles:

- `@ActorName` parsing and resolution
- `>>` initiative flag
- Deduplication
- Basic name matching (first match wins)

### 3.2 Gaps

| Gap | Description                                                      | Severity |
| --- | ---------------------------------------------------------------- | -------- |
| M1  | No autocomplete — user must type exact name                      | Medium   |
| M2  | No partial/fuzzy matching — `@Lun` doesn't match `Luna`          | Low      |
| M3  | No role-based mentions (`@all`, `@npcs`, `@players`)             | Medium   |
| M4  | No context-aware resolution (location-scoped, party-scoped)      | Low      |
| M5  | No mention notifications — mentioned actor doesn't know          | Medium   |
| M6  | No mention in non-chat contexts (world events, faction messages) | Low      |
| M7  | Multi-turn @mention — `@Luna @Max` picks only first actor        | Medium   |
| M8  | Disambiguation — `@Knight` matches multiple actors               | Low      |

### 3.3 M1 — Autocomplete

**Current:** User types `@Luna` manually.
**Proposed:** Frontend autocomplete dropdown triggered by `@`.

```typescript
interface MentionAutocomplete {
  /** Available actors in current context */
  candidates: MentionCandidate[];
  /** Filter by typed prefix */
  filter(prefix: string,): MentionCandidate[];
  /** Resolve selected candidate to actor ID */
  resolve(candidate: MentionCandidate,): string;
}

interface MentionCandidate {
  actorId: string;
  displayName: string;
  actorType: "user" | "character" | "assistant" | "npc";
  avatar?: string; // for UI display
  isPresent: boolean; // currently in chat
  recentMention: boolean; // mentioned in last 5 messages
}
```

**Data flow:**

1. User types `@` in input
2. Frontend calls `GET /api/chats/:chatId/mention-candidates`
3. Backend returns participants sorted by: present > recent > alphabetical
4. Frontend shows dropdown, filters as user types
5. Selection inserts `@DisplayName` into input

**Files:**

- `src/routes/chats.ts` — `GET /api/chats/:chatId/mention-candidates`
- `src/frontend/alpine/mention-autocomplete.ts` — new Alpine component
- `src/components/chat/mention-dropdown.html` — dropdown template

### 3.4 M2 — Fuzzy Matching

**Current:** Exact match on display name.
**Proposed:** Prefix + substring matching with scoring.

```typescript
function fuzzyMatchMention(
  input: string,
  candidates: MentionCandidate[],
): MentionCandidate[] {
  const lower = input.toLowerCase();
  return candidates
    .map(c => ({
      candidate: c,
      score: scoreMatch(lower, c.displayName.toLowerCase(),),
    }))
    .filter(m => m.score > 0)
    .sort((a, b,) => b.score - a.score)
    .map(m => m.candidate);
}

function scoreMatch(input: string, name: string,): number {
  if (name === input) { return 100; // exact
   }
  if (name.startsWith(input,)) { return 80; // prefix
   }
  if (name.includes(input,)) { return 50; // substring
   }
  return 0;
}
```

### 3.5 M3 — Role-Based Mentions

Special mention tokens that resolve to multiple actors:

| Token                | Resolves to                       | Example                        |
| -------------------- | --------------------------------- | ------------------------------ |
| `@all`               | All participants                  | "We should rest, @all"         |
| `@players`           | All user participants             | "@players, what do you think?" |
| `@npcs`              | All NPC actors                    | "@npcs, stand guard"           |
| `@party`             | Current party members             | "@party, follow me"            |
| `@gm` / `@assistant` | The GM/assistant                  | "@gm, can we rest here?"       |
| `@here`              | Participants active in last 5 min | "@here, anyone around?"        |

**Implementation:**

```typescript
// In mention-parser.ts — add role resolution
const ROLE_MENTIONS: Record<string, (participants: Participant[],) => string[]> = {
  "@all": (p,) => p.map(x => x.actorId),
  "@players": (p,) => p.filter(x => x.actorType === "user").map(x => x.actorId),
  "@npcs": (p,) => p.filter(x => x.agentType === "npc").map(x => x.actorId),
  "@party": (p,) => p.filter(x => x.partyId === currentPartyId).map(x => x.actorId),
  "@gm": (p,) => p.filter(x => x.agentType === "game_master").map(x => x.actorId),
  "@here": (p,) => p.filter(x => x.lastActiveAt > fiveMinutesAgo).map(x => x.actorId),
};
```

### 3.6 M4 — Context-Aware Resolution

Mentions resolve differently based on context:

| Context         | Scope                  | Example                                     |
| --------------- | ---------------------- | ------------------------------------------- |
| Group chat      | Chat participants only | `@Luna` → only if Luna is in this chat      |
| Story mode      | All story actors       | `@Luna` → Luna even if not in current scene |
| World event     | World participants     | `@Luna` → Luna if in this world             |
| Faction message | Faction members        | `@Luna` → Luna if in this faction           |

The existing `resolveMention()` function takes a participant list — the caller
is responsible for scoping the list to the current context. This is already
correct; just needs documentation.

### 3.7 M5 — Mention Notifications

When an actor is mentioned, emit a notification:

```typescript
// After mention resolution:
for (const actorId of mentionedActorIds) {
  await emitNotification({
    type: "mention",
    target_actor_id: actorId,
    chat_id: chatId,
    message_id: messageId,
    mentioned_by: senderId,
    preview: messageText.slice(0, 100,),
  },);
}
```

**Integration:** Connects to the existing notification system
(`src/routes/notifications.ts`, `src/frontend/alpine/chat-activity.ts`).

### 3.8 M7 — Multi-Turn @Mention

**Current:** `extractMentionedActorIds()` returns all mentioned IDs;
`selectNextGroupActor()` picks `mentionedIds[0]`.

**Proposed:** Support queuing multiple mentioned actors for sequential generation:

```typescript
interface MentionQueue {
  /** Actors mentioned in the current message, in order */
  queued: string[];
  /** Index of next actor to generate */
  nextIndex: number;
  /** Advance to next mentioned actor, or null if exhausted */
  advance(): string | null;
}
```

**Flow:**

1. User sends `@Luna @Max what do you think?`
2. `extractMentionedActorIds()` returns `["luna_id", "max_id"]`
3. System generates as Luna first
4. After Luna's response, system generates as Max
5. Both responses appear in chat

This turns a single user message into a multi-actor conversation trigger.

### 3.9 M8 — Disambiguation

When `@Knight` matches multiple actors (Sir Aldric, Dark Knight NPC):

```typescript
interface DisambiguationResult {
  ambiguous: true;
  prefix: string;
  candidates: MentionCandidate[];
  /** Suggested resolution: pick most recently active */
  suggestion: MentionCandidate;
}
```

**Options:**

1. **Auto-resolve to most recent** — silent, may surprise user
2. **Show disambiguation UI** — frontend shows picker
3. **Require more specificity** — error: "Did you mean @SirAldric or @DarkKnight?"

**Recommended:** Option 1 with visual feedback — resolve to most recently active,
show a subtle "Resolved @Knight → Sir Aldric" indicator. User can click to change.

### 3.10 API Endpoints (New)

```
GET  /api/chats/:chatId/mention-candidates     # Autocomplete data
GET  /api/chats/:chatId/mention-resolve?q=...  # Fuzzy resolve query
POST /api/chats/:chatId/mention-queue          # Queue multi-actor generation
```

---

## 4. Integration with Group Chat Reconciliation

These designs connect to the group chat reconciliation doc:

| Reconciliation Gap        | Voting/Mention Connection                                                         |
| ------------------------- | --------------------------------------------------------------------------------- |
| G2 (talkativity → prompt) | LLM vote reason should reflect talkativity (reserved = brief reason)              |
| G4 (cascade guard)        | Multi-turn @mention (M7) bypasses cascade entirely — actors are pre-selected      |
| G6 (silence/pass)         | LLM can abstain from voting if `talkativity < 3` (reserved character stays quiet) |

---

## 5. Implementation Priority

| Priority | Feature                                           | Effort | Reason                                 |
| -------- | ------------------------------------------------- | ------ | -------------------------------------- |
| **1**    | M7 — Multi-turn @mention                          | Small  | Biggest UX improvement for group chats |
| **2**    | M5 — Mention notifications                        | Small  | Completes the mention loop             |
| **3**    | M3 — Role-based mentions                          | Small  | `@all`, `@npcs` are high-value         |
| **4**    | Polls — core (simple + yes_no)                    | Medium | Foundation for all poll types          |
| **5**    | M1 — Autocomplete                                 | Medium | Requires frontend work                 |
| **6**    | Polls — LLM voting                                | Medium | Requires prompt integration            |
| **7**    | Polls — advanced types (ranked, points, weighted) | Medium | Builds on core                         |
| **8**    | M2 — Fuzzy matching                               | Small  | Nice-to-have                           |
| **9**    | M4 — Context-aware resolution                     | Small  | Mostly documentation                   |
| **10**   | M8 — Disambiguation                               | Small  | Edge case                              |
| **11**   | Polls — templates + event integration             | Medium | Requires event system                  |
| **12**   | M6 — Non-chat mentions                            | Small  | Future expansion                       |

---

## 6. File Change Summary

### @Mention Expansion

| File                                          | Change                                               |
| --------------------------------------------- | ---------------------------------------------------- |
| `src/group-chat/mention-parser.ts`            | Add fuzzy matching, role mentions, disambiguation    |
| `src/group-chat/mention-parser.test.ts`       | Tests for new features                               |
| `src/group-chat/mention-queue.ts`             | **New** — multi-turn mention queue                   |
| `src/routes/chats.ts`                         | Add mention-candidates and mention-resolve endpoints |
| `src/frontend/alpine/mention-autocomplete.ts` | **New** — autocomplete Alpine component              |
| `src/components/chat/mention-dropdown.html`   | **New** — dropdown template                          |

### Voting / Polls

| File                                 | Change                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| `src/db/migrations/XXX_polls.ts`     | **New** — polls, poll_votes, poll_templates tables          |
| `src/db/schema-core.ts`              | Add Polls, PollVotes, PollTemplates interfaces              |
| `src/db/enums.ts`                    | Add PollType, PollResolution, PollStatus, PollContext enums |
| `src/polls/service.ts`               | **New** — poll CRUD, voting, resolution logic               |
| `src/polls/llm-voter.ts`             | **New** — LLM voting behavior                               |
| `src/polls/resolvers.ts`             | **New** — resolution algorithms (majority, borda, etc.)     |
| `src/polls/types.ts`                 | **New** — shared types                                      |
| `src/polls/index.ts`                 | **New** — barrel export                                     |
| `src/routes/polls.ts`                | **New** — REST endpoints                                    |
| `src/frontend/alpine/poll-widget.ts` | **New** — poll UI component                                 |
| `src/components/chat/poll-card.html` | **New** — poll display template                             |
| `src/rpg/integration-registry.ts`    | Add poll events to social/faction/housing edges             |

---

## 7. Test Strategy

| Test                                                              | Covers     |
| ----------------------------------------------------------------- | ---------- |
| `parseMentions("@@all @Luna")` — role + individual                | M3         |
| `fuzzyMatchMention("lun", candidates)` — returns Luna             | M2         |
| `MentionQueue.advance()` — sequential actor selection             | M7         |
| `resolveDisambiguation("@Knight", 2 matches)` — picks most recent | M8         |
| `PollService.createVote()` — simple poll                          | Core       |
| `PollService.resolveMajority()` — tally + winner                  | Core       |
| `PollService.resolveBorda()` — ranked choice                      | Advanced   |
| `LLMVoter.vote()` — personality-influenced choice                 | LLM voting |
| `PollService.createVote()` — duplicate vote prevention            | Edge case  |
| `PollService.changeVote()` — updates with changed_from history    | Edge case  |
| `PollService.expirePoll()` — timeout closes poll                  | Lifecycle  |
