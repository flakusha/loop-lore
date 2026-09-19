// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for LLM prompt-template rendering (FEAT-065-LLM): static
 * sections, variable substitution, enabled filtering, system prompt pick,
 * and priority-based token-budget trimming.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { LlmTemplatePayload, } from "../../generation/template-types";
import { assembleFromTemplate, } from "./template-render";
import type { AssembleContext, } from "./types";

/**
 * Static-only assembly context: no DB reads (userId empty) and no built-in
 * section references, so sections render purely from `content`.
 */
function makeCtx(tokenBudget: number,): AssembleContext {
  return {
    db: null as unknown as Kysely<DB>,
    actor: {
      id: "actor-1",
      display_name: "Seraphine",
      system_prompt: null,
      description: "desc",
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
      settings: null,
    },
    chat: {
      id: "chat-1",
      mode: "chat",
      world_id: null,
      current_location_id: null,
    },
    params: { chatId: "chat-1", actorId: "actor-1", userId: "", modelId: "test-model", },
    isStory: false,
    tokenBudget,
  };
}

describe("assembleFromTemplate", () => {
  test("renders enabled static sections in order with variable substitution", async () => {
    const payload: LlmTemplatePayload = {
      sections: [
        { identifier: "", role: "system", content: "You are {{charName}}.", enabled: true, priority: 3, },
        { identifier: "", role: "user", content: "Hello", enabled: true, priority: 1, },
        { identifier: "", role: "assistant", content: "Hidden", enabled: false, priority: 1, },
      ],
    };
    const res = await assembleFromTemplate(makeCtx(10_000,), payload,);
    expect(res.messages.map((m,) => `${m.role}:${m.content}`),).toEqual(
      ["system:You are Seraphine.", "user:Hello",],
    );
    expect(res.systemPrompt,).toBe("You are Seraphine.",);
    expect(res.tokenCount,).toBeGreaterThan(0,);
    expect(res.sections.every((s,) => !s.dropped),).toBe(true,);
  });

  test("drops low-priority sections over budget", async () => {
    const long = "x".repeat(600,);
    const payload: LlmTemplatePayload = {
      sections: [
        { identifier: "", role: "system", content: "core", enabled: true, priority: 0, },
        { identifier: "", role: "user", content: long, enabled: true, priority: 3, },
      ],
    };
    const res = await assembleFromTemplate(makeCtx(50,), payload,);
    expect(res.sections.some((s,) => s.dropped),).toBe(true,);
    expect(res.sections.find((s,) => s.name === "custom:0")?.dropped,).toBe(false,);
    expect(res.tokenCount,).toBeLessThanOrEqual(50,);
  });

  test("reports linked-but-unknown builtin identifiers as static content", async () => {
    const payload: LlmTemplatePayload = {
      sections: [
        { identifier: "noSuchBuiltin", role: "system", content: "fallback", enabled: true, priority: 1, },
      ],
    };
    const res = await assembleFromTemplate(makeCtx(10_000,), payload,);
    expect(res.messages[0]?.content,).toBe("fallback",);
  });
  test("linked builtin identifier splices the section build output", async () => {
    const payload: LlmTemplatePayload = {
      sections: [
        { identifier: "customInstructions", role: "system", content: "ignored", enabled: true, priority: 1, },
      ],
    };
    const ctx = makeCtx(10_000,);
    ctx.userCustomInstructions = "always write tersely";
    const res = await assembleFromTemplate(ctx, payload,);
    expect(res.messages,).toHaveLength(1,);
    expect(res.messages[0]?.role,).toBe("system",);
    expect(String(res.messages[0]?.content ?? "",),).toContain("always write tersely",);
  });

  test("{{alias}} and {{builtin}} in static content expand to the built section", async () => {
    const payload: LlmTemplatePayload = {
      sections: [
        {
          identifier: "",
          role: "system",
          content: "A:{{systemPrompt}} B:{{system}}",
          enabled: true,
          priority: 1,
        },
      ],
    };
    const ctx = makeCtx(10_000,);
    ctx.actor.system_prompt = "Be kind.";
    const res = await assembleFromTemplate(ctx, payload,);
    expect(res.messages[0]?.content,).toBe("A:Be kind. B:Be kind.",);
  });

  test("resolveScalarVars: persona identity feeds userName/userDescription", async () => {
    const { createTestDb, } = await import("../../test-utils/create-test-db");
    const { insertActors, insertChatParticipants, insertChats, insertPersonas, insertUsers, } = await import(
      "../../test-utils/insert-helpers"
    );
    const { uid, } = await import("../../utils");
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = uid();
      await insertUsers(db, `u-${userId}`, "U", { id: userId, } as never,);
      await insertActors(db, "U", { id: userId as never, user_id: userId, owner_id: userId, },);
      await insertActors(db, "Heroine", { description: "Brave knight.", },);
      const actor = await db.selectFrom("actors",).select(["id",],).where("display_name", "=", "Heroine",)
        .executeTakeFirstOrThrow();
      const chatId = uid();
      await insertChats(db, "C", userId, { id: chatId, } as never,);
      await insertChatParticipants(db, chatId, userId,);
      await insertPersonas(db, userId, "Scholar", { description: "Quiet scholar.", },);
      const persona = await db.selectFrom("personas",).select(["id",],).where("user_id", "=", userId,)
        .executeTakeFirstOrThrow();
      await db.updateTable("chat_participants",).set({ persona_id: persona.id, },)
        .where("chat_id", "=", chatId,).where("actor_id", "=", userId,).execute();
      const ctx = makeCtx(10_000,);
      ctx.db = db;
      ctx.params = { chatId, actorId: actor.id, userId, modelId: "test-model", };
      const res = await assembleFromTemplate(ctx, {
        sections: [{
          identifier: "",
          role: "system",
          content: "{{userName}}|{{userDescription}}",
          enabled: true,
          priority: 1,
        },],
      },);
      expect(res.messages[0]?.content,).toBe("Scholar|Quiet scholar.",);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("assembleWithTemplate: chat override resolves an owned LLM row", async () => {
    const { createTestDb, } = await import("../../test-utils/create-test-db");
    const { insertActors, insertChats, insertUsers, } = await import("../../test-utils/insert-helpers");
    const { createTemplate, } = await import("../../generation/template-service/crud");
    const { assembleWithTemplate, } = await import("./template-render");
    const { uid, } = await import("../../utils");
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = uid();
      await insertUsers(db, `u-${userId}`, "U", { id: userId, } as never,);
      await insertActors(db, "Heroine", {
        id: uid() as never,
        description: "Brave knight.",
        system_prompt: "Actor prompt.",
      },);
      const actor = await db.selectFrom("actors",).select(["id", "display_name",],).where(
        "display_name",
        "=",
        "Heroine",
      )
        .executeTakeFirstOrThrow();
      const row = await createTemplate(db, userId, {
        name: "Row",
        modality: "llm",
        payload: { sections: [{ identifier: "system", role: "system", content: "", enabled: true, priority: 0, },], },
      },);
      const chatId = uid();
      await insertChats(db, "C", userId, { id: chatId, } as never,);
      const ctx = makeCtx(10_000,);
      ctx.db = db;
      ctx.actor.display_name = actor.display_name;
      ctx.actor.id = actor.id;
      ctx.actor.system_prompt = "Actor prompt.";
      ctx.actor.description = "Brave knight.";
      ctx.chat.id = chatId;
      ctx.params = { chatId, actorId: actor.id, userId, modelId: "test-model", };
      const res = await assembleWithTemplate(db, ctx, row.id, userId,);
      expect(res?.messages[0]?.content,).toContain("Actor prompt.",);
      expect(await assembleWithTemplate(db, ctx, "tmpl-missing", userId,),).toBeNull();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});
