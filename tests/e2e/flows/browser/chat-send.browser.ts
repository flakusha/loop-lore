/**
 * Browser E2E: Chat Send Round-trip + Encryption Flow
 *
 * Verifies the full chat message send path through the UI:
 *  - Plaintext: type → send → message renders after reload + persists in DB.
 *  - Encryption (SMK configured): client-side compress→encrypt before send,
 *    DB stores an encrypted payload, server decrypts on read so the UI
 *    renders plaintext.
 *
 * Uses the Alpine chatState() component state for web-first assertions
 * instead of fixed sleeps.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { ensureActorKey, getSmk, } from "@/crypto";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { waitForAlpineState, } from "../../helpers/htmx-alpine";
import { SEED, seedAll, } from "../../helpers/seed";

const VALID_HEX_KEY = "b".repeat(64,); // 32 bytes = 256-bit SMK

describe("Chat send round-trip (plaintext)", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db,);
  }, 45_000,);

  afterAll(async () => {
    await ctx.close();
  },);

  /** Open chat view, open the chat list, select the seeded solo chat. */
  async function openAndSelectChat(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
  ) {
    await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
    await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 10_000, },);
    // Open chat list panel (Alpine store toggle via header button)
    await page.evaluate(() => {
      document.querySelector("[data-testid='toggle-chat-list']",)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, },),
      );
    },);
    // Select the seeded chat by name (solo user owns SEED.soloChat).
    const chatItem = page.locator("[data-testid='chat-list-panel'] .nav-item",).filter({
      hasText: SEED.soloChat.name,
    },).first();
    await chatItem.waitFor({ state: "attached", timeout: 8000, },);
    await chatItem.click();
    // Wait for the chat to be selected (soloChat seeds no messages, so
    // don't require messages.length — the send test creates its own).
    await waitForAlpineState(
      page,
      "[x-data='chatState()']",
      (state,) => state.activeChat === SEED.soloChat.id,
      10_000,
    );
  }

  test("sends a message that renders and persists in DB", async () => {
    const page = await ctx.openPage();
    try {
      await openAndSelectChat(page,);

      const sent = "round-trip-" + Date.now();
      await page.fill("[data-testid='message-input']", sent,);
      await page.click("[data-testid='send-button']",);

      // Message appears in the DOM after send + loadMessages().
      await page.locator("#message-list",).getByText(sent,).waitFor({ timeout: 10_000, },);

      // Persisted in DB as plaintext (no key_id).
      const row = await ctx.db
        .selectFrom("messages",)
        .select(["content", "key_id", "chat_id",])
        .where("chat_id", "=", SEED.soloChat.id,)
        .where("content", "=", sent,)
        .executeTakeFirst();
      expect(row,).not.toBeNull();
      expect(row!.key_id,).toBeNull();
    } finally {
      await page.close();
    }
  }, 30_000,);

  test("does not send empty messages", async () => {
    const page = await ctx.openPage();
    try {
      await openAndSelectChat(page,);
      const before = await ctx.db
        .selectFrom("messages",)
        .select(ctx.db.fn.countAll().as("count"),)
        .where("chat_id", "=", SEED.soloChat.id,)
        .executeTakeFirstOrThrow();

      await page.click("[data-testid='send-button']",);
      await page.waitForTimeout(500,);

      const after = await ctx.db
        .selectFrom("messages",)
        .select(ctx.db.fn.countAll().as("count"),)
        .where("chat_id", "=", SEED.soloChat.id,)
        .executeTakeFirstOrThrow();
      expect(Number(after.count,),).toBe(Number(before.count,),);
    } finally {
      await page.close();
    }
  }, 30_000,);
});

describe("Chat encryption flow (SMK configured)", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({
      encryption: {
        required: false,
        compressThreshold: 128,
        compressAlgorithm: "gzip",
        keyRotationDays: 0,
        anonymous: false,
        serverEncryptionKey: VALID_HEX_KEY,
      },
    },);
    await seedAll(ctx.db,);

    // The seeded solo chat is public-tier with no actor keys. Encryption
    // requires: (1) a standard-tier chat, (2) an actor key for the solo
    // user so deriveChatKeyForChat doesn't throw "no participant keys".
    const smk = getSmk();
    expect(smk,).not.toBeNull();
    await ensureActorKey({ database: ctx.db, actorId: SEED.solo.id, smk: smk!, },);
    await ctx.db
      .updateTable("chats",)
      .set({ encryption_level: "standard", })
      .where("id", "=", SEED.soloChat.id,)
      .execute();
  }, 45_000,);

  afterAll(async () => {
    await ctx.close();
  },);

  test("sends client-encrypted content; server decrypts for display", async () => {
    const page = await ctx.openPage();
    try {
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
      await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.evaluate(() => {
        document.querySelector("[data-testid='toggle-chat-list']",)?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, },),
        );
      },);
      const chatItem = page.locator("[data-testid='chat-list-panel'] .nav-item",).filter({
        hasText: SEED.soloChat.name,
      },).first();
      await chatItem.waitFor({ state: "attached", timeout: 8000, },);
      await chatItem.click();

      // Chat key must be loaded into the Alpine chat-keys component.
      await waitForAlpineState(
        page,
        "[x-data='chatState()']",
        (state,) => state.activeChat === SEED.soloChat.id && state._encryptionEnabled === true && !!state._chatKey,
        10_000,
      );

      const secret = "encrypted-secret-" + Date.now();
      await page.fill("[data-testid='message-input']", secret,);
      await page.click("[data-testid='send-button']",);

      // UI renders plaintext (server decrypts on read).
      await page.locator("#message-list",).getByText(secret,).waitFor({ timeout: 10_000, },);

      // DB stores an encrypted payload, not the plaintext.
      const row = await ctx.db
        .selectFrom("messages",)
        .select(["content", "key_id", "chat_id",])
        .where("chat_id", "=", SEED.soloChat.id,)
        .orderBy("created_at", "desc",)
        .executeTakeFirst();
      expect(row,).not.toBeNull();
      expect(row!.content,).not.toContain(secret,);
      expect(row!.key_id,).not.toBeNull();
      // Payload shape: { enc, nonce, algo, comp, keyId } JSON.
      expect(row!.content,).toMatch(/^\{"enc":/);
    } finally {
      await page.close();
    }
  }, 30_000,);
});
