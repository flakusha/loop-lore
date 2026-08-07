/**
 * Shared schema + error/result types for the chat service layer.
 *
 * Colocated here so the domain function modules stay small and import the
 * types they need. Everything exported is re-exported by the service barrel.
 */

export interface ServiceError {
  code: "not_found" | "forbidden" | "bad_request";
  message: string;
}

/** Structured error for key-mechanic mutation on an online chat (maps to 409). */
export interface KeyMechanicConflictError {
  code: "key_mechanic_conflict";
  message: string;
  details: {
    fields: string[];
    migrateEndpoint: string;
  };
}

export type UpdateChatResult = ServiceError | KeyMechanicConflictError | { ok: true };

export interface CreateChatParams {
  name: string;
  type?: string;
  mode?: string;
  createdBy: string;
  worldId?: string | null;
  currentLocationId?: string | null;
  turnStrategy?: string | null;
  participantIds?: string[];
  gmConfig?: Record<string, unknown> | null;
  visualNovel?: boolean;
  templateId?: string;
  /** Seed the new chat with participant memories: "full" | "selective" | "fresh". */
  memoryCarry?: "full" | "selective" | "fresh";
  /** Actor memory ids to carry when memoryCarry === "selective". */
  memoryCarryIds?: string[];
}

export interface ChatSetupTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  mode: string | null;
  turn_strategy: string | null;
  world_id: string | null;
  gm_config: string | null;
  visual_novel: number;
}

export type TemplateMutationResult =
  | { ok: true; template: ChatSetupTemplate }
  | { ok: false; code: "conflict" | "not_found" | "bad_request"; message: string };

export interface MigrateChatParams {
  templateId: string;
  createdBy: string;
  name?: string;
  carry?: {
    participants?: boolean;
    memory?: boolean;
    history?: "none" | "summary" | "full";
    /** Carry party/game state: story_turns, quest_progress, group_initiatives. */
    state?: boolean;
    /** Carry chat pins + VN choice history. */
    pins?: boolean;
    /** Carry world/npc/location state snapshots for the party's world. */
    worldState?: boolean;
  };
}

export type MigrateChatResult =
  | ServiceError
  | { ok: true; newChatId: string; sourceChatId: string };

export interface UpdateChatParams {
  name?: string;
  mode?: string;
  turnStrategy?: string | null;
  worldId?: string | null;
  isPinned?: boolean;
  isPaused?: boolean;
  freezePanel?: boolean;
  userRole?: string | null;
  gmConfig?: Record<string, unknown> | null;
  visualNovel?: boolean;
}

export interface ListMessagesParams {
  chatId: string;
  page?: number;
  pageSize?: number;
  parentId?: string;
}

export interface RegenerateVariantParams {
  chatId: string;
  messageId: string;
  userId: string | null;
  userRole: string | null;
}

export type RegenerateVariantResult =
  | ServiceError
  | { ok: true; replayed: boolean; variantMessageId: string; swipeIndex: number };
