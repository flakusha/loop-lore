# i18n Implementation Plan

Build plan for locale/multilingual support. Companion to
[internationalization.md](../frontend/internationalization.md) (high-level
design) — this document is the **how**, not the **what**.

---

## Current State

| Layer                       | Coverage                       | Files                                        |
| --------------------------- | ------------------------------ | -------------------------------------------- |
| Client `__()` function      | ✅ Defined, wired into bundles | `src/frontend/alpine/i18n.ts`                |
| Translation catalog         | 36 keys (~100 needed)          | `src/public/locales/en.json`                 |
| Locale selector UI          | Dropdown exists, English-only  | `src/views/settings.html:57-61`              |
| Locale persistence          | `localStorage` key `"locale"`  | `src/frontend/ui.ts:97-101`                  |
| `__()` call sites           | 4 calls in 1 file              | `src/components/sidebar/sidebar.html`        |
| Server-side i18n            | ❌ None                        | All routes + views                           |
| TUI i18n                    | ❌ None                        | `src/tui/app.ts`, `chat.ts`, `asset-view.ts` |
| Locale middleware           | ❌ None                        | —                                            |
| DB locale column            | ❌ None                        | `users.settings` JSON unused                 |
| Config locale field         | ❌ None                        | `src/config/schema.ts`                       |
| Hardcoded strings remaining | ~90-100 unique                 | HTML, TS templates, TUI, route errors        |

---

## Implementation Phases

### Phase 1 — Server-Side i18n Infrastructure

#### 1a. Locale Catalog Service

**New file:** `src/i18n/index.ts`

```typescript
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../logger";

const LOCALE_DIR = join(import.meta.dir, "..", "public", "locales");
const log = getLogger("i18n");

export type LocaleCatalog = Record<string, string>;
export type LocaleId = string; // BCP-47 tag: "en", "ja", "zh-CN", etc.

const catalogs = new Map<LocaleId, LocaleCatalog>();
let defaultCatalog: LocaleCatalog = {};

function loadCatalog(locale: LocaleId): LocaleCatalog {
  const path = join(LOCALE_DIR, `${locale}.json`);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as LocaleCatalog;
  } catch (err) {
    log.warn("failed to load locale catalog", { locale, err });
    return {};
  }
}

export function ensureLocale(locale: LocaleId): void {
  if (!catalogs.has(locale)) {
    catalogs.set(locale, loadCatalog(locale));
  }
}

export function loadDefaultLocale(): void {
  defaultCatalog = loadCatalog("en");
  catalogs.set("en", defaultCatalog);
}

export function t(key: string, params?: Record<string, string | number>, locale?: LocaleId): string {
  const catalog = (locale && catalogs.get(locale)) || defaultCatalog;
  let val = catalog[key];
  if (!val) val = defaultCatalog[key];
  if (!val) return key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(`{${k}}`, String(v));
    }
  }
  return val;
}

export function getSupportedLocales(): LocaleId[] {
  return ["en"];
  // Extended: read directory or config for additional locales
}

export interface InterpolationParams {
  [key: string]: string | number;
}

export function tWithFallback(
  key: string,
  fallback: string,
  params?: InterpolationParams,
  locale?: LocaleId,
): string {
  const catalog = (locale && catalogs.get(locale)) || defaultCatalog;
  let val = catalog[key];
  if (!val) val = defaultCatalog[key];
  if (!val) return params ? interpolate(fallback, params) : fallback;
  if (params) return interpolate(val, params);
  return val;
}

function interpolate(tpl: string, params: InterpolationParams): string {
  let result = tpl;
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(`{${k}}`, String(v));
  }
  return result;
}
```

#### 1b. Extend RequestContext

**Edit:** `src/middleware/types.ts`

```typescript
export interface RequestContext {
  userId: string | null;
  userRole: string | null;
  sessionId: string | null;
  /** Resolved locale for this request. Default: "en" */
  locale: string;
}
```

#### 1c. Locale Middleware

**New file:** `src/middleware/locale.ts`

```typescript
/**
 * Locale middleware.
 *
 * Resolution order:
 *   1. Saved locale (from localStorage, sent as X-Locale header by client JS)
 *   2. Accept-Language header (first supported tag)
 *   3. "en" (default)
 *
 * Inject: context.locale = resolved locale
 */

import type { Middleware } from "./types";
import { ensureLocale, getSupportedLocales } from "../i18n";

const SUPPORTED = getSupportedLocales();

export function localeMiddleware(accepted: string[] = SUPPORTED): Middleware {
  return async (request, context, next) => {
    const xLocale = request.headers.get("X-Locale");
    if (xLocale && accepted.includes(xLocale)) {
      ensureLocale(xLocale);
      context.locale = xLocale;
      return next();
    }

    const acceptLang = request.headers.get("Accept-Language");
    if (acceptLang) {
      // Parse first matching tag
      for (const part of acceptLang.split(",")) {
        const tag = part.split(";")[0]?.trim().toLowerCase();
        if (tag && accepted.includes(tag)) {
          ensureLocale(tag);
          context.locale = tag;
          return next();
        }
      }
    }

    context.locale = "en";
    return next();
  };
}
```

#### 1d. Wire Middleware into Pipeline

**Edit:** `src/server.ts`

Add locale middleware to composable pipeline, before route dispatch:

```typescript
import { localeMiddleware } from "./middleware/locale";

// In pipeline composition:
const pipeline = compose([
  authMiddleware,
  localeMiddleware, // <-- added
  roleGuard,
  router,
]);
```

#### 1e. Pass Locale to Views

**Edit:** `src/routes/views.ts`

```typescript
// Extend wrapWithLayout and respond to accept locale
function wrapWithLayout(content: string, title?: string, locale?: string): string {
  let layout = readFileSync(layoutPath, "utf8");
  layout = layout.replace("{{{content}}}", () => content);
  layout = layout.replace('lang="en"', () => `lang="${locale || "en"}"`);
  if (title)
    layout = layout.replace(/<title>.*?<\/title>/, () => `<title>${escapeHtml(title)} — Loop Lore</title>`);
  return layout;
}

// Update respond to pass locale from context
function respond(content: string, isHtmx: boolean, title?: string, locale?: string): Response {
  const body = isHtmx ? content : wrapWithLayout(content, title, locale);
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ServeView passes locale from context
function serveView(viewName: string, isHtmx = false, context?: RequestContext): Response | null {
  // ...
  const l = context?.locale || "en";
  return respond(content, isHtmx, title, l);
}
```

#### 1f. Pass Locale Data to Client

**Edit:** `src/views/layout.html`

Add JSON blob with translated strings for current page, used by Alpine:

```html
<script id="i18n-data" type="application/json">
  {{{localeData}}}
</script>
```

In `src/routes/views.ts:wrapWithLayout`, inject locale data:

```typescript
// Build string map for current locale (subset or full catalog)
const localeData = JSON.stringify(getCatalogForLocale(locale));
layout = layout.replace("{{{localeData}}}", () => localeData);
```

**Edit:** `src/frontend/alpine/i18n.ts`

Read initial locale from embedded data instead of always fetching:

```typescript
const script = document.getElementById("i18n-data");
if (script) {
  try {
    __localeStrings = JSON.parse(script.textContent || "{}");
  } catch {
    /* fallback */
  }
}
```

---

### Phase 2 — Key Extraction & Template Migration

#### 2a. Expand en.json

**Edit:** `src/public/locales/en.json`

Expand from 36 keys to full coverage (~100+ keys). Organised by namespace:

```jsonc
{
  // Nav
  "nav.chat": "Chat",
  "nav.characters": "Characters",
  "nav.gallery": "Gallery",
  "nav.worlds": "Worlds",
  "nav.settings": "Settings",
  "nav.navigation": "Navigation",

  // Chat
  "chat.title": "Chat",
  "chat.placeholder": "Type a message...",
  "chat.noMessages": "No messages yet",
  "chat.selectChat": "Select a chat",
  "chat.selectChatDesc": "Choose a conversation from the sidebar or create a new one.",
  "chat.startConversation": "Start a conversation below. Messages are persisted automatically.",
  "chat.loadingMessages": "Loading messages...",
  "chat.loadingOlder": "Loading older messages...",
  "chat.noChats": "No chats yet",
  "chat.newChat": "+ New Chat",
  "chat.send": "Send",
  "chat.attachments": "Attach file",
  "chat.cancelGeneration": "Cancel",
  "chat.continuing": "↳ Continuing message...",
  "chat.chats": "Chats",
  "chat.rename": "Rename",
  "chat.delete": "Delete",
  "chat.settings": "Chat Settings",
  "chat.name": "Chat Name",
  "chat.mode": "Mode",
  "chat.mode.chat": "Chat",
  "chat.mode.roleplay": "Roleplay",
  "chat.turnStrategy": "Turn Strategy",
  "chat.turnStrategy.roundRobin": "Round Robin",
  "chat.turnStrategy.firstParticipant": "First Participant",
  "chat.renameChat": "Rename Chat",
  "chat.characterInfo": "Character Info",
  "chat.characterInfoDesc": "Character info will appear here when a chat is selected.",
  "chat.assets": "Chat Assets",
  "chat.assetsDesc": "Select a chat to see linked assets",
  "chat.noAssets": "No assets linked to this chat",
  "chat.close": "Close",
  "chat.messagePlaceholder": "Type a message...",

  // Message actions
  "message.edit": "Edit",
  "message.cancel": "Cancel",
  "message.save": "Save",
  "message.remove": "Remove",
  "message.regenerate": "Regenerate",
  "message.continue": "Continue",
  "message.previousVariant": "Previous variant",
  "message.nextVariant": "Next variant",
  "message.thinking": "Thinking process",
  "message.edited": "(edited)",

  // Generation
  "generation.connecting": "Connecting...",
  "generation.generating": "Generating...",
  "generation.error": "Generation failed",
  "generation.cancelled": "Cancelled",

  // Common
  "common.loading": "Loading...",
  "common.save": "Save",
  "common.saving": "Saving...",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.creating": "Creating...",
  "common.create": "Create",
  "common.search": "Search...",
  "common.error": "Error",
  "common.success": "Success",
  "common.noResults": "No results",
  "common.menu": "Toggle navigation",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.upload": "Upload",
  "common.download": "Download",
  "common.copy": "Copy",
  "common.uploading": "Uploading...",

  // Characters
  "characters.title": "Characters",
  "characters.noCharacters": "No characters yet",
  "characters.noCharactersDesc": "Create your first character to start roleplaying.",
  "characters.noDescription": "No description",
  "characters.noSystemPrompt": "No system prompt",
  "characters.startChat": "Start Chat",
  "characters.edit": "Edit Character",
  "characters.delete": "Delete",
  "characters.deleteConfirm": "Delete this character?",
  "characters.deleted": "Character deleted",
  "characters.displayName": "Display Name",
  "characters.description": "Description",
  "characters.systemPrompt": "System Prompt",
  "characters.personality": "Personality",
  "characters.welcomeMessage": "Welcome Message (first_mes)",
  "characters.exampleMessages": "Example Messages (mes_example)",
  "characters.avatar": "Avatar",

  // Settings
  "settings.title": "Settings",
  "settings.general": "General Settings",
  "settings.chat": "Chat Settings",
  "settings.api": "API Settings",
  "settings.data": "Data Management",
  "settings.theme": "Theme",
  "settings.language": "Language",
  "settings.displayName": "Display Name",
  "settings.birthDate": "Birth Date (for age-gated content)",
  "settings.enterToSend": "Enter to send",
  "settings.autoScroll": "Auto-scroll to bottom",
  "settings.inlinePreview": "Inline image preview",
  "settings.detailLevel": "Message detail level",
  "settings.provider": "Provider",
  "settings.apiKey": "API Key",
  "settings.apiKeyPlaceholder": "Enter your API key",
  "settings.clear": "Clear",
  "settings.endpointUrl": "API Endpoint URL",
  "settings.model": "Model",
  "settings.modelPlaceholder": "e.g., gpt-4o",
  "settings.maxTokens": "Max context tokens",
  "settings.temperature": "Temperature",
  "settings.testConnection": "Test Connection",
  "settings.saveApi": "Save API Settings",
  "settings.exportChats": "Export All Chats",
  "settings.importChats": "Import Chats",
  "settings.dangerZone": "Danger Zone",
  "settings.dangerZoneDesc": "This action permanently deletes all data. Type DELETE to confirm.",
  "settings.deleteConfirmPlaceholder": "Type \"DELETE\" to confirm",
  "settings.deleteAll": "Delete All Data",

  // Login
  "login.title": "Log In",
  "login.username": "Username",
  "login.password": "Password",
  "login.demoMode": "Continue in demo mode",
  "login.signUp": "Don't have an account? Sign up",
  "login.submit": "Log In",

  // Gallery
  "gallery.title": "Asset Gallery",
  "gallery.noAssets": "No assets yet",
  "gallery.noAssetsDesc": "Upload images, audio, or video to get started.",
  "gallery.failedToLoad": "Failed to load",
  "gallery.asset": "Asset",

  // Worlds
  "worlds.title": "Worlds",
  "worlds.noWorlds": "No worlds yet",
  "worlds.noWorldsDesc": "Create your first world.",
  "worlds.create": "Create World",
  "worlds.created": "World created",
  "worlds.failedToCreate": "Failed to create world",
  "worlds.networkError": "Network error",
  "worlds.noDescription": "No description",
  "worlds.lore": "Lore",
  "worlds.noLore": "No lore provided.",
  "worlds.chatRooms": "Chat Rooms",
  "worlds.noChatRooms": "No chat rooms yet.",
  "worlds.failedToLoad": "Failed to load",
  "worlds.id": "ID",

  // New Chat
  "newChat.title": "New Chat",
  "newChat.name": "Chat Name",
  "newChat.namePlaceholder": "Chat name",
  "newChat.type": "Type",
  "newChat.modeLabel": "Mode",
  "newChat.searchParticipants": "Search participants...",
  "newChat.noCharacters": "No characters found",
  "newChat.direct": "Direct",
  "newChat.group": "Group",
  "newChat.added": "added",
  "newChat.create": "Create Chat",
  "newChat.creating": "Creating...",
  "newChat.unknown": "Unknown",

  // Character edit
  "characterEdit.title": "Edit Character",
  "characterEdit.cancel": "Cancel",
  "characterEdit.save": "Save Character",
  "characterEdit.uploadAvatar": "Upload Avatar",
  "characterEdit.removeAvatar": "Remove",
  "characterEdit.saved": "Character saved",
  "characterEdit.failedToSave": "Failed to save",
  "characterEdit.avatarUploaded": "Avatar uploaded",
  "characterEdit.uploadFailed": "Upload failed",

  // Asset actions
  "asset.urlCopied": "URL copied",
  "asset.failedToCopy": "Failed to copy",
  "asset.deleteConfirm": "Delete this asset?",
  "asset.deleted": "Asset deleted",
  "asset.failedToDelete": "Failed to delete",
  "asset.failedToLoad": "Failed to load",

  // Errors (user-facing)
  "error.notFound": "Not found",
  "error.serverError": "Internal server error",
  "error.unauthorized": "Unauthorized",
  "error.forbidden": "Forbidden",
  "error.validation": "Validation failed",
  "error.network": "Network error",
  "error.rateLimited": "Too many attempts. Try again later.",

  // TUI
  "tui.title": "Loop Lore TUI",
  "tui.initializing": "initializing...",
  "tui.assetsVisible": "Assets: visible",
  "tui.assetsHidden": "Assets: hidden",
  "tui.refreshing": "refreshing messages...",
  "tui.loadFailed": "load failed",
  "tui.noActiveChat": "no active chat",
  "tui.displayCleared": "display cleared",
  "tui.ready": "ready",
  "tui.noAssets": "No assets loaded.",
  "tui.noLinkedAssets": "No assets linked to this chat.",
  "tui.assetName": "Name",
  "tui.assetType": "Type",
  "tui.assetMime": "MIME",
  "tui.assetSize": "Size",
  "tui.assetAdded": "Added",
  "tui.assetAlt": "Alt",
  "tui.navigate": "← → navigate",
  "tui.unlink": "Del: unlink",
  "tui.typing": "typing",
  "tui.error": "Error",
  "tui.noActiveChatDesc": "No active chat. Create or select a chat first.",
}
```

#### 2b. Upgrade `__()` with Interpolation

**Edit:** `src/frontend/alpine/i18n.ts`

```typescript
globalThis.__localeStrings = {};
globalThis.__ = function (key: string, fallback?: string, params?: Record<string, string | number>): string {
  let val = __localeStrings[key] || fallback || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(`{${k}}`, String(v));
    }
  }
  return val;
};
```

#### 2c. Migrate HTML Templates

Replace all hardcoded user-facing strings with `x-text="__('key')"` or
`{{ __("key") }}`.

**Files to edit:**

| File                                                | Approximate changes                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `src/views/layout.html`                             | Replace nav items and titles in sidebar (~8 strings)                |
| `src/views/chat.html`                               | Replace all button labels, empty states, modal titles (~25 strings) |
| `src/views/settings.html`                           | Replace form labels, section titles, button text (~20 strings)      |
| `src/views/login.html`                              | Replace all labels and links (~5 strings)                           |
| `src/views/characters.html`                         | Replace static text (~5 strings)                                    |
| `src/views/gallery.html`                            | Replace static text (~3 strings)                                    |
| `src/views/worlds.html`                             | Replace static text (~5 strings)                                    |
| `src/views/new-chat.html`                           | Replace labels, placeholders, button text (~10 strings)             |
| `src/views/character-edit.html`                     | Replace labels and buttons (~5 strings)                             |
| `src/views/world-detail.html` and `world-edit.html` | Replace labels (~5 strings)                                         |
| `src/views/character-chat-list.html`                | Replace empty state (~3 strings)                                    |
| `src/components/sidebar/sidebar.html`               | Already uses `__()`, add any missing nav items (~2 strings)         |

#### 2d. Migrate JS Template Strings

**Edit:** `src/frontend/page-loaders.ts`

Replace all `"No characters yet"`, `"Create Chat"`, `"Saving..."`, etc. with
`__("characters.noCharacters")`, `__("newChat.create")`, `__("common.saving")`.

This file generates HTML as string literals using template literals and
`innerHTML`. Each hardcoded UI string needs to become a `__("key")` call.

**Strategy:** Define `__()` at file scope (already loaded by bundle), then
replace string literals:

```typescript
// Before
grid.innerHTML = `<div class="title">No characters yet</div>`;

// After
grid.innerHTML = `<div class="title">${__("characters.noCharacters")}</div>`;
```

---

### Phase 3 — Client-Side Completion

#### 3a. Restore Saved Locale on Init

**Edit:** `src/frontend/alpine/app.ts:init()`

```typescript
init() {
  // ... existing init code ...

  const savedLocale = localStorage.getItem("locale") || "en";
  this.loadLocale(savedLocale);
  this.currentLocale = savedLocale;
}
```

#### 3b. Data-Driven Locale Selector

**Edit:** `src/views/settings.html`

Replace hardcoded `<option value="en">English</option>` with Alpine loop:

```html
<select class="form-select" onchange="setLocale(this.value)" data-testid="locale-select">
  <template x-for="l in locales" :key="l.id">
    <option :value="l.id" x-text="l.name"></option>
  </template>
</select>
```

**Edit:** `src/frontend/alpine/app.ts`

Add `locales` array:

```typescript
locales: [
  { id: "en", name: "English" },
],
```

#### 3c. Locale Selector on Login Page

**Edit:** `src/views/login.html`

Add a simple locale selector before the form, using only global `__()` (no
Alpine on login page):

```html
<div class="login-locale">
  <select onchange="setLocale(this.value)" data-testid="login-locale">
    <option value="en">English</option>
  </select>
</div>
```

#### 3d. Send X-Locale Header

**Edit:** `src/frontend/alpine/htmx.ts` (or similar htmx event handler)

Use htmx events to attach locale to requests:

```typescript
document.addEventListener("htmx:configRequest", (e: CustomEvent) => {
  const locale = localStorage.getItem("locale") || "en";
  e.detail.headers["X-Locale"] = locale;
});
```

---

### Phase 4 — TUI i18n

#### 4a. TUI Locale Helper

**Edit:** `src/tui/app.ts` (add at top)

```typescript
const __tui = (function () {
  const strings: Record<string, string> = {
    title: "Loop Lore TUI",
    initializing: "initializing...",
    assetsVisible: "Assets: visible",
    // ... all TUI strings
  };
  return (key: string, fallback?: string): string => strings[key] || fallback || key;
})();
```

**Alternative:** Load `en.json` via Bun's filesystem (no HTTP in TUI):

```typescript
import { readFileSync } from "node:fs";
const tuiStrings = JSON.parse(readFileSync("src/public/locales/en.json", "utf8"));
```

Then replace all blessed `setContent()` and `setLabel()` calls with key
lookups.

#### 4b. TUI Files to Migrate

| File                    | Strings                                       |
| ----------------------- | --------------------------------------------- |
| `src/tui/app.ts`        | ~10 (status bar, labels)                      |
| `src/tui/asset-view.ts` | ~16 (box labels, field labels, help text)     |
| `src/tui/chat.ts`       | ~8 (typing indicator, error messages, status) |

---

### Phase 5 — Route Hardcoded Strings

#### 5a. Strategy

API error strings return JSON to client — these are consumed by frontend code,
not directly displayed. Two options:

**Option A — Translate on server:** Use `t("error.notFound")` in route handlers
and return translated error messages. Requires locale context in every route.

**Option B — Use error codes:** Return canonical `ErrorCode` strings (e.g.,
`"CHAT_NOT_FOUND"`) from API, let client look up the translated message. This
keeps server locale-agnostic and is the preferred pattern.

**Recommended: Option B (error codes), with server-side string fallback.**

#### 5b. Error Code Pattern

**Edit:** `src/routes/http-utils.ts` (add error code enum)

```typescript
export const ErrorCodes = {
  CHAT_NOT_FOUND: "CHAT_NOT_FOUND",
  MESSAGE_NOT_FOUND: "MESSAGE_NOT_FOUND",
  ACTOR_NOT_FOUND: "ACTOR_NOT_FOUND",
  WORLD_NOT_FOUND: "WORLD_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  // ... etc
} as const;

export type ErrorCode = string;
```

Update `jsonError` to include code:

```typescript
export function jsonError(status: number, message: string, code?: ErrorCode): Response {
  return new Response(JSON.stringify({ error: message, code: code || "UNKNOWN" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

On client side, map codes to translated strings:

```typescript
const ERROR_MAP: Record<string, string> = {
  CHAT_NOT_FOUND: __("error.chatNotFound"),
  MESSAGE_NOT_FOUND: __("error.messageNotFound"),
  // ...
};
```

---

## Implementation Order

High-level sequence. Each item is one commit.

### Sprint 1 — Foundation

| Step | Files                         | Description                                                                                      |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | `src/i18n/index.ts`           | Create i18n service with `t()`, `loadDefaultLocale()`, `ensureLocale()`, `getSupportedLocales()` |
| 2    | `src/middleware/types.ts`     | Add `locale: string` to `RequestContext`                                                         |
| 3    | `src/middleware/locale.ts`    | Create locale middleware                                                                         |
| 4    | `src/server.ts`               | Wire locale middleware into pipeline                                                             |
| 5    | `src/routes/views.ts`         | Pass locale through `wrapWithLayout()`, inject `lang` attr and locale data script                |
| 6    | `src/views/layout.html`       | Add `{{{localeData}}}` placeholder, update `lang` attribute                                      |
| 7    | `src/frontend/alpine/i18n.ts` | Read `i18n-data` script on init                                                                  |
| 8    | —                             | **Verify**: Server renders `lang="en"`, locale data available in DOM                             |

### Sprint 2 — Key Expansion

| Step | Files                         | Description                                                                  |
| ---- | ----------------------------- | ---------------------------------------------------------------------------- |
| 9    | `src/public/locales/en.json`  | Expand to ~100+ keys (full namespace coverage)                               |
| 10   | `src/frontend/alpine/i18n.ts` | Add interpolation support (`params`)                                         |
| 11   | `src/frontend/alpine/htmx.ts` | Add `X-Locale` header on htmx requests                                       |
| 12   | —                             | **Verify**: Client `__()` works with interpolation, htmx sends locale header |

### Sprint 3 — HTML Template Migration

| Step | Files                                 | Description                                          |
| ---- | ------------------------------------- | ---------------------------------------------------- |
| 13   | `src/views/chat.html`                 | Replace all hardcoded strings (~25) with `__('key')` |
| 14   | `src/views/settings.html`             | Replace all labels/titles (~20)                      |
| 15   | `src/views/login.html`                | Replace all text (~5), add locale selector           |
| 16   | `src/views/characters.html`           | Replace static strings                               |
| 17   | `src/views/gallery.html`              | Replace static strings                               |
| 18   | `src/views/worlds.html`               | Replace static strings                               |
| 19   | `src/views/new-chat.html`             | Replace placeholders, labels, buttons                |
| 20   | `src/views/character-edit.html`       | Replace labels and buttons                           |
| 21   | Remaining HTML files                  | world-detail, world-edit, character-chat-list        |
| 22   | `src/components/sidebar/sidebar.html` | Add any missing nav key lookups                      |

### Sprint 4 — JS Template Migration

| Step | Files                          | Description                                                                                                                                                                           |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23   | `src/frontend/page-loaders.ts` | Replace all hardcoded UI strings with `__('key')` (~30+ changes across loadCharactersPage, loadGalleryPage, loadWorldsPage, loadNewChatPage, loadCharacterEditPage, loadSettingsPage) |
| 24   | —                              | **Verify**: All empty states, buttons, labels use translated strings                                                                                                                  |

### Sprint 5 — Client Completion

| Step | Files                        | Description                                                                  |
| ---- | ---------------------------- | ---------------------------------------------------------------------------- |
| 25   | `src/frontend/alpine/app.ts` | Fix init to read saved locale, add data-driven locales list                  |
| 26   | `src/views/settings.html`    | Make locale dropdown data-driven                                             |
| 27   | —                            | **Verify**: Locale persists across page loads, selector reflects saved value |

### Sprint 6 — TUI

| Step | Files                   | Description                                      |
| ---- | ----------------------- | ------------------------------------------------ |
| 28   | `src/tui/app.ts`        | Add locale string map, replace hardcoded strings |
| 29   | `src/tui/asset-view.ts` | Replace hardcoded strings                        |
| 30   | `src/tui/chat.ts`       | Replace hardcoded strings                        |
| 31   | —                       | **Verify**: TUI starts without English artifacts |

### Sprint 7 — API Error Standardization (Optional)

| Step | Files                      | Description                          |
| ---- | -------------------------- | ------------------------------------ |
| 32   | `src/routes/http-utils.ts` | Add error code enum                  |
| 33   | All `src/routes/*.ts`      | Return error codes in JSON responses |
| 34   | Client error handling      | Map codes to translated strings      |

---

## File Change Summary

### New Files

| File                       | Purpose                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `src/i18n/index.ts`        | Server-side i18n service: `t()`, catalog loading, locale management |
| `src/middleware/locale.ts` | Locale detection middleware                                         |

### Modified Files

| File                                  | Change                                         |
| ------------------------------------- | ---------------------------------------------- |
| `src/middleware/types.ts`             | Add `locale` to `RequestContext`               |
| `src/server.ts`                       | Wire locale middleware into pipeline           |
| `src/routes/views.ts`                 | Pass locale through layout, inject locale data |
| `src/views/layout.html`               | Add locale data placeholder, dynamic `lang`    |
| `src/public/locales/en.json`          | Expand from 36 to ~100+ keys                   |
| `src/frontend/alpine/i18n.ts`         | Add interpolation, read embedded data on init  |
| `src/frontend/alpine/app.ts`          | Read saved locale on init, data-driven locales |
| `src/frontend/alpine/htmx.ts`         | Send `X-Locale` header                         |
| `src/frontend/ui.ts`                  | Ensure `setLocale` updates `__localeStrings`   |
| `src/frontend/page-loaders.ts`        | Replace hardcoded strings with `__()`          |
| `src/views/chat.html`                 | ~25 key replacements                           |
| `src/views/settings.html`             | ~20 key replacements, data-driven locale       |
| `src/views/login.html`                | ~5 key replacements, add locale selector       |
| `src/views/characters.html`           | ~5 key replacements                            |
| `src/views/gallery.html`              | ~3 key replacements                            |
| `src/views/worlds.html`               | ~5 key replacements                            |
| `src/views/new-chat.html`             | ~10 key replacements                           |
| `src/views/character-edit.html`       | ~5 key replacements                            |
| `src/views/world-detail.html`         | ~3 key replacements                            |
| `src/views/world-edit.html`           | ~2 key replacements                            |
| `src/views/character-chat-list.html`  | ~2 key replacements                            |
| `src/components/sidebar/sidebar.html` | Add any missing nav key lookups                |
| `src/tui/app.ts`                      | ~10 key replacements                           |
| `src/tui/asset-view.ts`               | ~16 key replacements                           |
| `src/tui/chat.ts`                     | ~8 key replacements                            |

---

## Acceptance Criteria

1. All user-facing strings in HTML templates use `__("key")` pattern
2. All user-facing strings in `page-loaders.ts` use `__("key")` pattern
3. All TUI user-facing strings use locale key lookup
4. `en.json` covers all keys used across the app
5. Missing key shows key name (developer-visible), not crash
6. Locale persisted in `localStorage`, restored on page load
7. Locale selector in settings page is data-driven
8. Login page has locale selector
9. Server passes `locale` through layout (lang attr, locale data)
10. htmx requests include `X-Locale` header
11. API error responses include machine-readable code
12. `bun run check` passes
13. `bun test` passes
