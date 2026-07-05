import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

const sqlite: Database = new Database(":memory:");

function createSchema(database: Database): void {
  database.run("PRAGMA foreign_keys = ON");
  database.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'direct',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE actors (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL DEFAULT 'user',
      display_name TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      owner_id TEXT REFERENCES users(id),
      avatar_asset_id TEXT,
      description TEXT,
      system_prompt TEXT,
      agent_type TEXT NOT NULL DEFAULT 'none',
      settings TEXT NOT NULL DEFAULT '{}',
      data_version INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'private',
      welcome_message TEXT,
      personality TEXT,
      scenario TEXT,
      mes_example TEXT,
      alternate_greetings TEXT,
      post_history_instructions TEXT,
      creator_notes TEXT,
      creator TEXT,
      character_version TEXT,
      import_spec TEXT NOT NULL DEFAULT 'raw',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      avatar_asset_id TEXT,
      description TEXT,
      system_prompt TEXT,
      agent_type TEXT NOT NULL DEFAULT 'none',
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id),
      actor_id TEXT NOT NULL REFERENCES actors(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      content_encoding TEXT NOT NULL DEFAULT 'identity',
      model_id TEXT,
      provider TEXT,
      token_count_prompt INTEGER,
      token_count_completion INTEGER,
      token_count_total INTEGER,
      token_cost REAL,
      generation_time_ms INTEGER,
      tokens_per_second REAL,
      status TEXT NOT NULL DEFAULT 'sending',
      visibility TEXT NOT NULL DEFAULT 'visible',
      hidden_by TEXT REFERENCES actors(id),
      hidden_reason TEXT,
      idempotency_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      edited_at TEXT
    );
    CREATE TABLE chat_participants (
      chat_id TEXT NOT NULL REFERENCES chats(id),
      actor_id TEXT NOT NULL REFERENCES actors(id),
      role_in_chat TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (chat_id, actor_id)
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      storage_backend TEXT NOT NULL DEFAULT 'local',
      width INTEGER,
      height INTEGER,
      duration_secs REAL,
      alt_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE asset_links (
      asset_id TEXT NOT NULL REFERENCES assets(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (asset_id, entity_type, entity_id)
    );
    CREATE TABLE worlds (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      lore TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.run("CREATE INDEX idx_sessions_user_id ON sessions(user_id)");
  database.run("CREATE INDEX idx_sessions_token_hash ON sessions(token_hash)");
  database.run("CREATE INDEX idx_actors_user_id ON actors(user_id)");
  database.run("CREATE INDEX idx_actors_owner ON actors(owner_id)");
  database.run("CREATE INDEX idx_actors_type ON actors(actor_type)");
  database.run("CREATE INDEX idx_characters_owner ON characters(owner_id)");
  database.run("CREATE INDEX idx_chat_participants_actor ON chat_participants(actor_id)");
  database.run("CREATE INDEX idx_messages_chat_created ON messages(chat_id, created_at)");
  database.run("CREATE INDEX idx_messages_idempotency ON messages(idempotency_key)");
  database.run("CREATE INDEX idx_messages_actor ON messages(actor_id)");
  database.run("CREATE INDEX idx_assets_owner ON assets(owner_id)");
  database.run("CREATE INDEX idx_asset_links_entity ON asset_links(entity_type, entity_id)");
}

type Row = Record<string, unknown>;

beforeAll(() => {
  createSchema(sqlite);
});

afterAll(() => {
  sqlite.close();
});

describe("Database schema", () => {
  test("all tables exist", () => {
    const tables = sqlite
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Row[];
    const names = tables.map((t) => t.name as string);
    expect(names).toEqual([
      "actors",
      "asset_links",
      "assets",
      "characters",
      "chat_participants",
      "chats",
      "messages",
      "sessions",
      "users",
      "worlds",
    ]);
  });

  describe("actors — unified participant table", () => {
    test("insert user as actor", () => {
      sqlite.run("INSERT INTO users (id, username, display_name, role, settings) VALUES (?, ?, ?, ?, ?)", [
        "user-1",
        "alice",
        "Alice",
        "user",
        "{}",
      ]);
      sqlite.run("INSERT INTO actors (id, actor_type, display_name, user_id) VALUES (?, ?, ?, ?)", [
        "actor-user-1",
        "user",
        "Alice",
        "user-1",
      ]);
      const actor = sqlite.query("SELECT * FROM actors WHERE id = ?").get("actor-user-1") as Row;
      expect(actor.actor_type).toBe("user");
      expect(actor.display_name).toBe("Alice");
      expect(actor.user_id).toBe("user-1");
      expect(actor.agent_type).toBe("none");
    });

    test("insert AI character as actor", () => {
      sqlite.run(
        "INSERT INTO actors (id, actor_type, display_name, owner_id, agent_type, description) VALUES (?, ?, ?, ?, ?, ?)",
        ["actor-char-1", "character", "Bob", "user-1", "ai", "An AI character"],
      );
      const actor = sqlite.query("SELECT * FROM actors WHERE id = ?").get("actor-char-1") as Row;
      expect(actor.actor_type).toBe("character");
      expect(actor.display_name).toBe("Bob");
      expect(actor.agent_type).toBe("ai");
      expect(actor.description).toBe("An AI character");
    });

    test("insert system narrator as actor", () => {
      sqlite.run("INSERT INTO actors (id, actor_type, display_name, agent_type) VALUES (?, ?, ?, ?)", [
        "actor-narrator",
        "narrator",
        "Narrator",
        "narrator",
      ]);
      const actor = sqlite.query("SELECT * FROM actors WHERE id = ?").get("actor-narrator") as Row;
      expect(actor.actor_type).toBe("narrator");
      expect(actor.agent_type).toBe("narrator");
    });

    test("actor_type discriminator prevents mixing types", () => {
      const actors = sqlite
        .query("SELECT actor_type, COUNT(*) as cnt FROM actors GROUP BY actor_type ORDER BY actor_type")
        .all() as Row[];
      expect(actors.map((r) => ({ type: r.actor_type, count: r.cnt }))).toEqual([
        { type: "character", count: 1 },
        { type: "narrator", count: 1 },
        { type: "user", count: 1 },
      ]);
    });
  });

  describe("messages — visibility enum (replaces hidden boolean)", () => {
    test("message defaults to visible", () => {
      const chatId = "chat-vis";
      sqlite.run("INSERT INTO chats (id, name, type, created_by) VALUES (?, ?, ?, ?)", [
        chatId,
        "Vis Test",
        "direct",
        "user-1",
      ]);
      sqlite.run("INSERT INTO chat_participants (chat_id, actor_id) VALUES (?, ?)", [chatId, "actor-user-1"]);
      sqlite.run(
        "INSERT INTO messages (id, chat_id, actor_id, role, content, content_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["msg-vis", chatId, "actor-user-1", "user", "Hello", "text", "sent"],
      );
      const message = sqlite.query("SELECT visibility FROM messages WHERE id = ?").get("msg-vis") as Row;
      expect(message.visibility).toBe("visible");
    });

    test("can set different visibility states", () => {
      sqlite.run(
        "INSERT INTO messages (id, chat_id, actor_id, role, content, content_type, status, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ["msg-hidden-user", "chat-vis", "actor-user-1", "user", "gone", "text", "sent", "hidden_by_user"],
      );
      sqlite.run(
        "INSERT INTO messages (id, chat_id, actor_id, role, content, content_type, status, visibility, hidden_by, hidden_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          "msg-hidden-mod",
          "chat-vis",
          "actor-user-1",
          "user",
          "bad",
          "text",
          "sent",
          "hidden_by_moderator",
          "actor-user-1",
          "inappropriate",
        ],
      );
      sqlite.run(
        "INSERT INTO messages (id, chat_id, actor_id, role, content, content_type, status, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ["msg-auto", "chat-vis", "actor-user-1", "user", "auto", "text", "sent", "auto_hidden"],
      );
      const states = sqlite
        .query("SELECT id, visibility FROM messages WHERE chat_id = ? ORDER BY rowid")
        .all("chat-vis") as Row[];
      expect(states).toEqual([
        { id: "msg-vis", visibility: "visible" },
        { id: "msg-hidden-user", visibility: "hidden_by_user" },
        { id: "msg-hidden-mod", visibility: "hidden_by_moderator" },
        { id: "msg-auto", visibility: "auto_hidden" },
      ]);
    });

    test("only visible messages appear in default query", () => {
      const visible = sqlite
        .query("SELECT COUNT(*) as cnt FROM messages WHERE visibility = 'visible'")
        .get() as Row;
      const hidden = sqlite
        .query("SELECT COUNT(*) as cnt FROM messages WHERE visibility != 'visible'")
        .get() as Row;
      expect(visible.cnt).toBe(1);
      expect(hidden.cnt).toBe(3);
    });
  });

  describe("chat_participants — actor FK replaces polymorphic pair", () => {
    test("participants link actors to chats", () => {
      const chatId = "chat-cp";
      sqlite.run("INSERT INTO chats (id, name, type, created_by) VALUES (?, ?, ?, ?)", [
        chatId,
        "CP Test",
        "group",
        "user-1",
      ]);
      sqlite.run("INSERT INTO chat_participants (chat_id, actor_id, role_in_chat) VALUES (?, ?, ?)", [
        chatId,
        "actor-user-1",
        "owner",
      ]);
      sqlite.run("INSERT INTO chat_participants (chat_id, actor_id, role_in_chat) VALUES (?, ?, ?)", [
        chatId,
        "actor-char-1",
        "member",
      ]);

      const participants = sqlite
        .query(
          "SELECT a.display_name, cp.role_in_chat FROM chat_participants cp JOIN actors a ON a.id = cp.actor_id WHERE cp.chat_id = ? ORDER BY cp.rowid",
        )
        .all(chatId) as Row[];
      expect(participants).toHaveLength(2);
      expect(participants[0].display_name).toBe("Alice");
      expect(participants[0].role_in_chat).toBe("owner");
      expect(participants[1].display_name).toBe("Bob");
    });

    test("composite PK prevents duplicate actor in same chat", () => {
      expect(() => {
        sqlite.run("INSERT INTO chat_participants (chat_id, actor_id) VALUES (?, ?)", [
          "chat-cp",
          "actor-user-1",
        ]);
      }).toThrow();
    });
  });

  describe("characters — agent_type replaces is_bot boolean", () => {
    test("character defaults to agent_type='none'", () => {
      sqlite.run("INSERT INTO characters (id, owner_id, name, settings) VALUES (?, ?, ?, ?)", [
        "char-agent-1",
        "user-1",
        "Default Char",
        "{}",
      ]);
      const c = sqlite.query("SELECT agent_type FROM characters WHERE id = ?").get("char-agent-1") as Row;
      expect(c.agent_type).toBe("none");
    });

    test("can set different agent types", () => {
      sqlite.run("INSERT INTO characters (id, owner_id, name, agent_type, settings) VALUES (?, ?, ?, ?, ?)", [
        "char-ai",
        "user-1",
        "AI Buddy",
        "ai",
        "{}",
      ]);
      sqlite.run("INSERT INTO characters (id, owner_id, name, agent_type, settings) VALUES (?, ?, ?, ?, ?)", [
        "char-npc",
        "user-1",
        "Shopkeeper",
        "npc",
        "{}",
      ]);
      const aiChar = sqlite.query("SELECT agent_type FROM characters WHERE id = ?").get("char-ai") as Row;
      const npcChar = sqlite.query("SELECT agent_type FROM characters WHERE id = ?").get("char-npc") as Row;
      expect(aiChar.agent_type).toBe("ai");
      expect(npcChar.agent_type).toBe("npc");
    });

    test("query by agent type", () => {
      const aiChars = sqlite
        .query("SELECT COUNT(*) as cnt FROM characters WHERE agent_type = 'ai'")
        .get() as Row;
      const humanChars = sqlite
        .query("SELECT COUNT(*) as cnt FROM characters WHERE agent_type = 'none'")
        .get() as Row;
      expect(aiChars.cnt).toBe(1);
      expect(humanChars.cnt).toBe(1);
    });
  });

  describe("actor-based message queries", () => {
    test("messages join to actors instead of user/character FKs", () => {
      const chatId = "chat-actor-msg";
      sqlite.run("INSERT INTO chats (id, name, type, created_by) VALUES (?, ?, ?, ?)", [
        chatId,
        "Actor Msg",
        "direct",
        "user-1",
      ]);
      sqlite.run("INSERT INTO chat_participants (chat_id, actor_id) VALUES (?, ?)", [chatId, "actor-user-1"]);
      sqlite.run("INSERT INTO chat_participants (chat_id, actor_id) VALUES (?, ?)", [chatId, "actor-char-1"]);

      sqlite.run(
        "INSERT INTO messages (id, chat_id, actor_id, role, content, content_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["msg-actor-1", chatId, "actor-user-1", "user", "Hi Bob!", "text", "confirmed"],
      );
      sqlite.run(
        "INSERT INTO messages (id, chat_id, actor_id, role, content, content_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["msg-actor-2", chatId, "actor-char-1", "assistant", "Hello Alice!", "text", "confirmed"],
      );

      const msgs = sqlite
        .query(
          `SELECT m.content, a.display_name, a.actor_type
         FROM messages m
         JOIN actors a ON a.id = m.actor_id
         WHERE m.chat_id = ?
         ORDER BY m.created_at`,
        )
        .all(chatId) as Row[];
      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe("Hi Bob!");
      expect(msgs[0].display_name).toBe("Alice");
      expect(msgs[1].content).toBe("Hello Alice!");
      expect(msgs[1].display_name).toBe("Bob");
    });
  });

  describe("edge cases & constraints", () => {
    test("FK constraint: message actor must exist", () => {
      expect(() => {
        sqlite.run(
          "INSERT INTO messages (id, chat_id, actor_id, role, content, content_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ["msg-orphan", "chat-vis", "nonexistent-actor", "user", "test", "text", "confirmed"],
        );
      }).toThrow();
    });

    test("FK constraint: participant actor must exist", () => {
      expect(() => {
        sqlite.run("INSERT INTO chat_participants (chat_id, actor_id) VALUES (?, ?)", ["chat-vis", "ghost"]);
      }).toThrow();
    });
  });
});
