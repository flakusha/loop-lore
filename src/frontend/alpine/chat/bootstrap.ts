// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 280
// ── Chat page (chat.html) — reactive state object builder ────
import type { AlpineState, ChatState, } from "../types";
import { attachValidateDraft, createComposerPreSend, } from "../composer-pre-send";
import { chatActions, } from "../chat-actions";
import { chatActivity, } from "../chat-activity";
import { chatBackgrounds, } from "../chat-backgrounds";
import { chatBattle, } from "../chat-battle";
import { chatEditing, } from "../chat-editing";
import { chatFilters, } from "../chat-filters";
import { chatGenerations, } from "../chat-generations";
import { chatGroup, } from "../chat-group";
import { chatInlineState, } from "./inline-state";
import { chatInvites, } from "../chat-invites";
import { chatKeys, } from "../chat-keys";
import { chatLifecycle, } from "./lifecycle";
import { chatLocation, } from "../chat-location";
import { chatManagement, } from "../chat-management";
import { chatMessages, } from "../chat-messages";
import { chatMusicEmbed, } from "./music-embed";
import { chatPanels, } from "../chat-panels";
import { chatParticipants, } from "../chat-participants";
import { chatPins, } from "../chat-pins";
import { chatProactive, } from "../chat-proactive";
import { chatPromptTemplate, } from "../chat-prompt-template";
import { chatQuickReplies, } from "../chat-quick-replies";
import { chatSections, } from "../chat-sections";
import { chatSectionsNav, } from "../chat-sections-nav";
import { chatSettings, } from "../chat-settings";
import { chatSideChannels, } from "../chat-side-channels";
import { chatUtils, } from "../chat-utils";
import { chatVariants, } from "../chat-variants";
import { chatWorld, } from "./world";
import { creationWizard, } from "../creation-wizard";
import { gifPicker, } from "../chat-actions/gif-picker";
import { messageArchive, } from "../message-archive";
import { messageSearch, } from "../message-search";
import { promptAnalyzeActions, } from "../chat-actions/prompt-analyze";
import { promptImproveActions, } from "../chat-actions/prompt-improve";
import { worldChannels, } from "../world-channels";

import { mergeReactiveSource, } from "./merge-reactive";

/** Build the chat page's reactive Alpine state (registry entry = chatState). */
export function chatState() {
  const state = {
    ...chatInlineState,

    // ── Sub-module state + methods ──
    ...chatKeys,
    ...chatGroup,
    ...chatSettings,
    ...chatPromptTemplate,
    ...chatQuickReplies,
    ...chatBattle,
    ...chatPanels,
    ...chatProactive,
    ...creationWizard,

    // ── Lifecycle (init / destroy / user + chat list load) ──
    ...chatLifecycle,
    ...chatWorld,

    // ── Sub-module methods ──
    ...chatKeys,
    ...chatFilters,
    ...chatGroup,
    ...chatSettings,
    ...chatBackgrounds,
    ...messageSearch,
    ...chatMessages,
    ...chatGenerations,
    ...chatVariants,
    ...chatActivity,
    ...chatManagement,
    ...chatEditing,
    ...attachValidateDraft(createComposerPreSend(),),
    ...chatActions,
    ...promptImproveActions,
    ...promptAnalyzeActions,
    ...gifPicker,
    ...chatMusicEmbed,
    ...chatPins,
    ...messageArchive,
    ...chatInvites,
    ...worldChannels,
  };

  // chatLocation + chatUtils + chatSections + chatSectionsNav declare `get`
  // accessors — plain spread would evaluate them once and freeze the result.
  mergeReactiveSource(state, chatLocation,);
  mergeReactiveSource(state, chatUtils,);
  mergeReactiveSource(state, chatSections,);
  mergeReactiveSource(state, chatSectionsNav,);
  // chatParticipants declares getters (isGroupChat, filteredAvailableActors) —
  // a plain spread would freeze them, so merge descriptor-preserving.
  mergeReactiveSource(state, chatParticipants,);
  // chatSideChannels declares a getter (isGroupChat) — merge descriptor-preserving.
  mergeReactiveSource(state, chatSideChannels,);

  return state as unknown as AlpineState<ChatState>;
}
