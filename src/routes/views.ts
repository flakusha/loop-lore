/**
 * View Serving Routes
 *
 * Serve HTML templates as htmx-friendly pages:
 *   GET  /                     — landing page (index.html) → chat view
 *   GET  /views/:name          — view template from src/views/
 *   GET  /character/:slug    — chat list for character
 *   GET  /character/:slug/:chatId — specific chat
 *   GET  /worlds             — world list
 *   GET  /worlds/:id         — world detail
 *   GET  /worlds/:id/edit    — world edit
 *
 * Templates wrap content in layout.html using {{{content}}} injection.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";

const VIEWS_DIR = join(import.meta.dir, "..", "views");
const PUBLIC_DIR = join(import.meta.dir, "..", "..", "dist", "public");

// View templates that can be served
const ALLOWED_VIEWS = new Set([
  "chat",
  "gallery",
  "settings",
  "login",
  "characters",
  "new-chat",
  "assets",
  "worlds",
  "world-detail",
  "world-edit",
  "character-edit",
]);

/** Simplistic layout wrapper — replaces {{{content}}} in layout.html */
function wrapWithLayout(content: string, title?: string): string {
  const layoutPath = join(VIEWS_DIR, "layout.html");
  if (!existsSync(layoutPath)) return content;

  let layout = readFileSync(layoutPath, "utf8");
  layout = layout.replace("{{{content}}}", () => content);
  if (title) layout = layout.replace(/<title>.*?<\/title>/, () => `<title>${title} — Loop Lore</title>`);
  return layout;
}

function serveView(viewName: string): Response | null {
  // Sanitize: only allow known view names to prevent path traversal
  viewName = viewName === "assets" ? "gallery" : viewName;
  if (!ALLOWED_VIEWS.has(viewName)) return null;

  const viewPath = join(VIEWS_DIR, `${viewName}.html`);
  if (!existsSync(viewPath)) return null;

  const content = readFileSync(viewPath, "utf8");
  const wrapped =
    viewName === "index"
      ? content
      : wrapWithLayout(content, viewName.charAt(0).toUpperCase() + viewName.slice(1));

  return new Response(wrapped, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Serve character chat list
function serveCharacterChatList(slug: string): Response | null {
  const viewPath = join(VIEWS_DIR, "character-chat-list.html");
  if (!existsSync(viewPath)) return null;

  let content = readFileSync(viewPath, "utf8");
  // Inject character slug for Alpine to use
  content = content.replace("{{characterSlug}}", () => slug);
  return new Response(wrapWithLayout(content, `${slug} — Chats`), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Serve specific chat (character/:slug/:chatId)
function serveCharacterChat(slug: string, _chatId: string): Response | null {
  const viewPath = join(VIEWS_DIR, "chat.html");
  if (!existsSync(viewPath)) return null;

  const content = readFileSync(viewPath, "utf8");
  // Chat view will use Alpine to load messages for the specific chat
  return new Response(wrapWithLayout(content, `${slug} — Chat`), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Serve world list
function serveWorldsList(): Response | null {
  return serveView("worlds");
}

// Serve world detail
function serveWorldDetail(worldId: string): Response | null {
  const viewPath = join(VIEWS_DIR, "world-detail.html");
  if (!existsSync(viewPath)) return null;

  let content = readFileSync(viewPath, "utf8");
  content = content.replace("{{worldId}}", () => worldId);
  return new Response(wrapWithLayout(content, "World — Details"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Serve world edit
function serveWorldEdit(worldId: string): Response | null {
  const viewPath = join(VIEWS_DIR, "world-edit.html");
  if (!existsSync(viewPath)) return null;

  let content = readFileSync(viewPath, "utf8");
  content = content.replace("{{worldId}}", () => worldId);
  return new Response(wrapWithLayout(content, "Edit World"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Serve character edit
function serveCharacterEdit(characterId: string): Response | null {
  const viewPath = join(VIEWS_DIR, "character-edit.html");
  if (!existsSync(viewPath)) return null;

  let content = readFileSync(viewPath, "utf8");
  content = content.replace("{{characterId}}", () => characterId);
  return new Response(wrapWithLayout(content, "Edit Character"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const dispatch: RouteDispatch = async ({
  request,
  context: _context,
  database: _database,
  config: _config,
}) => {
  const url = new URL(request.url);
  const { pathname } = url;

  // ── Landing page ────────────────────────────────────────────
  if (pathname === "/") {
    const chatResult = serveView("chat");
    if (chatResult) return chatResult;

    // Fallback to public/index.html
    const publicIndex = join(PUBLIC_DIR, "index.html");
    if (existsSync(publicIndex)) {
      return new Response(readFileSync(publicIndex), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Loop Lore");
  }

  // ── Character routes ───────────────────────────────────────
  // /character/:slug → chat list for character
  const characterChatListMatch = /^\/character\/([\w-]+)$/.exec(pathname);
  if (characterChatListMatch) {
    const result = serveCharacterChatList(characterChatListMatch[1]);
    if (result) return result;
  }

  // /character/:slug/edit → character edit (must check before /:chatId)
  const characterEditMatch = /^\/character\/([\w-]+)\/edit$/.exec(pathname);
  if (characterEditMatch) {
    const result = serveCharacterEdit(characterEditMatch[1]);
    if (result) return result;
  }

  // /character/:slug/:chatId → specific chat
  const characterChatMatch = /^\/character\/([\w-]+)\/([\w-]+)$/.exec(pathname);
  if (characterChatMatch) {
    const [, slug, chatId] = characterChatMatch;
    const result = serveCharacterChat(slug, chatId);
    if (result) return result;
  }

  // /characters/:id/edit → character edit (alternative url)
  const charactersEditMatch = /^\/characters\/([\w-]+)\/edit$/.exec(pathname);
  if (charactersEditMatch) {
    const result = serveCharacterEdit(charactersEditMatch[1]);
    if (result) return result;
  }

  // ── World routes ───────────────────────────────────────────
  // /worlds → world list
  if (pathname === "/worlds") {
    const result = serveWorldsList();
    if (result) return result;
  }

  // /worlds/:id → world detail
  const worldDetailMatch = /^\/worlds\/([\w-]+)$/.exec(pathname);
  if (worldDetailMatch) {
    const result = serveWorldDetail(worldDetailMatch[1]);
    if (result) return result;
  }

  // /worlds/:id/edit → world edit
  const worldEditMatch = /^\/worlds\/([\w-]+)\/edit$/.exec(pathname);
  if (worldEditMatch) {
    const result = serveWorldEdit(worldEditMatch[1]);
    if (result) return result;
  }

  // ── View templates ──────────────────────────────────────────
  const viewMatch = /^\/views\/([\w-]+)$/.exec(pathname);
  if (viewMatch) {
    const result = serveView(viewMatch[1]);
    if (result) return result;
  }

  return null; // Not a view route
};

registerRoute(dispatch); // eslint-disable-line unicorn/no-top-level-side-effects
export { dispatch, serveView };
