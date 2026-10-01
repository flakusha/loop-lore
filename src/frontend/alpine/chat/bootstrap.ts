// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 280
// ── Chat page (chat.html) — reactive state object builder ────
import { chatActions, } from "../chat-actions";
import { gifPicker, } from "../chat-actions/gif-picker";
import { messageActions, } from "../chat-actions/message-actions";
import { promptAnalyzeActions, } from "../chat-actions/prompt-analyze";
import { promptImproveActions, } from "../chat-actions/prompt-improve";
import { turnSkipActions, } from "../chat-actions/turn-skip";
import { chatActivity, } from "../chat-activity";
import { chatBackgrounds, } from "../chat-backgrounds";
import { chatBattle, } from "../chat-battle";
import { chatEditing, } from "../chat-editing";
import { chatFilters, } from "../chat-filters";
import { chatGenerations, } from "../chat-generations";
import { chatGroup, } from "../chat-group";
import { chatInvites, } from "../chat-invites";
import { chatKeys, } from "../chat-keys";
import { chatLocation, } from "../chat-location";
import { chatManagement, } from "../chat-management";
import { chatMessages, } from "../chat-messages";
import { chatPanels, } from "../chat-panels";
import { chatParticipants, } from "../chat-participants";
import { chatPins, } from "../chat-pins";
import { chatProactive, } from "../chat-proactive";
import { chatPromptTemplate, } from "../chat-prompt-template";
import { chatQuickReplies, } from "../chat-quick-replies";
import { chatSections, } from "../chat-sections";
import { chatSectionsNav, } from "../chat-sections-nav";
import { chatSettings, } from "../chat-settings";
import { actorModelActions, } from "../chat-settings/actor-models";
import { chatSideChannels, } from "../chat-side-channels";
import { chatUtils, } from "../chat-utils";
import { chatVariants, } from "../chat-variants";
import { attachValidateDraft, createComposerPreSend, } from "../composer-pre-send";
import { creationWizard, } from "../creation-wizard";
import { messageArchive, } from "../message-archive";
import { messageSearch, } from "../message-search";
import type { AlpineState, ChatState, } from "../types";
import { worldChannels, } from "../world-channels";
import { chatInlineState, } from "./inline-state";
import { chatLifecycle, } from "./lifecycle";
import { chatMusicEmbed, } from "./music-embed";
import { chatWorld, } from "./world";

import { chatMusicLinks, } from "../chat-music-links";
import { slashAutocomplete, } from "../slash-autocomplete";
import { mergeReactiveSource, } from "./merge-reactive";

/** Build the chat page's reactive Alpine state (registry entry = chatState).
 * @returns The merged Alpine state for the chat page.
 */
export function chatState() {
  const state = {
    // ── Sub-module state + methods ──
    ...chatKeys,
    ...chatGroup,
    ...slashAutocomplete,
    ...chatSettings,
    ...chatPromptTemplate,
    ...chatQuickReplies,
    ...chatBattle,
    ...chatPanels,
    ...chatProactive,
    ...creationWizard,

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
    ...turnSkipActions,
    ...messageActions,
    ...chatMusicEmbed,
    ...chatPins,
    ...chatMusicLinks,
    ...messageArchive,
    ...chatInvites,
    ...worldChannels,

    // Lifecycle must be last: sub-modules such as commandPalette also expose init().
    ...chatLifecycle,
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
  // chatInlineState declares filteredChats and currentChat getters —
  // preserve them instead of freezing their initial values via spread.
  mergeReactiveSource(state, chatInlineState,);
  // actorModelActions declares the _actorModelRows getter — a plain spread
  // (as in chatSettings) would freeze it to a static empty array.
  mergeReactiveSource(state, actorModelActions,);

  return state as unknown as AlpineState<ChatState>;
}
