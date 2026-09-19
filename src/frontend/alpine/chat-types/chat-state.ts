// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatArchiveState, } from "./archive-state";
import type { ChatBattleState, } from "./battle-state";
import type { ChatComposerPreSendState, } from "./composer-pre-send-state";
import type { ChatCoreState, } from "./core";
import type { GifPickerState, } from "./gif-picker-state";
import type { ChatLocationState, } from "./location-state";
import type { ChatMemoryState, } from "./memory-state";
import type { ChatMessageSearchState, } from "./message-search-state";
import type { ChatMoodState, } from "./mood-state";
import type { ChatMovementState, } from "./movement-state";
import type { ChatNpcState, } from "./npc-state";
import type { ChatParticipantsState, } from "./participants-state";
import type { ChatPinsState, } from "./pins-state";
import type { ChatPromptAnalyzeState, } from "./prompt-analyze-state";
import type { ChatPromptImproveState, } from "./prompt-improve-state";
import type { ChatPromptTemplateState, } from "./prompt-template-state";
import type { ChatRpgQuestionsState, ChatRpgState, } from "./rpg-state";
import type { ChatSideChannelsState, } from "./side-channels-state";
import type { ChatWizardState, } from "./wizard-state";

/** Aggregate ChatState: composed from domain slices. */
export interface ChatState
  extends
    ChatCoreState,
    ChatBattleState,
    ChatRpgState,
    ChatMoodState,
    ChatMemoryState,
    ChatLocationState,
    ChatMessageSearchState,
    ChatParticipantsState,
    ChatSideChannelsState,
    ChatPinsState,
    ChatArchiveState,
    ChatComposerPreSendState,
    ChatMovementState,
    ChatNpcState,
    ChatWizardState,
    ChatRpgQuestionsState,
    ChatPromptImproveState,
    ChatPromptAnalyzeState,
    ChatPromptTemplateState,
    GifPickerState
{}
