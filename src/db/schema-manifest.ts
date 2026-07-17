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
import type { DB } from "./schema";

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
  table(name: string, columns: Record<string, ColMeta>): this {
    this.tables.set(name, { columns });
    return this;
  }

  /** All table names, sorted. */
  get tableNames(): string[] {
    return [...this.tables.keys()].sort();
  }

  /** Column names for a table, in registration order. */
  columnsOf(name: string): string[] {
    const t = this.tables.get(name);
    if (!t) throw new Error(`Unknown table: ${name}`);
    return Object.keys(t.columns);
  }

  /** Column metadata for a table. */
  tableOf(name: string): TableMeta {
    const t = this.tables.get(name);
    if (!t) throw new Error(`Unknown table: ${name}`);
    return t;
  }

  /**
   * Verify an in-memory SQLite DB matches this manifest.
   * Returns structured diff for test assertions.
   */
  verify(sqlite: { query(sql: string, params?: unknown[]): { all(): unknown[] } }): {
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
          .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'kysely_%'")
          .all() as { name: string }[]
      ).map((r) => r.name),
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
      if (!actualTables.has(name)) {
        missingTables.push(name);
        continue;
      }

      const expected = this.columnsOf(name);
      const actualCols = (sqlite.query(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map(
        (r) => r.name,
      );

      const expectedSet = new Set(expected);
      const actualSet = new Set(actualCols);

      const missingInDb = expected.filter((c) => !actualSet.has(c));
      const extraInDb = actualCols.filter((c) => !expectedSet.has(c));

      if (missingInDb.length > 0 || extraInDb.length > 0) {
        columnMismatches.push({ table: name, missingInDb, extraInDb });
      }
    }

    // Extra tables in DB (not in manifest)
    for (const name of actualTables) {
      if (!this.tables.has(name)) {
        extraTables.push(name);
      }
    }

    return { missingTables, extraTables, columnMismatches };
  }
}

// ── The Single Source of Truth ─────────────────────────────────
//
// Every table, every column — matches schema-*.ts interfaces.
// Order matches registration; keep in sync with DB aggregate in schema.ts.

function col(type: ColMeta["type"], opts?: Omit<ColMeta, "type">): ColMeta {
  return { type, ...opts };
}

export const SCHEMA = new SchemaManifest()

  // ── Core: Users ──────────────────────────────────────────────
  .table("users", {
    id: col("text", { primaryKey: true }),
    username: col("text", { notNull: true }),
    display_name: col("text", { notNull: true }),
    password_hash: col("text"),
    role: col("text", { notNull: true }),
    status: col("text", { notNull: true }),
    settings: col("text", { notNull: true }),
    birth_date: col("text"),
    age_gate_accepted_at: col("text"),
    data_version: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    last_seen_at: col("text"),
  })

  // ── Core: Personas ───────────────────────────────────────────
  .table("personas", {
    id: col("text", { primaryKey: true }),
    user_id: col("text", { notNull: true }),
    name: col("text", { notNull: true }),
    avatar_asset_id: col("text"),
    description: col("text"),
    title: col("text"),
    is_default: col("text", { notNull: true }),
    data_version: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: Sessions ───────────────────────────────────────────
  .table("sessions", {
    id: col("text", { primaryKey: true }),
    user_id: col("text", { notNull: true }),
    token_hash: col("text", { notNull: true }),
    ip: col("text"),
    user_agent: col("text"),
    created_at: col("text", { notNull: true }),
    last_activity: col("text", { notNull: true }),
    expires_at: col("text", { notNull: true }),
  })

  // ── Core: Chats ──────────────────────────────────────────────
  .table("chats", {
    id: col("text", { primaryKey: true }),
    name: col("text", { notNull: true }),
    type: col("text", { notNull: true }),
    mode: col("text", { notNull: true }),
    purpose: col("text", { notNull: true }),
    created_by: col("text", { notNull: true }),
    world_id: col("text"),
    current_location_id: col("text"),
    story_state: col("text"),
    gm_config: col("text"),
    turn_strategy: col("text"),
    max_turns: col("integer"),
    auto_advance: col("integer"),
    parent_chat_id: col("text"),
    is_pinned: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: Actors ─────────────────────────────────────────────
  .table("actors", {
    id: col("text", { primaryKey: true }),
    actor_type: col("text", { notNull: true }),
    display_name: col("text", { notNull: true }),
    user_id: col("text"),
    owner_id: col("text"),
    avatar_asset_id: col("text"),
    description: col("text"),
    system_prompt: col("text"),
    agent_type: col("text", { notNull: true }),
    settings: col("text", { notNull: true }),
    data_version: col("integer", { notNull: true }),
    visibility: col("text", { notNull: true }),
    welcome_message: col("text"),
    personality: col("text"),
    scenario: col("text"),
    mes_example: col("text"),
    alternate_greetings: col("text"),
    post_history_instructions: col("text"),
    creator_notes: col("text"),
    creator: col("text"),
    character_version: col("text"),
    import_spec: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: Chat Participants ──────────────────────────────────
  .table("chat_participants", {
    chat_id: col("text", { notNull: true }),
    actor_id: col("text", { notNull: true }),
    role_in_chat: col("text", { notNull: true }),
    talkativity: col("integer", { notNull: true }),
    initiative: col("integer", { notNull: true }),
    joined_at: col("text", { notNull: true }),
    last_read_message_id: col("text"),
    impersonate_actor_id: col("text"),
    persona_id: col("text"),
  })

  // ── Core: Group Initiatives ──────────────────────────────────
  .table("group_initiatives", {
    chat_id: col("text", { notNull: true }),
    scene_id: col("text", { notNull: true }),
    actor_id: col("text", { notNull: true }),
    score: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: Chat Mentions ──────────────────────────────────────
  .table("chat_mentions", {
    id: col("text", { primaryKey: true }),
    message_id: col("text", { notNull: true }),
    actor_id: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
  })

  // ── Core: Characters ─────────────────────────────────────────
  .table("characters", {
    id: col("text", { primaryKey: true }),
    owner_id: col("text", { notNull: true }),
    name: col("text", { notNull: true }),
    avatar_asset_id: col("text"),
    description: col("text"),
    system_prompt: col("text"),
    agent_type: col("text", { notNull: true }),
    settings: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: Messages ───────────────────────────────────────────
  .table("messages", {
    id: col("text", { primaryKey: true }),
    chat_id: col("text", { notNull: true }),
    actor_id: col("text", { notNull: true }),
    parent_id: col("text"),
    role: col("text", { notNull: true }),
    content: col("text", { notNull: true }),
    key_id: col("text"),
    content_format: col("text", { notNull: true }),
    content_type: col("text", { notNull: true }),
    content_encoding: col("text", { notNull: true }),
    model_id: col("text"),
    provider: col("text"),
    token_count_prompt: col("integer"),
    token_count_completion: col("integer"),
    token_count_total: col("integer"),
    token_cost: col("real"),
    generation_time_ms: col("integer"),
    tokens_per_second: col("real"),
    status: col("text", { notNull: true }),
    visibility: col("text", { notNull: true }),
    hidden_by: col("text"),
    hidden_reason: col("text"),
    idempotency_key: col("text"),
    continuation_index: col("integer"),
    swipe_index: col("integer"),
    data_version: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    edited_at: col("text"),
    archived_at: col("text"),
    attachments: col("text"),
  })

  // ── Core: Actor Keys ─────────────────────────────────────────
  .table("actor_keys", {
    id: col("text", { primaryKey: true }),
    actor_id: col("text", { notNull: true }),
    name: col("text", { notNull: true }),
    key_type: col("text", { notNull: true }),
    encrypted_key: col("text"),
    public_key: col("text"),
    created_at: col("text", { notNull: true }),
    expires_at: col("text"),
    status: col("text", { notNull: true }),
  })

  // ── Core: Actor Notes ────────────────────────────────────────
  .table("actor_notes", {
    id: col("text", { primaryKey: true }),
    actor_id: col("text", { notNull: true }),
    title: col("text", { notNull: true }),
    content: col("text", { notNull: true }),
    category: col("text", { notNull: true }),
    pinned: col("text", { notNull: true }),
    sort_order: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: Actor Items ────────────────────────────────────────
  .table("actor_items", {
    id: col("text", { primaryKey: true }),
    actor_id: col("text", { notNull: true }),
    name: col("text", { notNull: true }),
    description: col("text"),
    item_type: col("text", { notNull: true }),
    quantity: col("integer", { notNull: true }),
    value: col("text"),
    weight: col("real"),
    tags: col("text", { notNull: true }),
    metadata: col("text", { notNull: true }),
    equipped: col("text", { notNull: true }),
    sort_order: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: User API Keys ──────────────────────────────────────
  .table("user_api_keys", {
    id: col("text", { primaryKey: true }),
    user_id: col("text", { notNull: true }),
    provider_name: col("text", { notNull: true }),
    api_key_encrypted: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: Model Role Overrides ───────────────────────────────
  .table("model_role_overrides", {
    role: col("text", { notNull: true }),
    provider: col("text", { notNull: true }),
    model: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: System Config ──────────────────────────────────────
  .table("system_config", {
    key: col("text", { primaryKey: true }),
    value: col("text", { notNull: true }),
    description: col("text"),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Core: Log Entries ────────────────────────────────────────
  .table("log_entries", {
    id: col("text", { primaryKey: true }),
    level: col("integer", { notNull: true }),
    timestamp: col("real", { notNull: true }),
    time: col("text", { notNull: true }),
    message: col("text", { notNull: true }),
    module: col("text"),
    user_id: col("text"),
    session_id: col("text"),
    request_id: col("text"),
    meta: col("text"),
    event_type: col("text"),
    entity_type: col("text"),
    entity_id: col("text"),
    action: col("text"),
    created_at: col("text", { notNull: true }),
  })

  // ── Core: Plugin State ───────────────────────────────────────
  .table("plugin_state", {
    name: col("text", { primaryKey: true }),
    enabled: col("integer", { notNull: true }),
    enabled_at: col("text"),
    disabled_at: col("text"),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Content: Assets ──────────────────────────────────────────
  .table("assets", {
    id: col("text", { primaryKey: true }),
    owner_id: col("text", { notNull: true }),
    filename: col("text", { notNull: true }),
    mime_type: col("text", { notNull: true }),
    asset_type: col("text", { notNull: true }),
    size_bytes: col("integer", { notNull: true }),
    storage_path: col("text", { notNull: true }),
    storage_backend: col("text", { notNull: true }),
    visibility: col("text", { notNull: true }),
    width: col("integer"),
    height: col("integer"),
    duration_secs: col("real"),
    alt_text: col("text"),
    created_at: col("text", { notNull: true }),
  })

  // ── Content: Asset Links ─────────────────────────────────────
  .table("asset_links", {
    asset_id: col("text", { notNull: true }),
    entity_type: col("text", { notNull: true }),
    entity_id: col("text", { notNull: true }),
    label: col("text"),
    sort_order: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
  })

  // ── Content: Asset Shares ────────────────────────────────────
  .table("asset_shares", {
    id: col("text", { primaryKey: true }),
    asset_id: col("text", { notNull: true }),
    shared_with_id: col("text", { notNull: true }),
    shared_by_id: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
  })

  // ── Generation: Generation Attempts ──────────────────────────
  .table("generation_attempts", {
    id: col("text", { primaryKey: true }),
    chat_id: col("text", { notNull: true }),
    parent_message_id: col("text", { notNull: true }),
    actor_id: col("text", { notNull: true }),
    idempotency_key: col("text", { notNull: true }),
    model_id: col("text", { notNull: true }),
    provider: col("text", { notNull: true }),
    status: col("text", { notNull: true }),
    cancel_reason: col("text"),
    cancel_reason_detail: col("text"),
    cancel_source: col("text"),
    abort_signal_id: col("text"),
    started_at: col("text", { notNull: true }),
    completed_at: col("text"),
    prompt_tokens: col("integer"),
    completion_tokens: col("integer"),
    total_tokens: col("integer"),
    generation_time_ms: col("integer"),
    error_message: col("text"),
    streaming_chunks_received: col("integer"),
    streaming_chars_received: col("integer"),
    repetition_score: col("real"),
    repetition_analysis: col("text"),
    policy_analysis: col("text"),
    response_count_in_turn: col("integer"),
    parent_attempt_id: col("text"),
    continuation_count: col("integer"),
    partial_content: col("text"),
    step_index: col("integer"),
    total_steps: col("integer"),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: Worlds ────────────────────────────────────────────
  .table("worlds", {
    id: col("text", { primaryKey: true }),
    owner_id: col("text", { notNull: true }),
    name: col("text", { notNull: true }),
    description: col("text"),
    lore: col("text"),
    scan_depth: col("integer"),
    token_budget: col("integer"),
    difficulty_modifier: col("integer", { notNull: true }),
    difficulty_reroll: col("text", { notNull: true }),
    difficulty_state: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: Locations ─────────────────────────────────────────
  .table("locations", {
    id: col("text", { primaryKey: true }),
    world_id: col("text", { notNull: true }),
    name: col("text", { notNull: true }),
    description: col("text"),
    connections: col("text", { notNull: true }),
    parent_location_id: col("text"),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: Story Turns ───────────────────────────────────────
  .table("story_turns", {
    id: col("text", { primaryKey: true }),
    chat_id: col("text", { notNull: true }),
    turn_number: col("integer", { notNull: true }),
    actor_id: col("text", { notNull: true }),
    turn_type: col("text", { notNull: true }),
    prompt_sent: col("text", { notNull: true }),
    response_received: col("text"),
    quality_score: col("real"),
    quality_details: col("text"),
    regeneration_count: col("integer", { notNull: true }),
    status: col("text", { notNull: true }),
    gm_decision: col("text"),
    world_events: col("text", { notNull: true }),
    quest_progress: col("text", { notNull: true }),
    started_at: col("text", { notNull: true }),
    completed_at: col("text"),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: Quests ────────────────────────────────────────────
  .table("quests", {
    id: col("text", { primaryKey: true }),
    world_id: col("text", { notNull: true }),
    creator_id: col("text", { notNull: true }),
    name: col("text", { notNull: true }),
    description: col("text"),
    type: col("text", { notNull: true }),
    status: col("text", { notNull: true }),
    priority: col("integer", { notNull: true }),
    config: col("text", { notNull: true }),
    progress: col("integer", { notNull: true }),
    target: col("integer", { notNull: true }),
    start_time: col("text"),
    deadline: col("text"),
    time_location_id: col("text"),
    rewards: col("text", { notNull: true }),
    narrative_hooks: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
    completed_at: col("text"),
  })

  // ── Story: Quest Progress ────────────────────────────────────
  .table("quest_progress", {
    id: col("text", { primaryKey: true }),
    quest_id: col("text", { notNull: true }),
    chat_id: col("text", { notNull: true }),
    progress: col("integer", { notNull: true }),
    status: col("text", { notNull: true }),
    contributed_events: col("text", { notNull: true }),
    started_at: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
    completed_at: col("text"),
  })

  // ── Story: World States ──────────────────────────────────────
  .table("world_states", {
    id: col("text", { primaryKey: true }),
    world_id: col("text", { notNull: true }),
    snapshot: col("text", { notNull: true }),
    trigger_message_id: col("text"),
    trigger_turn_id: col("text"),
    description: col("text"),
    created_at: col("text", { notNull: true }),
  })

  // ── Story: NPC States ────────────────────────────────────────
  .table("npc_states", {
    id: col("text", { primaryKey: true }),
    actor_id: col("text", { notNull: true }),
    world_id: col("text", { notNull: true }),
    location_id: col("text"),
    health: col("integer", { notNull: true }),
    mental_state: col("text", { notNull: true }),
    knowledge: col("text", { notNull: true }),
    relationships: col("text", { notNull: true }),
    inventory: col("text", { notNull: true }),
    schedule: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: Location States ───────────────────────────────────
  .table("location_states", {
    id: col("text", { primaryKey: true }),
    location_id: col("text", { notNull: true }),
    world_id: col("text", { notNull: true }),
    description_override: col("text"),
    atmosphere: col("text"),
    npcs_present: col("text", { notNull: true }),
    items_available: col("text", { notNull: true }),
    time_of_day: col("text"),
    weather: col("text"),
    hazards: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: Items ─────────────────────────────────────────────
  .table("items", {
    id: col("text", { primaryKey: true }),
    world_id: col("text", { notNull: true }),
    name: col("text", { notNull: true }),
    description: col("text"),
    category: col("text", { notNull: true }),
    rarity: col("text", { notNull: true }),
    stackable: col("text", { notNull: true }),
    max_stack: col("integer", { notNull: true }),
    properties: col("text", { notNull: true }),
    value: col("integer", { notNull: true }),
    weight: col("real", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: World Items ───────────────────────────────────────
  .table("world_items", {
    id: col("text", { primaryKey: true }),
    world_id: col("text", { notNull: true }),
    item_id: col("text", { notNull: true }),
    location_id: col("text"),
    owner_actor_id: col("text"),
    quantity: col("integer", { notNull: true }),
    visibility: col("text", { notNull: true }),
    spawn_condition: col("text"),
    respawnable: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: Actor Memories ────────────────────────────────────
  .table("actor_memories", {
    id: col("text", { primaryKey: true }),
    actor_id: col("text", { notNull: true }),
    source_chat_id: col("text"),
    content: col("text", { notNull: true }),
    memory_type: col("text", { notNull: true }),
    confidence: col("real", { notNull: true }),
    importance: col("real", { notNull: true }),
    keywords: col("text", { notNull: true }),
    decay_rate: col("real", { notNull: true }),
    strength: col("real", { notNull: true }),
    expires_at: col("text"),
    last_accessed_at: col("text"),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: Actor Lore Entries ────────────────────────────────
  .table("actor_lore_entries", {
    id: col("text", { primaryKey: true }),
    actor_id: col("text", { notNull: true }),
    name: col("text"),
    content: col("text", { notNull: true }),
    keys: col("text", { notNull: true }),
    secondary_keys: col("text", { notNull: true }),
    selective: col("integer", { notNull: true }),
    case_sensitive: col("integer", { notNull: true }),
    enabled: col("text", { notNull: true }),
    constant: col("integer", { notNull: true }),
    position: col("text", { notNull: true }),
    insertion_order: col("integer", { notNull: true }),
    priority: col("integer", { notNull: true }),
    comment: col("text"),
    sort_order: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Story: World Lore Entries ────────────────────────────────
  .table("world_lore_entries", {
    id: col("text", { primaryKey: true }),
    world_id: col("text", { notNull: true }),
    name: col("text"),
    content: col("text", { notNull: true }),
    keys: col("text", { notNull: true }),
    secondary_keys: col("text", { notNull: true }),
    selective: col("integer", { notNull: true }),
    case_sensitive: col("integer", { notNull: true }),
    enabled: col("text", { notNull: true }),
    constant: col("integer", { notNull: true }),
    position: col("text", { notNull: true }),
    insertion_order: col("integer", { notNull: true }),
    priority: col("integer", { notNull: true }),
    comment: col("text"),
    sort_order: col("integer", { notNull: true }),
    created_at: col("text", { notNull: true }),
    updated_at: col("text", { notNull: true }),
  })

  // ── Synthetic: Synthetic Data ────────────────────────────────
  .table("synthetic_data", {
    id: col("text", { primaryKey: true }),
    chat_id: col("text"),
    world_id: col("text"),
    type: col("text", { notNull: true }),
    source_data: col("text", { notNull: true }),
    generated_cases: col("text", { notNull: true }),
    metadata: col("text", { notNull: true }),
    status: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
    validated_at: col("text"),
    validated_by: col("text"),
  })

  // ── Telemetry: Telemetry Events ──────────────────────────────
  .table("telemetry_events", {
    id: col("text", { primaryKey: true }),
    session_id: col("text"),
    user_id: col("text"),
    chat_id: col("text"),
    event_type: col("text", { notNull: true }),
    event_data: col("text", { notNull: true }),
    source: col("text", { notNull: true }),
    created_at: col("text", { notNull: true }),
  })

  // ── System: Data Migrations (runtime tracking table) ────────
  .table("data_migrations", {
    table_name: col("text", { notNull: true }),
    from_version: col("integer", { notNull: true }),
    to_version: col("integer", { notNull: true }),
    description: col("text", { notNull: true }),
    applied_at: col("text", { notNull: true }),
  });
