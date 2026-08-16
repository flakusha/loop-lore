// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Alpine State Contract
 *
 * Pins the chatState() component and ui-store shapes so additions and typos
 * fail loudly. Reads component-local state at runtime (post-init, pre-chat)
 * and asserts declared defaults from src/frontend/alpine/chat.ts and
 * src/frontend/stores/ui-store.ts.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { getAlpineData, getAlpineStore, waitForAlpineReady, } from "../../helpers/htmx-alpine";

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

      const state = await getAlpineData<Record<string, unknown>>(page, "[x-data='chatState()']",);

      // Core flags (src/frontend/alpine/chat.ts).
      expect(state.isGenerating,).toBe(false,);
      expect(state.isContinuing,).toBe(false,);
      expect(state.activeChat,).toBeNull();
      // messages is empty until a chat is selected.
      expect(state.messages,).toEqual([],);
      // chats is auto-loaded on init (solo user's seeded chat appears).
      expect(Array.isArray(state.chats,),).toBe(true,);
      expect((state.chats as unknown[]).length,).toBeGreaterThan(0,);
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

      const ui = await getAlpineStore<Record<string, unknown>>(page, "ui",);
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
});
