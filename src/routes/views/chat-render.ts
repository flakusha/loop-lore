import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { escapeHtml, } from "./layout";

async function enrichChats(
  database: Kysely<DB>,
  chats: {
    id: string;
    name: string;
    type: string;
    is_pinned: string;
    updated_at: string;
    created_at: string;
    encryption_level: string;
    world_name: string | null;
    location_name: string | null;
  }[],
): Promise<
  {
    id: string;
    name: string;
    type: string;
    is_pinned: string;
    updated_at: string;
    created_at: string;
    encryption_level: string;
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
  is_pinned: string;
  updated_at: string;
  created_at: string;
  world_name: string | null;
  location_name: string | null;
  encryption_level: string;
  participant_count: number;
  last_message: string | null;
}[],): string {
  const now = Date.now();
  return rows
    .map((r,) => {
      const name = escapeHtml(r.name,);
      const typeLabel = r.type === "group" ? "👥" : "💬";
      const pinned = r.is_pinned === "pinned" ? " ★" : "";
      const encryptionBadge = r.encryption_level !== "public" && r.encryption_level !== "none"
        ? `<span title="Encrypted (${
          escapeHtml(r.encryption_level,)
        })" style="font-size:11px;color:var(--accent-cyan)">🔒</span>`
        : "";
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
            ${name}${pinned ? `<span style="color:var(--accent-yellow)">${pinned}</span>` : ""}${encryptionBadge}
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

export { enrichChats, renderChatListItems, };
