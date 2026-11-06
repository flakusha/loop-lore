// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/harness` command tests (TASK-harness-production-dispatch-path-runturn-caller-tasktype-mem):
 * the production caller of the outbound ACP stack.
 *
 * Resource contract: ONE in-memory migrated DB per test (its own
 * user/actor/chat ids), the process-shared admin-settings store and the
 * process-shared runtime singleton (both seeded and reset around every test),
 * in-memory fake adapters. No child process, no ports, no cross-test state.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type HarnessAcpConfig, } from "../../config/schema/harness";
import {
  initHarnessAdminSettings,
  resetHarnessAdminSettings,
} from "../../integrations/harness/admin-settings";
import { fakeFactory, } from "../../integrations/harness/fakes";
import { initHarnessRuntime, resetHarnessRuntime, } from "../../integrations/harness/runtime";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { type CommandContext, getCommand, } from "./registry";
import "./harness-turn";

let userId: string;
let chatId: string;
let tag = "";
let idCounter = 0;

let fixture: TestDb;

/** The ACP config the admin store and the runtime are seeded with. */
function acpConfig(): HarnessAcpConfig {
  return {
    enabled: true,
    profiles: [{
      name: "omp",
      command: ["omp",],
      tiers: { fast: { model: "zai/flash", capabilities: ["tools",], }, },
      tosGrayzoneAcknowledged: true,
    },],
  };
}

/** The command context of the calling admin. */
function context(): CommandContext {
  return {
    chatId,
    db: fixture.db,
    userId,
    userRole: "solo",
    roleInChat: "owner",
  };
}

beforeEach(async () => {
  tag = `c${++idCounter}`;
  userId = `user-harness-command-${tag}`;
  chatId = `chat-harness-command-${tag}`;
  fixture = await createTestDb();
  initHarnessAdminSettings(acpConfig(),);

  await fixture.db.insertInto("users",).values({
    id: userId,
    username: `harness-command-${tag}`,
    display_name: "Harness Command",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();

  await insertActors(fixture.db, "Harness Command", {
    // The caller's personal actor shares the user's id (the chat layer
    // addresses the caller by that id, so the rows it writes must find it).
    id: userId,
    actor_type: "user",
    agent_type: "none",
    user_id: userId,
    owner_id: userId,
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);

  await fixture.db.insertInto("chats",).values({
    id: chatId,
    name: "Harness Command",
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();
},);

afterEach(async () => {
  resetHarnessRuntime();
  resetHarnessAdminSettings();
  await destroyTestDb(fixture,);
},);

describe("/harness", () => {
  it("runs the turn through the composed runtime and answers in the chat", async () => {
    const { factory, logs, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "the answer", }, },);
    initHarnessRuntime(acpConfig(), factory,);

    const result = await getCommand("harness",)?.(["omp", "do", "the", "thing",], context(),);

    expect(result?.handled,).toBe(true,);
    expect(logs.get("omp",)?.prompts,).toEqual(["do the thing",],);

    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.role,).toBe("assistant",);
  });

  it("attributes the answer to the chat's character when there is one", async () => {
    const characterId = `actor-harness-command-character-${tag}`;
    await insertActors(fixture.db, "Oracle", {
      id: characterId,
      actor_type: "character",
      agent_type: "ai",
      owner_id: userId,
      settings: "{}",
      import_spec: "raw",
      data_source_format: "json",
      data_raw: null,
    } as never,);

    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "the answer", }, },);
    initHarnessRuntime(acpConfig(), factory,);

    const result = await getCommand("harness",)?.(["omp", "do", "the", "thing",], {
      ...context(),
      currentCharacter: { id: characterId, name: "Oracle", },
    },);

    expect(result?.handled,).toBe(true,);
    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.actor_id,).toBe(characterId,);
  });

  it("explains that the harness is off when no runtime is composed", async () => {
    const result = await getCommand("harness",)?.(["omp", "hello",], context(),);

    expect(result?.handled,).toBe(true,);
    expect(result?.systemMessage,).toContain("Harness unavailable",);
  });

  it("shows the usage with the configured profiles when the prompt is missing", async () => {
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], }, },);
    initHarnessRuntime(acpConfig(), factory,);

    const result = await getCommand("harness",)?.([], context(),);

    expect(result?.handled,).toBe(true,);
    expect(result?.systemMessage,).toContain("/harness <profile> <prompt>",);
    expect(result?.systemMessage,).toContain("omp",);
  });

  it("refuses a caller who is not an admin", async () => {
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], }, },);
    initHarnessRuntime(acpConfig(), factory,);

    const result = await getCommand("harness",)?.(
      ["omp", "hello",],
      { ...context(), userRole: "user", },
    );

    expect(result?.handled,).toBe(true,);
    expect(result?.systemMessage,).toContain("role_denied",);
    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows,).toHaveLength(0,);
  });
});
