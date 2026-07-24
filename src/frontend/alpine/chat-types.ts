import type { MoodPanelState, } from "./mood-panel";
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

/** Chat-level GM configuration — mirrors `src/chat/types.ts::GmConfig` */
export interface GmConfig {
  assistantRole?: "off" | "helper" | "gm" | "moderator";
  visualNovel?: boolean;
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
    visual_novel?: number;
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

  _groupPaused: boolean;

  _renameChatId: string;

  _renameChatName: string;

  _personas: any[];

  _selectedPersonaId: string | null;

  _impersonatingActorId: string | null;

  _assistantRole: "off" | "helper" | "gm" | "moderator";

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
    visual_novel?: number;
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

  // ── Mood System ──────────────────────────────────────────────
  _moodPanel: MoodPanelState;

  loadMoodPanel(actorId: string,): Promise<void>;

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

  loadMood(): Promise<void>;

  updateMoodHappiness(happiness: number,): Promise<void>;

  applyMoodDelta(delta: number,): Promise<void>;

  _getMoodEmoji(mood: string,): string;

  _getMoodColor(happiness: number,): string;

  _happinessToMood(happiness: number,): string;

  _emotionAvatars: { emotion: string; avatarId: string; assetId: string }[];

  _emotionAvatarsLoading: boolean;

  _currentEmotionAvatar: string | null;

  loadEmotionAvatars(): Promise<void>;

  selectEmotionAvatar(emotion: string,): string | null;
}
