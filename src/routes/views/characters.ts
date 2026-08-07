import type { Kysely, } from "kysely";
import { ActorType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { escapeHtml, htmlResponse, } from "./layout";

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

  const cards = Array.from(actors, (c,) => {
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
  },).join("",);

  return htmlResponse(cards,);
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

  const items = Array.from(chats, (c,) => {
    const name = escapeHtml(c.name,);
    return `<div class="chat-item" onclick="location.assign('/views/chat?chatid=${c.id}')" data-testid="chat-item-${c.id}">
      <div class="chat-info"><h4 class="chat-name">${name}</h4><p class="chat-preview">No messages yet</p></div>
      <span class="chat-time">${c.updated_at ? new Date(c.updated_at,).toLocaleDateString() : ""}</span>
    </div>`;
  },).join("",);

  return htmlResponse(items,);
}

export { serveCharacterChatListDb, serveCharacterEditForm, serveCharactersGrid, };
