/**
 * DB Schema — Core Domain Tables
 *
 * Users, sessions, chats, actors, participants, messages.
 */
import type { Generated } from "kysely";
import type {
  UserRole,
  UserStatus,
  ChatType,
  ChatMode,
  TurnStrategy,
  ActorType,
  AgentType,
  ChatParticipantRole,
  MessageRole,
  MessageContentType,
  MessageContentFormat,
  ContentEncoding,
  MessageStatus,
  MessageVisibility,
  ActorVisibility,
} from "./enums";

// ── Users ────────────────────────────────────────────────────
export interface Users {
  id: Generated<string>;
  username: string;
  display_name: string;
  password_hash: string | null;
  role: UserRole;
  status: UserStatus;
  settings: string;
  birth_date: string | null;
  age_gate_accepted_at: string | null;
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
  type: ChatType;
  mode: ChatMode;
  created_by: string;
  world_id: string | null;
  current_location_id: string | null;
  story_state: string | null;
  gm_config: string | null;
  turn_strategy: TurnStrategy | null;
  max_turns: number | null;
  auto_advance: number | null;
  is_pinned: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Actors ────────────────────────────────────────────────────
export interface Actors {
  id: Generated<string>;
  actor_type: ActorType;
  display_name: string;
  user_id: string | null;
  owner_id: string | null;
  avatar_asset_id: string | null;
  description: string | null;
  system_prompt: string | null;
  agent_type: AgentType;
  settings: string;
  data_version: number;
  visibility: Generated<ActorVisibility>;
  welcome_message: string | null;
  personality: string | null;
  scenario: string | null;
  mes_example: string | null;
  alternate_greetings: string | null; // JSON array
  post_history_instructions: string | null;
  creator_notes: string | null;
  creator: string | null;
  character_version: string | null;
  import_spec: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Chat Participants ─────────────────────────────────────────
export interface ChatParticipants {
  chat_id: string;
  actor_id: string;
  role_in_chat: ChatParticipantRole;
  joined_at: Generated<string>;
  last_read_message_id: string | null;
}

// ── Characters ────────────────────────────────────────────────
export interface Characters {
  id: Generated<string>;
  owner_id: string;
  name: string;
  avatar_asset_id: string | null;
  description: string | null;
  system_prompt: string | null;
  agent_type: AgentType;
  settings: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Messages ──────────────────────────────────────────────────
export interface Messages {
  id: Generated<string>;
  chat_id: string;
  actor_id: string;
  parent_id: string | null;
  role: MessageRole;
  content: string;
  key_id: string | null;
  content_format: MessageContentFormat;
  content_type: MessageContentType;
  content_encoding: ContentEncoding;
  model_id: string | null;
  provider: string | null;
  token_count_prompt: number | null;
  token_count_completion: number | null;
  token_count_total: number | null;
  token_cost: number | null;
  generation_time_ms: number | null;
  tokens_per_second: number | null;
  status: MessageStatus;
  visibility: MessageVisibility;
  hidden_by: string | null;
  hidden_reason: string | null;
  idempotency_key: string | null;
  continuation_index: number | null;
  swipe_index: number | null;
  created_at: Generated<string>;
  edited_at: string | null;
  attachments: string | null;
}

// ── Actor Keys ────────────────────────────────────────────────
export interface ActorKeys {
  id: Generated<string>;
  actor_id: string;
  name: string;
  key_type: string;
  encrypted_key: string | null;
  public_key: string | null;
  created_at: Generated<string>;
  expires_at: string | null;
  status: string;
}

// ── Actor Notes ───────────────────────────────────────────────
export interface ActorNotes {
  id: Generated<string>;
  actor_id: string;
  title: string;
  content: string;
  category: string;
  pinned: number;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Actor Items ───────────────────────────────────────────────
export interface ActorItems {
  id: Generated<string>;
  actor_id: string;
  name: string;
  description: string | null;
  item_type: string;
  quantity: number;
  value: string | null;
  weight: number | null;
  tags: string;
  metadata: string;
  equipped: number;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── User API Keys (BYO) ──────────────────────────────────────
export interface UserApiKeys {
  id: Generated<string>;
  user_id: string;
  provider_name: string;
  api_key_encrypted: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
