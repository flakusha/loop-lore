/**
 * Global ambient type declarations for the frontend bundles.
 *
 * MODULE-MODE .d.ts — uses `declare global { }` to augment `typeof globalThis`.
 * This file is imported by both entry points:
 *   - `src/frontend/alpine/index.ts` (Alpine/chat bundle)
 *   - `src/frontend/pages.ts` (vanilla pages bundle)
 *
 * IMPORTANT: This file must be imported (not just included via tsconfig) because
 * it's a module (has `export {}`). Both entry points import it as `"./loaders"`.
 *
 * `eslint --fix` can safely transform `declare var` → `declare let` here because
 * `declare let` inside `declare global` correctly augments `typeof globalThis`.
 * This eliminates the script-mode gotcha where `declare let` at file scope
 * creates block-scoped variables that don't appear on `typeof globalThis`.
 */

export {};

declare global {
  /* ── Vendor / framework globals ─────────────────────────────── */

  var htmx: {
    ajax: (method: string, url: string, opts: { target: string; swap: string },) => void;
    trigger: (elt: EventTarget | string, eventName: string, detail?: unknown,) => boolean;
    defineExtension: (
      name: string,
      extension: { onEvent?: (name: string, evt: CustomEvent,) => void },
    ) => void;
    process: (elt: HTMLElement,) => void;
  };

  var Alpine: {
    $data: (el: HTMLElement,) => Record<string, unknown>;
    initTree: (el: HTMLElement,) => void;
    store: {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Alpine.store generic is for caller convenience
      <T = Record<string, unknown>,>(key: string,): T;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Alpine.store generic is for caller convenience
      <T = Record<string, unknown>,>(key: string, value: T,): void;
    };
  };

  var apiFetch: (url: string, options?: RequestInit,) => Promise<Response>;

  /* ── UI helpers (src/frontend/ui.ts) ────────────────────────── */

  var toggleSidebar: () => void;
  var closeSidebar: () => void;
  var showToast: (type: string, message: string,) => void;
  var applyTheme: (themeId: string,) => void;
  var setLocale: (localeId: string,) => void;
  var t: (key: string, params?: Record<string, string>,) => string;
  var openModal: (id: string,) => void;
  var closeModal: (el: Element,) => void;
  var closeModalOnBackdrop: (event: Event,) => void;

  /* ── Page-loader functions (attached to globalThis for onclick / x-data) ── */

  var adminPage: any;
  var filterCharacters: () => void;
  var selectCharacterCard: (id: string,) => Promise<void>;
  var startChatFromChar: (btn: HTMLElement,) => Promise<void>;
  var editCharacter: (btn: HTMLElement,) => void;
  var deleteCharacter: (btn: HTMLElement,) => Promise<void>;
  var exportCharacter: (btn: HTMLElement,) => void;
  var saveCharacterEdit: (characterId: string,) => Promise<void>;
  var uploadAvatar: (input: HTMLInputElement,) => Promise<void>;
  var clearAvatar: () => void;
  var filterAssets: () => void;
  var openAssetPreview: (id: string,) => Promise<void>;
  var copyAssetUrl: () => Promise<void>;
  var downloadAsset: () => void;
  var deleteAssetPreview: () => Promise<void>;
  var loadNewChatPage: () => Promise<void>;
  var removeParticipant: (id: string,) => void;
  var selectActorFromList: (id: string,) => void;
  var filterWorlds: () => void;
  var createWorld: (event: Event,) => Promise<void>;

  var worldDetail: any;
  var questsPage: any;
  var filterBar: any;
  var personasPage: any;
  var settingsModal: any;
  var settingsPage: any;

  /* ── Loose / vendor-injected globals ────────────────────────── */

  var currentLocale: string;
  var __marked: any;
  var __DOMPurify: any;
  var __previewAsset: PreviewAsset | null;
  var __appInitCount: number;
  var __TELEMETRY_FRONTEND_ENABLED: boolean | string | number;
  var __TELEMETRY_FLUSH_INTERVAL: number | undefined;
  var __USER_ID: string | undefined;
  var __SESSION_ID: string | undefined;
  var __: (key: string, fallback?: string,) => string;
  var __localeStrings: Record<string, string>;
  var __THEMES: { id: string; name: string; file: string }[];
  var __chatKey: CryptoKey | null;
  var __chatKeyId: string | null;

  /* ── Supporting interfaces ──────────────────────────────────── */

  interface WorldDetailInit {
    worldId: string;
    locations: {
      id: string;
      name: string;
      description: string | null;
      world_id: string;
    }[];
  }

  interface PreviewAsset {
    id: string;
    filename?: string;
    mime_type?: string;
    size_bytes?: number;
    asset_type?: string;
    avatar_asset_id?: string;
  }
}

/* ── Vendor module ambient shims ────────────────────────────── */
/* Note: these are script-mode ambient declarations (not inside declare global) */
/* They work at file scope in module-mode .d.ts files */

declare module "alpinejs" {
  const Alpine: any;
  export default Alpine;
}

declare module "@alpinejs/morph" {
  const morph: any;
  export default morph;
}
