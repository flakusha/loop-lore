/**
 * Tests for view serving routes - redirect and layout wrapping behavior.
 */
import { describe, test, expect } from "bun:test";
import { viewRoutes } from "./views";

const mockDb = {} as never;

describe("viewRoutes redirects", () => {
  test("/views/chat.html redirects to /views/chat", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/views/chat.html"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/views/chat");
  });

  test("/views/gallery.html redirects to /views/gallery", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/views/gallery.html"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/views/gallery");
  });

  test("/views/layout redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/views/layout"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/views/");
  });

  test("/views/layout.html redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/views/layout.html"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/views/");
  });

  test("/views/nonexistent redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/views/nonexistent"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/views/");
  });
});

describe("partials redirect without HX-Request", () => {
  test("/partials/modals/settings without HX-Request redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/partials/modals/settings"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/views/");
  });

  test("/partials/modals/settings with HX-Request returns bare fragment", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(
      new Request("http://localhost/partials/modals/settings", { headers: { "HX-Request": "true" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("<!doctype");
    expect(body).toContain("settingsModal");
  });

  test("/partials/characters/create-modal without HX-Request redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/partials/characters/create-modal"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/views/");
  });
});

describe("dynamic partials redirect without HX-Request", () => {
  test("/dynamic/characters/grid without HX-Request redirects to /views/", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/dynamic/characters/grid"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/views/");
  });
});

describe("views serve with layout wrapping", () => {
  test("/views/chat returns wrapped content", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/views/chat"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<!doctype html>");
  });

  test("/views/chat with HX-Request returns bare fragment", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(
      new Request("http://localhost/views/chat", { headers: { "HX-Request": "true" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("<!doctype");
    expect(body).toContain("app-layout");
  });

  test("/views/login returns wrapped content", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/views/login"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<!doctype html>");
  });

  test("/views/worlds returns wrapped content", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(new Request("http://localhost/views/worlds"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<!doctype html>");
  });
});

describe("chat view mounts modals", () => {
  test("/views/chat includes user-preferences and chat-settings modals", async () => {
    const app = viewRoutes({ database: mockDb });
    const res = await app.handle(
      new Request("http://localhost/views/chat", { headers: { "HX-Request": "true" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    // User preferences modal (was never mounted — bug fix)
    expect(body).toContain("settings-modal-title");
    expect(body).toContain("settingsModal");
    // Chat settings modal
    expect(body).toContain("chat-settings-modal");
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
    const app = viewRoutes({ database: missingDb });
    const res = await app.handle(new Request("http://localhost/worlds/does-not-exist"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("World not found");
    // The broken shell (edit button pointing at a non-existent world) must not render.
    expect(body).not.toContain('data-testid="edit-world"');
  });

  test("/worlds/:id/edit with missing world returns not-found", async () => {
    const app = viewRoutes({ database: missingDb });
    const res = await app.handle(new Request("http://localhost/worlds/does-not-exist/edit"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("World not found");
  });

  test("/characters/:id/edit with missing character returns not-found", async () => {
    const app = viewRoutes({ database: missingDb });
    const res = await app.handle(new Request("http://localhost/characters/does-not-exist/edit"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Character not found");
  });

  test("/character/:slug/edit with missing character returns not-found", async () => {
    const app = viewRoutes({ database: missingDb });
    const res = await app.handle(new Request("http://localhost/character/does-not-exist/edit"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Character not found");
  });
});
