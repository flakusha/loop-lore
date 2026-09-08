/**
 * Tests for the telemetry service.
 *
 * The config is loaded at module scope from env (dev defaults ON), so the
 * disabled path is exercised separately in `service-disabled.test.ts`
 * (mock.module stubs the config module before import).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { getRetentionDays, hashId, isFrontendTelemetryEnabled, isTelemetryEnabled, record, } from "./service";

// Bun's mock.module is process-global and cannot be unmocked: under
// `bun run` an earlier file (e.g.
// generate-route/__tests__/abort.test.ts) may have replaced ./service with
// a capture stub whose record has the SAME arity but never writes.
// Arity probes cannot detect it — behavior probe: write a row through a
// scratch DB and skip unless the row lands (pristine-module guard; see
// generation/providers/registry.test.ts).
const telemetryPristine = await (async () => {
  const probe = await createTestDb();
  try {
    await record(probe.db, { eventType: "__probe__", data: {}, },);
    const rows = await probe.db.selectFrom("telemetry_events",).select("id",).limit(1,).execute();
    return rows.length === 1;
  } catch {
    return false;
  } finally {
    probe.sqlite.close();
  }
})();
const describeReal = telemetryPristine ? describe : describe.skip;

describeReal("Telemetry Service", () => {
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
    expect(result[0]?.session_id,).toBe(hashId("1",),);
    expect(result[0]?.user_id,).toBe(hashId("2",),);
    expect(result[0]?.chat_id,).toBe(hashId("3",),);
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
    await record(db, { eventType: "boom", data: {}, },);
  });

  it("exposes enabled + retention getters", () => {
    expect(typeof isTelemetryEnabled(),).toBe("boolean",);
    expect(typeof isFrontendTelemetryEnabled(),).toBe("boolean",);
    expect(getRetentionDays(),).toBeGreaterThan(0,);
  });
},);
