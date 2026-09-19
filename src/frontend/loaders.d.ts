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

import type { ModelManagerState, } from "./alpine/model-manager";
import type { TranslationMap, } from "./i18n";

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
      <T = Record<string, unknown>,>(key: string,): T;

      <T = Record<string, unknown>,>(key: string, value: T,): void;
    };
  };

  var apiFetch: (url: string, options?: RequestInit,) => Promise<Response>;

  /* ── UI helpers (src/frontend/ui.ts) ────────────────────────── */

  var toggleSidebar: typeof import("./ui").toggleSidebar;
  var closeSidebar: typeof import("./ui").closeSidebar;
  var showToast: typeof import("./ui").showToast;
  var applyTheme: typeof import("./ui").applyTheme;
  var setLocale: typeof import("./ui").setLocale;
  var t: typeof import("./ui").t;
  var openModal: typeof import("./ui").openModal;
  var closeModal: typeof import("./ui").closeModal;
  var closeModalOnBackdrop: typeof import("./ui").closeModalOnBackdrop;

  /* ── Page-loader functions (attached to globalThis for onclick / x-data) ── */

  var adminPage: any;
  var filterCharacters: typeof import("./pages/characters").filterCharacters;
  var selectCharacterCard: typeof import("./pages/characters").selectCharacterCard;
  var unlinkCharacterAsset: typeof import("./pages/characters").unlinkCharacterAsset;
  var startChatFromChar: typeof import("./pages/characters").startChatFromChar;
  var editCharacter: typeof import("./pages/characters").editCharacter;
  var deleteCharacter: typeof import("./pages/characters").deleteCharacter;
  var exportCharacter: typeof import("./pages/characters").exportCharacter;
  var saveCharacterEdit: (characterId: string,) => Promise<void>;
  var updateAvatarFocusPreview: () => void;
  var uploadAvatar: (input: HTMLInputElement,) => Promise<void>;
  var clearAvatar: () => void;
  var filterAssets: () => void;
  var openAssetPreview: typeof import("./asset-preview").openAssetPreview;
  var copyAssetUrl: typeof import("./asset-preview").copyAssetUrl;
  var downloadAsset: typeof import("./asset-preview").downloadAsset;
  var deleteAssetPreview: typeof import("./asset-preview").deleteAssetPreview;
  var loadNewChatPage: () => Promise<void>;
  var removeParticipant: (id: string,) => void;
  var selectActorFromList: (id: string,) => void;
  var filterWorlds: () => void;
  var createWorld: (event: Event,) => Promise<void>;
  var importWorld: (event: Event,) => Promise<void>;
  var exportWorld: (worldId: string,) => void;

  var worldDetail: any;
  var questsPage: any;
  var filterBar: any;
  var personasPage: any;
  var settingsModal: any;
  var settingsPage: any;
  var modelManager: () => ModelManagerState;

  /* ── Loose / vendor-injected globals ────────────────────────── */

  var actorEmotionAvatarsFactory: (actorId: string,) => unknown;
  var actorLicensingFactory: (actorId: string,) => unknown;
  var actorEntitiesFactory: (actorId: string, kind: string,) => unknown;
  var actorSystemsFactory: (actorId: string,) => unknown;
  var actorTraitsFactory: (actorId: string,) => unknown;
  var exportProgressFactory: () => unknown;
  var actorEmotionAvatars: unknown;
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
  var __localeStrings: TranslationMap;
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
