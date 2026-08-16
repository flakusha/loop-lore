// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { ActorType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { buildEditFormHtml, } from "./character-edit-form";
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

  return htmlResponse(buildEditFormHtml({
    name,
    desc,
    systemPrompt,
    personality,
    welcome,
    scenario,
    mesExample,
    postHistory,
    avatarHtml,
    avatarId,
    avatarRemoveBtn,
    characterId,
  },),);
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
