/**
 * Alpine.js Component Types
 *
 * Only chat page uses Alpine now. All other pages use vanilla JS + HTMX.
 */

export {};

interface AlpineMagicThis {
  $dispatch(event: string, detail?: unknown): void;
  $nextTick(callback?: () => void): Promise<void>;
  $refs: Record<string, HTMLElement>;
  $el: HTMLElement;
}

export type AlpineState<T> = T & ThisType<T & AlpineMagicThis>;

interface MessageAttachment {
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

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  thinking?: string;
  actor_name?: string;
  variantIndex?: number;
  totalVariants?: number;
  attachments?: MessageAttachment[];
}

export interface GroupedMessage extends Message {
  group?: boolean;
  groupCount?: number;
}

export interface GalleryAsset {
  id: string;
  name?: string;
  filename?: string;
  asset_type?: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  alt_text?: string;
}

interface GenerationDetail {
  model?: string;
  elapsedMs?: number;
  chunksReceived?: number;
  charsReceived?: number;
  status?: string;
  attemptId?: string;
}

export interface ChatState extends AlpineMagicThis {
  isGenerating: boolean;
  generationLabel: string;
  activeAttemptId: string | null;
  continuingMessageId: string | null;
  isContinuing: boolean;
  _generationEventSource: EventSource | null;
  chats: Array<{ id: string; name?: string; isPinned?: number }>;
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
  currentCharacter: { id: string; display_name?: string; name?: string; description?: string } | null;
  generationDetail: GenerationDetail | null;

  editingMessageId: string | null;
  editContent: string;
  previewMediaAsset: GalleryAsset | null;
  pendingAssets: Array<{ assetId: string; filename: string }>;

  groupedMessages: GroupedMessage[];
  _observer: MutationObserver | null;
  _groupedKey: string;
  _groupedCache: GroupedMessage[] | null;
  _toggleChatListHandler: () => void;
  _toggleGalleryHandler: () => void;
  _toggleCharacterInfoHandler: () => void;
  _chatSettingsName: string;
  _chatSettingsMode: string;
  _chatSettingsTurnStrategy: string;
  _renameChatId: string;
  _renameChatName: string;

  _chatKey: CryptoKey | null;
  _encryptionEnabled: boolean;
  _keyId: string | null;

  init(): void;
  destroy(): void;
  loadUserInfo(): Promise<void>;
  loadChats(): Promise<void>;
  selectChat(chatId: string): Promise<void>;
  loadMessages(): Promise<void>;
  loadOlderMessages(): Promise<void>;
  setupInfiniteScroll(): void;
  sendMessage(): Promise<void>;
  autoResize(el: HTMLTextAreaElement): void;
  scrollToBottom(): void;
  loadGalleryAssets(): Promise<void>;
  loadCharacterInfo(): Promise<void>;
  formatTime(iso: string): string;
  displayName(msg: { role: string; actor_name?: string }): string;
  copyMessage(msgId: string, event: Event): Promise<void>;
  removeMessage(msgId: string, event: Event): Promise<void>;
  connectGenerationSSE(chatId: string): void;
  _cleanupSSE(): void;
  cancelGeneration(): Promise<void>;
  regenerateResponse(): Promise<void>;
  regenerateVariant(messageId: string): Promise<void>;
  switchVariant(messageId: string, direction: number): Promise<void>;
  continueMessage(messageId: string): Promise<void>;
  retryFromPoint(attemptId: string, step: number): Promise<void>;
  getChatId(): string | null;
  handleAttach(event: Event): Promise<void>;
  escapeHtml(str: string): string;
  startEdit(msgId: string): void;
  cancelEdit(): void;
  saveEdit(msgId: string): Promise<void>;
  renderMarkdown(content: string): string;
  getMediaStyle(asset: any, totalCount: number): Record<string, string>;
  openMediaPreview(asset: any): void;
  removePendingAsset(assetId: string): void;
  openAssetPreview(asset: { id: string; asset_type?: string; filename?: string; name?: string }): void;
  openChatSettings(): void;
  saveChatSettings(): Promise<void>;
  renameChat(chatId: string): Promise<void>;
  openRenameModal(chatId: string): void;
  confirmRenameChat(): Promise<void>;
  deleteChat(chatId: string, event: Event): Promise<void>;
  toggleChatPin(chatId: string): Promise<void>;
  loadChatKey(chatId: string): Promise<void>;
  checkGenerationStatus(chatId: string): Promise<void>;
}

interface WorldEditState {
  loading: boolean;
  error: boolean;
  activeTab: string;
  world: { id: string; name: string; description: string | null; lore: string | null; tags: string[] } | null;
  tagsStr: string;
  locations: Array<{
    id: string;
    name: string;
    description: string | null;
    parent_location_id: string | null;
  }>;
  locationsLoaded: boolean;
  loadingLocations: boolean;
  showAddForm: boolean;
  newLocName: string;
  newLocDesc: string;
  newLocParentId: string;
  worldId: string | null;
  init(): void;
  saveWorld(): Promise<void>;
  loadLocations(): Promise<void>;
  addLocation(): Promise<void>;
  deleteLocation(locId: string): Promise<void>;
}

declare global {
  interface DocumentEventMap {
    "htmx:configRequest": CustomEvent<{ headers: Record<string, string> }>;
    "htmx:beforeSwap": CustomEvent<{ content: string }>;
    "htmx:afterSwap": CustomEvent<{ target: Element }>;
    "htmx:load": CustomEvent<{ elt: Element }>;
    "htmx:responseError": CustomEvent<{ xhr?: XMLHttpRequest }>;
    "htmx:loadTheme": CustomEvent<{ theme?: string }>;
    "show-toast": CustomEvent<{ type?: string; message: string; icon?: string }>;
  }

  interface Window {
    app: () => {
      toasts: Array<{ type: string; msg: string; icon: string }>;
      currentTheme: string;
      sidebarOpen: boolean;
      currentLocale: string;
      localeStrings: Record<string, string>;
      init: () => void;
      applyTheme: (themeId: string) => void;
      iconFor: (type: string) => string;
      closeAllModals: () => void;
      loadLocale: (locale: string) => Promise<void>;
      setLocale: (localeId: string) => void;
      __: (key: string, fallback?: string) => string;
    };
    chatState: () => AlpineState<ChatState>;
    worldEditState: () => AlpineState<WorldEditState>;
    Alpine: {
      $data: (el: HTMLElement) => Record<string, unknown>;
      initTree: (el: HTMLElement) => void;
      store: {
        <T = Record<string, unknown>>(key: string): T;
        <T = Record<string, unknown>>(key: string, value: T): void;
      };
    };
    htmx: {
      ajax: (method: string, url: string, opts: { target: string; swap: string }) => void;
      defineExtension: (
        name: string,
        extension: { onEvent?: (name: string, evt: CustomEvent) => void },
      ) => void;
    };
    __: (key: string, fallback?: string) => string;
    __localeStrings: Record<string, string>;
    __THEMES: Array<{ id: string; name: string; file: string }>;
    apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
    toggleSidebar: () => void;
    closeSidebar: () => void;
    showToast: (type: string, message: string) => void;
    applyTheme: (themeId: string) => void;
    setLocale: (localeId: string) => void;
  }

  var chatState: Window["chatState"];
  var worldEditState: Window["worldEditState"];
  var app: Window["app"];
  var __: Window["__"];
  var __localeStrings: Window["__localeStrings"];
  var __THEMES: Window["__THEMES"];
  var Alpine: Window["Alpine"];
  var htmx: Window["htmx"];
  var apiFetch: Window["apiFetch"];
  var toggleSidebar: Window["toggleSidebar"];
  var closeSidebar: Window["closeSidebar"];
  var showToast: Window["showToast"];
  var applyTheme: Window["applyTheme"];
  var setLocale: Window["setLocale"];
  var __chatKey: CryptoKey | null;
  var __chatKeyId: string | null;
}
