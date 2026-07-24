/**
 * Ordered registry of prompt sections — the single source of truth for prompt
 * assembly order. Add a section: create a builder under ./sections and add it
 * here. The orchestrator runs them in this exact order.
 */
import { actorHeaderSection, } from "./sections/actor-header";
import { authorNoteSection, } from "./sections/author-note";
import { chatHistorySection, } from "./sections/chat-history";
import { dynamicContextSection, } from "./sections/dynamic-context";
import { emotionAvatarSection, } from "./sections/emotion-avatar";
import { eventSection, } from "./sections/events";
import { examplesSection, } from "./sections/examples";
import { groupParticipantsSection, } from "./sections/group-participants";
import { loreSection, } from "./sections/lore";
import { memorySection, } from "./sections/memories";
import { nsfwContextSection, } from "./sections/nsfw-context";
import { postHistorySection, } from "./sections/post-history";
import { recentEventsSection, } from "./sections/recent-events";
import { storyContextSection, } from "./sections/story-context";
import { systemSection, } from "./sections/system";
import { userPersonaSection, } from "./sections/user-persona";
import type { SectionBuilder, } from "./types";

export const PROMPT_SECTIONS: SectionBuilder[] = [
  systemSection,
  authorNoteSection,
  actorHeaderSection,
  groupParticipantsSection,
  userPersonaSection,
  nsfwContextSection,
  emotionAvatarSection,
  loreSection,
  memorySection,
  eventSection,
  postHistorySection,
  storyContextSection,
  dynamicContextSection,
  recentEventsSection,
  examplesSection,
  chatHistorySection,
];
