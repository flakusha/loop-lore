/**
 * Alpine.js Component Functions
 *
 * Extracted from inline <script> blocks in view templates.
 * Compiled into dist/public/alpine.js via bun build.
 * Attached to window so x-data="fn()" bindings resolve.
 */

// ── Type declarations for htmx custom events ─────────────────

export {};
// Required for declare global in module

// Alpine magic properties — injected on `this` by x-data at runtime
// Extend when new features use additional magics ($root, $id, $data, $store, $watch)
// Full list: https://alpinejs.dev/magics
interface AlpineMagicThis {
  $dispatch(event: string, detail?: unknown): void;
  $nextTick(callback?: () => void): Promise<void>;
  $refs: Record<string, HTMLElement>;
  $el: HTMLElement;
}

// Component state: typed data + Alpine magics accessible on `this`
// Custom ThisType avoids Alpine.AlpineComponent<T> which breaks on `any` fields
// (InferInterceptors<T> corrupts `any` → `{}` inside Magics<T>)
type AlpineState<T> = T & ThisType<T & AlpineMagicThis>;

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
      pageTitle: string;
      init: () => void;
      applyTheme: (themeId: string) => void;
      iconFor: (type: string) => string;
      closeAllModals: () => void;
      toast: (type: string, message: string) => void;
      setTheme: (themeId: string) => void;
      getThemeName: () => string;
      loadLocale: (locale: string) => Promise<void>;
      setLocale: (localeId: string) => void;
      __: (key: string, fallback?: string) => string;
    };
    chatState: () => AlpineState<{
      isGenerating: boolean;
      generationLabel: string;
      generationCheckInterval: ReturnType<typeof setInterval> | null;
      activeAttemptId: string | null;
      continuingMessageId: string | null;
      isContinuing: boolean;
      chats: Array<{ id: string; name?: string }>;
      activeChat: string | null;
      messages: Array<{
        id: string;
        role: string;
        content: string;
        created_at: string;
        thinking?: string;
        actor_name?: string;
        variantIndex?: number;
        totalVariants?: number;
        attachments?: Array<{
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
        }>;
      }>;
      loadingMessages: boolean;
      loadingError: string | null;
      hasMoreMessages: boolean;
      loadingOlder: boolean;
      currentPage: number;
      totalPages: number;
      scrollObserver: IntersectionObserver | null;
      activeChatName: string;
      galleryAssets: Array<{ id: string; name?: string; filename?: string }>;
      userDisplayName: string;
      userRole: string;
      currentCharacter: { id: string; display_name?: string; name?: string; description?: string } | null;
      generationDetail: {
        model?: string;
        elapsedMs?: number;
        chunksReceived?: number;
        charsReceived?: number;
        status?: string;
        attemptId?: string;
      } | null;
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
      checkGenerationStatus(chatId: string): Promise<void>;
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
      editingMessageId: string | null;
      editContent: string;
      groupedMessages: Array<{
        id: string;
        role: string;
        content: string;
        created_at: string;
        thinking?: string;
        actor_name?: string;
        group?: boolean;
        groupCount?: number;
        attachments?: Array<{
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
        }>;
      }>;
      renderMarkdown(content: string): string;
      getMediaStyle(asset: any, totalCount: number): Record<string, string>;
      openMediaPreview(asset: any): void;
      previewMediaAsset: any;
      pendingAssets: Array<{ assetId: string; filename: string }>;
      removePendingAsset(assetId: string): void;
      // Internal fields (accessed via this._*) in component methods
      _observer: MutationObserver | null;
      _groupedKey: string;
      _groupedCache: any;
      _toggleChatListHandler: () => void;
      _toggleGalleryHandler: () => void;
      _toggleCharacterInfoHandler: () => void;
      _chatSettingsName: string;
      _chatSettingsMode: string;
      _chatSettingsTurnStrategy: string;
      openChatSettings(): void;
      saveChatSettings(): Promise<void>;
      renameChat(chatId: string): Promise<void>;
      deleteChat(chatId: string, event: Event): Promise<void>;
    }>;
    galleryState: () => AlpineState<{
      previewAsset: {
        id: string;
        name?: string;
        filename?: string;
        asset_type?: string;
        mime_type?: string;
        size_bytes?: number;
        storage_path?: string;
      } | null;
      filterType: string;
      searchQuery: string;
      assetCount: number;
      assets: Array<{
        id: string;
        name?: string;
        filename?: string;
        asset_type?: string;
        mime_type?: string;
        size_bytes?: number;
        storage_path?: string;
      }>;
      loading: boolean;
      uploading: boolean;
      uploadLabel: string;
      init(): void;
      loadAssets(): Promise<void>;
      openPreview(asset: { id: string; name?: string; filename?: string }): void;
      deleteAsset(id: string): Promise<void>;
      uploadAsset(event: Event): Promise<void>;
      handleDrop(event: DragEvent): void;
      formatSize(bytes: number): string;
    }>;
    settingsPage: () => AlpineState<{
      currentTheme: string;
      currentLocale: string;
      enterToSend: boolean;
      autoScroll: boolean;
      inlinePreview: boolean;
      detailLevel: string;
      apiProvider: string;
      apiKey: string;
      apiEndpoint: string;
      apiModel: string;
      maxTokens: number;
      temperature: number;
      init(): void;
      setTheme(themeId: string): void;
      setLocale(localeId: string): void;
    }>;
    newChatState: () => {
      name: string;
      chatType: string;
      chatMode: string;
      error: string;
      submitting: boolean;
      init: () => void;
      typeEnum: (type: string) => string;
      modeEnum: (mode: string) => string;
      createChat: () => Promise<void>;
    };
    worldsState: () => any;
    worldDetailState: () => any;
    worldEditState: () => any;
    characterChatListState: () => any;
    charactersState: () => any;
    characterEditState: () => any;
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
    };
    /** i18n: translate key to locale string */
    __: (key: string, fallback?: string) => string;
    __localeStrings: Record<string, string>;
    /** Theme definitions array (set by theme.ts) */
    __THEMES: Array<{ id: string; name: string; file: string }>;
  }

  // Global var declarations — enables globalThis.chatState etc.
  // (Window interface properties don't flow to typeof globalThis)
  var chatState: Window["chatState"];
  var galleryState: Window["galleryState"];
  var settingsPage: Window["settingsPage"];
  var newChatState: Window["newChatState"];
  var worldsState: Window["worldsState"];
  var worldDetailState: Window["worldDetailState"];
  var worldEditState: Window["worldEditState"];
  var characterChatListState: Window["characterChatListState"];
  var charactersState: Window["charactersState"];
  var characterEditState: Window["characterEditState"];
  var app: Window["app"];
  var __: Window["__"];
  var __localeStrings: Window["__localeStrings"];
  var __THEMES: Window["__THEMES"];
  var Alpine: Window["Alpine"];
  var htmx: Window["htmx"];
  var apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}
