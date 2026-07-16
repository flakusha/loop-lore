/**
 * View Serving Routes
 *
 * Serve HTML templates as htmx-friendly pages:
 *   GET  /                     — landing page → dist/public/index.html via server.ts
 *   GET  /views/:name          — view template from src/views/
 *   GET  /partials/:page/:section — HTML fragment from src/partials/
 *   GET  /character/:slug      — chat list for character
 *   GET  /character/:slug/:chatId — specific chat
 *   GET  /worlds               — world list
 *   GET  /worlds/:id           — world detail
 *   GET  /worlds/:id/edit      — world edit
 *
 * When `HX-Request` header is present, returns content fragment only (no layout).
 * When absent (direct navigation), wraps with full layout.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RouteDispatch, RouteDispatchParams } from "./router";
import { registerRoute } from "./router";
import { ActorType } from "../db/enums";

const VIEWS_DIR = join(import.meta.dir, "..", "views");
const PARTIALS_DIR = join(import.meta.dir, "..", "partials");
const COMPONENTS_DIR = join(import.meta.dir, "..", "components");

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
  "personas",
  "admin",
]);

const ALLOWED_PARTIALS = new Set([
  "characters/create-modal",
  "characters/import-modal",
  "characters/detail-modal",
  "gallery/upload-modal",
  "gallery/preview-modal",
  "worlds/create-modal",
  "worlds/edit-modal",
]);

const viewCache = new Map<string, string>();

function wrapWithLayout(content: string, title?: string): string {
  const layoutPath = join(VIEWS_DIR, "layout.html");
  if (!existsSync(layoutPath)) return content;

  let layout = readFileSync(layoutPath, "utf8");
  layout = layout.replace("{{{content}}}", () => content);
  if (title) layout = layout.replace(/<title>.*?<\/title>/, () => `<title>${title} — Loop Lore</title>`);
  return layout;
}

function resolveIncludes(content: string, seen = new Set<string>()): string {
  return content.replaceAll(/\{\{>\s*([\w./-]+)\s*\}\}/g, (_match, includePath: string) => {
    const resolved = join(COMPONENTS_DIR, includePath);
    if (seen.has(resolved)) {
      throw new Error(`Circular include detected: ${includePath} (resolved to ${resolved})`);
    }
    if (!existsSync(resolved)) {
      throw new Error(`Include not found: ${includePath} (resolved to ${resolved})`);
    }
    const included = readFileSync(resolved, "utf8");
    seen.add(resolved);
    return resolveIncludes(included, seen);
  });
}

function loadView(viewName: string): string {
  const cached = viewCache.get(viewName);
  if (cached !== undefined) return cached;

  const viewPath = join(VIEWS_DIR, `${viewName}.html`);
  if (!existsSync(viewPath)) return "";
  const content = readFileSync(viewPath, "utf8");
  const resolved = resolveIncludes(content);
  viewCache.set(viewName, resolved);
  return resolved;
}

function respond(content: string, isHtmx: boolean, title?: string): Response {
  const body = isHtmx ? content : wrapWithLayout(content, title);
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function serveView(viewName: string, isHtmx = false): Response | null {
  viewName = viewName === "assets" ? "gallery" : viewName;
  if (!ALLOWED_VIEWS.has(viewName)) return null;

  const content = loadView(viewName);
  if (!content) return null;

  const title = viewName === "index" ? undefined : viewName.charAt(0).toUpperCase() + viewName.slice(1);
  return respond(content, isHtmx, title);
}

function serveCharacterChatList(slug: string, isHtmx = false): Response | null {
  let content = loadView("character-chat-list");
  if (!content) return null;

  content = content.replace("{{characterSlug}}", () => slug);
  return respond(content, isHtmx, `${slug} — Chats`);
}

function serveCharacterChat(slug: string, _chatId: string, isHtmx = false): Response | null {
  const content = loadView("chat");
  if (!content) return null;

  return respond(content, isHtmx, `${slug} — Chat`);
}

function serveWorldsList(isHtmx = false): Response | null {
  return serveView("worlds", isHtmx);
}

function serveWorldDetail(worldId: string, isHtmx = false): Response | null {
  let content = loadView("world-detail");
  if (!content) return null;

  content = content.replace("{{worldId}}", () => worldId);
  return respond(content, isHtmx, "World — Details");
}

function serveWorldEdit(worldId: string, isHtmx = false): Response | null {
  let content = loadView("world-edit");
  if (!content) return null;

  content = content.replace("{{worldId}}", () => worldId);
  return respond(content, isHtmx, "Edit World");
}

function serveCharacterEdit(characterId: string, isHtmx = false): Response | null {
  let content = loadView("character-edit");
  if (!content) return null;

  content = content.replace("{{characterId}}", () => characterId);
  return respond(content, isHtmx, "Edit Character");
}

// ── Static partials (read from file) ─────────────────────────

function serveStaticPartial(name: string, searchParams?: URLSearchParams): Response | null {
  if (!ALLOWED_PARTIALS.has(name)) return null;

  const partialPath = join(PARTIALS_DIR, `${name}.html`);
  if (!existsSync(partialPath)) return null;

  let content = readFileSync(partialPath, "utf8");
  // Replace {{worldId}} in edit-modal when worldId query param is present
  if (searchParams?.has("worldId")) {
    content = content.replace("{{worldId}}", () => searchParams.get("worldId")!);
  }
  return htmlResponse(content);
}

// ── Dynamic partials (server-rendered) ───────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

async function serveCharactersGrid(database: Kysely<DB>): Promise<Response> {
  const actors = await database
    .selectFrom("actors")
    .selectAll()
    .where("actor_type", "!=", ActorType.User)
    .orderBy("display_name", "asc")
    .limit(200)
    .execute();

  if (actors.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)" data-testid="characters-empty">
      <div class="icon">👤</div>
      <div class="title">No characters found</div>
      <div class="description">Create your first character to start roleplaying.</div>
    </div>`);
  }

  const cards = actors
    .map((c) => {
      const avatar = c.avatar_asset_id
        ? `<img src="/api/assets/${c.avatar_asset_id}/thumb" alt="Avatar" />`
        : "<span>👤</span>";
      const name = escapeHtml(c.display_name);
      const desc = escapeHtml(c.description || "No description");
      return `<div class="character-card" onclick="selectCharacterCard('${c.id}')" data-testid="character-card-${c.id}">
      <div class="card-img">${avatar}</div>
      <div class="card-body">
        <div class="name">${name}</div>
        <div class="description">${desc}</div>
      </div>
    </div>`;
    })
    .join("");

  return htmlResponse(cards);
}

async function serveWorldsListDb(database: Kysely<DB>): Promise<Response> {
  const worlds = await database.selectFrom("worlds").selectAll().orderBy("name", "asc").limit(100).execute();

  if (worlds.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">🌍</div>
      <div class="title">No worlds found</div>
      <div class="description">Create your first world.</div>
    </div>`);
  }

  const items = worlds
    .map((w) => {
      const name = escapeHtml(w.name);
      const desc = escapeHtml(w.description || "No description");
      return `<div class="world-card" onclick="location.assign('/worlds/${w.id}')" data-testid="world-card-${w.id}">
      <div class="world-header"><h3 class="world-name">${name}</h3><span class="world-id">ID: ${w.id}</span></div>
      <div class="world-description">${desc}</div>
      <div class="world-meta"><span class="tag">0 chats</span></div>
    </div>`;
    })
    .join("");

  return htmlResponse(items);
}

async function serveWorldDetailContent(worldId: string, database: Kysely<DB>): Promise<Response> {
  const world = await database.selectFrom("worlds").selectAll().where("id", "=", worldId).executeTakeFirst();

  if (!world) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">World not found</div>
    </div>`);
  }

  const name = escapeHtml(world.name);
  const desc = escapeHtml(world.description || "");
  const lore = escapeHtml(world.lore || "No lore provided.");

  return htmlResponse(`<div style="max-width:800px;margin:0 auto">
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <h2>${name}</h2>
        <p class="description">${desc}</p>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <label class="form-label">Lore</label>
        <div class="lore-content">${lore}</div>
      </div>
    </div>`);
}

async function serveCharacterEditForm(characterId: string, database: Kysely<DB>): Promise<Response> {
  const actor = await database
    .selectFrom("actors")
    .selectAll()
    .where("id", "=", characterId)
    .executeTakeFirst();

  if (!actor) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">Character not found</div>
    </div>`);
  }

  const name = escapeHtml(actor.display_name || "");
  const desc = escapeHtml(actor.description || "");
  const systemPrompt = escapeHtml(actor.system_prompt || "");
  const personality = escapeHtml(actor.personality || "");
  const welcome = escapeHtml(actor.welcome_message || "");
  const scenario = escapeHtml(actor.scenario || "");
  const mesExample = escapeHtml(actor.mes_example || "");
  const postHistory = escapeHtml(actor.post_history_instructions || "");
  const avatarHtml = actor.avatar_asset_id
    ? `<img src="/api/assets/${actor.avatar_asset_id}/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`
    : "<span>👤</span>";
  const avatarId = actor.avatar_asset_id || "";
  const avatarRemoveBtn = actor.avatar_asset_id
    ? '<button type="button" class="btn btn-danger" onclick="clearAvatar()">Remove</button>'
    : "";

  return htmlResponse(`<div style="max-width:720px;margin:0 auto;width:100%">
      <form id="char-edit-form" data-testid="character-edit-form">
        <div class="form-group" style="display:flex;align-items:flex-start;gap:var(--space-4)">
          <div style="width:80px;height:80px;border-radius:var(--radius-md);background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0;overflow:hidden;border:1px solid var(--border-default)">
            <div id="avatar-preview">${avatarHtml}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-2)">
            <label class="btn btn-secondary" style="cursor:pointer">
              <span id="upload-avatar-label">Upload Avatar</span>
              <input type="file" accept="image/*" style="display:none" id="avatar-input" onchange="uploadAvatar(this)" />
            </label>
            ${avatarRemoveBtn}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-name">Display Name</label>
          <input class="form-input" type="text" id="edit-name" value="${name}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-desc">Description</label>
          <textarea class="form-input form-textarea" id="edit-desc" rows="3">${desc}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-system">System Prompt</label>
          <textarea class="form-input form-textarea" id="edit-system" rows="6">${systemPrompt}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-personality">Personality</label>
          <textarea class="form-input form-textarea" id="edit-personality" rows="4">${personality}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-greeting">Welcome Message</label>
          <textarea class="form-input form-textarea" id="edit-greeting" rows="4">${welcome}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-scenario">Scenario</label>
          <textarea class="form-input form-textarea" id="edit-scenario" rows="3">${scenario}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-example">Example Messages</label>
          <textarea class="form-input form-textarea" id="edit-example" rows="5">${mesExample}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-post-history">Post-History Instructions</label>
          <textarea class="form-input form-textarea" id="edit-post-history" rows="4">${postHistory}</textarea>
        </div>
        <input type="hidden" id="char-avatar-id" value="${avatarId}" />
        <div style="display:flex;gap:var(--space-3);justify-content:flex-end;margin-top:var(--space-6)">
          <a href="/views/characters" class="btn btn-secondary" data-testid="cancel-edit-character">Cancel</a>
          <button type="button" class="btn btn-primary" onclick="saveCharacterEdit('${characterId}')" data-testid="save-character-btn">Save Character</button>
        </div>
      </form>
    </div>`);
}

async function serveCharacterChatListDb(slug: string, database: Kysely<DB>): Promise<Response> {
  const chats = await database
    .selectFrom("chats")
    .selectAll()
    .where("name", "like", `%${slug}%`)
    .orderBy("updated_at", "desc")
    .limit(50)
    .execute();

  if (chats.length === 0) {
    return htmlResponse(
      `<div class="empty-state" style="padding:var(--space-12)"><div class="icon">💬</div><div class="title">No chats yet</div></div>`,
    );
  }

  const items = chats
    .map((c) => {
      const name = escapeHtml(c.name);
      return `<div class="chat-item" onclick="location.assign('/views/chat?chatid=${c.id}')" data-testid="chat-item-${c.id}">
      <div class="chat-info"><h4 class="chat-name">${name}</h4><p class="chat-preview">No messages yet</p></div>
      <span class="chat-time">${c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ""}</span>
    </div>`;
    })
    .join("");

  return htmlResponse(items);
}

async function serveGalleryGrid(database: Kysely<DB>): Promise<Response> {
  const assets = await database
    .selectFrom("assets")
    .selectAll()
    .orderBy("filename", "asc")
    .limit(200)
    .execute();

  if (assets.length === 0) {
    return htmlResponse(`<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div>
      <div class="title">No assets found</div>
      <div class="description">Upload images, audio, or video to get started.</div>
    </div>`);
  }

  function thumbForAsset(a: (typeof assets)[number]): string {
    switch (a.asset_type) {
      case "image": {
        return `<img src="/api/assets/${a.id}/thumb" alt="${escapeHtml(a.filename)}" loading="lazy" />`;
      }
      case "audio": {
        return `<div class="file-icon">🎵</div>`;
      }
      case "video": {
        return `<div class="file-icon">🎬</div>`;
      }
      default: {
        return `<div class="file-icon">📄</div>`;
      }
    }
  }

  const cards = assets
    .map((a) => {
      const filename = escapeHtml(a.filename);
      const size = formatSize(a.size_bytes);
      return `<div class="asset-card" onclick="openAssetPreview('${a.id}')" data-testid="asset-card-${a.id}">
      <div class="thumb">${thumbForAsset(a)}</div>
      <div class="details">
        <span class="name">${filename}</span>
        <span class="type">${size}</span>
      </div>
    </div>`;
    })
    .join("");

  return htmlResponse(cards);
}

// ── Main dispatch ───────────────────────────────────────────

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  return await dispatchView(request, context, database);
};

async function dispatchView(
  request: Request,
  _context: RouteDispatchParams["context"] | null,
  database: Kysely<DB> | null,
): Promise<Response | null> {
  const isHtmx = request.headers.get("HX-Request") === "true";
  const url = new URL(request.url);
  const { pathname } = url;

  // ── Landing page ────────────────────────────────────────────
  // Let server.ts serve dist/public/index.html via respondWithFile for
  // ETag, Vary, and pre-built compressed variants (.gz/.br/.zst).
  if (pathname === "/") {
    return null;
  }

  // ── Static partials (lazy-loaded modals, skeletons) ──────
  const partialMatch = /^\/partials\/([\w/-]+)$/.exec(pathname);
  if (partialMatch) {
    const result = serveStaticPartial(partialMatch[1]!, url.searchParams);
    if (result) return result;
  }

  // ── Dynamic partials (server-rendered data) ─────────────
  if (database) {
    if (pathname === "/dynamic/characters/grid") {
      return await serveCharactersGrid(database);
    }
    if (pathname === "/dynamic/gallery/grid") {
      return await serveGalleryGrid(database);
    }
    if (pathname === "/dynamic/worlds/list") {
      return await serveWorldsListDb(database);
    }

    const worldDetailMatch = /^\/dynamic\/worlds\/([\w-]+)\/detail$/.exec(pathname);
    if (worldDetailMatch) {
      return await serveWorldDetailContent(worldDetailMatch[1]!, database);
    }

    const charEditMatch = /^\/dynamic\/characters\/([\w-]+)\/edit-form$/.exec(pathname);
    if (charEditMatch) {
      return await serveCharacterEditForm(charEditMatch[1]!, database);
    }

    const charChatListMatch = /^\/dynamic\/characters\/([\w-]+)\/chat-list$/.exec(pathname);
    if (charChatListMatch) {
      return await serveCharacterChatListDb(charChatListMatch[1]!, database);
    }
  }

  // ── Character routes ───────────────────────────────────────
  const characterChatListMatch = /^\/character\/([\w-]+)$/.exec(pathname);
  if (characterChatListMatch) {
    const result = serveCharacterChatList(characterChatListMatch[1]!, isHtmx);
    if (result) return result;
  }

  const characterEditMatch = /^\/character\/([\w-]+)\/edit$/.exec(pathname);
  if (characterEditMatch) {
    const result = serveCharacterEdit(characterEditMatch[1]!, isHtmx);
    if (result) return result;
  }

  const characterChatMatch = /^\/character\/([\w-]+)\/([\w-]+)$/.exec(pathname);
  if (characterChatMatch) {
    const [, slug, chatId] = characterChatMatch;
    const result = serveCharacterChat(slug!, chatId!, isHtmx);
    if (result) return result;
  }

  const charactersEditMatch = /^\/characters\/([\w-]+)\/edit$/.exec(pathname);
  if (charactersEditMatch) {
    const result = serveCharacterEdit(charactersEditMatch[1]!, isHtmx);
    if (result) return result;
  }

  // ── World routes ───────────────────────────────────────────
  if (pathname === "/worlds") {
    const result = serveWorldsList(isHtmx);
    if (result) return result;
  }

  const worldDetailMatch2 = /^\/worlds\/([\w-]+)$/.exec(pathname);
  if (worldDetailMatch2) {
    const result = serveWorldDetail(worldDetailMatch2[1]!, isHtmx);
    if (result) return result;
  }

  const worldEditMatch = /^\/worlds\/([\w-]+)\/edit$/.exec(pathname);
  if (worldEditMatch) {
    const result = serveWorldEdit(worldEditMatch[1]!, isHtmx);
    if (result) return result;
  }

  // ── View templates ──────────────────────────────────────────
  const viewMatch = /^\/views\/([\w-]+)$/.exec(pathname);
  if (viewMatch) {
    const result = serveView(viewMatch[1]!, isHtmx);
    if (result) return result;
  }

  return null;
}

registerRoute(dispatch);
export { dispatch, serveView };
