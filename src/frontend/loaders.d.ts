/**
 * Global ambient type declarations for the frontend bundles.
 *
 * SCRIPT-MODE .d.ts — these declarations are active project-wide without
 * any import side-effect (unlike `declare global { var … }` in module files
 * such as types.ts, which only take effect when that module is imported).
 * The pages bundle (pages.ts) does *not* import types.ts, so every ambient
 * variable that needs to be available on `globalThis` for both the Alpine
 * (chat) and the vanilla-pages bundles MUST live here.
 *
 * Interface-only augmentations (Window, DocumentEventMap) can stay in types.ts
 * because they are only consumed by code that already imports types.ts.
 */

/* ── Vendor / framework globals ─────────────────────────────── */

declare var htmx: {
  ajax: (method: string, url: string, opts: { target: string; swap: string }) => void;
  trigger: (elt: EventTarget | string, eventName: string, detail?: unknown) => boolean;
  defineExtension: (name: string, extension: { onEvent?: (name: string, evt: CustomEvent) => void }) => void;
  process: (elt: HTMLElement) => void;
};

declare var Alpine: {
  $data: (el: HTMLElement) => Record<string, unknown>;
  initTree: (el: HTMLElement) => void;
  store: {
    <T = Record<string, unknown>>(key: string): T;
    <T = Record<string, unknown>>(key: string, value: T): void;
  };
};

declare var apiFetch: (url: string, options?: RequestInit) => Promise<Response>;

/* ── UI helpers (src/frontend/ui.ts) ────────────────────────── */

declare var toggleSidebar: () => void;
declare var closeSidebar: () => void;
declare var showToast: (type: string, message: string) => void;
declare var applyTheme: (themeId: string) => void;
declare var setLocale: (localeId: string) => void;
declare var openModal: (id: string) => void;
declare var closeModal: (el: Element) => void;
declare var closeModalOnBackdrop: (event: Event) => void;

/* ── Page-loader functions (attached to globalThis for onclick / x-data) ── */

declare var adminPage: any;
declare var filterCharacters: () => void;
declare var selectCharacterCard: (id: string) => Promise<void>;
declare var startChatFromChar: (btn: HTMLElement) => Promise<void>;
declare var editCharacter: (btn: HTMLElement) => void;
declare var deleteCharacter: (btn: HTMLElement) => Promise<void>;
declare var filterAssets: () => void;
declare var openAssetPreview: (id: string) => Promise<void>;
declare var copyAssetUrl: () => Promise<void>;
declare var downloadAsset: () => void;
declare var deleteAssetPreview: () => Promise<void>;
declare var loadNewChatPage: () => Promise<void>;
declare var removeParticipant: (id: string) => void;
declare var selectActorFromList: (id: string) => void;
declare var filterWorlds: () => void;
declare var createWorld: (event: Event) => Promise<void>;

declare var worldDetail: any;
declare var questsPage: any;
declare var filterBar: any;
declare var personasPage: any;
declare var settingsModal: any;
declare var settingsPage: any;

/* ── Loose / vendor-injected globals ────────────────────────── */

declare var currentLocale: string;
declare var __marked: any;
declare var __DOMPurify: any;
declare var __previewAsset: PreviewAsset | null;
declare var __appInitCount: number;
declare var __TELEMETRY_FRONTEND_ENABLED: boolean | string | number;
declare var __: (key: string, fallback?: string) => string;
declare var __localeStrings: Record<string, string>;
declare var __THEMES: Array<{ id: string; name: string; file: string }>;
declare var __chatKey: CryptoKey | null;
declare var __chatKeyId: string | null;

/* ── Supporting interfaces ──────────────────────────────────── */

interface WorldDetailInit {
  worldId: string;
  locations: Array<{
    id: string;
    name: string;
    description: string | null;
    world_id: string;
  }>;
}

interface PreviewAsset {
  id: string;
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  asset_type?: string;
  avatar_asset_id?: string;
}

/* ── Vendor module ambient shims ────────────────────────────── */
declare module "alpinejs" {
  const Alpine: any;
  export default Alpine;
}

declare module "@alpinejs/morph" {
  const morph: any;
  export default morph;
}
