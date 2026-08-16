/**
 * Tests for the telemetry service.
 *
 * The config is loaded at module scope from env (dev defaults ON), so the
 * disabled path is exercised separately in `service-disabled.test.ts`
 * (mock.module stubs the config module before import).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { getRetentionDays, isFrontendTelemetryEnabled, isTelemetryEnabled, record, } from "./service";

describe("Telemetry Service", () => {
  it("should record events with full metadata", async () => {
    const { db, sqlite, } = await createTestDb();
    await record(db, {
      eventType: "test",
      sessionId: "1",
      userId: "2",
      chatId: "3",
      data: { test: true, },
    },);
    const result = await db.selectFrom("telemetry_events",).selectAll().limit(1,).execute();
    expect(result.length,).toBe(1,);
    expect(result[0]?.event_type,).toBe("test",);
    expect(result[0]?.session_id,).toBe("1",);
    expect(result[0]?.user_id,).toBe("2",);
    expect(result[0]?.chat_id,).toBe("3",);
    expect(JSON.parse(result[0]!.event_data,),).toEqual({ test: true, },);
    sqlite.close();
  });

  it("falls back to {} when data cannot be serialized", async () => {
    const { db, sqlite, } = await createTestDb();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await record(db, { eventType: "circular", data: circular, },);
    const result = await db.selectFrom("telemetry_events",).selectAll().limit(1,).execute();
    expect(result[0]?.event_data,).toBe("{}",);
    sqlite.close();
  });

  it("swallows database errors instead of throwing", async () => {
    const { db, sqlite, } = await createTestDb();
    sqlite.close();
    // The assertion is that this resolves — record() must swallow the insert error.
    await record(db, { eventType: "boom", },);
  });

  it("exposes enabled + retention getters", () => {
    expect(typeof isTelemetryEnabled(),).toBe("boolean",);
    expect(typeof isFrontendTelemetryEnabled(),).toBe("boolean",);
    expect(getRetentionDays(),).toBeGreaterThan(0,);
  });
});
