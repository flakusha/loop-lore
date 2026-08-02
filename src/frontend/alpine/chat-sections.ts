// ── Chat sections (multi-location sectioning) — manage panel ────
//
// Additive chat sectioning: sections divide a chat's message stream into
// ordered groups (optionally bound to a location). The panel lists sections,
// lets the user create/delete/reorder them, picks the "active" section, and
// assigns/clears that section on individual messages.
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-sections", },);

export interface ChatSectionRow {
  id: string;
  label: string;
  description: string | null;
  location_id: string | null;
  sort_index: number;
}

export const chatSections: Partial<ChatState> & ThisType<ChatState> = {
  _sections: [] as ChatSectionRow[],
  _sectionsLoading: false,
  _sectionsOpen: false,
  _activeSectionId: null as string | null,
  _newSectionLabel: "",
  _newSectionDesc: "",

  toggleSectionsPanel() {
    this._sectionsOpen = !this._sectionsOpen;
    if (this._sectionsOpen && this.activeChat) {
      this.loadSections();
    }
  },

  async loadSections() {
    if (!this.activeChat) { return; }
    this._sectionsLoading = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/sections`,);
      if (!res.ok) { return; }
      const body = await res.json();
      this._sections = (body.data as ChatSectionRow[]) || [];
      // Keep active section valid.
      if (!this._activeSectionId || this._sections.every((s,) => s.id !== this._activeSectionId)) {
        this._activeSectionId = this._sections[0]?.id ?? null;
      }
    } catch (error) {
      log.warn("loadSections failed", { error: String(error,), },);
    }
    this._sectionsLoading = false;
  },

  async createSection() {
    if (!this.activeChat || !this._newSectionLabel.trim()) { return; }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ label: this._newSectionLabel.trim(), description: this._newSectionDesc || null, },),
      },);
      if (res.ok) {
        this._newSectionLabel = "";
        this._newSectionDesc = "";
        await this.loadSections();
      }
    } catch (error) {
      log.warn("createSection failed", { error: String(error,), },);
    }
  },

  async deleteSection(sectionId: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/sections/${sectionId}`, { method: "DELETE", },);
      if (res.ok) {
        if (this._activeSectionId === sectionId) { this._activeSectionId = null; }
        await this.loadSections();
      }
    } catch (error) {
      log.warn("deleteSection failed", { error: String(error,), },);
    }
  },

  async moveSection(sectionId: string, dir: -1 | 1,) {
    if (!this.activeChat) { return; }
    const idx = this._sections.findIndex((s,) => s.id === sectionId);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= this._sections.length) { return; }
    const reordered = this._sections.map((s,) => ({ ...s, }));
    const tmp = reordered[idx]!;
    reordered[idx] = reordered[target]!;
    reordered[target] = tmp;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/sections/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ sectionIds: reordered.map((s,) => s.id), },),
      },);
      if (res.ok) { await this.loadSections(); }
    } catch (error) {
      log.warn("moveSection failed", { error: String(error,), },);
    }
  },

  sectionLabel(sectionId: string | null,): string {
    if (!sectionId) { return "Unassigned"; }
    return this._sections.find((s,) => s.id === sectionId)?.label ?? "Unknown";
  },

  async assignMessageToSection(messageId: string, sectionId: string | null,) {
    if (!this.activeChat) { return; }
    try {
      await apiFetch(`/api/chats/${this.activeChat}/messages/${messageId}/section`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ sectionId, },),
      },);
    } catch (error) {
      log.warn("assignMessageToSection failed", { error: String(error,), },);
    }
  },
};
