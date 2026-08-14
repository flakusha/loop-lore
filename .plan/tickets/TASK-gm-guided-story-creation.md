# TASK: GM-Guided Story Creation

**Status:** 🟡 In Progress (UI + persistence implemented in worktree `feature/gm-guided-story-ui`; orchestrator consumption pending)
**Priority:** High
**Effort:** High
**Epic:** epic-assistant-gm-flows

## Progress (2026-08-14)

Implemented in worktree `feature/gm-guided-story-ui` (commit `669d7912`, GPG-signed):

- ✅ `GmConfig` extended with `storyMode` + `gmGuidance` (backend `src/chat/types/config.ts` + frontend `src/frontend/alpine/chat-types/gm.ts`)
- ✅ `GmParticipant` type added (frontend) for the user-GM model
- ✅ `PUT /api/v1/chats/:id/gm-guidance` endpoint (runtime-patchable, no online key-mechanic lock) + `updateGmGuidance` service
- ✅ Dedicated `gm-guidance` Alpine component + Chat Settings panel (scene, target character, constraints, turn priority, apply/clear)
- ✅ `/guide` + `/scene` command buttons open the GM Guidance panel
- ✅ Validation schemas extended (`GmConfigSchema`, `GmGuidanceUpdateBody`)
- ✅ Documented in `docs/frontend/chat/group-chat.md`
- ✅ Service + component tests (9 passing)

**Pending:** The story orchestrator (`GameMasterService` / turn selector) does not yet *consume* `gm_config.gmGuidance` to actually steer character turns at runtime — that is a backend integration follow-up (separate ticket).

## Summary

The user acts as Game Master, directly guiding LLM characters in chat or group-chat to collaboratively create a story. Unlike automated GM flows, the human GM has explicit control over narrative direction — directing which characters speak, setting scene constraints, steering turn order, and injecting narrative prompts. Built on existing GM flows infrastructure but adds the "user-as-GM" UX layer.

## Rationale

- Group chat already supports multiple participants (users + characters + assistants). Extending this with a user-GM participant type is natural and low-friction.
- `GmConfig.assistantRole` in `chat-types.ts` already defines `"gm"` as a role; this task builds the narrative guidance UX around it.
- Story-mode backend (`src/story/`) has turn orchestration ready; this task wires the user as the turn orchestrator instead of the system.
- Bridges GM flows (P2-D) with chat system (P2-B) into a cohesive story-creation workflow.

## Design

### User-GM Participant Type

| Participant         | Role       | Control Level                                                 |
| ------------------- | ---------- | ------------------------------------------------------------- |
| Human User          | **GM**     | Full narrative control — directs characters, sets constraints |
| LLM Character       | **Player** | Responds in-character based on GM guidance                    |
| Assistant (GM role) | **Co-GM**  | Optional — auto-generates scene details, NPC voices           |

### GM Guidance Commands

| Command                                     | Effect                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/guide <direction>`                        | Set narrative direction for the next turn (e.g., `/guide focus on the mysterious door`)            |
| `/target <character>`                       | Direct the next response to a specific character                                                   |
| `/constraint <rule>`                        | Add a narrative constraint for this turn (e.g., `/constraint stay in-character as a cautious elf`) |
| `/scene <description>`                      | Describe the current scene for all characters                                                      |
| `/skip <character>`                         | Skip a character's turn                                                                            |
| `/priority <character> <high\|medium\|low>` | Set turn priority for next round                                                                   |

### Frontend Architecture

```
src/frontend/
├── pages/
│   └── visual-novel.ts          (existing - VN page)
├── alpine/
│   ├── chat-types.ts            (extend participant types for "gm" role)
│   ├── command-buttons.ts       (add /guide button)
│   ├── chat-settings.ts         (add GM guidance panel)
│   └── chat.ts                  (wire GM turn-order control)
└── pages.ts                     (wire new routes)
```

### Key Type Changes

In `src/frontend/alpine/chat-types.ts`:

```typescript
// Extend GmConfig with story-mode fields
export interface GmConfig {
  assistantRole?: "off" | "helper" | "gm" | "moderator";
  visualNovel?: boolean;
  // NEW: GM-guided story fields
  storyMode?: boolean;
  gmGuidance?: {
    constraints: string[];
    targetCharacter?: string;
    sceneDescription?: string;
    turnPriority: Record<string, "high" | "medium" | "low">;
  };
}
```

In `src/frontend/alpine/chat-types.ts` — extend participant types:

```typescript
export interface GroupChatParticipant {
  id: string;
  name: string;
  type: "user" | "character" | "assistant" | "gm"; // added "gm"
  role: "gm" | "player" | "cogm" | "moderator"; // added "gm" role
  isActive: boolean;
  order: number; // turn order
}
```

## Acceptance Criteria

- [ ] `GmConfig` type extended with `storyMode` and `gmGuidance` fields in `chat-types.ts`
- [ ] Participant type extended to include `"gm"` role in `chat-types.ts`
- [ ] `/guide` command button added to `command-buttons.ts` with narrative direction input
- [ ] GM guidance panel added to `chat-settings.ts` (constraints, character targeting, turn control)
- [ ] GM turn-order control wired into group chat message flow in `chat.ts`
- [ ] GM-guided story variant documented in `docs/frontend/chat/group-chat.md`
- [ ] User-GM can direct characters to speak in group chat
- [ ] User-GM can set scene description visible to all participants
- [ ] User-GM can constrain character responses (in-character, topic, tone)
- [ ] Turn order UI respects GM-set priorities
- [ ] All new code has passing TypeScript checks

## Integration Points

- **epic-assistant-gm-flows.md** — GM flows parent epic; GM-guided story uses the same reconciliation infrastructure
- **epic-story-mode-ui.md** — Story Mode UI; GM-guided story uses the GM panel and turn-order visualization
- **docs/frontend/chat/group-chat.md** — Group chat spec; GM-guided story is a variant of group chat
- **docs/frontend/chat/assistant.md** — Assistant as GM; the user-GM variant complements the assistant-GM variant
- **docs/spec/assistant-commands.md** — Assistant commands; `/guide` is a new command prefix

## Tasks

- [ ] Extend `GmConfig` type with story-mode fields in `chat-types.ts`
- [ ] Extend participant types to include `"gm"` role in `chat-types.ts`
- [ ] Add `/guide` command button to `command-buttons.ts`
- [ ] Add GM guidance panel to `chat-settings.ts`
- [ ] Wire GM turn-order control into group chat flow in `chat.ts`
- [ ] Document GM-guided story variant in `group-chat.md` spec
- [ ] Write TypeScript integration tests

## Files to Create/Modify

| File                                     | Action                                  |
| ---------------------------------------- | --------------------------------------- |
| `src/frontend/alpine/chat-types.ts`      | Extend `GmConfig` and participant types |
| `src/frontend/alpine/command-buttons.ts` | Add `/guide` button and handler         |
| `src/frontend/alpine/chat-settings.ts`   | Add GM guidance panel component         |
| `src/frontend/alpine/chat.ts`            | Wire GM turn-order control              |
| `docs/frontend/chat/group-chat.md`       | Document GM-guided story variant        |

## Risk

Medium — GM-guided story creation changes the chat UX in group-chat mode. The existing group-chat infrastructure (participants, turn order, message tree) provides a solid foundation, but the GM-control-as-participant model needs careful UX design to avoid confusion between "user-GM" and "assistant-GM" roles.

## Related

- `TASK-assistant-gm-flows.md` — GM flows parent task
- `TASK-assistant-gm-flows-reconciliation.md` — GM/assistant reconciliation
- `TASK-wire-gm-service-story-mode.md` — GM service wiring
- `epic-assistant-gm-flows.md` — Parent epic
- `epic-story-mode-ui.md` — Story mode UI epic
- `docs/frontend/chat/group-chat.md` — Group chat spec (194 lines, partially implemented)
- `docs/frontend/chat/multi-llm-story.md` — Story mode spec (521 lines, aspirational)
