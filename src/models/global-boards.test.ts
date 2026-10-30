/**
 * Tests for the UGI global board importer (date parse, CSV extract, stubbed import).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { importUgi, parseUgiCsv, parseUgiDate, } from "./global-boards";
import { latestRankings, } from "./rankings";

const CSV = [
  "author/model_name,Model Link,Release Date,Test Date,UGI 🏆,W/10 👍",
  '"mistralai/Mistral-Small-3.1-24B-Instruct-2503",https://example.com,3/17/2025,9/6/2025,40.94,6.5',
  '"org/Quoted, Model",https://example.com,1/2/2026,10/16/2026,55.1,7',
  "bad-row-no-date,https://example.com,1/1/2026,,10,5",
  "bad-score,https://example.com,1/1/2026,1/5/2026,NaN,5",
].join("\n",);

function stubFetch(body: string,) {
  return async (_url: string,) => new Response(body, { status: 200, },);
}

describe("ugi board import", () => {
  it("parses M/D/YYYY to ISO and rejects garbage", () => {
    expect(parseUgiDate("9/6/2025",),).toBe("2025-09-06T00:00:00.000Z",);
    expect(parseUgiDate("13/40/2025",),).toBeNull();
    expect(parseUgiDate("2025-09-06",),).toBeNull();
    expect(parseUgiDate("",),).toBeNull();
  });

  it("extracts rows by header name and skips bad rows", () => {
    const rows = parseUgiCsv(CSV,);
    expect(rows.length,).toBe(2,);
    expect(rows[0],).toMatchObject({
      modelId: "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
      ugi: 40.94,
      willingness: 6.5,
      observedAt: "2025-09-06T00:00:00.000Z",
    },);

    // Quoted comma inside the model cell survives the split.
    expect(rows[1]?.modelId,).toBe("org/Quoted, Model",);
  });

  it("importUgi persists global/imported rows keyed on Test Date", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      expect(await importUgi(db, stubFetch(CSV,) as typeof fetch,),).toBe(2,);
      // Idempotent: re-import writes nothing new.
      expect(await importUgi(db, stubFetch(CSV,) as typeof fetch,),).toBe(0,);
      const rows = await latestRankings(db, { scope: "global", source: "ugi", },);
      expect(rows.length,).toBe(2,);
    } finally {
      sqlite.close();
    }
  });

  it("failed fetch writes nothing", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const failing = async (_url: string,) => new Response("boom", { status: 500, },);
      expect(await importUgi(db, failing as typeof fetch,),).toBe(0,);
    } finally {
      sqlite.close();
    }
  });
});
