/**
 * Tests for view serving routes - redirect and layout wrapping behavior.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { applyI18n, viewRoutes, } from "./views";

const mockDb = {} as never;

describe("viewRoutes redirects", () => {
  test("/views/chat.html redirects to /views/chat", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/chat.html",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/views/chat",);
  });

  test("/views/gallery.html redirects to /views/gallery", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/gallery.html",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/views/gallery",);
  });

  test("/views/layout redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/layout",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/views/",);
  });

  test("/views/layout.html redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/layout.html",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/views/",);
  });

  test("/views/nonexistent redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/nonexistent",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/views/",);
  });
});

describe("partials redirect without HX-Request", () => {
  test("/partials/modals/settings without HX-Request redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/partials/modals/settings",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/views/",);
  });

  test("/partials/modals/settings with HX-Request returns bare fragment", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(
      new Request("http://localhost/partials/modals/settings", { headers: { "HX-Request": "true", }, },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).not.toContain("<!doctype",);
    expect(body,).toContain("settingsModal",);
  });

  test("/partials/characters/create-modal without HX-Request redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/partials/characters/create-modal",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/views/",);
  });
});

describe("dynamic partials redirect without HX-Request", () => {
  test("/dynamic/characters/grid without HX-Request redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/dynamic/characters/grid",),);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/views/",);
  });
});

describe("views serve with layout wrapping", () => {
  test("/views/chat returns wrapped content", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/chat",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("<!doctype html>",);
  });

  test("/views/chat with HX-Request returns bare fragment", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(
      new Request("http://localhost/views/chat", { headers: { "HX-Request": "true", }, },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).not.toContain("<!doctype",);
    expect(body,).toContain("app-layout",);
  });

  test("/views/login returns wrapped content", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/login",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("<!doctype html>",);
  });

  test("/views/worlds returns wrapped content", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/worlds",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("<!doctype html>",);
  });
});

describe("chat view mounts modals", () => {
  test("/views/chat includes user-preferences and chat-settings modals", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(
      new Request("http://localhost/views/chat", { headers: { "HX-Request": "true", }, },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.text();
    // User preferences modal (was never mounted — bug fix)
    expect(body,).toContain("settings-modal-title",);
    expect(body,).toContain("settingsModal",);
    // Chat settings modal
    expect(body,).toContain("chat-settings-modal",);
  });
});

describe("id verification (URL injection guard)", () => {
  // DB mock whose lookups always miss — simulates a deleted/archived id.
  const missingDb = {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: async () => null,
        }),
      }),
    }),
  } as never;

  test("/worlds/:id with missing world returns not-found, not shell", async () => {
    const app = viewRoutes({ database: missingDb, },);
    const res = await app.handle(new Request("http://localhost/worlds/does-not-exist",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("World not found",);
    // The broken shell (edit button pointing at a non-existent world) must not render.
    expect(body,).not.toContain('data-testid="edit-world"',);
  });

  test("/worlds/:id/edit with missing world returns not-found", async () => {
    const app = viewRoutes({ database: missingDb, },);
    const res = await app.handle(new Request("http://localhost/worlds/does-not-exist/edit",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("World not found",);
  });

  test("/characters/:id/edit with missing character returns not-found", async () => {
    const app = viewRoutes({ database: missingDb, },);
    const res = await app.handle(new Request("http://localhost/characters/does-not-exist/edit",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("Character not found",);
  });

  test("/character/:slug/edit with missing character returns not-found", async () => {
    const app = viewRoutes({ database: missingDb, },);
    const res = await app.handle(new Request("http://localhost/character/does-not-exist/edit",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("Character not found",);
  });
});

describe("applyI18n", () => {
  test("replaces i18n template expression with translated value", () => {
    const t = (key: string,) => `translated:${key}`;
    expect(applyI18n('{{{ t("common.save") }}}', t,),).toBe("translated:common.save",);
  });

  test("replaces i18n template expression with spaces", () => {
    const t = (key: string,) => `translated:${key}`;
    expect(applyI18n('{{{ t("common.save") }}}', t,),).toBe("translated:common.save",);
  });

  test("replaces multiple i18n placeholders", () => {
    const t = (key: string,) => key;
    const input = '<button title="{{{ t("common.save") }}}">{{{ t("common.cancel") }}}</button>';
    expect(applyI18n(input, t,),).toBe('<button title="common.save">common.cancel</button>',);
  });

  test("passes through content without template expressions unchanged", () => {
    const t = (_key: string,) => "should-not-be-called";
    expect(applyI18n("<p>Hello world</p>", t,),).toBe("<p>Hello world</p>",);
  });

  test("returns content unchanged when t is undefined", () => {
    expect(applyI18n('{{{ t("common.save") }}}',),).toBe('{{{ t("common.save") }}}',);
  });

  test("returns content unchanged when content is empty", () => {
    const t = (_key: string,) => "translated";
    expect(applyI18n("", t,),).toBe("",);
  });
});

describe("chat list encryption badge", () => {
  test("renders a lock badge for non-public chats and none for public", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "owner", "Owner", { id: "owner-1", } as any,);
    await insertChats(db, "Encrypted chat", "owner-1", { encryption_level: "standard", } as any,);
    await insertChats(db, "Public chat", "owner-1", { encryption_level: "none", } as any,);

    const app = viewRoutes({ database: db, },);
    const res = await app.handle(
      new Request("http://localhost/dynamic/chats/list", { headers: { "HX-Request": "true", }, },),
    );
    expect(res.status,).toBe(200,);
    const html = await res.text();

    // Both chats are listed; the lock appears exactly once (standard only).
    expect(html,).toContain("Encrypted chat",);
    expect(html,).toContain("Public chat",);
    const lockCount = html.split("🔒",).length - 1;
    expect(lockCount,).toBe(1,);
    // Split into cards and assert the lock lives in the encrypted chat's card
    // (identified by its data-testid) and not the public one.
    const cards = html.split('data-testid="',).filter((seg,) => seg.startsWith("chat-card-",));
    const encryptedCard = cards.find((c,) => c.includes("Encrypted chat",));
    const publicCard = cards.find((c,) => c.includes("Public chat",));
    expect(encryptedCard,).toBeDefined();
    expect(publicCard,).toBeDefined();
    expect(encryptedCard ?? "",).toContain("🔒",);
    expect(publicCard ?? "",).not.toContain("🔒",);
  });
});

describe("NSFW moderation admin view", () => {
  test("/views/nsfw-moderation is guarded for non-admin users", async () => {
    const app = viewRoutes({ database: mockDb, },);
    const res = await app.handle(new Request("http://localhost/views/nsfw-moderation",),);
    expect([302, 403,],).toContain(res.status,);
  });

  test("/views/nsfw-moderation renders consent state + audit log for admin", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "Moderator", "Moderator", { id: "admin-1", } as any,);
    await insertUsers(db, "Target User", "Target", { id: "target-1", } as any,);

    const app = new Elysia({ name: "test-views", },)
      .derive(() => ({ userId: "admin-1", userRole: "admin", }))
      .use(viewRoutes({ database: db, },),) as unknown as Elysia;

    const res = await app.handle(new Request("http://localhost/views/nsfw-moderation?userId=target-1",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    // Wrapped in the page layout
    expect(body,).toContain("<!doctype html>",);
    // Consent state + audit-log structural markers are rendered server-side
    expect(body,).toContain("Consent State",);
    expect(body,).toContain("Moderation Audit Log",);
    expect(body,).toContain("target-1",);
    // Lazy default consent row is present, and no moderation actions exist yet
    expect(body,).toContain("NSFW enabled",);
    expect(body,).toContain("No moderation actions recorded",);
  });
});
