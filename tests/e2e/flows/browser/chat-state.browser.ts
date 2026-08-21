// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Alpine State Contract
 *
 * Pins the chatState() component and ui-store shapes so additions and typos
 * fail loudly. Reads component-local state at runtime (post-init, pre-chat)
 * and asserts declared defaults from src/frontend/alpine/chat/bootstrap.ts and
 * src/frontend/stores/ui-store.ts.
 *
 * The `ChatStateShape` / `UiStoreShape` types are re-exported from the
 * contract fixture so any structural drift in the factory or store definition
 * causes a TypeScript build error — not a silent hydration mismatch.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import {
  getAlpineData,
  getAlpineStore,
  waitForAlpineReady,
  waitForAlpineState,
} from "../../helpers/htmx-alpine";
import { CHAT_SELECTORS, type ChatStateShape, type UiStoreShape, } from "../../fixtures/chat-state-contract";

describe("Alpine state contract E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("chatState() exposes the declared defaults before a chat is selected", async () => {
    const page = await ctx.openPage();
    try {
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await waitForAlpineReady(page,);

      const state = await getAlpineData<ChatStateShape>(page, CHAT_SELECTORS.chatStateRoot,);

      // Core flags (src/frontend/alpine/chat/bootstrap.ts).
      expect(state.isGenerating,).toBe(false,);
      expect(state.isContinuing,).toBe(false,);
      expect(state.activeChat,).toBeNull();
      // messages is empty until a chat is selected.
      expect(state.messages,).toEqual([],);
      // chats is auto-loaded on init (solo user's seeded chat appears).
      expect(Array.isArray(state.chats,),).toBe(true,);
      expect(state.chats.length,).toBeGreaterThan(0,);
      expect(state.loadingMessages,).toBe(false,);
      expect(state.loadingError,).toBeNull();
      expect(state.hasMoreMessages,).toBe(true,);
      expect(state.currentPage,).toBe(1,);
      expect(state.totalPages,).toBe(1,);
      expect(state.detailLevel,).toBe("Immersion",);
      expect(state.impersonationActive,).toBe(false,);
      expect(state.currentCharacter,).toBeNull();

      // groupMessages getter must be a live getter (it recomputes), exposed
      // as an array that reflects messages.
      expect(Array.isArray(state.groupedMessages,),).toBe(true,);
    } finally {
      await page.close();
    }
  }, 60_000,);

  test("ui store exposes the declared default toggles", async () => {
    const page = await ctx.openPage();
    try {
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await waitForAlpineReady(page,);

      const ui = await getAlpineStore<UiStoreShape>(page, "ui",);
      // src/frontend/stores/ui-store.ts.
      expect(ui.showChatList,).toBe(false,);
      expect(ui.showGallery,).toBe(false,);
      expect(ui.showCharacterInfo,).toBe(false,);
      expect(ui.showMemoryPanel,).toBe(false,);
      expect(ui.showSectionsPanel,).toBe(false,);
      expect(ui.showBackgroundPanel,).toBe(false,);
      expect(ui.showLocationPanel,).toBe(false,);
      expect(ui.showUploadModal,).toBe(false,);
      expect(ui.showImportForm,).toBe(false,);
      expect(ui.showCreateForm,).toBe(false,);
      expect(ui.showEditModal,).toBe(false,);
      expect(ui.showPreviewModal,).toBe(false,);
      expect(ui.showChatSettings,).toBe(false,);
      expect(ui.showRenameModal,).toBe(false,);
      expect(ui.showPersonaForm,).toBe(false,);
      expect(ui.hasActiveChat,).toBe(false,);
      expect(ui.showGmPanel,).toBe(false,);
    } finally {
      await page.close();
    }
  }, 60_000,);

  test(
    "cold-load: $store.ui.showChatList is false at /views/chat before any user interaction",
    async () => {
      const page = await ctx.openPage();
      try {
        await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await waitForAlpineReady(page,);

        // Use waitForAlpineState to verify the panel toggle is closed — replaces
        // any ad-hoc timeout that would mask a broken initializer.
        const ui = await waitForAlpineState<UiStoreShape>(
          page,
          "[data-testid='app-root']",
          (s) => s.showChatList === false,
          5000,
        );
        expect(ui.showChatList,).toBe(false,);
        expect(ui.showGallery,).toBe(false,);
      } finally {
        await page.close();
      }
    },
    60_000,
  );
});
