// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Chat Compression → Encryption → Decryption → Decompression Flow
 *
 * Covers TASK-e2e-state-contracts Topic 1:
 *   - Open seeded chat → assert `window.__chatKey` is set (Alpine chat-keys
 *     state) → send a message → assert rendered message decrypts to plaintext
 *     after the htmx swap (no "[Encrypted — unable to decrypt]" placeholder).
 *   - Fetch the message via the API and assert the stored content is the
 *     encrypted payload (`{enc, nonce, algo, comp, keyId}` JSON).
 *   - Wrong-key path: assert the server falls back to the
 *     "[Encrypted — unable to decrypt]" placeholder for messages it cannot
 *     decrypt (the UI never sees them, but the API contract is observable).
 *
 * Encryption is automatic when the per-chat key is present (no user toggle).
 * The chat key is fetched on `selectChat` via chat-keys.loadChatKey() and
 * stored on `globalThis.__chatKey` so htmx extensions can read it after swap.
 */

import { ensureActorKey, getSmk, } from "@/crypto";
import { ChatMode, ChatType, } from "@/db/enums";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, waitForAlpineState, } from "../../helpers/htmx-alpine";
import { SEED, seedAll, } from "../../helpers/seed";

const VALID_HEX_KEY = "b".repeat(64,); // 32 bytes = 256-bit SMK

describe("Chat compression-encryption-decryption flow (UI)", () => {
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

    // Encryption requires (1) a standard-tier chat and (2) an actor key for
    // the solo user so deriveChatKeyForChat does not throw "no participant keys".
    const smk = getSmk();
    expect(smk,).not.toBeNull();
    await ensureActorKey({ database: ctx.db, actorId: SEED.solo.id, smk: smk!, },);
    await ctx.db
      .updateTable("chats",)
      .set({ encryption_level: "standard", },)
      .where("id", "=", SEED.soloChat.id,)
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("selecting a chat loads the chat key into window.__chatKey", async () => {
    const page = await ctx.openPage();
    // /api/v1/telemetry/event is 403 for solo — benign infrastructure noise.
    const errors = trackPageErrors(page, { allowlist: [/Failed to load resource.*403/,], },);
    try {
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 30_000, },);
      await page.evaluate(() => {
        document.querySelector("[data-testid='toggle-chat-list']",)?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, },),
        );
      },);
      // Wait for the chat-list-panel to actually become visible (CSS toggle
      // sets display:flex via Alpine :style). 'attached' would resolve even
      // while the panel is display:none, hiding all nav-item children.
      await page.locator("[data-testid='chat-list-panel']",).waitFor({
        state: "visible",
        timeout: 15_000,
      },);
      const chatItem = page.locator("[data-testid='chat-list-panel'] .nav-item",).filter({
        hasText: SEED.soloChat.name,
      },).first();
      await chatItem.waitFor({ state: "visible", timeout: 15_000, },);
      await chatItem.click();

      // chat-keys module populates globalThis.__chatKey once loadChatKey succeeds.
      await waitForAlpineState(
        page,
        "[x-data='chatState()']",
        (state,) => state.activeChat === SEED.soloChat.id && state._encryptionEnabled === true && !!state._chatKey,
        10_000,
      );
      const keyPresent = await page.evaluate(() => globalThis.__chatKey instanceof CryptoKey);
      expect(keyPresent,).toBe(true,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("sending an encrypted message decrypts to plaintext after the htmx swap", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: [/Failed to load resource.*403/,], },);
    try {
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 30_000, },);
      await page.evaluate(() => {
        document.querySelector("[data-testid='toggle-chat-list']",)?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, },),
        );
      },);
      // Wait for the chat-list-panel to actually become visible (CSS toggle
      // sets display:flex via Alpine :style). 'attached' would resolve even
      // while the panel is display:none, hiding all nav-item children.
      await page.locator("[data-testid='chat-list-panel']",).waitFor({
        state: "visible",
        timeout: 15_000,
      },);
      const chatItem = page.locator("[data-testid='chat-list-panel'] .nav-item",).filter({
        hasText: SEED.soloChat.name,
      },).first();
      await chatItem.waitFor({ state: "visible", timeout: 15_000, },);
      await chatItem.click();
      await waitForAlpineState(
        page,
        "[x-data='chatState()']",
        (state,) => state.activeChat === SEED.soloChat.id && state._encryptionEnabled === true && !!state._chatKey,
        10_000,
      );

      const secret = `encryption-flow-${Date.now()}`;
      await page.fill("[data-testid='message-input']", secret,);
      await page.click("[data-testid='send-button']",);

      // The server decrypts on read, so the rendered bubble contains plaintext.
      await page.locator("#message-list",).getByText(secret,).waitFor({ timeout: 30_000, },);
      const bodyText = await page.evaluate(() => document.body.textContent || "");
      expect(bodyText,).not.toContain("[Encrypted \u2014 unable to decrypt]",);

      // DB row is the encrypted payload, not plaintext.
      const row = await ctx.db
        .selectFrom("messages",)
        .select(["content", "key_id", "chat_id",],)
        .where("chat_id", "=", SEED.soloChat.id,)
        .orderBy("created_at", "desc",)
        .executeTakeFirst();
      expect(row,).not.toBeNull();
      expect(row!.content,).not.toContain(secret,);
      expect(row!.key_id,).not.toBeNull();
      expect(row!.content,).toMatch(/^\{"enc":/,);
      expect(row!.content,).toMatch(/"algo":/,);
      expect(row!.content,).toMatch(/"comp":/,);
      expect(row!.content,).toMatch(/"key_id":/,);

      // API also returns plaintext (server-side decrypt).
      const list = await page.evaluate(async (chatId,) => {
        const r = await fetch(`/api/v1/chats/${chatId}/messages`, { credentials: "include", },);
        return { status: r.status, body: await r.text(), };
      }, SEED.soloChat.id,);
      expect(list.status,).toBe(200,);
      expect(list.body,).toContain(secret,);
      expect(list.body,).not.toContain("[Encrypted \u2014 unable to decrypt]",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});

describe("Encrypted message — wrong-key fallback (API)", () => {
  // Direct DB test of the resolveMessageContent fallback path: a stored
  // encrypted payload with a deleted key_id falls back to the placeholder.
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
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test(
    "server returns the unable-to-decrypt placeholder for a single encrypted message when the key is gone",
    async () => {
      const smk = getSmk();
      expect(smk,).not.toBeNull();
      await ensureActorKey({ database: ctx.db, actorId: SEED.solo.id, smk: smk!, },);
      await ctx.db
        .updateTable("chats",)
        .set({ encryption_level: "standard", },)
        .where("id", "=", SEED.soloChat.id,)
        .execute();

      // Insert a synthetic encrypted payload with a key_id that doesn't exist.
      // The server's resolveMessageContent in routes/messages/read.ts will
      // catch the decrypt failure and substitute the placeholder.
      const bogusKeyId = "00000000-0000-0000-0000-deadbeefdead";
      // Strict shape per src/crypto/pipeline.ts (isEncryptedPayload): algo must
      // be "aes-256-gcm", key_id is snake_case, nonce must be 12-byte base64.
      const bogusPayload = JSON.stringify({
        enc: "c29tZSBmYWtlIGNpcGhlcnRleHQgYnl0ZXM=",
        nonce: "AAECAwQFBgcICQoL",
        algo: "aes-256-gcm",
        comp: "none",
        key_id: bogusKeyId,
      },);
      const msgId = "b9999999-0000-4000-a000-000000000000";
      await ctx.db
        .insertInto("messages",)
        .values({
          id: msgId,
          chat_id: SEED.soloChat.id,
          actor_id: SEED.solo.id,
          role: "user",
          content: bogusPayload,
          content_format: "markdown",
          content_type: "text",
          content_encoding: "encrypted",
          status: "confirmed",
          visibility: "visible",
          key_id: bogusKeyId,
        },)
        .execute();

      // Single-message endpoint applies resolveMessageContent → placeholder.
      const single = await fetch(`${ctx.url}/api/v1/messages/${msgId}`, {
        credentials: "include",
      },);
      expect(single.status,).toBe(200,);
      const singleBody = await single.text();
      expect(singleBody,).toContain("[Encrypted \u2014 unable to decrypt]",);
      expect(singleBody,).not.toContain(bogusPayload,);

      // Both /api/v1/messages/:id (single) and /api/v1/chats/:id/messages (list)
      // apply resolveMessageContent — both substitute the placeholder when the
      // stored payload's key_id has no matching chat_keys row. Pin the list
      // endpoint here too so the contract is observable from either surface.
      const list = await fetch(`${ctx.url}/api/v1/chats/${SEED.soloChat.id}/messages`, {
        credentials: "include",
      },);
      expect(list.status,).toBe(200,);
      const listBody = await list.text();
      expect(listBody,).toContain("[Encrypted \u2014 unable to decrypt]",);
      expect(listBody,).not.toContain(bogusPayload,);
    },
    60_000,
  );
});
