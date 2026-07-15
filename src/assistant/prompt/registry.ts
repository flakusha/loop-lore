/**
 * Ordered registry of prompt sections — the single source of truth for prompt
 * assembly order. Add a section: create a builder under ./sections and add it
 * here. The orchestrator runs them in this exact order.
 */
import type { SectionBuilder } from "./types";
import { actorHeaderSection } from "./sections/actor-header";
import { chatHistorySection } from "./sections/chat-history";
import { examplesSection } from "./sections/examples";
import { groupParticipantsSection } from "./sections/group-participants";
import { loreSection } from "./sections/lore";
import { memorySection } from "./sections/memories";
import { postHistorySection } from "./sections/post-history";
import { storyContextSection } from "./sections/story-context";
import { systemSection } from "./sections/system";
import { userPersonaSection } from "./sections/user-persona";

export const PROMPT_SECTIONS: SectionBuilder[] = [
  systemSection,
  actorHeaderSection,
  groupParticipantsSection,
  userPersonaSection,
  loreSection,
  memorySection,
  postHistorySection,
  examplesSection,
  chatHistorySection,
  storyContextSection,
];
