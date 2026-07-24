/**
 * DB Schema Manifest — Single Source of Truth
 *
 * Runtime representation of every table and its columns.
 * Used by:
 *   - schema-sync.test.ts: verify migrations produce correct DB
 *   - test-utils: typed insert helpers
 *   - future: generate EXPECTED_TABLES, insert defaults, etc.
 *
 * When adding a table or column:
 *   1. Update schema-*.ts interface
 *   2. Update this manifest (same file, same place)
 *   3. Add migration if needed
 */
import type { DB, } from "./schema";

/** Type-safe table name from the DB interface. */
export type TableName = keyof DB;

// ── Types ─────────────────────────────────────────────────────

interface ColMeta {
  /** SQLite storage type */
  type: "text" | "integer" | "real";
  /** NOT NULL constraint */
  notNull?: boolean;
  /** Has DEFAULT expression or value */
  hasDefault?: boolean;
  /** Is part of PRIMARY KEY */
  primaryKey?: boolean;
}

interface TableMeta {
  columns: Record<string, ColMeta>;
}

// ── SchemaManifest ────────────────────────────────────────────

export class SchemaManifest {
  readonly tables = new Map<string, TableMeta>();

  /** Register a table. Chainable. */
  table(name: string, columns: Record<string, ColMeta>,): this {
    this.tables.set(name, { columns, },);
    return this;
  }

  /** All table names, sorted. */
  get tableNames(): string[] {
    return [...this.tables.keys(),].sort();
  }

  /** Column names for a table, in registration order. */
  columnsOf(name: string,): string[] {
    const t = this.tables.get(name,);
    if (!t) { throw new Error(`Unknown table: ${name}`,); }
    return Object.keys(t.columns,);
  }

  /** Column metadata for a table. */
  tableOf(name: string,): TableMeta {
    const t = this.tables.get(name,);
    if (!t) { throw new Error(`Unknown table: ${name}`,); }
    return t;
  }

  /**
   * Verify an in-memory SQLite DB matches this manifest.
   * Returns structured diff for test assertions.
   */
  verify(sqlite: { query(sql: string, params?: unknown[],): { all(): unknown[] } },): {
    missingTables: string[];
    extraTables: string[];
    columnMismatches: {
      table: string;
      missingInDb: string[];
      extraInDb: string[];
    }[];
  } {
    const actualTables = new Set(
      (
        sqlite
          .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'kysely_%'",)
          .all() as { name: string }[]
      ).map((r,) => r.name),
    );

    const missingTables: string[] = [];
    const extraTables: string[] = [];
    const columnMismatches: {
      table: string;
      missingInDb: string[];
      extraInDb: string[];
    }[] = [];

    // Check each manifest table exists in DB
    for (const name of this.tableNames) {
      if (!actualTables.has(name,)) {
        missingTables.push(name,);
        continue;
      }

      const expected = this.columnsOf(name,);
      const actualCols = (sqlite.query(`PRAGMA table_info("${name}")`,).all() as { name: string }[]).map(
        (r,) => r.name,
      );

      const expectedSet = new Set(expected,);
      const actualSet = new Set(actualCols,);

      const missingInDb = expected.filter((c,) => !actualSet.has(c,));
      const extraInDb = actualCols.filter((c,) => !expectedSet.has(c,));

      if (missingInDb.length > 0 || extraInDb.length > 0) {
        columnMismatches.push({ table: name, missingInDb, extraInDb, },);
      }
    }

    // Extra tables in DB (not in manifest)
    for (const name of actualTables) {
      if (!this.tables.has(name,)) {
        extraTables.push(name,);
      }
    }

    return { missingTables, extraTables, columnMismatches, };
  }
}

// ── The Single Source of Truth ─────────────────────────────────
//
// Every table, every column — matches schema-*.ts interfaces.
// Order matches registration; keep in sync with DB aggregate in schema.ts.

function col(type: ColMeta["type"], opts?: Omit<ColMeta, "type">,): ColMeta {
  return { type, ...opts, };
}

export const SCHEMA = new SchemaManifest()
  // ── Core: Users ──────────────────────────────────────────────
  .table("users", {
    id: col("text", { primaryKey: true, },),
    username: col("text", { notNull: true, },),
    display_name: col("text", { notNull: true, },),
    password_hash: col("text",),
    role: col("text", { notNull: true, },),
    status: col("text", { notNull: true, },),
    settings: col("text", { notNull: true, },),
    birth_date: col("text",),
    age_gate_accepted_at: col("text",),
    data_version: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    last_seen_at: col("text",),
  },)
  // ── Core: Personas ───────────────────────────────────────────
  .table("personas", {
    id: col("text", { primaryKey: true, },),
    user_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    avatar_asset_id: col("text",),
    description: col("text",),
    title: col("text",),
    is_default: col("text", { notNull: true, },),
    data_version: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: Sessions ───────────────────────────────────────────
  .table("sessions", {
    id: col("text", { primaryKey: true, },),
    user_id: col("text", { notNull: true, },),
    token_hash: col("text", { notNull: true, },),
    ip: col("text",),
    user_agent: col("text",),
    created_at: col("text", { notNull: true, },),
    last_activity: col("text", { notNull: true, },),
    expires_at: col("text", { notNull: true, },),
  },)
  // ── Core: Chats ──────────────────────────────────────────────
  .table("chats", {
    id: col("text", { primaryKey: true, },),
    name: col("text", { notNull: true, },),
    type: col("text", { notNull: true, },),
    mode: col("text", { notNull: true, },),
    purpose: col("text", { notNull: true, },),
    created_by: col("text", { notNull: true, },),
    world_id: col("text",),
    current_location_id: col("text",),
    story_state: col("text",),
    gm_config: col("text",),
    visual_novel: col("integer", { notNull: true, },),
    turn_strategy: col("text",),
    max_turns: col("integer",),
    auto_advance: col("integer",),
    parent_chat_id: col("text",),
    is_pinned: col("text", { notNull: true, },),
    encryption_level: col("text", { notNull: true, },),
    response_length_preset: col("text",),
    response_length_custom: col("text",),
    context_max_tokens: col("integer",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: Actors ─────────────────────────────────────────────
  .table("actors", {
    id: col("text", { primaryKey: true, },),
    actor_type: col("text", { notNull: true, },),
    display_name: col("text", { notNull: true, },),
    user_id: col("text",),
    owner_id: col("text",),
    avatar_asset_id: col("text",),
    description: col("text",),
    system_prompt: col("text",),
    agent_type: col("text", { notNull: true, },),
    settings: col("text", { notNull: true, },),
    data_version: col("integer", { notNull: true, },),
    visibility: col("text", { notNull: true, },),
    welcome_message: col("text",),
    personality: col("text",),
    scenario: col("text",),
    mes_example: col("text",),
    alternate_greetings: col("text",),
    post_history_instructions: col("text",),
    creator_notes: col("text",),
    creator: col("text",),
    character_version: col("text",),
    import_spec: col("text", { notNull: true, },),
    content_rating: col("text", { notNull: true, },),
    template_overrides: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: Chat Participants ──────────────────────────────────
  .table("chat_participants", {
    chat_id: col("text", { notNull: true, },),
    actor_id: col("text", { notNull: true, },),
    role_in_chat: col("text", { notNull: true, },),
    talkativity: col("integer", { notNull: true, },),
    initiative: col("integer", { notNull: true, },),
    joined_at: col("text", { notNull: true, },),
    last_read_message_id: col("text",),
    impersonate_actor_id: col("text",),
    persona_id: col("text",),
  },)
  // ── Core: Group Initiatives ──────────────────────────────────
  .table("group_initiatives", {
    chat_id: col("text", { notNull: true, },),
    scene_id: col("text", { notNull: true, },),
    actor_id: col("text", { notNull: true, },),
    score: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: Chat Mentions ──────────────────────────────────────
  .table("chat_mentions", {
    id: col("text", { primaryKey: true, },),
    message_id: col("text", { notNull: true, },),
    actor_id: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Core: Characters ─────────────────────────────────────────
  .table("characters", {
    id: col("text", { primaryKey: true, },),
    owner_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    avatar_asset_id: col("text",),
    description: col("text",),
    system_prompt: col("text",),
    agent_type: col("text", { notNull: true, },),
    settings: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: Messages ───────────────────────────────────────────
  .table("messages", {
    id: col("text", { primaryKey: true, },),
    chat_id: col("text", { notNull: true, },),
    actor_id: col("text", { notNull: true, },),
    parent_id: col("text",),
    role: col("text", { notNull: true, },),
    content: col("text", { notNull: true, },),
    key_id: col("text",),
    content_format: col("text", { notNull: true, },),
    content_type: col("text", { notNull: true, },),
    content_encoding: col("text", { notNull: true, },),
    model_id: col("text",),
    provider: col("text",),
    token_count_prompt: col("integer",),
    token_count_completion: col("integer",),
    token_count_total: col("integer",),
    token_cost: col("real",),
    generation_time_ms: col("integer",),
    tokens_per_second: col("real",),
    status: col("text", { notNull: true, },),
    visibility: col("text", { notNull: true, },),
    hidden_by: col("text",),
    hidden_reason: col("text",),
    idempotency_key: col("text",),
    continuation_index: col("integer",),
    swipe_index: col("integer",),
    data_version: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    edited_at: col("text",),
    archived_at: col("text",),
    attachments: col("text",),
  },)
  // ── Core: Actor Keys ─────────────────────────────────────────
  .table("actor_keys", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    key_type: col("text", { notNull: true, },),
    encrypted_key: col("text",),
    public_key: col("text",),
    created_at: col("text", { notNull: true, },),
    expires_at: col("text",),
    status: col("text", { notNull: true, },),
  },)
  // ── Core: Actor Notes ────────────────────────────────────────
  .table("actor_notes", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    title: col("text", { notNull: true, },),
    content: col("text", { notNull: true, },),
    category: col("text", { notNull: true, },),
    pinned: col("text", { notNull: true, },),
    sort_order: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: Actor Items ────────────────────────────────────────
  .table("actor_items", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    item_type: col("text", { notNull: true, },),
    quantity: col("integer", { notNull: true, },),
    value: col("text",),
    weight: col("real",),
    tags: col("text", { notNull: true, },),
    metadata: col("text", { notNull: true, },),
    equipped: col("text", { notNull: true, },),
    sort_order: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: User API Keys ──────────────────────────────────────
  .table("user_api_keys", {
    id: col("text", { primaryKey: true, },),
    user_id: col("text", { notNull: true, },),
    provider_name: col("text", { notNull: true, },),
    api_key_encrypted: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: Model Role Overrides ───────────────────────────────
  .table("model_role_overrides", {
    role: col("text", { notNull: true, },),
    provider: col("text", { notNull: true, },),
    model: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: System Config ──────────────────────────────────────
  .table("system_config", {
    key: col("text", { primaryKey: true, },),
    value: col("text", { notNull: true, },),
    description: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Core: Log Entries ────────────────────────────────────────
  .table("log_entries", {
    id: col("text", { primaryKey: true, },),
    level: col("integer", { notNull: true, },),
    timestamp: col("real", { notNull: true, },),
    time: col("text", { notNull: true, },),
    message: col("text", { notNull: true, },),
    module: col("text",),
    user_id: col("text",),
    session_id: col("text",),
    request_id: col("text",),
    meta: col("text",),
    event_type: col("text",),
    entity_type: col("text",),
    entity_id: col("text",),
    action: col("text",),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Core: Plugin State ───────────────────────────────────────
  .table("plugin_state", {
    name: col("text", { primaryKey: true, },),
    enabled: col("integer", { notNull: true, },),
    enabled_at: col("text",),
    disabled_at: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Content: Assets ──────────────────────────────────────────
  .table("assets", {
    id: col("text", { primaryKey: true, },),
    owner_id: col("text", { notNull: true, },),
    filename: col("text", { notNull: true, },),
    mime_type: col("text", { notNull: true, },),
    asset_type: col("text", { notNull: true, },),
    size_bytes: col("integer", { notNull: true, },),
    storage_path: col("text", { notNull: true, },),
    storage_backend: col("text", { notNull: true, },),
    visibility: col("text", { notNull: true, },),
    width: col("integer",),
    height: col("integer",),
    duration_secs: col("real",),
    alt_text: col("text",),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Content: Asset Links ─────────────────────────────────────
  .table("asset_links", {
    asset_id: col("text", { notNull: true, },),
    entity_type: col("text", { notNull: true, },),
    entity_id: col("text", { notNull: true, },),
    label: col("text",),
    sort_order: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Content: Asset Shares ────────────────────────────────────
  .table("asset_shares", {
    id: col("text", { primaryKey: true, },),
    asset_id: col("text", { notNull: true, },),
    shared_with_id: col("text", { notNull: true, },),
    shared_by_id: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Generation: Generation Attempts ──────────────────────────
  .table("generation_attempts", {
    id: col("text", { primaryKey: true, },),
    chat_id: col("text", { notNull: true, },),
    parent_message_id: col("text", { notNull: true, },),
    actor_id: col("text", { notNull: true, },),
    idempotency_key: col("text", { notNull: true, },),
    model_id: col("text", { notNull: true, },),
    provider: col("text", { notNull: true, },),
    status: col("text", { notNull: true, },),
    cancel_reason: col("text",),
    cancel_reason_detail: col("text",),
    cancel_source: col("text",),
    abort_signal_id: col("text",),
    started_at: col("text", { notNull: true, },),
    completed_at: col("text",),
    prompt_tokens: col("integer",),
    completion_tokens: col("integer",),
    total_tokens: col("integer",),
    generation_time_ms: col("integer",),
    error_message: col("text",),
    streaming_chunks_received: col("integer",),
    streaming_chars_received: col("integer",),
    repetition_score: col("real",),
    repetition_analysis: col("text",),
    policy_analysis: col("text",),
    response_count_in_turn: col("integer",),
    parent_attempt_id: col("text",),
    continuation_count: col("integer",),
    partial_content: col("text",),
    step_index: col("integer",),
    total_steps: col("integer",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: Worlds ────────────────────────────────────────────
  .table("worlds", {
    id: col("text", { primaryKey: true, },),
    owner_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    lore: col("text",),
    scan_depth: col("integer",),
    token_budget: col("integer",),
    difficulty_modifier: col("integer", { notNull: true, },),
    difficulty_reroll: col("text", { notNull: true, },),
    difficulty_state: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: Locations ─────────────────────────────────────────
  .table("locations", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    connections: col("text", { notNull: true, },),
    parent_location_id: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: Story Turns ───────────────────────────────────────
  .table("story_turns", {
    id: col("text", { primaryKey: true, },),
    chat_id: col("text", { notNull: true, },),
    turn_number: col("integer", { notNull: true, },),
    actor_id: col("text", { notNull: true, },),
    turn_type: col("text", { notNull: true, },),
    prompt_sent: col("text", { notNull: true, },),
    response_received: col("text",),
    quality_score: col("real",),
    quality_details: col("text",),
    regeneration_count: col("integer", { notNull: true, },),
    status: col("text", { notNull: true, },),
    gm_decision: col("text",),
    world_events: col("text", { notNull: true, },),
    quest_progress: col("text", { notNull: true, },),
    started_at: col("text", { notNull: true, },),
    completed_at: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: Quests ────────────────────────────────────────────
  .table("quests", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    creator_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    type: col("text", { notNull: true, },),
    status: col("text", { notNull: true, },),
    priority: col("integer", { notNull: true, },),
    config: col("text", { notNull: true, },),
    progress: col("integer", { notNull: true, },),
    target: col("integer", { notNull: true, },),
    start_time: col("text",),
    deadline: col("text",),
    time_location_id: col("text",),
    rewards: col("text", { notNull: true, },),
    narrative_hooks: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
    completed_at: col("text",),
  },)
  // ── Story: Quest Progress ────────────────────────────────────
  .table("quest_progress", {
    id: col("text", { primaryKey: true, },),
    quest_id: col("text", { notNull: true, },),
    chat_id: col("text", { notNull: true, },),
    progress: col("integer", { notNull: true, },),
    status: col("text", { notNull: true, },),
    contributed_events: col("text", { notNull: true, },),
    started_at: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
    completed_at: col("text",),
  },)
  // ── Story: World States ──────────────────────────────────────
  .table("world_states", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    snapshot: col("text", { notNull: true, },),
    trigger_message_id: col("text",),
    trigger_turn_id: col("text",),
    description: col("text",),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Story: NPC States ────────────────────────────────────────
  .table("npc_states", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    world_id: col("text", { notNull: true, },),
    location_id: col("text",),
    health: col("integer", { notNull: true, },),
    mental_state: col("text", { notNull: true, },),
    knowledge: col("text", { notNull: true, },),
    relationships: col("text", { notNull: true, },),
    inventory: col("text", { notNull: true, },),
    schedule: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: Location States ───────────────────────────────────
  .table("location_states", {
    id: col("text", { primaryKey: true, },),
    location_id: col("text", { notNull: true, },),
    world_id: col("text", { notNull: true, },),
    description_override: col("text",),
    atmosphere: col("text",),
    npcs_present: col("text", { notNull: true, },),
    items_available: col("text", { notNull: true, },),
    time_of_day: col("text",),
    weather: col("text",),
    hazards: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: Items ─────────────────────────────────────────────
  .table("items", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    category: col("text", { notNull: true, },),
    rarity: col("text", { notNull: true, },),
    stackable: col("text", { notNull: true, },),
    max_stack: col("integer", { notNull: true, },),
    properties: col("text", { notNull: true, },),
    value: col("integer", { notNull: true, },),
    weight: col("real", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: World Items ───────────────────────────────────────
  .table("world_items", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    item_id: col("text", { notNull: true, },),
    location_id: col("text",),
    owner_actor_id: col("text",),
    quantity: col("integer", { notNull: true, },),
    visibility: col("text", { notNull: true, },),
    spawn_condition: col("text",),
    respawnable: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: Actor Memories ────────────────────────────────────
  .table("actor_memories", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    source_chat_id: col("text",),
    source_message_id: col("text",),
    content: col("text", { notNull: true, },),
    memory_type: col("text", { notNull: true, },),
    confidence: col("real", { notNull: true, },),
    importance: col("real", { notNull: true, },),
    keywords: col("text", { notNull: true, },),
    decay_rate: col("real", { notNull: true, },),
    strength: col("real", { notNull: true, },),
    context: col("text",),
    world_id: col("text",),
    user_id: col("text",),
    scope: col("text",),
    pinned: col("text",),
    privacy: col("text",),
    shareability: col("text",),
    expires_at: col("text",),
    last_accessed_at: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: Actor Lore Entries ────────────────────────────────
  .table("actor_lore_entries", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    name: col("text",),
    content: col("text", { notNull: true, },),
    keys: col("text", { notNull: true, },),
    secondary_keys: col("text", { notNull: true, },),
    selective: col("integer", { notNull: true, },),
    case_sensitive: col("integer", { notNull: true, },),
    enabled: col("text", { notNull: true, },),
    constant: col("integer", { notNull: true, },),
    position: col("text", { notNull: true, },),
    insertion_order: col("integer", { notNull: true, },),
    priority: col("integer", { notNull: true, },),
    comment: col("text",),
    sort_order: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Story: World Lore Entries ────────────────────────────────
  .table("world_lore_entries", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    name: col("text",),
    content: col("text", { notNull: true, },),
    keys: col("text", { notNull: true, },),
    secondary_keys: col("text", { notNull: true, },),
    selective: col("integer", { notNull: true, },),
    case_sensitive: col("integer", { notNull: true, },),
    enabled: col("text", { notNull: true, },),
    constant: col("integer", { notNull: true, },),
    position: col("text", { notNull: true, },),
    insertion_order: col("integer", { notNull: true, },),
    priority: col("integer", { notNull: true, },),
    comment: col("text",),
    sort_order: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Synthetic: Synthetic Data ────────────────────────────────
  .table("synthetic_data", {
    id: col("text", { primaryKey: true, },),
    chat_id: col("text",),
    world_id: col("text",),
    type: col("text", { notNull: true, },),
    source_data: col("text", { notNull: true, },),
    generated_cases: col("text", { notNull: true, },),
    metadata: col("text", { notNull: true, },),
    status: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    validated_at: col("text",),
    validated_by: col("text",),
  },)
  // ── Telemetry: Telemetry Events ──────────────────────────────
  .table("telemetry_events", {
    id: col("text", { primaryKey: true, },),
    session_id: col("text",),
    user_id: col("text",),
    chat_id: col("text",),
    event_type: col("text", { notNull: true, },),
    event_data: col("text", { notNull: true, },),
    source: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Chat: Message Reactions ──────────────────────────────────
  .table("message_reactions", {
    id: col("text", { primaryKey: true, },),
    message_id: col("text", { notNull: true, },),
    user_id: col("text", { notNull: true, },),
    emoji: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Chat: Chat Pins ──────────────────────────────────────────
  .table("chat_pins", {
    id: col("text", { primaryKey: true, },),
    chat_id: col("text", { notNull: true, },),
    message_id: col("text", { notNull: true, },),
    pinned_by: col("text", { notNull: true, },),
    pinned_at: col("text", { notNull: true, },),
  },)
  // ── User: Notifications ──────────────────────────────────────
  .table("notifications", {
    id: col("text", { primaryKey: true, },),
    user_id: col("text", { notNull: true, },),
    type: col("text", { notNull: true, },),
    title: col("text", { notNull: true, },),
    body: col("text",),
    link: col("text",),
    read: col("integer", { notNull: true, },),
    data: col("text",),
    created_at: col("text", { notNull: true, },),
  },)
  // ── System: Data Migrations (runtime tracking table) ────────
  .table("data_migrations", {
    table_name: col("text", { notNull: true, },),
    from_version: col("integer", { notNull: true, },),
    to_version: col("integer", { notNull: true, },),
    description: col("text", { notNull: true, },),
    applied_at: col("text", { notNull: true, },),
  },)
  // ── Character: Permanent Traits ──────────────────────────────
  .table("character_permanent_traits", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    trait_category: col("text", { notNull: true, },),
    trait_name: col("text", { notNull: true, },),
    trait_value: col("text", { notNull: true, },),
    immutable: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: World Traits ──────────────────────────────────
  .table("character_world_traits", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    world_id: col("text", { notNull: true, },),
    trait_category: col("text", { notNull: true, },),
    trait_name: col("text", { notNull: true, },),
    trait_value: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: Location Traits ───────────────────────────────
  .table("character_location_traits", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    location_id: col("text", { notNull: true, },),
    trait_name: col("text", { notNull: true, },),
    trait_value: col("text", { notNull: true, },),
    bonus: col("integer",),
    penalty: col("integer",),
    effects: col("text",),
    equipment_override: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: Mood ──────────────────────────────────────────
  .table("character_mood", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    world_id: col("text",),
    happiness: col("integer", { notNull: true, },),
    base_mood: col("text", { notNull: true, },),
    current_mood: col("text", { notNull: true, },),
    mood_stability: col("real", { notNull: true, },),
    expression_modifiers: col("text",),
    last_mood_change: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: Mood Events ───────────────────────────────────
  .table("mood_events", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    world_id: col("text",),
    event_type: col("text", { notNull: true, },),
    happiness_delta: col("integer", { notNull: true, },),
    mood_override: col("text",),
    source: col("text", { notNull: true, },),
    source_id: col("text",),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Character: Relationships ─────────────────────────────────
  .table("character_relationships", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    target_actor_id: col("text", { notNull: true, },),
    world_id: col("text",),
    relationship_type: col("text", { notNull: true, },),
    standing: col("integer", { notNull: true, },),
    trust: col("integer", { notNull: true, },),
    familiarity: col("integer", { notNull: true, },),
    is_bidirectional: col("integer", { notNull: true, },),
    metadata: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: Avatars ───────────────────────────────────────
  .table("character_avatars", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    asset_id: col("text", { notNull: true, },),
    label: col("text", { notNull: true, },),
    tags: col("text", { notNull: true, },),
    is_primary: col("integer", { notNull: true, },),
    sort_order: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: Avatar Config ─────────────────────────────────
  .table("character_avatar_config", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    selection_rule: col("text", { notNull: true, },),
    weights: col("text",),
    fallback_chain: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── World: Avatar Config ─────────────────────────────────────
  .table("world_avatar_config", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    actor_id: col("text", { notNull: true, },),
    selection_rule_override: col("text",),
    weights_override: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: Emotions ──────────────────────────────────────
  .table("emotions", {
    id: col("text", { primaryKey: true, },),
    name: col("text", { notNull: true, },),
    display_name: col("text", { notNull: true, },),
    category: col("text", { notNull: true, },),
    valence: col("real", { notNull: true, },),
    arousal: col("real", { notNull: true, },),
    icon: col("text",),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Character: Character Emotions ────────────────────────────
  .table("character_emotions", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    emotion_id: col("text", { notNull: true, },),
    intensity: col("real", { notNull: true, },),
    context: col("text",),
    expires_at: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: Availability ──────────────────────────────────
  .table("character_availability", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    status: col("text", { notNull: true, },),
    usage_policy: col("text",),
    activity_restrictions: col("text",),
    content_policy: col("text",),
    nsfw_policy: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Character: Licensing ─────────────────────────────────────
  .table("character_licensing", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    license_type: col("text", { notNull: true, },),
    custom_license_text: col("text",),
    attribution: col("text",),
    allow_derivatives: col("integer", { notNull: true, },),
    allow_commercial: col("integer", { notNull: true, },),
    share_alike: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Admin: Character Overrides ───────────────────────────────
  .table("admin_character_overrides", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    admin_id: col("text", { notNull: true, },),
    action: col("text", { notNull: true, },),
    visibility_override: col("text",),
    license_override: col("text",),
    reason: col("text",),
    expires_at: col("text",),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Recipes ────────────────────────────────────────
  .table("crafting_recipes", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    discipline: col("text", { notNull: true, },),
    tier: col("integer", { notNull: true, },),
    level_required: col("integer", { notNull: true, },),
    output_item_id: col("text", { notNull: true, },),
    output_quantity: col("integer", { notNull: true, },),
    crafting_time_seconds: col("integer", { notNull: true, },),
    base_success_chance: col("real", { notNull: true, },),
    base_quality_min: col("integer", { notNull: true, },),
    base_quality_max: col("integer", { notNull: true, },),
    perfect_threshold: col("integer", { notNull: true, },),
    station_type_required: col("text",),
    discovered_by_default: col("integer", { notNull: true, },),
    tags: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Recipe Materials ───────────────────────────────
  .table("crafting_recipe_materials", {
    id: col("text", { primaryKey: true, },),
    recipe_id: col("text", { notNull: true, },),
    item_id: col("text", { notNull: true, },),
    quantity: col("integer", { notNull: true, },),
    slot_type: col("text", { notNull: true, },),
    quality_requirement: col("text",),
    bonus_effect: col("text",),
    sort_order: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Station Definitions ────────────────────────────
  .table("crafting_station_defs", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    station_type: col("text", { notNull: true, },),
    tier: col("integer", { notNull: true, },),
    speed_bonus: col("real", { notNull: true, },),
    quality_bonus: col("real", { notNull: true, },),
    success_bonus: col("real", { notNull: true, },),
    material_saving_chance: col("real", { notNull: true, },),
    max_durability: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Station Instances ──────────────────────────────
  .table("crafting_station_instances", {
    id: col("text", { primaryKey: true, },),
    station_def_id: col("text", { notNull: true, },),
    world_id: col("text", { notNull: true, },),
    location_id: col("text",),
    owner_actor_id: col("text",),
    current_durability: col("integer", { notNull: true, },),
    is_active: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Professions ────────────────────────────────────
  .table("professions", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    world_id: col("text", { notNull: true, },),
    discipline: col("text", { notNull: true, },),
    level: col("integer", { notNull: true, },),
    experience: col("integer", { notNull: true, },),
    title: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Profession Specializations ─────────────────────
  .table("profession_specializations", {
    id: col("text", { primaryKey: true, },),
    profession_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    bonus_type: col("text", { notNull: true, },),
    bonus_value: col("real", { notNull: true, },),
    requirement_level: col("integer", { notNull: true, },),
    requirement_specializations: col("text", { notNull: true, },),
    is_active: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Recipe Discoveries ─────────────────────────────
  .table("recipe_discoveries", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    world_id: col("text", { notNull: true, },),
    recipe_id: col("text", { notNull: true, },),
    discovery_method: col("text", { notNull: true, },),
    discovered_at: col("text", { notNull: true, },),
    mastery_level: col("integer", { notNull: true, },),
  },)
  // ── Crafting: Gathering Node Definitions ─────────────────────
  .table("gathering_node_defs", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    name: col("text", { notNull: true, },),
    description: col("text",),
    node_type: col("text", { notNull: true, },),
    skill_required: col("integer", { notNull: true, },),
    respawn_time_seconds: col("integer", { notNull: true, },),
    rarity: col("text", { notNull: true, },),
    max_uses: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Gathering Node Materials ───────────────────────
  .table("gathering_node_materials", {
    id: col("text", { primaryKey: true, },),
    node_def_id: col("text", { notNull: true, },),
    item_id: col("text", { notNull: true, },),
    min_quantity: col("integer", { notNull: true, },),
    max_quantity: col("integer", { notNull: true, },),
    drop_chance: col("real", { notNull: true, },),
    min_quality: col("text",),
    max_quality: col("text",),
    sort_order: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Gathering Node Instances ───────────────────────
  .table("gathering_node_instances", {
    id: col("text", { primaryKey: true, },),
    node_def_id: col("text", { notNull: true, },),
    world_id: col("text", { notNull: true, },),
    location_id: col("text",),
    current_uses: col("integer", { notNull: true, },),
    is_depleted: col("integer", { notNull: true, },),
    respawn_at: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Crafting Attempts ──────────────────────────────
  .table("crafting_attempts", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    world_id: col("text", { notNull: true, },),
    recipe_id: col("text", { notNull: true, },),
    station_instance_id: col("text",),
    materials_used: col("text", { notNull: true, },),
    status: col("text", { notNull: true, },),
    quality_achieved: col("integer", { notNull: true, },),
    output_item_id: col("text",),
    output_quantity: col("integer", { notNull: true, },),
    experience_gained: col("integer", { notNull: true, },),
    skill_increase: col("integer", { notNull: true, },),
    bonus_effects: col("text", { notNull: true, },),
    duration_ms: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
  },)
  // ── Crafting: Crafting Orders ────────────────────────────────
  .table("crafting_orders", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text", { notNull: true, },),
    requester_actor_id: col("text", { notNull: true, },),
    crafter_actor_id: col("text",),
    recipe_id: col("text", { notNull: true, },),
    quantity: col("integer", { notNull: true, },),
    max_quality: col("text",),
    offered_payment: col("integer", { notNull: true, },),
    offered_materials: col("text", { notNull: true, },),
    status: col("text", { notNull: true, },),
    deadline: col("text",),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Character Intimacy ────────────────────────────────
  .table("character_intimacy", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    target_actor_id: col("text", { notNull: true, },),
    world_id: col("text",),
    score: col("integer", { notNull: true, },),
    action_history: col("text", { notNull: true, },),
    unlocked_thresholds: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Character Arousal ─────────────────────────────────
  .table("character_arousal", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    world_id: col("text",),
    level: col("integer", { notNull: true, },),
    buildup_rate: col("real", { notNull: true, },),
    decay_rate: col("real", { notNull: true, },),
    modifiers: col("text", { notNull: true, },),
    last_update: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Character Desire Profile ──────────────────────────
  .table("character_desire_profile", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    turn_ons: col("text", { notNull: true, },),
    turn_offs: col("text", { notNull: true, },),
    fetishes: col("text", { notNull: true, },),
    hard_limits: col("text", { notNull: true, },),
    current_desire: col("integer", { notNull: true, },),
    desire_decay_rate: col("real", { notNull: true, },),
    desire_buildup_rate: col("real", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Character Seduction Skills ────────────────────────
  .table("character_seduction_skills", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    skill_category: col("text", { notNull: true, },),
    skill_name: col("text", { notNull: true, },),
    level: col("integer", { notNull: true, },),
    xp: col("integer", { notNull: true, },),
    xp_to_next: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Encounters ────────────────────────────────────────
  .table("nsfw_encounters", {
    id: col("text", { primaryKey: true, },),
    world_id: col("text",),
    encounter_type: col("text", { notNull: true, },),
    intensity: col("text", { notNull: true, },),
    narrative_style: col("text", { notNull: true, },),
    participants: col("text", { notNull: true, },),
    phases: col("text", { notNull: true, },),
    current_phase: col("integer", { notNull: true, },),
    outcomes: col("text", { notNull: true, },),
    content_tags: col("text", { notNull: true, },),
    completed: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Character Body Profile ────────────────────────────
  .table("character_body_profile", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    stamina: col("integer", { notNull: true, },),
    flexibility: col("integer", { notNull: true, },),
    sensitivity: col("integer", { notNull: true, },),
    endurance: col("integer", { notNull: true, },),
    size_category: col("text", { notNull: true, },),
    build: col("text", { notNull: true, },),
    beauty: col("integer", { notNull: true, },),
    charisma: col("integer", { notNull: true, },),
    style: col("integer", { notNull: true, },),
    scent: col("text",),
    modifications: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Character Heat Cycle ──────────────────────────────
  .table("character_heat_cycle", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    species: col("text", { notNull: true, },),
    cycle_length_days: col("integer", { notNull: true, },),
    current_phase: col("text", { notNull: true, },),
    days_until_next_heat: col("integer", { notNull: true, },),
    effects: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Character Fantasies ───────────────────────────────
  .table("character_fantasies", {
    id: col("text", { primaryKey: true, },),
    actor_id: col("text", { notNull: true, },),
    fantasy_name: col("text", { notNull: true, },),
    category: col("text", { notNull: true, },),
    intensity: col("text", { notNull: true, },),
    requirements: col("text", { notNull: true, },),
    fulfillment_effects: col("text", { notNull: true, },),
    risks: col("text", { notNull: true, },),
    discovered_through: col("text",),
    initial_reaction: col("text", { notNull: true, },),
    current_feeling: col("text", { notNull: true, },),
    times_explored: col("integer", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },)
  // ── NSFW: Location NSFW Config ──────────────────────────────
  .table("location_nsfw_config", {
    id: col("text", { primaryKey: true, },),
    location_id: col("text", { notNull: true, },),
    location_type: col("text", { notNull: true, },),
    privacy_level: col("text", { notNull: true, },),
    discovery_chance: col("integer", { notNull: true, },),
    atmosphere: col("text", { notNull: true, },),
    equipment: col("text", { notNull: true, },),
    risks: col("text", { notNull: true, },),
    created_at: col("text", { notNull: true, },),
    updated_at: col("text", { notNull: true, },),
  },);
