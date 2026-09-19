// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUIClient.uploadImage tests - POST multipart to /upload/image with
 * overwrite, surface the stored filename, and fail loudly on errors.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { ComfyUIClient, } from "./comfyui";

createLogger({ level: "error", },);

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1,],);

interface Captured {
  url: string;
  form: FormData | null;
}

function stubUpload(response: () => Response,): { captured: Captured; restore: () => void } {
  const captured: Captured = { url: "", form: null, };
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit,) => {
    captured.url = String(input,);
    captured.form = (init?.body as FormData) ?? null;
    return response();
  }) as unknown as typeof fetch;
  return {
    captured,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function client(): ComfyUIClient {
  return new ComfyUIClient({ baseUrl: "http://127.0.0.1:8188", timeout: 5_000, },);
}

describe("ComfyUIClient.uploadImage", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const fn of cleanup.splice(0,)) { fn(); }
  },);

  test("posts the image with overwrite and returns the stored name", async () => {
    const { captured, restore, } = stubUpload(
      () => new Response(JSON.stringify({ name: "matting-1.png", subfolder: "", type: "input", },),),
    );
    cleanup.push(restore,);

    const name = await client().uploadImage(Buffer.from(PNG,), "matting-1.png",);

    expect(name,).toBe("matting-1.png",);
    expect(captured.url,).toBe("http://127.0.0.1:8188/upload/image",);
    expect(captured.form?.get("overwrite",),).toBe("true",);
    const file = captured.form?.get("image",);
    expect(file,).toBeInstanceOf(File,);
    expect((file as File).name,).toBe("matting-1.png",);
  });

  test("throws with the HTTP status on failure", async () => {
    const { restore, } = stubUpload(() => new Response("denied", { status: 500, },));
    cleanup.push(restore,);
    await expect(client().uploadImage(Buffer.from(PNG,), "x.png",),).rejects.toThrow(
      "upload failed [500]",
    );
  });

  test("throws when the response has no filename", async () => {
    const { restore, } = stubUpload(() => new Response(JSON.stringify({},),));
    cleanup.push(restore,);
    await expect(client().uploadImage(Buffer.from(PNG,), "x.png",),).rejects.toThrow(
      "no filename",
    );
  });
});
