// ── Chat sections — story-spanning navigation (Phases 2-6) ────
//
// Story map (message counts, current-section highlight, actor presence,
// split-party indicator), sticky-location-header scrollspy, and section
// transfer. Split from chat-sections.ts to keep both files under the 250L
// size ceiling. State is merged into ChatState via mergeReactiveSource (the
// module declares `get` accessors), so no plain-spread composition.
import type { ChatState, } from "./types";

export const chatSectionsNav: Partial<ChatState> & ThisType<ChatState> = {
  _currentSectionId: null as string | null,
  _storyMapOpen: false,

  toggleStoryMap() {
    this._storyMapOpen = !this._storyMapOpen;
    if (this._storyMapOpen && this.activeChat) {
      this.loadSections();
    }
  },

  /**
   * Map of section id → number of messages assigned to it (from the loaded
   * message stream). Unassigned messages are not counted.
   *
   * @returns Map keyed by section id.
   */
  sectionMessageCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const msg of this.groupedMessages) {
      if (!msg.section_id) { continue; }
      counts.set(msg.section_id, (counts.get(msg.section_id,) ?? 0) + 1,);
    }
    return counts;
  },

  /** Name of the section currently in view (scrollspy), for the header. */
  get currentSectionName(): string | null {
    return this._currentSectionId ? this.sectionLabel(this._currentSectionId,) : null;
  },

  /**
   * Unique actor names that have messages in the given section. Used by the
   * group-chat story map to show per-character location presence.
   *
   * @param sectionId Section to inspect.
   * @returns Unique actor names.
   */
  sectionActors(sectionId: string,): string[] {
    const names = new Set<string>();
    for (const msg of this.groupedMessages) {
      if (msg.section_id !== sectionId) { continue; }
      if (msg.actor_name) { names.add(msg.actor_name,); }
    }
    return Array.from(names,);
  },

  /** True when actors occupy more than one section (party is separated). */
  get partySplit(): boolean {
    const occupied = new Set<string>();
    for (const msg of this.groupedMessages) {
      if (msg.section_id && msg.actor_name) { occupied.add(msg.section_id,); }
    }
    return occupied.size > 1;
  },

  /**
   * Scrollspy: find which section the message list viewport is currently in
   * (the last section divider above the scroll position) and store it in
   * `_currentSectionId`. Throttled to animation frames; a no-op when the
   * stream is not mounted.
   */
  trackCurrentSection() {
    const el = document.querySelector("#message-list",);
    if (!el) { return; }
    const dividers = Array.from(el.querySelectorAll(".section-divider[data-section-id]",),);
    if (dividers.length === 0) {
      this._currentSectionId = null;
      return;
    }
    const top = el.scrollTop + 80;
    let found: string | null = null;
    for (const div of dividers) {
      if ((div as HTMLElement).offsetTop <= top) {
        found = (div as HTMLElement).dataset.sectionId ?? null;
      } else {
        break;
      }
    }
    this._currentSectionId = found;
  },

  /**
   * Transfer the story position to a section: mark it active, jump to it, and
   * (when the section is bound to a world location) sync the chat's current
   * location so backgrounds follow the new scene.
   *
   * @param sectionId Destination section.
   */
  async transferToSection(sectionId: string,) {
    if (!this.activeChat) { return; }
    const section = this._sections.find((s,) => s.id === sectionId);
    if (!section) { return; }
    this._activeSectionId = sectionId;
    this.jumpToSection(sectionId,);
    if (section.location_id) {
      this._selectedLocationId = section.location_id;
      await this.changeChatLocation();
    }
  },
};
