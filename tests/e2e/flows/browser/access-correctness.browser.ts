/**
 * Browser E2E: Access Control & Visibility
 *
 * Verifies that a solo (demo) user — who is NOT the owner/participant — is
 * denied access to another user's (e2euser's) private resources through the
 * UI, and that no data leaks into the DOM:
 *   A. World ownership: the world edit form (`.world-edit-tabs`) must not
 *      render for a world the solo user doesn't own, and the world detail
 *      page must not leak the world name.
 *   B. Chat access: a chat owned by e2euser (solo is not a participant) must
 *      not surface any message content in the solo chat UI.
 *
 * Runs in default solo mode (auth NOT required). seedUsers() creates the
 * e2euser owner; createBrowserTest() seeds the solo 'demo' user.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { ChatMode, ChatType, WorldVisibility, } from "@/db/enums";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

// Distinct resources owned by SEED.user.id (e2euser) that the solo user must NOT see.
const WORLD_ID = "b0000001-0000-4000-a000-000000000000";
const WORLD_NAME = "E2E Private World (e2euser)";
const CHAT_ID = "b0000002-0000-4000-a000-000000000000";
const CHAT_NAME = "E2E Private Chat (e2euser)";
const MSG_ID = "b0000003-0000-4000-a000-000000000000";
const MSG_SECRET = "E2E_PRIVATE_CHAT_SECRET1";

describe("Access control E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedUsers(ctx.db,);

    // A private world owned by e2euser (the solo 'demo' user is not the owner).
    await ctx.db
      .insertInto("worlds",)
      .values({
        id: WORLD_ID,
        owner_id: SEED.user.id,
        name: WORLD_NAME,
        description: "Owned by e2euser; must be hidden from the solo user",
        publication_status: "published",
        visibility: WorldVisibility.Private,
        kind: "rpg",
      },)
      .onConflict((oc,) => oc.column("id",).doNothing())
      .execute();

    // A chat owned by e2euser (e2euser is the only participant).
    await ctx.db
      .insertInto("chats",)
      .values({
        id: CHAT_ID,
        name: CHAT_NAME,
        type: ChatType.Direct,
        mode: ChatMode.Story,
        created_by: SEED.user.id,
      },)
      .onConflict((oc,) => oc.column("id",).doNothing())
      .execute();
    await ctx.db
      .insertInto("chat_participants",)
      .values({
        chat_id: CHAT_ID,
        actor_id: SEED.user.id,
        role_in_chat: "owner",
      },)
      .onConflict((oc,) => oc.columns(["chat_id", "actor_id",],).doNothing())
      .execute();
    await ctx.db
      .insertInto("messages",)
      .values({
        id: MSG_ID,
        chat_id: CHAT_ID,
        actor_id: SEED.user.id,
        role: "user",
        content: MSG_SECRET,
        content_format: "markdown",
        content_type: "text",
        content_encoding: "identity",
        status: "confirmed",
        visibility: "visible",
      },)
      .onConflict((oc,) => oc.column("id",).doNothing())
      .execute();
  }, 45_000,);

  afterAll(async () => {
    await ctx.close();
  },);

  // ── A. World ownership (solo user is not the owner) ────────────────
  describe("World ownership", () => {
    test("non-owner solo user cannot load the world edit form", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, {
        // Resource-load 404s (e.g. favicon) are benign; the access-control
        // signal is the world API 404 + absent edit form.
        allowlist: [/404 \(Not Found\)/, /401 \(Unauthorized\)/, /Failed to load resource/,],
      },);
      try {
        // The world-edit shell renders, then the Alpine component fetches
        // /api/worlds/:id, which is access-gated (requireWorldAccess).
        const worldApi = page.waitForResponse(
          (res,) => res.url().includes(`/api/worlds/${WORLD_ID}`) && res.request().method() === "GET",
          { timeout: 10_000, },
        );
        await page.goto(`${ctx.url}/worlds/${WORLD_ID}/edit`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
        const res = await worldApi;
        // requireWorldAccess: not owner, not admin (solo is "solo"), not public,
        // not a member → 404.
        expect(res.status(),).toBe(404,);

        // loadWorld() settles into the error/empty state, hiding the ⏳ loading
        // indicator. Wait for that, then assert the edit form does not render.
        await page.waitForFunction(() => !document.body.innerText.includes("⏳"), null, { timeout: 8_000, },);
        expect(await page.locator(".world-edit-tabs",).count(),).toBe(0,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 40_000,);

    test("non-owner solo user sees no world detail content (no name leak)", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, {
        allowlist: [/404 \(Not Found\)/, /401 \(Unauthorized\)/, /Failed to load resource/,],
      },);
      try {
        await page.goto(`${ctx.url}/worlds/${WORLD_ID}`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
        // The #world-detail container htmx-loads /dynamic/worlds/:id/detail on page load.
        await page.waitForFunction(() => {
          const el = document.querySelector("#world-detail",);
          return !!el && el.children.length > 0 && !(el.textContent || "").includes("⏳");
        }, null, { timeout: 8_000, },);
        const bodyText = await page.evaluate(() => document.body.innerText,);
        // serveWorldDetailContent allows owner/admin only; solo is denied → no name leak.
        expect(bodyText,).not.toContain(WORLD_NAME,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 40_000,);
  });

  // ── B. Chat access (solo user is not a participant) ────────────────
  describe("Chat access", () => {
    test("solo non-participant sees no messages from e2euser's chat", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, {
        allowlist: [/404 \(Not Found\)/, /401 \(Unauthorized\)/, /Failed to load resource/,],
      },);
      try {
        await page.goto(`${ctx.url}/views/chat?chatid=${CHAT_ID}`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
        // The chat app only keeps chats the user created; a foreign chatid is
        // dropped (redirect to /views/chat) before any message fetch.
        await page.locator("#message-list",).waitFor({ state: "attached", timeout: 10_000, },);
        await page
          .waitForFunction(() => !new URLSearchParams(location.search,).has("chatid",), null, { timeout: 8_000, })
          .catch(() => { /* redirect may not be observed; the message-count guard below is authoritative */ },);

        // Give the message layer a beat to settle, then assert no content leaks.
        await page.waitForTimeout(600,);
        expect(await page.locator("#message-list .message",).count(),).toBe(0,);
        const bodyText = await page.evaluate(() => document.body.innerText,);
        expect(bodyText,).not.toContain(MSG_SECRET,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 40_000,);
  });
});