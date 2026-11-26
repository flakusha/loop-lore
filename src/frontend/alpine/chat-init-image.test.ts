// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, } from "../../test-utils/isolate-only";
import type { InitImageState, } from "./chat-types/init-image-state";

type FetchCall = { url: string; opts: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if ((await import("../../test-utils/isolate-only")).ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      return fetchHandler ? fetchHandler(url, opts ?? {},) : new Response("{}", { status: 200, },);
    },
  }),);
}

const { chatInitImage, } = await import("./chat-init-image");
const { chatActions, } = await import("./chat-actions");

function makeCtx(): InitImageState {
  return {
    ...chatInitImage,
    _initImage: { assetId: null, filename: "", uploading: false, error: "", },
  } as InitImageState;
}

function imageFile(name = "init.png",): File {
  return new File(["bytes",], name, { type: "image/png", },);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

describeOrSkip("chatInitImage", () => {
  test("attach uploads first, then keeps only the owned asset id", async () => {
    fetchHandler = () => Response.json({ id: "asset-9", filename: "stored-init.png", },);
    const ctx = makeCtx();

    await ctx.attachInitImage(imageFile(),);

    expect(fetchCalls,).toHaveLength(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/assets",);
    const body = fetchCalls[0]?.opts.body as FormData;
    expect(body.get("file",),).toBeInstanceOf(File,);
    expect(ctx._initImage.assetId,).toBe("asset-9",);
    expect(ctx._initImage.filename,).toBe("stored-init.png",);
    expect(ctx._initImage.uploading,).toBe(false,);
  });

  test("upload failure clears the selection and surfaces the error", async () => {
    fetchHandler = () => Response.json({ error: "file too large", }, { status: 413, },);
    const ctx = makeCtx();

    await ctx.attachInitImage(imageFile(),);

    expect(ctx._initImage.assetId,).toBeNull();
    expect(ctx._initImage.error,).toContain("file too large",);
    expect(ctx._initImage.uploading,).toBe(false,);
  });

  test("clear detaches the image", async () => {
    fetchHandler = () => Response.json({ id: "asset-9", },);
    const ctx = makeCtx();
    await ctx.attachInitImage(imageFile(),);

    ctx.clearInitImage();

    expect(ctx._initImage.assetId,).toBeNull();
    expect(ctx.initImageBody(),).toEqual({},);
  });

  test("missing image produces no init fields", () => {
    expect(makeCtx().initImageBody(),).toEqual({},);
  });

  test("selected image round-trips through the generate-image action", async () => {
    const ctx = makeCtx();
    ctx.selectInitImage("asset-9", "init.png",);
    fetchHandler = () => new Response("{}", { status: 200, },);

    await chatActions.dispatchCommandAction!.call(
      ctx as never,
      "generate-image",
      { prompt: "edit it", },
      "chat-1",
    );

    const genCall = fetchCalls.find((call,) => call.url === "/api/v1/generation/image");
    expect(genCall,).toBeDefined();
    const body = JSON.parse(genCall!.opts.body as string,) as Record<string, unknown>;
    expect(body.init_image,).toBe("asset-9",);
    expect(body.workflow,).toBe("img2img",);
  });
},);
