import type { AlpineMagicThis, GalleryAsset, } from "./types";

export interface MessageAttachment {
  assetId: string;
  order: number;
  caption: string;
  label: string;
  url: string;
  thumbUrl?: string;
  filename: string;
  mimeType: string;
  type: string;
  width: number;
  height: number;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  edited_at?: string;
  thinking?: string;
  actor_name?: string;
  variantIndex?: number;
  totalVariants?: number;
  attachments?: MessageAttachment[];
  model_id?: string;
  provider?: string;
  token_count_prompt?: number;
  token_count_completion?: number;
  token_count_total?: number;
  generation_time_ms?: number;
  tokens_per_second?: number;
  status?: string;
  emotion?: string;
  reactions?: { emoji: string; count: number; userReacted: boolean }[];
  pinned?: boolean;
}

export interface GroupedMessage extends Message {
  group?: boolean;
  groupCount?: number;
}

export interface GenerationDetail {
  model?: string;
  elapsedMs?: number;
  chunksReceived?: number;
  charsReceived?: number;
  status?: string;
  attemptId?: string;
}

/**
 * GM configuration persisted on a chat's `gm_config` JSON blob.
 * Mirrors the backend `src/chat/types.ts` `GmConfig` plus the VN display
 * keys the chat settings modal persists (`chat-settings.ts`).
 */
export interface GmConfig {
  /** Assistant's role in this chat: off, helper, gm, or moderator */
  assistantRole?: "off" | "helper" | "gm" | "moderator";
  /** Visual novel mode (image-heavy, sequential panel display) */
  visualNovel?: boolean;
  /** VN panel layout */
  vnLayout?: "overlay" | "below" | "split";
  /** VN typewriter effect enabled */
  vnTypewriter?: boolean;
  /** VN typewriter speed (chars per frame) */
  vnTypewriterSpeed?: number;
  /** VN scene transition style */
  vnTransition?: "fade" | "cut" | "dissolve" | "slide" | "wipe";
  /** VN auto-advance between scenes */
  vnAutoAdvance?: boolean;
}

// ── RPG Stats Types (Phase 1 Foundation) ─────────────────────
export interface RpgStatBlock {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface RpgStats extends RpgStatBlock {
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  ac: number;
  initiative: number;
  xp: number;
  xpToNext: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  description: string;
  duration: number; // -1 = infinite, 0+ = turns remaining
  modifier: Partial<RpgStatBlock>;
  icon?: string;
}

export interface EquipmentSlot {
  slot: "head" | "chest" | "legs" | "feet" | "hands" | "weapon" | "shield" | "accessory";
  itemId: string | null;
  itemName?: string;
}

// ── Memory Types ───────────────────────────────────────────────
export interface MemoryEntry {
  id: string;
  content: string;
  type: "episodic" | "semantic" | "procedural";
  category?: string;
  confidence: number;
  importance: number;
  keywords: string[];
  sourceMessageId?: string;
  createdAt: string;
  expiresAt?: string;
  pinned?: boolean;
  tokenCount?: number;
}

export interface MemoryPanelState {
  activeTab: "character" | "assistant" | "world";
  characterMemories: MemoryEntry[];
  assistantMemories: MemoryEntry[];
  worldMemories: MemoryEntry[];
  searchQuery: string;
  loading: boolean;
  tokenBudget: number;
  tokensUsed: number;
  showCreateForm: boolean;
  newMemoryContent: string;
}

/** One channel chat row returned by GET /api/worlds/:worldId/chats. */
export interface WorldChannelChat {
  id: string;
  name: string;
  current_location_id: string | null;
  location_name: string | null;
}

export interface ChatState extends AlpineMagicThis {
  isGenerating: boolean;
  generationLabel: string;
  activeAttemptId: string | null;
  continuingMessageId: string | null;
  isContinuing: boolean;
  _generationEventSource: EventSource | null;
  chats: {
    id: string;
    name?: string;
    isPinned?: number;
    type?: string;
    mode?: string;
    turn_strategy?: string;
    story_state?: string;
    gm_config?: string;
  }[];
  activeChat: string | null;
  messages: Message[];
  loadingMessages: boolean;
  loadingError: string | null;
  hasMoreMessages: boolean;
  loadingOlder: boolean;
  currentPage: number;
  totalPages: number;
  scrollObserver: IntersectionObserver | null;
  activeChatName: string;
  galleryAssets: GalleryAsset[];
  userDisplayName: string;
  userRole: string;
  currentCharacter: {
    id: string;
    display_name?: string;
    name?: string;
    description?: string;
    avatar_asset_id?: string;
  } | null;
  generationDetail: GenerationDetail | null;
  detailLevel: "Immersion" | "Basic" | "Detailed";
  impersonationActive: boolean;
  impersonatingActorId: string | null;

  editingMessageId: string | null;
  editContent: string;
  previewMediaAsset: GalleryAsset | null;
  pendingAssets: { assetId: string; filename: string }[];

  groupedMessages: GroupedMessage[];
  _observer: MutationObserver | null;
  _groupedKey: string;
  _groupedCache: GroupedMessage[] | null;
  _toggleChatListHandler: (() => void) | null;
  _toggleGalleryHandler: (() => void) | null;
  _toggleCharacterInfoHandler: (() => void) | null;
  _toggleMemoryPanelHandler: (() => void) | null;
  _panelClickHandler: ((e: MouseEvent,) => void) | null;
  _keydownHandler: ((e: KeyboardEvent,) => void) | null;
  _chatSettingsName: string;
  _chatSettingsMode: string;
  _chatSettingsTurnStrategy: string;
  _chatOnline: boolean;
  _groupPaused: boolean;
  _renameChatId: string;
  _renameChatName: string;
  _personas: any[];
  _selectedPersonaId: string | null;
  _impersonatingActorId: string | null;
  _assistantRole: "off" | "helper" | "gm" | "moderator";

  // VN (visual novel) mode settings — persisted to gm_config.
  _vnEnabled: boolean;
  _vnLayout: "overlay" | "below" | "split";
  _vnTypewriter: boolean;
  _vnTypewriterSpeed: number;
  _vnTransition: "fade" | "cut" | "dissolve" | "slide" | "wipe";
  _vnAutoAdvance: boolean;

  _chatKey: CryptoKey | null;
  _encryptionEnabled: boolean;
  _keyId: string | null;
  _hamburgerOpen: Record<string, boolean>;
  _statsOpen: Record<string, boolean>;
  _contextMenu: { visible: boolean; messageId: string | null; x: number; y: number };
  _impersonationLoaded: boolean;
  _storageHandler: ((e: StorageEvent,) => void) | null;
  _unseenCounts: Record<string, number>;
  _isScrolledUp: boolean;
  _scrollHandler: (() => void) | null;
  _activityEventSource: EventSource | null;
  _debugView: boolean;
  _showCommandPalette: boolean;
  _activeCommand: string;
  _commandList: { name: string; description: string }[];
  _filteredCommands: { name: string; description: string }[];
  _chatFilter: string;
  readonly filteredChats: { id: string; name?: string }[];
  // Chat-list filters (chat-filters.ts) — server-side query params for /api/chats.
  _chatType: "all" | "direct" | "group";
  _chatStatus: "all" | "active" | "archived";
  _chatSort: "recent" | "name" | "unread" | "pinned-first";
  _filterParams(): string;
  applyChatFilters(): Promise<void>;
  _searchResults: { chatId: string; chatName: string; characterName: string; characterAvatar: string | null }[];
  searchChats(q: string,): Promise<void>;
  // World channels (chat-only worlds) — sidebar tree.
  _worlds: { id: string; name: string }[];
  _worldChats: Record<string, WorldChannelChat[]>;
  _worldExpanded: Record<string, boolean>;
  _worldsLoading: boolean;
  worldJoinCode: string;
  loadWorldChannels(): Promise<void>;
  loadWorldChats(worldId: string,): Promise<void>;
  toggleWorld(worldId: string,): void;
  worldChatGroups(worldId: string,): { locationId: string; locationName: string; chats: WorldChannelChat[] }[];
  joinWorldByCode(): Promise<void>;
  _joinableChats: { chatId: string; chatName: string; participantCount: number; lastActiveAt: string | null }[];
  loadJoinableChats(): Promise<void>;
  joinChat(chatId: string,): Promise<void>;
  selectedChats: string[];
  _mentionQuery: string;
  _mentionResults: { actor_id: string; name: string; display_name?: string; actor_type?: string }[];
  _showMentionAutocomplete: boolean;
  _chatParticipants: { actor_id: string; name: string; display_name?: string; actor_type?: string }[];

  init(): void;
  destroy(): void;
  loadUserInfo(): Promise<void>;
  loadChats(): Promise<void>;
  selectChat(chatId: string,): Promise<void>;
  loadMessages(): Promise<void>;
  loadOlderMessages(): Promise<void>;
  setupInfiniteScroll(): void;
  sendMessage(): Promise<void>;
  autoResize(el: HTMLTextAreaElement,): void;
  scrollToBottom(): void;
  setupScrollDetection(): void;
  scrollToBottomSmooth(): void;
  loadGalleryAssets(): Promise<void>;
  loadCharacterInfo(): Promise<void>;
  formatTime(iso: string,): string;
  formatTimeShort(iso: string,): string;
  displayName(msg: { role: string; actor_name?: string },): string;
  copyMessage(msgId: string, event: Event,): Promise<void>;
  removeMessage(msgId: string, event: Event,): Promise<void>;
  toggleImpersonate(): Promise<void>;
  toggleDebugView(): void;
  handleCommandInput(event: Event,): void;
  selectCommand(name: string,): void;
  dispatchCommandAction(action: string, payload: Record<string, unknown> | null, chatId: string,): Promise<void>;
  loadImpersonationState(): Promise<void>;
  loadPersonas(): Promise<void>;
  setPersona(): Promise<void>;
  toggleImpersonation(): Promise<void>;
  generateImageFromMessage(msgId: string,): Promise<void>;
  captionMessage(msgId: string,): Promise<void>;
  statsLine(msg: {
    model_id?: string;
    provider?: string;
    generation_time_ms?: number;
    token_count_total?: number;
    tokens_per_second?: number;
  },): string;
  formattedGenerationTime(ms?: number,): string;
  formattedTokensPerSecond(msg: {
    tokens_per_second?: number;
    generation_time_ms?: number;
    token_count_total?: number;
  },): string;
  connectGenerationSSE(chatId: string,): void;
  _cleanupSSE(): void;
  cancelGeneration(): Promise<void>;
  connectActivitySSE(): void;
  disconnectActivitySSE(): void;
  markChatAsRead(chatId: string,): Promise<void>;
  getUnseenCount(chatId: string,): number;
  regenerateResponse(): Promise<void>;
  regenerateVariant(messageId: string,): Promise<void>;
  switchVariant(messageId: string, direction: number,): Promise<void>;
  continueMessage(messageId: string,): Promise<void>;
  retryFromPoint(attemptId: string, step: number,): Promise<void>;
  getChatId(): string | null;
  handleAttach(event: Event,): Promise<void>;
  escapeHtml(str: string,): string;
  startEdit(msgId: string,): void;
  cancelEdit(): void;
  saveEdit(msgId: string,): Promise<void>;
  renderMarkdown(content: string,): string;
  getMediaStyle(asset: any, totalCount: number,): Record<string, string>;
  openMediaPreview(asset: any,): void;
  removePendingAsset(assetId: string,): void;
  openAssetPreview(asset: { id: string; asset_type?: string; filename?: string; name?: string },): void;
  openChatSettings(): void;
  updateVnMode(): void;
  openContextMenu(event: MouseEvent, msgId: string,): void;
  closeContextMenu(): void;
  saveChatSettings(): Promise<void>;
  isChatPaused(chat: any,): boolean;
  readonly currentChat: {
    id: string;
    name?: string;
    type?: string;
    mode?: string;
    turn_strategy?: string;
    story_state?: string;
    gm_config?: string;
  } | null;
  toggleGroupPause(): Promise<void>;
  loadChatParticipants(): Promise<void>;
  handleMentionInput(event: Event,): void;
  selectMention(participant: { actor_id: string; name: string },): void;
  hideMentionAutocomplete(): void;
  renameChat(chatId: string,): Promise<void>;
  openRenameModal(chatId: string,): void;
  confirmRenameChat(): Promise<void>;
  deleteChat(chatId: string, event: Event,): Promise<void>;
  toggleChatPin(chatId: string,): Promise<void>;
  toggleChatSelection(chatId: string,): void;
  batchArchive(): Promise<void>;
  batchDelete(): Promise<void>;
  batchExport(): Promise<void>;
  loadChatKey(chatId: string,): Promise<void>;
  checkGenerationStatus(chatId: string,): Promise<void>;
  registerPanelHandlers(): void;
  unregisterPanelHandlers(): void;
  toggleReaction(msgId: string, emoji: string,): Promise<void>;
  loadMessageReactions(msgId: string,): Promise<void>;
  loadAllReactions(): Promise<void>;
  _reactionPicker: { visible: boolean; messageId: string; x: number; y: number };
  _quickEmojis: string[];
  showReactionPicker(msgId: string, event: Event,): void;
  closeReactionPicker(): void;

  // ── RPG Stats ───────────────────────────────────────────────
  rpgStats: RpgStats | null;
  statusEffects: StatusEffect[];
  equipment: EquipmentSlot[];
  loadRpgStats(): Promise<void>;
  getModifier(stat: number,): number;
  effectiveStat(base: number, effects: StatusEffect[],): number;

  // ── Mood System ───────────────────────────────────────────
  _mood: {
    happiness: number;
    currentMood: string;
    baseMood: string;
    moodStability: number;
    lastMoodChange: string;
    expressionModifiers: Record<string, number>;
  } | null;
  _moodLoading: boolean;
  _moodCanEdit: boolean;
  _moodSliderValue: number;
  _activeChatWorldId: string | null;
  _emotionAvatars: { emotion: string; avatarId: string; assetId: string }[];
  _emotionAvatarsLoading: boolean;
  _currentEmotionAvatar: string | null;
  _emotionGenRunning: boolean;
  _emotionGenStatus: string | null;
  _emotionGenJobId: string | null;
  _activeEmotions: { def: { id: string; icon: string | null; display_name: string }; intensity: number }[];
  _activeEmotionsLoading: boolean;
  loadMood(): Promise<void>;
  loadEmotionAvatars(): Promise<void>;
  generateEmotionAvatars(): Promise<void>;
  _pollEmotionJob(actorId: string, jobId: string | null,): Promise<void>;
  loadEmotions(): Promise<void>;
  getActiveEmotions(): { def: { id: string; icon: string | null; display_name: string }; intensity: number }[];
  avatarForMessage(msg: { role?: string; emotion?: string | null },): string | null;
  selectEmotionAvatar(emotion: string,): string | null;
  updateMoodHappiness(happiness: number,): Promise<void>;
  applyMoodDelta(delta: number,): Promise<void>;
  _happinessToMood(happiness: number,): string;
  _getMoodEmoji(mood: string,): string;
  _getMoodColor(happiness: number,): string;

  // ── Memory System ───────────────────────────────────────────
  memoryPanel: MemoryPanelState;
  loadMemories(): Promise<void>;
  toggleMemoryPanel(): void;
  searchMemories(): void;
  createMemory(): Promise<void>;
  deleteMemory(memoryId: string,): Promise<void>;
  toggleMemoryPin(memoryId: string,): Promise<void>;
  getFilteredMemories(): MemoryEntry[];
  getCurrentMemoryList(): MemoryEntry[];
  updateMemoryTokenCount(): void;
  _getCharacterActorId(): string | null;
  _updateTokenCount(): void;

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

  // ── Message search (message-search.ts) ──────────────────
  _msgSearchOpen: boolean;
  _msgSearchQuery: string;
  _msgSearchMatches: string[];
  _msgSearchTotal: number;
  _msgSearchIndex: number;
  _msgSearchLoading: boolean;
  _msgSearchDebounce: ReturnType<typeof setTimeout> | null;
  toggleMessageSearch(): void;
  onMessageSearchInput(): void;
  runMessageSearch(): Promise<void>;
  applyMessageSearchHighlights(): void;
  applySearchMatchActive(): void;
  scrollToSearchMatch(index: number,): void;
  nextMessageMatch(): void;
  prevMessageMatch(): void;
  onMessageSearchEnter(event: KeyboardEvent,): void;
  closeMessageSearch(): void;
}
