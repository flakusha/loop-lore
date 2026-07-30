// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Global type augmentations for the browser frontend.
 *
 * Covers:
 *  - globalThis globals declared in eslint.config.mjs
 *  - Alpine component `$el` typing (eliminates `(this as any).$el` casts)
 *  - htmx extension types
 */

// ── Alpine component contract ────────────────────────────────────────────────
// Alpine components use `Alpine.data('name', () => ({ ... }))` and get `$el`
// injected by Alpine at runtime.  Without this augmentation, `$el` is `any`.
declare module "alpinejs" {
  type AlpineComponent = {
    $el: HTMLElement;
    $data: Record<string, unknown>;
    $refs: Record<string, HTMLElement>;
    $watch: (property: string, callback: (value: unknown,) => void,) => void;
    $nextTick: (callback: () => void,) => Promise<void>;
    $dispatch: (event: string, detail?: unknown,) => void;
  };
}

// ── GlobalThis augmentations ────────────────────────────────────────────────
// These are the globals injected by vendor.ts and the HTML template.
// Typed declarations eliminate `(globalThis as any).foo` casts.

declare global {
  // ── Alpine ──────────────────────────────────────────────────────────────
  var Alpine: typeof import("alpinejs").default;
  var htmx: typeof import("htmx.org").default;

  // ── App globals (set by HTML template via <script>) ─────────────────────
  var apiFetch: typeof import("./fe-fetch").feFetch;
  var THEMES: Array<{ id: string; name: string }>;
  var __THEMES: Array<{ id: string; name: string }>;
  var chatState: Record<string, unknown>;
  var worldEditState: Record<string, unknown>;

  // ── UI functions ───────────────────────────────────────────────────────
  var showToast: (msg: string, type?: string,) => void;
  var closeSidebar: () => void;
  var toggleSidebar: () => void;
  var applyTheme: (themeId: string,) => void;

  // ── i18n ───────────────────────────────────────────────────────────────
  var setLocale: (locale: string,) => void;
  var __: (key: string, params?: Record<string, string>,) => string;
  var __localeStrings: Record<string, unknown>;

  // ── Persona (inline shape — defined in alpine/personas.ts) ────────────
  var personasPage: {
    personas: Array<{
      id: string;
      name: string;
      description?: string;
      avatarUrl?: string;
      isDefault?: boolean;
    }>;
    selectedPersonaId: string | null;
  };

  // ── Session (set by HTML template) ─────────────────────────────────────
  var __SESSION_ID: string | undefined;
  var __USER_ID: string | undefined;
}
