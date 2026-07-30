/**
 * View Serving Routes
 *
 * Serve HTML templates as htmx-friendly pages:
 *   GET  /partials/:page/:section — HTML fragment from src/partials/
 *   GET  /dynamic/characters/grid — server-rendered character grid
 *   GET  /dynamic/gallery/grid    — server-rendered gallery grid
 *   GET  /dynamic/worlds/list     — server-rendered world list
 *   GET  /dynamic/gallery/search  — HTMX gallery search
 *   GET  /dynamic/characters/search — HTMX character search
 *   GET  /dynamic/worlds/search   — HTMX world search
 *   GET  /dynamic/worlds/:id/detail — world detail content
 *   GET  /dynamic/characters/:id/edit-form — character edit form
 *   GET  /dynamic/characters/:id/chat-list — character chat list
 *   GET  /character/:slug         — chat list for character
 *   GET  /character/:slug/edit    — character edit page
 *   GET  /character/:slug/:chatId — specific chat
 *   GET  /characters/:id/edit     — character edit (by id)
 *   GET  /worlds                  — world list
 *   GET  /worlds/:id              — world detail
 *   GET  /worlds/:id/edit         — world edit
 *   GET  /views/:name             — view template from src/views/
 *
 * When `HX-Request` header is present, returns content fragment only (no layout).
 * When absent (direct navigation), wraps with full layout.
 *
 * Elysia plugin — uses closure injection for database access.
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { existsSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import { ActorType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { adminViewGuard, } from "../middleware/admin-gate";
import { getNonce, } from "../middleware/csp-nonce";
import { isFrontendTelemetryEnabled, } from "../telemetry/service";

const VIEWS_DIR = join(import.meta.dir, "..", "views",);
const PARTIALS_DIR = join(import.meta.dir, "..", "partials",);
const COMPONENTS_DIR = join(import.meta.dir, "..", "components",);
const ICONS_DIR = join(import.meta.dir, "..", "..", "dist", "public", "icons", "tabler",);

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
  "quests",
  "register",
  "chat-list",
],);

const ALLOWED_PARTIALS = new Set([
  "characters/create-modal",
  "characters/import-modal",
  "characters/detail-modal",
  "gallery/upload-modal",
  "gallery/preview-modal",
  "worlds/create-modal",
  "worlds/edit-modal",
  "modals/settings",
],);

const viewCache = new Map<string, string>();

function wrapWithLayout(
  content: string,
  title?: string,
  userId?: string | null,
  sessionId?: string | null,
  cspNonce?: string | null,
  t?: (key: string,) => string,
): string {
  const layoutPath = join(VIEWS_DIR, "layout.html",);
  if (!existsSync(layoutPath,)) { return content; }

  let layout = readFileSync(layoutPath, "utf8",);
  layout = layout.replace("{{{content}}}", () => content,);
  layout = layout.replace("{{telemetryEnabled}}", () => (isFrontendTelemetryEnabled() ? "true" : "false"),);
  layout = layout.replace("{{userId}}", () => JSON.stringify(userId ?? null,),);
  layout = layout.replace("{{sessionId}}", () => JSON.stringify(sessionId ?? null,),);
  layout = layout.replaceAll("{{cspNonce}}", () => cspNonce ?? "",);
  if (title) { layout = layout.replace(/<title>.*?<\/title>/, () => `<title>${title} — Loop Lore</title>`,); }
  // i18n: replace {{{t("key")}}} with translated string
  layout = applyI18n(layout, t,);
  return layout;
}

function resolveIncludes(content: string, chain = new Set<string>(),): string {
  return content.replaceAll(/\{\{>\s*([\w./-]+)\s*\}\}/g, (_match, includePath: string,) => {
    const resolved = join(COMPONENTS_DIR, includePath,);
    if (chain.has(resolved,)) {
      throw new Error(`Circular include detected: ${includePath} (resolved to ${resolved})`,);
    }
    if (!existsSync(resolved,)) {
      throw new Error(`Include not found: ${includePath} (resolved to ${resolved})`,);
    }
    const included = readFileSync(resolved, "utf8",);
    chain.add(resolved,);
    return resolveIncludes(included, chain,);
  },);
}

/**
 * Replace `{{icon:name}}` directives with inline SVG content from
 * `dist/public/icons/tabler/{name}.svg`. The dist SVGs are copied from
 * node_modules by `src/build/copy-icons.ts` during the frontend build.
 *
 * Falls back to a comment placeholder if the icon file is missing so
 * the page still renders (visible indicator for debugging).
 */
function resolveIcons(content: string,): string {
  return content.replaceAll(/\{\{icon:([\w-]+)\}\}/g, (_match, name: string,) => {
    const iconPath = join(ICONS_DIR, `${name}.svg`,);
    if (!existsSync(iconPath,)) {
      return `<!-- icon not found: ${name} -->`;
    }
    return readFileSync(iconPath, "utf8",);
  },);
}

function loadView(viewName: string,): string {
  const cached = viewCache.get(viewName,);
  if (cached !== undefined) { return cached; }

  const viewPath = join(VIEWS_DIR, `${viewName}.html`,);
  if (!existsSync(viewPath,)) { return ""; }
  const content = readFileSync(viewPath, "utf8",);
  const resolved = resolveIcons(resolveIncludes(content,),);
  viewCache.set(viewName, resolved,);
  return resolved;
}

function applyI18n(content: string, t?: (key: string,) => string,): string {
  if (!t) { return content; }
  return content.replaceAll(/\{\{\{t\("([^"]+)"\)\}\}\}/g, (_match, key,) => t(key,),);
}

function respond(
  content: string,
  isHtmx: boolean,
  title?: string,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response {
  const nonce = request ? getNonce(request,) : null;
  const body = isHtmx ? applyI18n(content, t,) : wrapWithLayout(content, title, userId, sessionId, nonce, t,);
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", },
  },);
}

function notFoundView(
  message: string,
  isHtmx: boolean,
  title = "Not found",
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response {
  const translatedTitle = t ? t("errors.notFound",) : title;
  const content = `<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">${escapeHtml(message,)}</div>
    </div>`;
  return respond(content, isHtmx, translatedTitle, userId, sessionId, request, t,);
}

function htmlResponse(body: string,): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", },
  },);
}

function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

function serveView(
  viewName: string,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response | null {
  viewName = viewName === "assets" ? "gallery" : viewName;
  if (!ALLOWED_VIEWS.has(viewName,)) { return null; }

  const content = loadView(viewName,);
  if (!content) { return null; }

  const title = viewName === "index" ? undefined : viewName.charAt(0,).toUpperCase() + viewName.slice(1,);
  return respond(content, isHtmx, title, userId, sessionId, request, t,);
}

function serveCharacterChatList(
  slug: string,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response | null {
  let content = loadView("character-chat-list",);
  if (!content) { return null; }

  content = content.replace("{{characterSlug}}", () => slug,);
  return respond(content, isHtmx, `${slug} — Chats`, userId, sessionId, request, t,);
}

function serveCharacterChat(
  slug: string,
  _chatId: string,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response | null {
  const content = loadView("chat",);
  if (!content) { return null; }

  return respond(content, isHtmx, `${slug} — Chat`, userId, sessionId, request, t,);
}

function serveWorldsList(
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response | null {
  return serveView("worlds", isHtmx, userId, sessionId, request, t,);
}

async function serveWorldDetail(
  worldId: string,
  database: Kysely<DB>,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Promise<Response | null> {
  const world = await database.selectFrom("worlds",).select("id",).where("id", "=", worldId,).executeTakeFirst();
  if (!world) { return notFoundView("World not found", isHtmx, "World not found", userId, sessionId, request,); }

  let content = loadView("world-detail",);
  if (!content) { return null; }

  content = content.replace("{{worldId}}", () => worldId,);
  return respond(content, isHtmx, "World — Details", userId, sessionId, request, t,);
}

async function serveWorldEdit(
  worldId: string,
  database: Kysely<DB>,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Promise<Response | null> {
  const world = await database.selectFrom("worlds",).select("id",).where("id", "=", worldId,).executeTakeFirst();
  if (!world) { return notFoundView("World not found", isHtmx, "World not found", userId, sessionId, request,); }

  let content = loadView("world-edit",);
  if (!content) { return null; }

  content = content.replace("{{worldId}}", () => worldId,);
  return respond(content, isHtmx, "Edit World", userId, sessionId, request, t,);
}

async function serveCharacterEdit(
  characterId: string,
  database: Kysely<DB>,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Promise<Response | null> {
  const actor = await database
    .selectFrom("actors",)
    .select("id",)
    .where("id", "=", characterId,)
    .executeTakeFirst();
  if (!actor) {
    return notFoundView(
      "Character not found",
      isHtmx,
      "Character not found",
      userId,
      sessionId,
      request,
    );
  }

  let content = loadView("character-edit",);
  if (!content) { return null; }

  content = content.replace("{{characterId}}", () => characterId,);
  return respond(content, isHtmx, "Edit Character", userId, sessionId, request, t,);
}

// ── Static partials (read from file) ─────────────────────────

function serveStaticPartial(name: string, searchParams?: URLSearchParams,): string | null {
  if (!ALLOWED_PARTIALS.has(name,)) { return null; }

  const partialPath = join(PARTIALS_DIR, `${name}.html`,);
  if (existsSync(partialPath,)) {
    let content = readFileSync(partialPath, "utf8",);
    if (searchParams?.has("worldId",)) {
      content = content.replace("{{worldId}}", () => searchParams.get("worldId",)!,);
    }
    return content;
  }

  // Fallback to components dir
  const componentPath = join(COMPONENTS_DIR, `${name}.html`,);
  if (existsSync(componentPath,)) {
    return readFileSync(componentPath, "utf8",);
  }

  return null;
}

// ── Dynamic partials (server-rendered) ───────────────────────

function formatSize(bytes: number,): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1_048_576) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  return `${(bytes / 1_048_576).toFixed(1,)} MB`;
}

async function serveCharactersGrid(database: Kysely<DB>,): Promise<Response> {
  const actors = await database
    .selectFrom("actors",)
    .selectAll()
    .where("actor_type", "!=", ActorType.User,)
    .orderBy("display_name", "asc",)
    .limit(200,)
    .execute();

  if (actors.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)" data-testid="characters-empty">
      <div class="icon">👤</div>
      <div class="title">No characters found</div>
      <div class="description">Create your first character to start roleplaying.</div>
    </div>`,);
  }

  const cards = actors
    .map((c,) => {
      const avatar = c.avatar_asset_id
        ? `<img src="/api/assets/${c.avatar_asset_id}/thumb" alt="Avatar" />`
        : "<span>👤</span>";
      const name = escapeHtml(c.display_name,);
      const desc = escapeHtml(c.description || "",);
      return `<div class="character-card" onclick="selectCharacterCard('${c.id}')" data-testid="character-card-${c.id}">
      <div class="card-img">${avatar}</div>
      <div class="card-body">
        <div class="name">${name}</div>
        <div class="description">${desc}</div>
      </div>
    </div>`;
    },)
    .join("",);

  return htmlResponse(cards,);
}

async function serveWorldsListDb(database: Kysely<DB>,): Promise<Response> {
  const worlds = await database.selectFrom("worlds",).selectAll().orderBy("name", "asc",).limit(100,).execute();

  if (worlds.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">🌍</div>
      <div class="title">No worlds found</div>
      <div class="description">Create your first world.</div>
    </div>`,);
  }

  const items = worlds
    .map((w,) => {
      const name = escapeHtml(w.name,);
      const desc = escapeHtml(w.description || "",);
      return `<div class="world-card" onclick="location.assign('/worlds/${w.id}')" data-testid="world-card-${w.id}">
      <div class="world-header"><h3 class="world-name">${name}</h3><span class="world-id">ID: ${w.id}</span></div>
      <div class="world-description">${desc}</div>
      <div class="world-meta"><span class="tag">0 chats</span></div>
    </div>`;
    },)
    .join("",);

  return htmlResponse(items,);
}

async function serveWorldDetailContent(worldId: string, database: Kysely<DB>,): Promise<Response> {
  const world = await database.selectFrom("worlds",).selectAll().where("id", "=", worldId,).executeTakeFirst();

  if (!world) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">World not found</div>
    </div>`,);
  }

  const name = escapeHtml(world.name,);
  const desc = escapeHtml(world.description || "",);
  const lore = escapeHtml(world.lore || "",);

  const locations = await database
    .selectFrom("locations",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .orderBy("name", "asc",)
    .execute();

  const locationsJson = JSON.stringify(
    locations.map((l,) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      world_id: l.world_id,
    })),
  );

  return htmlResponse(
    `<div style="max-width:800px;margin:0 auto" x-data="worldDetail({ worldId: '${worldId}', locations: ${locationsJson} })">
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <h2>${name}</h2>
        <p class="description">${desc}</p>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <label class="form-label">Lore</label>
        <div class="lore-content">${lore}</div>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3)">
          <label class="form-label" style="margin: 0" x-text="'Locations (' + locationCount + ')'"></label>
          <div style="display: flex; gap: var(--space-2)">
            <button class="btn btn-secondary btn-xs" @click="showCreateLocation = !showCreateLocation" x-text="showCreateLocation ? 'Cancel' : '+ Add'"></button>
            <button class="btn btn-secondary btn-xs" @click="initializeStates()">Init States</button>
          </div>
        </div>
        <div x-show="showCreateLocation" style="margin-bottom: var(--space-3); padding: var(--space-3); background: var(--bg-secondary, #f8f9fa); border-radius: 4px; border: 1px solid var(--border-default, #e9ecef)">
          <div style="display: grid; gap: var(--space-2)">
            <input class="form-input" style="font-size: 13px" x-model="newLocationName" placeholder="Location name" />
            <input class="form-input" style="font-size: 13px" x-model="newLocationDesc" placeholder="Description (optional)" />
            <button class="btn btn-primary btn-xs" @click="createLocation()" style="justify-self: flex-start">Create</button>
          </div>
        </div>
        <div x-show="locations.length === 0" class="empty-state" style="padding: var(--space-4); font-size: 13px">No locations defined</div>
        <template x-if="locations.length > 0">
          <div style="display: grid; gap: var(--space-2)">
            <template x-for="loc in locations" :key="loc.id">
              <div style="padding: var(--space-3); background: var(--bg-secondary, #f8f9fa); border-radius: 4px; border: 1px solid var(--border-default, #e9ecef); cursor: pointer" @click="expandLoc(loc.id)">
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <div>
                    <strong style="font-size: 13px" x-text="loc.name"></strong>
                    <span x-show="loc.description && expandedLoc !== loc.id" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px; display: block" x-text="loc.description"></span>
                  </div>
                  <div style="display: flex; gap: 4px" @click.stop>
                    <button class="btn btn-danger btn-xs" @click="deleteLocation(loc.id)">Delete</button>
                  </div>
                </div>
                <div x-show="expandedLoc === loc.id" @click.stop style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-default, #e9ecef)">
                  <div style="display: grid; gap: var(--space-2)">
                    <input class="form-input" style="font-size: 13px" x-model="editLocName" />
                    <textarea class="form-input form-textarea" rows="2" style="font-size: 13px" x-model="editLocDesc" placeholder="Description"></textarea>
                    <button class="btn btn-primary btn-xs" @click="saveLocation(loc.id)" style="justify-self: flex-start">Save</button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>
      <div style="display: flex; gap: var(--space-3); margin-top: var(--space-4)">
        <a href="/quests?worldId=${worldId}" class="btn btn-primary btn-sm" style="text-decoration: none; display: inline-flex; align-items: center">
          View Quests
        </a>
      </div>
    </div>`,
  );
}

async function serveCharacterEditForm(characterId: string, database: Kysely<DB>,): Promise<Response> {
  const actor = await database
    .selectFrom("actors",)
    .selectAll()
    .where("id", "=", characterId,)
    .executeTakeFirst();

  if (!actor) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">Character not found</div>
    </div>`,);
  }

  const name = escapeHtml(actor.display_name || "",);
  const desc = escapeHtml(actor.description || "",);
  const systemPrompt = escapeHtml(actor.system_prompt || "",);
  const personality = escapeHtml(actor.personality || "",);
  const welcome = escapeHtml(actor.welcome_message || "",);
  const scenario = escapeHtml(actor.scenario || "",);
  const mesExample = escapeHtml(actor.mes_example || "",);
  const postHistory = escapeHtml(actor.post_history_instructions || "",);
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
    </div>`,);
}

async function serveCharacterChatListDb(slug: string, database: Kysely<DB>,): Promise<Response> {
  const chats = await database
    .selectFrom("chats",)
    .selectAll()
    .where("name", "like", `%${slug}%`,)
    .orderBy("updated_at", "desc",)
    .limit(50,)
    .execute();

  if (chats.length === 0) {
    return htmlResponse(
      `<div class="empty-state" style="padding:var(--space-12)"><div class="icon">💬</div><div class="title">No chats yet</div></div>`,
    );
  }

  const items = chats
    .map((c,) => {
      const name = escapeHtml(c.name,);
      return `<div class="chat-item" onclick="location.assign('/views/chat?chatid=${c.id}')" data-testid="chat-item-${c.id}">
      <div class="chat-info"><h4 class="chat-name">${name}</h4><p class="chat-preview">No messages yet</p></div>
      <span class="chat-time">${c.updated_at ? new Date(c.updated_at,).toLocaleDateString() : ""}</span>
    </div>`;
    },)
    .join("",);

  return htmlResponse(items,);
}

async function serveGalleryGrid(database: Kysely<DB>,): Promise<Response> {
  const assets = await database
    .selectFrom("assets",)
    .selectAll()
    .orderBy("filename", "asc",)
    .limit(200,)
    .execute();

  if (assets.length === 0) {
    return htmlResponse(`<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div>
      <div class="title">No assets found</div>
      <div class="description">Upload images, audio, or video to get started.</div>
    </div>`,);
  }

  function thumbForAsset(a: (typeof assets)[number],): string {
    switch (a.asset_type) {
      case "image": {
        return `<img src="/api/assets/${a.id}/thumb" alt="${escapeHtml(a.filename,)}" loading="lazy" />`;
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
    .map((a,) => {
      const filename = escapeHtml(a.filename,);
      const size = formatSize(a.size_bytes,);
      return `<div class="asset-card" onclick="openAssetPreview('${a.id}')" data-testid="asset-card-${a.id}">
      <div class="thumb">${thumbForAsset(a,)}</div>
      <div class="details">
        <span class="name">${filename}</span>
        <span class="type">${size}</span>
      </div>
    </div>`;
    },)
    .join("",);

  return htmlResponse(cards,);
}

// ── Dynamic search endpoints (HTMX active search) ───────────

async function serveGallerySearch(database: Kysely<DB>, params: URLSearchParams,): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const type = params.get("type",) ?? "all";
  const sort = params.get("sort",) ?? "name";

  let qb = database.selectFrom("assets",).selectAll();

  if (query) {
    qb = qb.where("filename", "like", `%${query}%`,);
  }
  if (type !== "all") {
    qb = qb.where("asset_type", "=", type as any,);
  }

  if (sort === "newest") { qb = qb.orderBy("created_at", "desc",); }
  else if (sort === "oldest") { qb = qb.orderBy("created_at", "asc",); }
  else { qb = qb.orderBy("filename", "asc",); }

  const assets = await qb.limit(200,).execute();

  if (assets.length === 0) {
    return htmlResponse(`<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div>
      <div class="title">No assets match your search</div>
      <div class="description">Try different search terms.</div>
    </div>`,);
  }

  function thumbForAsset(a: (typeof assets)[number],): string {
    switch (a.asset_type) {
      case "image": {
        return `<img src="/api/assets/${a.id}/thumb" alt="${escapeHtml(a.filename,)}" loading="lazy" />`;
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
    .map((a,) => {
      const filename = escapeHtml(a.filename,);
      const size = formatSize(a.size_bytes,);
      return `<div class="asset-card" onclick="openAssetPreview('${a.id}')" data-testid="asset-card-${a.id}">
      <div class="thumb">${thumbForAsset(a,)}</div>
      <div class="details">
        <span class="name">${filename}</span>
        <span class="type">${size}</span>
      </div>
    </div>`;
    },)
    .join("",);

  return htmlResponse(cards,);
}

async function serveCharactersSearch(database: Kysely<DB>, params: URLSearchParams,): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const sort = params.get("sort",) ?? "name";

  let qb = database.selectFrom("actors",).selectAll().where("actor_type", "!=", ActorType.User,);

  if (query) {
    qb = qb.where("display_name", "like", `%${query}%`,);
  }

  if (sort === "newest") { qb = qb.orderBy("created_at", "desc",); }
  else if (sort === "oldest") { qb = qb.orderBy("created_at", "asc",); }
  else { qb = qb.orderBy("display_name", "asc",); }

  const actors = await qb.limit(200,).execute();

  if (actors.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)" data-testid="characters-empty">
      <div class="icon">👤</div>
      <div class="title">No characters match your search</div>
      <div class="description">Try different search terms.</div>
    </div>`,);
  }

  const cards = actors
    .map((c,) => {
      const avatar = c.avatar_asset_id
        ? `<img src="/api/assets/${c.avatar_asset_id}/thumb" alt="Avatar" />`
        : "<span>👤</span>";
      const name = escapeHtml(c.display_name,);
      const desc = escapeHtml(c.description || "",);
      return `<div class="character-card" onclick="selectCharacterCard('${c.id}')" data-testid="character-card-${c.id}">
      <div class="card-img">${avatar}</div>
      <div class="card-body">
        <div class="name">${name}</div>
        <div class="description">${desc}</div>
      </div>
    </div>`;
    },)
    .join("",);

  return htmlResponse(cards,);
}

async function serveWorldsSearch(database: Kysely<DB>, params: URLSearchParams,): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const sort = params.get("sort",) ?? "name";

  let qb = database.selectFrom("worlds",).selectAll();

  if (query) {
    qb = qb.where("name", "like", `%${query}%`,);
  }

  if (sort === "newest") { qb = qb.orderBy("created_at", "desc",); }
  else if (sort === "oldest") { qb = qb.orderBy("created_at", "asc",); }
  else { qb = qb.orderBy("name", "asc",); }

  const worlds = await qb.limit(100,).execute();

  if (worlds.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">🌍</div>
      <div class="title">No worlds match your search</div>
      <div class="description">Try different search terms.</div>
    </div>`,);
  }

  const items = worlds
    .map((w,) => {
      const name = escapeHtml(w.name,);
      const desc = escapeHtml(w.description || "",);
      return `<div class="world-card" onclick="location.assign('/worlds/${w.id}')" data-testid="world-card-${w.id}">
      <div class="world-header"><h3 class="world-name">${name}</h3><span class="world-id">ID: ${w.id}</span></div>
      <div class="world-description">${desc}</div>
      <div class="world-meta"><span class="tag">0 chats</span></div>
    </div>`;
    },)
    .join("",);

  return htmlResponse(items,);
}

// ── Elysia plugin ───────────────────────────────────────────

async function serveChatsListDb(database: Kysely<DB>, params: URLSearchParams,): Promise<Response> {
  const page = Math.max(1, parseInt(params.get("page",) ?? "1", 10,),);
  const rawPageSize = Math.max(1, parseInt(params.get("pageSize",) ?? "50", 10,),);
  const pageSize = Math.min(100, rawPageSize,);
  const offset = (page - 1) * pageSize;

  const [chats, countRow,] = await Promise.all([
    database
      .selectFrom("chats",)
      .leftJoin("worlds", "worlds.id", "chats.world_id",)
      .leftJoin("locations", "locations.id", "chats.current_location_id",)
      .select([
        "chats.id",
        "chats.name",
        "chats.type",
        "chats.purpose",
        "chats.is_pinned",
        "chats.updated_at",
        "chats.created_at",
        "worlds.name as world_name",
        "locations.name as location_name",
      ],)
      .orderBy("chats.is_pinned", "desc",)
      .orderBy("chats.updated_at", "desc",)
      .limit(pageSize,)
      .offset(offset,)
      .execute(),
    database.selectFrom("chats",)
      .select((eb: any,) => eb.fn.countAll().as("total",))
      .executeTakeFirst(),
  ],);

  if (chats.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">💬</div>
      <div class="title">No chats yet</div>
      <div class="description">Create your first chat to get started.</div>
    </div>`,);
  }

  const enriched = await enrichChats(database, chats,);
  const total = Number((countRow as any)?.total ?? 0,);
  const hasMore = offset + pageSize < total;
  const items = renderChatListItems(enriched,);
  const loadMore = hasMore
    ? `<div style="padding:var(--space-4);text-align:center">
        <button class="btn btn-secondary" hx-get="/dynamic/chats/list?page=${page + 1}&pageSize=${pageSize}"
          hx-target="#chat-list-grid" hx-swap="beforeend"
          hx-trigger="click" style="width:100%">Load more (${total - offset - pageSize} remaining)</button>
      </div>`
    : "";
  return htmlResponse(`<div data-page="${page}">${items}</div>${loadMore}`,);
}

async function serveChatsSearch(database: Kysely<DB>, params: URLSearchParams,): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const worldId = params.get("world",)?.trim() ?? "";
  const chatType = params.get("type",)?.trim() ?? "";
  const sort = params.get("sort",) ?? "recent";
  const page = Math.max(1, parseInt(params.get("page",) ?? "1", 10,),);
  const rawPageSize = Math.max(1, parseInt(params.get("pageSize",) ?? "50", 10,),);
  const pageSize = Math.min(100, rawPageSize,);
  const offset = (page - 1) * pageSize;

  let qb = database
    .selectFrom("chats",)
    .leftJoin("worlds", "worlds.id", "chats.world_id",)
    .leftJoin("locations", "locations.id", "chats.current_location_id",)
    .select([
      "chats.id",
      "chats.name",
      "chats.type",
      "chats.purpose",
      "chats.is_pinned",
      "chats.updated_at",
      "chats.created_at",
      "worlds.name as world_name",
      "locations.name as location_name",
    ],);

  if (query) {
    qb = qb.where("chats.name", "like", `%${query}%`,);
  }
  if (worldId) {
    qb = qb.where("chats.world_id", "=", worldId,);
  }
  if (chatType) {
    qb = qb.where("chats.type", "=", chatType as any,);
  }

  if (sort === "name") { qb = qb.orderBy("chats.name", "asc",); }
  else if (sort === "oldest") { qb = qb.orderBy("chats.created_at", "asc",); }
  else { qb = qb.orderBy("chats.is_pinned", "desc",).orderBy("chats.updated_at", "desc",); }

  const [chats, countRow,] = await Promise.all([
    qb.limit(pageSize,).offset(offset,).execute(),
    qb.clearOrderBy().select((eb: any,) => eb.fn.countAll().as("total" as any,)).executeTakeFirst(),
  ],);

  if (chats.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">🔍</div>
      <div class="title">No chats match your search</div>
      <div class="description">Try different search terms or filters.</div>
    </div>`,);
  }

  const enriched = await enrichChats(database, chats,);
  const total = Number((countRow as any)?.total ?? 0,);
  const hasMore = offset + pageSize < total;
  const items = renderChatListItems(enriched,);
  const loadMore = hasMore
    ? `<div style="padding:var(--space-4);text-align:center">
        <button class="btn btn-secondary" hx-get="/dynamic/chats/search?q=${
      encodeURIComponent(query,)
    }&world=${worldId}&type=${chatType}&sort=${sort}&page=${page + 1}&pageSize=${pageSize}"
          hx-target="#chat-list-grid" hx-swap="beforeend"
          hx-trigger="click" style="width:100%">Load more (${total - offset - pageSize} remaining)</button>
      </div>`
    : "";
  return htmlResponse(`<div data-page="${page}">${items}</div>${loadMore}`,);
}

async function enrichChats(
  database: Kysely<DB>,
  chats: {
    id: string;
    name: string;
    type: string;
    purpose: string | null;
    is_pinned: string;
    updated_at: string;
    created_at: string;
    world_name: string | null;
    location_name: string | null;
  }[],
): Promise<
  {
    id: string;
    name: string;
    type: string;
    purpose: string | null;
    is_pinned: string;
    updated_at: string;
    created_at: string;
    world_name: string | null;
    location_name: string | null;
    participant_count: number;
    last_message: string | null;
  }[]
> {
  const chatIds = chats.map((c,) => c.id);
  const [counts, lastMsgs,] = await Promise.all([
    database.selectFrom("chat_participants",)
      .select(["chat_id", (eb: any,) => eb.fn.count("actor_id",).as("cnt",),],)
      .where("chat_id", "in", chatIds,)
      .groupBy("chat_id",)
      .execute(),
    database.selectFrom("messages",)
      .select(["chat_id", "content",],)
      .where("chat_id", "in", chatIds,)
      .where("status", "!=", "deleted" as any,)
      .orderBy("id", "desc",)
      .limit(chatIds.length * 2,)
      .execute(),
  ],);
  const countMap = new Map<string, number>(counts.map((r,) => [r.chat_id, Number(r.cnt,),]),);
  const msgMap = new Map<string, string>();
  for (const m of lastMsgs) {
    if (!msgMap.has(m.chat_id,)) { msgMap.set(m.chat_id, m.content,); }
  }
  return chats.map((c,) => ({
    ...c,
    participant_count: countMap.get(c.id,) ?? 0,
    last_message: msgMap.get(c.id,) ?? null,
  }));
}

function renderChatListItems(rows: {
  id: string;
  name: string;
  type: string;
  purpose: string | null;
  is_pinned: string;
  updated_at: string;
  created_at: string;
  world_name: string | null;
  location_name: string | null;
  participant_count: number;
  last_message: string | null;
}[],): string {
  const now = Date.now();
  return rows
    .map((r,) => {
      const name = escapeHtml(r.name,);
      const typeLabel = r.type === "group" ? "👥" : "💬";
      const pinned = r.is_pinned === "pinned" ? " ★" : "";
      const worldTag = r.world_name
        ? `<span class="tag" style="background:var(--bg-tertiary);padding:1px 6px;border-radius:var(--radius-sm);font-size:11px">🌍 ${
          escapeHtml(r.world_name,)
        }</span>`
        : "";
      const locationTag = r.location_name
        ? `<span class="tag" style="background:var(--bg-tertiary);padding:1px 6px;border-radius:var(--radius-sm);font-size:11px">📍 ${
          escapeHtml(r.location_name,)
        }</span>`
        : "";
      const ts = new Date(r.updated_at,).getTime();
      const age = now - ts;
      let ageStr: string;
      if (age < 60_000) { ageStr = "just now"; }
      else if (age < 3_600_000) { ageStr = `${Math.floor(age / 60_000,)}m ago`; }
      else if (age < 86_400_000) { ageStr = `${Math.floor(age / 3_600_000,)}h ago`; }
      else { ageStr = `${Math.floor(age / 86_400_000,)}d ago`; }

      const preview = r.last_message
        ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:500px">${
          escapeHtml(r.last_message.slice(0, 80,),)
        }${r.last_message.length > 80 ? "…" : ""}</div>`
        : "";

      return `<div class="chat-list-card" onclick="location.assign('/views/chat?chatid=${encodeURIComponent(r.id,)}')"
        style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);border:1px solid var(--border-default);border-radius:var(--radius-md);cursor:pointer;background:var(--bg-primary);transition:background 0.15s"
        onmouseenter="this.style.background='var(--bg-tertiary)'" onmouseleave="this.style.background='var(--bg-primary)'"
        data-testid="chat-card-${r.id}">
        <span style="font-size:18px;flex-shrink:0">${typeLabel}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:14px;display:flex;align-items:center;gap:var(--space-1)">
            ${name}${pinned ? `<span style="color:var(--accent-yellow)">${pinned}</span>` : ""}
          </div>
          <div style="display:flex;gap:var(--space-2);margin-top:2px;flex-wrap:wrap;align-items:center">
            ${worldTag}${locationTag}
            ${
        r.participant_count > 0
          ? `<span style="font-size:11px;color:var(--text-secondary)">👥 ${r.participant_count}</span>`
          : ""
      }
          </div>
          ${preview}
        </div>
        <span style="font-size:11px;color:var(--text-secondary);flex-shrink:0;white-space:nowrap">${ageStr}</span>
      </div>`;
    },)
    .join("\n",);
}

export function viewRoutes({ database, }: { database: Kysely<DB> },) {
  return (
    new Elysia({ name: "views", },)
      // ── Static partials (lazy-loaded modals, skeletons) ──────
      .get("/partials/:page/:section", (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        const name = `${ctx.params.page}/${ctx.params.section}`;
        const url = new URL(ctx.request.url,);
        const content = serveStaticPartial(name, url.searchParams,);
        if (!content) { return new Response("Not found", { status: 404, },); }
        return htmlResponse(content,);
      },)
      // ── Dynamic partials (server-rendered data) ─────────────
      .get("/dynamic/characters/grid", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        return await serveCharactersGrid(database,);
      },)
      .get("/dynamic/gallery/grid", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        return await serveGalleryGrid(database,);
      },)
      .get("/dynamic/worlds/list", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        return await serveWorldsListDb(database,);
      },)
      // HTMX search endpoints
      .get("/dynamic/gallery/search", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        const url = new URL(ctx.request.url,);
        return await serveGallerySearch(database, url.searchParams,);
      },)
      .get("/dynamic/characters/search", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        const url = new URL(ctx.request.url,);
        return await serveCharactersSearch(database, url.searchParams,);
      },)
      .get("/dynamic/worlds/search", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        const url = new URL(ctx.request.url,);
        return await serveWorldsSearch(database, url.searchParams,);
      },)
      .get("/dynamic/chats/list", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        const url = new URL(ctx.request.url,);
        return await serveChatsListDb(database, url.searchParams,);
      },)
      .get("/dynamic/chats/search", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        const url = new URL(ctx.request.url,);
        return await serveChatsSearch(database, url.searchParams,);
      },)
      .get("/dynamic/worlds/:id/detail", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        return await serveWorldDetailContent(ctx.params.id, database,);
      },)
      .get("/dynamic/characters/:id/edit-form", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        return await serveCharacterEditForm(ctx.params.id, database,);
      },)
      .get("/dynamic/characters/:id/chat-list", async (ctx,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        if (!isHtmx) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        return await serveCharacterChatListDb(ctx.params.id, database,);
      },)
      // ── Character routes ───────────────────────────────────────
      .get("/character/:slug", (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const result = serveCharacterChatList(ctx.params.slug, isHtmx, ctx.userId, ctx.sessionId, ctx.request,);
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      },)
      .get("/character/:slug/edit", async (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const result = await serveCharacterEdit(
          ctx.params.slug,
          database,
          isHtmx,
          ctx.userId,
          ctx.sessionId,
          ctx.request,
          ctx.t,
        );
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      },)
      .get("/character/:slug/:chatId", (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const result = serveCharacterChat(
          ctx.params.slug,
          ctx.params.chatId,
          isHtmx,
          ctx.userId,
          ctx.sessionId,
          ctx.request,
        );
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      },)
      .get("/characters/:id/edit", async (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const result = await serveCharacterEdit(
          ctx.params.id,
          database,
          isHtmx,
          ctx.userId,
          ctx.sessionId,
          ctx.request,
        );
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      },)
      // ── World routes ───────────────────────────────────────────
      .get("/worlds", (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const result = serveWorldsList(isHtmx, ctx.userId, ctx.sessionId, ctx.request, ctx.t,);
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      },)
      .get("/worlds/:id", async (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const result = await serveWorldDetail(
          ctx.params.id,
          database,
          isHtmx,
          ctx.userId,
          ctx.sessionId,
          ctx.request,
          ctx.t,
        );
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      },)
      .get("/worlds/:id/edit", async (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const result = await serveWorldEdit(
          ctx.params.id,
          database,
          isHtmx,
          ctx.userId,
          ctx.sessionId,
          ctx.request,
          ctx.t,
        );
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      },)
      // ── Admin view (guarded — must precede /views/:name) ─────────
      .guard({ beforeHandle: adminViewGuard, }, (app,) =>
        app.get("/views/admin", (ctx: any,) => {
          const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
          const result = serveView("admin", isHtmx, ctx.userId, ctx.sessionId, ctx.request, ctx.t,);
          if (result) { return result; }
          return new Response("Not found", { status: 404, },);
        },),)
      // ── View templates (non-admin) ──────────────────────────────
      .get("/views/:name", (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const name = ctx.params.name as string;

        // Redirect .html extensions to clean path; non-allowed views to /views/
        const cleanName = name.replace(/\.html?$/i, "",);
        const isHtmlExtension = /\.html?$/i.test(name,);
        if (isHtmlExtension) {
          if (ALLOWED_VIEWS.has(cleanName,)) {
            return new Response(null, { status: 302, headers: { Location: `/views/${cleanName}`, }, },);
          }
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }
        if (!ALLOWED_VIEWS.has(name,)) {
          return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
        }

        const result = serveView(name, isHtmx, ctx.userId, ctx.sessionId, ctx.request, ctx.t,);
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      },)
  );
}

export { serveView, };
