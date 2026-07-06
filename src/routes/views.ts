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
 * When `HX-Request` header is present, returns content fragment only (no layout).
 * When absent (direct navigation), wraps with full layout.
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

/** Return raw content or layout-wrapped depending on request source */
function respond(content: string, isHtmx: boolean, title?: string): Response {
  const body = isHtmx ? content : wrapWithLayout(content, title);
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function serveView(viewName: string, isHtmx = false): Response | null {
  viewName = viewName === "assets" ? "gallery" : viewName;
  if (!ALLOWED_VIEWS.has(viewName)) return null;

  const viewPath = join(VIEWS_DIR, `${viewName}.html`);
  if (!existsSync(viewPath)) return null;

  const content = readFileSync(viewPath, "utf8");
  const title = viewName === "index" ? undefined : viewName.charAt(0).toUpperCase() + viewName.slice(1);
  return respond(content, isHtmx, title);
}

function serveCharacterChatList(slug: string, isHtmx = false): Response | null {
  const viewPath = join(VIEWS_DIR, "character-chat-list.html");
  if (!existsSync(viewPath)) return null;

  let content = readFileSync(viewPath, "utf8");
  content = content.replace("{{characterSlug}}", () => slug);
  return respond(content, isHtmx, `${slug} — Chats`);
}

function serveCharacterChat(slug: string, _chatId: string, isHtmx = false): Response | null {
  const viewPath = join(VIEWS_DIR, "chat.html");
  if (!existsSync(viewPath)) return null;

  const content = readFileSync(viewPath, "utf8");
  return respond(content, isHtmx, `${slug} — Chat`);
}

function serveWorldsList(isHtmx = false): Response | null {
  return serveView("worlds", isHtmx);
}

function serveWorldDetail(worldId: string, isHtmx = false): Response | null {
  const viewPath = join(VIEWS_DIR, "world-detail.html");
  if (!existsSync(viewPath)) return null;

  let content = readFileSync(viewPath, "utf8");
  content = content.replace("{{worldId}}", () => worldId);
  return respond(content, isHtmx, "World — Details");
}

function serveWorldEdit(worldId: string, isHtmx = false): Response | null {
  const viewPath = join(VIEWS_DIR, "world-edit.html");
  if (!existsSync(viewPath)) return null;

  let content = readFileSync(viewPath, "utf8");
  content = content.replace("{{worldId}}", () => worldId);
  return respond(content, isHtmx, "Edit World");
}

function serveCharacterEdit(characterId: string, isHtmx = false): Response | null {
  const viewPath = join(VIEWS_DIR, "character-edit.html");
  if (!existsSync(viewPath)) return null;

  let content = readFileSync(viewPath, "utf8");
  content = content.replace("{{characterId}}", () => characterId);
  return respond(content, isHtmx, "Edit Character");
}

const dispatch: RouteDispatch = ({ request }) => Promise.resolve(dispatchView(request));

function dispatchView(request: Request): Response | null {
  const isHtmx = request.headers.get("HX-Request") === "true";
  const url = new URL(request.url);
  const { pathname } = url;

  // ── Landing page ────────────────────────────────────────────
  if (pathname === "/") {
    const chatResult = serveView("chat", isHtmx);
    if (chatResult) return chatResult;

    const publicIndex = join(PUBLIC_DIR, "index.html");
    if (existsSync(publicIndex)) {
      return new Response(readFileSync(publicIndex), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Loop Lore");
  }

  // ── Character routes ───────────────────────────────────────
  const characterChatListMatch = /^\/character\/([\w-]+)$/.exec(pathname);
  if (characterChatListMatch) {
    const result = serveCharacterChatList(characterChatListMatch[1], isHtmx);
    if (result) return result;
  }

  const characterEditMatch = /^\/character\/([\w-]+)\/edit$/.exec(pathname);
  if (characterEditMatch) {
    const result = serveCharacterEdit(characterEditMatch[1], isHtmx);
    if (result) return result;
  }

  const characterChatMatch = /^\/character\/([\w-]+)\/([\w-]+)$/.exec(pathname);
  if (characterChatMatch) {
    const [, slug, chatId] = characterChatMatch;
    const result = serveCharacterChat(slug, chatId, isHtmx);
    if (result) return result;
  }

  const charactersEditMatch = /^\/characters\/([\w-]+)\/edit$/.exec(pathname);
  if (charactersEditMatch) {
    const result = serveCharacterEdit(charactersEditMatch[1], isHtmx);
    if (result) return result;
  }

  // ── World routes ───────────────────────────────────────────
  if (pathname === "/worlds") {
    const result = serveWorldsList(isHtmx);
    if (result) return result;
  }

  const worldDetailMatch = /^\/worlds\/([\w-]+)$/.exec(pathname);
  if (worldDetailMatch) {
    const result = serveWorldDetail(worldDetailMatch[1], isHtmx);
    if (result) return result;
  }

  const worldEditMatch = /^\/worlds\/([\w-]+)\/edit$/.exec(pathname);
  if (worldEditMatch) {
    const result = serveWorldEdit(worldEditMatch[1], isHtmx);
    if (result) return result;
  }

  // ── View templates ──────────────────────────────────────────
  const viewMatch = /^\/views\/([\w-]+)$/.exec(pathname);
  if (viewMatch) {
    const result = serveView(viewMatch[1], isHtmx);
    if (result) return result;
  }

  return null; // Not a view route
}

registerRoute(dispatch);
export { dispatch, serveView };
