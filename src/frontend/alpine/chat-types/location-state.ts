// ── Chat Sections + Backgrounds + Location ──────────────────
export interface ChatLocationState {
  // ── Chat Sections (multi-location sectioning) ──────────────
  _sections: {
    id: string;
    label: string;
    description: string | null;
    location_id: string | null;
    sort_index: number;
  }[];
  _sectionsLoading: boolean;
  _sectionsOpen: boolean;
  _activeSectionId: string | null;
  _newSectionLabel: string;
  _newSectionDesc: string;
  toggleSectionsPanel(): void;
  loadSections(): Promise<void>;
  createSection(): Promise<void>;
  deleteSection(sectionId: string,): Promise<void>;
  moveSection(sectionId: string, dir: -1 | 1,): Promise<void>;
  sectionLabel(sectionId: string | null,): string;
  sectionDividerFor(index: number, sectionId: string | null,): {
    id: string;
    label: string;
    description: string | null;
    location_id: string | null;
    sort_index: number;
  } | null;
  jumpToSection(sectionId: string,): void;
  assignMessageToSection(messageId: string, sectionId: string | null,): Promise<void>;

  // ── Chat Backgrounds (location sync) ────────────────────
  _background: {
    id: string;
    name: string;
    type: string;
    location_id: string | null;
    asset_id: string | null;
    config: string | null;
    priority: number;
  } | null;
  _backgrounds: {
    id: string;
    name: string;
    type: string;
    location_id: string | null;
    asset_id: string | null;
    config: string | null;
    priority: number;
  }[];
  _backgroundsLoading: boolean;
  _backgroundsOpen: boolean;
  toggleBackgroundPanel(): void;
  loadBackground(): Promise<void>;
  loadBackgrounds(): Promise<void>;
  setBackground(backgroundId: string,): Promise<void>;
  removeBackground(): Promise<void>;

  // ── Chat Location (change / transfer / join at location) ─────
  _locations: {
    id: string;
    name: string;
    description: string | null;
  }[];
  _locationsLoading: boolean;
  _locationOpen: boolean;
  _selectedLocationId: string;
  _chatWorldId: string | null;
  _chatCurrentLocationId: string | null;
  _chatRecentLocationChanged: boolean;
  _locationBusy: boolean;
  _locationJoinableChats: {
    chatId: string;
    chatName: string;
    participantCount: number;
    lastActiveAt: string | null;
  }[];
  toggleLocationPanel(): void;
  loadLocations(): Promise<void>;
  loadLocationJoinable(): Promise<void>;
  joinLocationChat(chatId: string,): Promise<void>;
  readonly selectedLocationName: string | null;
  readonly currentLocationName: string | null;
  changeChatLocation(): Promise<void>;
  transferChatLocation(): Promise<void>;
  _locationWorldId(): Promise<string | null>;
  _emitLocationChanged(): void;
}
