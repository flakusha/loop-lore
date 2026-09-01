// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ordered registry of prompt sections — the single source of truth for prompt
 * assembly order. Add a section: create a builder under ./sections and add it
 * here. The orchestrator runs them in this exact order.
 */
import { actorHeaderSection, } from "./sections/actor-header";
import { authorNoteSection, } from "./sections/author-note";
import { chatHistorySection, } from "./sections/chat-history";
import { customInstructionsSection, } from "./sections/custom-instructions";
import { dynamicContextSection, } from "./sections/dynamic-context";
import { emotionAvatarSection, } from "./sections/emotion-avatar";
import { eventSection, } from "./sections/events";
import { examplesSection, } from "./sections/examples";
import { gmNotesSection, } from "./sections/gm-notes";
import { groupParticipantsSection, } from "./sections/group-participants";
import { internalTraitsSection, } from "./sections/internal-traits";
import { loreSection, } from "./sections/lore";
import { memorySection, } from "./sections/memories";
import { nsfwPolicySection, } from "./sections/nsfw-policy";
import { styleSection, } from "./sections/output-style";
import { pluginAgentRoleSection, } from "./sections/plugin-agent-role";
import { postHistorySection, } from "./sections/post-history";
import { recentEventsSection, } from "./sections/recent-events";
import { storyContextSection, } from "./sections/story-context";
import { systemSection, } from "./sections/system";
import { taskClarificationSection, } from "./sections/task-clarification";
import { travelSection, } from "./sections/travel";
import { userPersonaSection, } from "./sections/user-persona";
import type { SectionBuilder, } from "./types";

export const PROMPT_SECTIONS: SectionBuilder[] = [
  systemSection,
  styleSection,
  taskClarificationSection,
  nsfwPolicySection,
  authorNoteSection,
  customInstructionsSection,
  actorHeaderSection,
  pluginAgentRoleSection,
  groupParticipantsSection,
  userPersonaSection,
  emotionAvatarSection,
  internalTraitsSection,
  loreSection,
  memorySection,
  eventSection,
  storyContextSection,
  travelSection,
  gmNotesSection,
  dynamicContextSection,
  recentEventsSection,
  examplesSection,
  chatHistorySection,
  // postHistorySection is rendered as `role: "user"` (not "system"), so it
  // is NOT spliced to the front by `reorderPromptMessages`. Placed AFTER
  // chat history so the post-history instructions land at the end of the
  // assembled messages — matching the documented SillyTavern semantics
  // ("instructions appended after chat history") and the intent stated in
  // sections/post-history.ts.
  postHistorySection,
];
