import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { record, } from "./service";

describe("Telemetry Service", () => {
  it("should record events", async () => {
    const { db, } = await createTestDb();
    await record(db, {
      eventType: "test",
      sessionId: "1",
      userId: "2",
      chatId: "3",
      data: { test: true, },
    },);
    const result = await db.selectFrom("telemetry_events",).selectAll().limit(1,).execute();
    expect(result.length,).toBe(1,);
  });
});
