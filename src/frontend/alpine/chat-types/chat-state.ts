import type { ChatCoreState, } from "./core";
import type { ChatLocationState, } from "./location-state";
import type { ChatMemoryState, } from "./memory-state";
import type { ChatMessageSearchState, } from "./message-search-state";
import type { ChatMoodState, } from "./mood-state";
import type { ChatParticipantsState, } from "./participants-state";
import type { ChatRpgState, } from "./rpg-state";

/** Aggregate ChatState: composed from domain slices. */
export interface ChatState
  extends
    ChatCoreState,
    ChatRpgState,
    ChatMoodState,
    ChatMemoryState,
    ChatLocationState,
    ChatMessageSearchState,
    ChatParticipantsState
{}
