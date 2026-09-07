// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/controller/upload.ts — handleUpload multipart gate,
 * size/MIME validation, and the createAsset wiring.
 */

import { afterAll, afterEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../../config/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import type { UploadOpts, } from "./types";
import { handleUpload, } from "./upload";

const MAX_SIZE = 10 * 1_048_576;
let uploadDir: string;
let config: Config;
let db: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;
const dirs: string[] = [];

async function setup() {
  const result = await createTestDb();
  db = result;
  uploadDir = mkdtempSync(join(tmpdir(), "ll-upload-",),);
  dirs.push(uploadDir,);
  mkdirSync(uploadDir, { recursive: true, },);
  await insertUsers(db.db, "upload-user", "Upload User",);
  const row = await db.db.selectFrom("users",).select("id",).where("username", "=", "upload-user",)
    .executeTakeFirstOrThrow();
  userId = row.id;
  config = {
    assets: {
      uploadDir,
      enabled: true,
      maxFileSize: MAX_SIZE,
      compression: true,
      signedUrlSecret: "",
      signedUrlExpirySeconds: 900,
    },
    auth: { jwtSecret: "test", },
  } as unknown as Config;
  return { db, uploadDir, config, userId, };
}

async function makeRequest(fd: FormData,): Promise<Response> {
  return handleUpload({
    request: new Request("http://local/api/assets", { method: "POST", body: fd, },),
    userId,
    database: db.db,
    uploadDir,
    maxFileSize: MAX_SIZE,
    config,
  } as UploadOpts,);
}

afterEach(() => {
  // Remove temp dir but do NOT close the DB — each test owns its instance;
  // closing it mid-suite would break subsequent tests that share the same variable.
  for (const d of dirs) {
    rmSync(d, { recursive: true, force: true, },);
  }
  dirs.length = 0;
},);

afterAll(() => {
  db?.sqlite.close();
},);

describe("handleUpload", () => {
  test("rejects non-multipart content-type", async () => {
    const result = await setup();
    db = result.db;
    const res = await handleUpload({
      request: new Request("http://local/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({},),
      },),
      userId,
      database: db.db,
      uploadDir,
      maxFileSize: MAX_SIZE,
      config,
    } as UploadOpts,);
    expect(res.status,).toBe(400,);
    const body = await res.text();
    expect(body,).toContain("multipart/form-data",);
  });

  test("rejects when parsing the multipart body throws", async () => {
    const result = await setup();
    db = result.db;
    const res = await handleUpload({
      request: new Request("http://local/api/assets", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=----TestBoundary1234", },
        body: "this is not valid multipart data at all",
      },),
      userId,
      database: db.db,
      uploadDir,
      maxFileSize: MAX_SIZE,
      config,
    } as UploadOpts,);
    expect(res.status,).toBe(400,);
    const body = await res.text();
    expect(body,).toContain("Failed to parse",);
  });

  test("rejects when the file field is missing", async () => {
    const result = await setup();
    db = result.db;
    const fd = new FormData();
    fd.set("alt_text", "no file here",);
    const res = await makeRequest(fd,);
    expect(res.status,).toBe(400,);
    const body = await res.text();
    expect(body,).toContain("file field is required",);
  });

  test("rejects when the file is too large", async () => {
    const result = await setup();
    db = result.db;
    const giant = new Uint8Array(MAX_SIZE + 1,);
    const fd = new FormData();
    fd.set("file", new File([giant,], "huge.png", { type: "image/png", },),);
    const res = await makeRequest(fd,);
    expect(res.status,).toBe(400,);
    const body = await res.text();
    expect(body,).toContain("too large",);
  });

  test("rejects SVG (active format)", async () => {
    const result = await setup();
    db = result.db;
    const buf = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>",);
    const fd = new FormData();
    fd.set("file", new File([buf,], "evil.svg", { type: "image/svg+xml", },),);
    const res = await makeRequest(fd,);
    expect(res.status,).toBe(400,);
    const body = await res.text();
    expect(body,).toContain("Unsupported file type",);
  });

  test("accepts a valid PNG and returns 201 with HX-Trigger", async () => {
    const result = await setup();
    db = result.db;
    const buf = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);
    const fd = new FormData();
    fd.set("file", new File([buf,], "scene.png", { type: "image/png", },),);
    const res = await makeRequest(fd,);
    expect(res.status,).toBe(201,);
    const body = await res.json();
    expect(body.id,).toBeTruthy();
    expect(body.filename,).toBe("scene.png",);
    expect(body.mime_type,).toBe("image/png",);
    expect(body.asset_type,).toBe("image",);
    expect(res.headers.get("content-type",),).toBe("application/json",);
    expect(res.headers.get("hx-trigger",),).toContain("asset:uploaded",);
  });

  test("uploading the same content twice returns 200 with duplicate:true", async () => {
    const result = await setup();
    db = result.db;
    const buf = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);
    const fd = new FormData();
    fd.set("file", new File([buf,], "dup.png", { type: "image/png", },),);
    const first = await makeRequest(fd,);
    expect(first.status,).toBe(201,);
    const second = await makeRequest(fd,);
    expect(second.status,).toBe(200,);
    const body = await second.json();
    expect(body.duplicate,).toBe(true,);
    expect(second.headers.get("hx-trigger",),).toContain("asset:duplicate",);
  });

  test("sanitizes alt_text by stripping HTML tags", async () => {
    const result = await setup();
    db = result.db;
    const buf = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);
    const fd = new FormData();
    const file = new File([buf,], "alt.png", { type: "image/png", },);
    fd.set("file", file,);
    fd.set("alt_text", "<b>Bold</b> and <script>evil</script> normal text",);
    const res = await makeRequest(fd,);
    expect(res.status,).toBe(201,);
    const body = await res.json();
    expect(body.alt_text || "",).not.toContain("<b>",);
    expect(body.alt_text || "",).not.toContain("<script>",);
  });

  test("file with empty type defaults to application/octet-stream and is rejected", async () => {
    const result = await setup();
    db = result.db;
    const buf = Buffer.from("hello",);
    const fd = new FormData();
    fd.set("file", new File([buf,], "no-type.bin",),);
    const res = await makeRequest(fd,);
    expect(res.status,).toBe(400,);
  });
});
