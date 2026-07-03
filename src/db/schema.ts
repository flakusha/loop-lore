import type { Generated } from "kysely";

// ── Users (auth + identity) ────────────────────────────────────
export interface Users {
  id: Generated<string>;
  username: string;
  display_name: string;
  password_hash: string | null;
  role: string; // 'admin' | 'user' | 'viewer' | 'solo'
  settings: string; // JSON blob
  birth_date: string | null; // ISO date (YYYY-MM-DD) for age gate
  age_gate_accepted_at: string | null; // ISO timestamp of last acceptance
  created_at: Generated<string>;
  last_seen_at: string | null;
}

// ── Sessions ──────────────────────────────────────────────────
export interface Sessions {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  ip: string | null;
  user_agent: string | null;
  created_at: Generated<string>;
  last_activity: Generated<string>;
  expires_at: string;
}

// ── Chats ─────────────────────────────────────────────────────
export interface Chats {
  id: Generated<string>;
  name: string;
  type: string; // 'direct' | 'group'
  created_by: string; // FK → users.id
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Actors (unified participant — replaces user/character FKs) ─
// actor_type: 'user' | 'character' | 'narrator' | 'system'
// agent_type: 'none' | 'ai' | 'narrator' | 'npc'
export interface Actors {
  id: Generated<string>;
  actor_type: string; // discriminator: 'user' | 'character' | 'narrator' | 'system'
  display_name: string;
  user_id: string | null; // FK → users.id (populated for actor_type='user')
  owner_id: string | null; // FK → users.id (populated for actor_type='character')
  avatar_asset_id: string | null;
  description: string | null;
  system_prompt: string | null;
  agent_type: string; // 'none' | 'ai' | 'narrator' | 'npc'
  settings: string; // JSON blob
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Chat Participants (junction: actor ↔ chat) ───────────────
export interface ChatParticipants {
  chat_id: string; // FK → chats.id
  actor_id: string; // FK → actors.id
  role_in_chat: string; // 'member' | 'owner' | 'observer'
  joined_at: Generated<string>;
}

// ── Characters (legacy table, kept for backward compat) ───────
export interface Characters {
  id: Generated<string>;
  owner_id: string;
  name: string;
  avatar_asset_id: string | null;
  description: string | null;
  system_prompt: string | null;
  agent_type: string; // 'none' | 'ai' | 'narrator' | 'npc'
  settings: string; // JSON blob
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Messages ──────────────────────────────────────────────────
export interface Messages {
  id: Generated<string>;
  chat_id: string; // FK → chats.id
  actor_id: string; // FK → actors.id (unified sender)
  role: string; // 'user' | 'assistant' | 'character' | 'system'
  content: string;
  content_type: string; // 'text' | 'action' | 'narration' | 'system'
  content_encoding: string; // 'identity' | 'gzip' | 'zstd' | 'brotli'
  model_id: string | null;
  provider: string | null;
  token_count_prompt: number | null;
  token_count_completion: number | null;
  token_count_total: number | null;
  token_cost: number | null;
  generation_time_ms: number | null;
  tokens_per_second: number | null;
  status: string; // 'sending' | 'sent' | 'confirmed' | 'failed'
  visibility: string; // 'visible' | 'hidden_by_user' | 'hidden_by_moderator' | 'auto_hidden' | 'redacted'
  hidden_by: string | null; // FK → actors.id
  hidden_reason: string | null;
  idempotency_key: string | null;
  created_at: Generated<string>;
  edited_at: string | null;
}

// ── Assets ────────────────────────────────────────────────────
export interface Assets {
  id: Generated<string>;
  owner_id: string;
  filename: string;
  mime_type: string;
  asset_type: string; // 'image' | 'audio' | 'video' | 'other'
  size_bytes: number;
  storage_path: string;
  storage_backend: string; // 'local' | 's3' | 'gcs'
  width: number | null;
  height: number | null;
  duration_secs: number | null;
  alt_text: string | null;
  created_at: Generated<string>;
}

// ── Asset Links (polymorphic junction) ────────────────────────
export interface AssetLinks {
  asset_id: string;
  entity_type: string;
  entity_id: string;
  label: string | null;
  sort_order: Generated<number>;
  created_at: Generated<string>;
}

// ── Worlds ──────────────────────────────────────────────────
export interface Worlds {
  id: Generated<string>;
  owner_id: string;
  name: string;
  description: string | null;
  lore: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── DB Aggregate ────────────────────────────────────────────
export interface DB {
  users: Users;
  sessions: Sessions;
  chats: Chats;
  actors: Actors;
  chat_participants: ChatParticipants;
  characters: Characters;
  messages: Messages;
  assets: Assets;
  asset_links: AssetLinks;
  worlds: Worlds;
}
